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
      if (!QUALITES.some((q) => q[0] === s.qualite)) s.qualite = 'auto'; if (!Object.prototype.hasOwnProperty.call(IMAGES, s.images)) s.images = 'economie'; // un réglage inconnu (une sauvegarde abîmée) : celui par défaut
      while (s.stations.length < G.PRODUITS.length) s.stations.push({ niv: 0, staff: false, prog: 0, actif: false });
      G.parcours(s); // les recettes de boutique (recalculées depuis st.boutiques), le quartier de la boutique en cours, pas de défi pour une boutique ouverte avant
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
  function audio() { if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { actx = new AC(); } catch (e) { actx = null; } if (actx && typeof SONS !== 'undefined') SONS.brancher(actx, () => st); } // les sons lisent les réglages en direct (st.son, st.musique)
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
  // le vrai gain de la première fournée, au niveau 1 et à la main (étoiles, bonus, mobilier… compris), comme premiereVente de src/evenement.js
  const premiereFournee = (i) => G.revenuFournee(Object.assign({}, st, { stations: st.stations.map((x, k) => (k === i ? Object.assign({}, x, { niv: 1, staff: false }) : x)) }), i);
  function renderCards(force) {
    renderSaison(force);
    const remise = G.remise(st), critique = st.ev && st.ev.type === 'critique' ? st.ev.restants : [];
    G.PRODUITS.forEach((p, i) => {
      const s = st.stations[i], c = cards[i];
      let html, cls;
      const gagnee = G.recetteGagnee(st, i), cache = !gagnee && i !== G.recettesConnues(st); // des recettes de boutique pas encore gagnées, seule la prochaine se montre
      if (c.el.hidden !== cache) c.el.hidden = cache;
      if (cache) return;
      if (!gagnee) { // la recette de la prochaine boutique : le but, verrouillé
        const q = p.quartier ? G.QUARTIERS.find((x) => x.id === p.quartier) : null;
        cls = 'carte verrou boutique';
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}<span class="cadenas" aria-hidden="true">${ICONS.UI.cadenas}</span></div><div class="corps"><h3>${esc(p.nom)} <span class="tag boutique">boutique n°${p.boutique}</span></h3>
          <p class="but">Ouvre la boutique n°${p.boutique} pour la débloquer</p><p>${esc(p.desc)}${q ? ` La recette de ${esc(q.nom)}.` : ''} Rapporte ${G.fmtEur(premiereFournee(i))} la fournée.</p>
          <button type="button" class="btn lavande" data-a="parcours"><small>Le parcours du boulanger</small><b>Voir ce qui t’attend</b></button></div>`;
      } else if (s.niv === 0) {
        const prev = i === 0 || st.stations[i - 1].niv > 0, ok = st.coins >= p.debloquer * remise;
        cls = 'carte verrou' + (prev ? '' : ' secret');
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${esc(p.desc)} Rapporte ${G.fmtEur(premiereFournee(i))} la fournée.</p>
          <button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>${remise < 1 ? `Débloquer −${Math.round((1 - remise) * 100)} %` : 'Débloquer'}</small><b>${G.fmtEur(p.debloquer * remise)}</b></button></div>`;
      } else {
        const n = G.quantite(st, i), prix = G.prixNiveaux(st, i, n), ok = st.coins >= prix, pal = G.prochainPalier(s.niv);
        const prec = G.PALIERS.filter((x) => x <= s.niv).pop() || 0, franchit = pal && s.niv + n >= pal; // le palier : les gains montent à 25, 50, 75, 100… (G.PALIERS)
        const rapide = p.temps <= 1.5 && s.staff;
        cls = 'carte' + (s.staff ? ' auto' : ' manuel') + (s.actif ? ' actif' : '') + (critique.includes(i) ? ' gouter' : '');
        html = `${critique.includes(i) ? '<span class="badge-critique">Sers le critique !</span>' : ''}<div class="icone">${ICONS.PRODUITS[p.id]}<span class="niv">${s.niv}</span></div>
          <div class="corps"><h3><span class="nom">${esc(p.nom)}${st.jour && st.jour.pain === i ? ' <span class="tag">×1,5</span>' : ''}${st.specialite === i ? ' <span class="tag spe">×2</span>' : ''}</span></h3>
            <div class="palier ${franchit ? 'bientot' : ''}">${pal ? `<span title="Au niveau ${pal}, les gains sont multipliés par ${G.fmtMult(G.palierMult(pal))}">Palier <b>${pal}</b> · ×${G.fmtMult(G.palierMult(pal))}</span><span>${pal - s.niv === 1 ? '1 niveau' : `${pal - s.niv} niveaux`}</span><i style="width:${((s.niv - prec) / (pal - prec) * 100).toFixed(0)}%"></i>` : `<span>Dernier palier atteint · ×${G.fmtMult(G.palierMult(s.niv))}</span><i style="width:100%"></i>`}</div>
            <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${G.fmtEur(G.revenuFournee(st, i))}</span>${s.staff || s.actif ? `<span class="tps">${G.fmtDuree(G.temps(st, i))}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
          <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'} ${remise < 1 ? 'promo' : ''}" data-a="ameliorer"><small>${remise < 1 ? `−${Math.round((1 - remise) * 100)} % ×${n}` : `Améliorer ×${n}`}</small><b>${G.fmtEur(prix)}</b>${franchit ? `<i class="pal-badge">palier ×${G.fmtMult(G.palierMult(pal))}</i>` : ''}</button>
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
      if (a === 'parcours') { son.tap(); sheetParcours(); return; }
      if (a === 'debloquer' || a === 'ameliorer') {
        const r = G.acheter(st, i);
        if (!r.ok) { son.non(); toast(r.verrou ? `Ouvre la boutique n°${r.boutique} pour débloquer cette recette.` : `Il manque ${G.fmtEur(r.prix - st.coins)}`); return; }
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
  // les nouveautés (src/nouveautes.js) : st.nouveautesVues garde l'id de la plus récente vue ; toute entrée plus récente allume le point du cadeau
  const NVS = typeof NV !== 'undefined' ? NV : null;
  const nouveautesNonVues = () => (NVS && st ? NVS.nonVues(st.nouveautesVues).length : 0);
  const primesAReclamer = () => { const j = G.objectifsDuJour(st, st.now), sm = st.semaine; return j.objectifs.filter((o) => o.fait && !o.reclame).length + (sm && sm.fait && !sm.reclame ? 1 : 0); };
  const etoilesPretes = (st, gain) => gain >= 3 && G.passageOk(st); // la pastille ★ clignote : 3 étoiles au moins, et le défi de passage fait
  function badge(el, n, cls) { const b = el.querySelector('.badge'); if (!b) return; b.hidden = !n; b.textContent = n > 0 && cls !== 'point' ? n : ''; b.className = 'badge' + (cls ? ' ' + cls : ''); }
  // l'enseigne : un nom trop long pour la largeur (« Le Grand Fournil de la Capitale » à 360 px) passe en petit, sur deux lignes ;
  // mesuré seulement quand le nom, la largeur ou les polices changent
  let enseigneVue = '';
  function majEnseigne(nom) {
    const cle = `${nom}|${innerWidth}|${document.fonts ? document.fonts.status : ''}`; if (cle === enseigneVue) return; enseigneVue = cle;
    const e = $('#enseigne'), s = e.querySelector('span'); s.textContent = nom; e.classList.remove('long');
    if (s.scrollWidth > s.clientWidth + 1) e.classList.add('long');
  }
  function hud() {
    const taux = G.tauxParSeconde(st), gain = G.etoilesGagnables(st), pret = etoilesPretes(st, gain), marche = G.jourDeMarche(st.now), boost = st.boost && st.boost.fin > st.now ? st.boost.mult : 0;
    const bonus = G.AMELIORATIONS.filter((a) => !st.ameliorations[a.id] && G.ameliorationOuverte(st, a) && st.coins >= G.prixBonus(st, a)).length + G.MOBILIER.filter((m) => G.mobilierCran(st, m.id) < m.max && st.coins >= G.prixMeuble(st, m.id)).length, primes = primesAReclamer(), pts = G.ptsTalents(st);
    if (pageActive === 'journal' && tiroir.pos !== 'ferme' && nonLues()) marquerLu(); // une nouvelle arrivée pendant qu'on lit le Journal est lue aussitôt
    const nouveaux = nonLues(), nom = G.nomBoutique(st), ev = st.ev ? st.ev.type : '', nv = nouveautesNonVues();
    // le marché du samedi et la bonne critique : pas de deuxième ligne sous le solde (elle repoussait la boutique à 360×640) ;
    // la ligne du rythme et les badges s'y relaient toutes les 4 s, à hauteur constante
    const br = st.boosts && st.boosts.actif && st.boosts.actif.fin > st.now ? st.boosts.actif.mult : 0; // un boost de la réserve (l'événement du quartier)
    const extras = [marche && 'Marché ×1,5', boost && `Bonne critique ×${boost}`, br && `Boost ×${br}`].filter(Boolean), tour = extras.length ? Math.floor(performance.now() / 4000) % (extras.length + 1) : 0;
    const key = `${G.fmtEur(st.coins)}|${G.fmtEur(taux)}|${st.etoiles}|${gain}|${pret}|${marche}|${boost}|${br}|${bonus}|${primes}|${pts}|${nouveaux}|${nom}|${ev}|${tour}|${nv}`;
    majEnseigne(nom); // avant le raccourci : les polices arrivent sans que rien d'autre ne change
    if (key === lastHud) return; lastHud = key;
    $('#coins').textContent = G.fmtEur(st.coins);
    $('#taux').innerHTML = `<span${tour ? ' style="display:none"' : ''}>${taux > 0 ? `<b>+${G.fmtEur(taux)}</b><span class="ps"> par seconde</span><span class="ps-c"> / s</span>` : 'Touche la baguette !'}</span>` + extras.map((t, k) => `<span class="marche" style="margin:0;padding:1px 7px;vertical-align:top${tour === k + 1 ? '' : ';display:none'}">${t}</span>`).join('');
    $('#etoiles-n').innerHTML = gain > 0 ? `${st.etoiles}<small><i> · </i>+${gain}</small>` : st.etoiles; // sur un téléphone, le « +gain » passe sous le compte (style.css)
    $('#b-etoiles').classList.toggle('pret', pret);
    $('#b-ameliorations').classList.toggle('pret', bonus > 0); badge($('#b-ameliorations'), bonus);
    $('#b-cloche').classList.toggle('actif', !!ev); $('#b-cloche .point').hidden = !ev && !nouveaux; // la cloche : l'événement en cours, sinon les nouvelles pas lues
    $('#b-cloche').setAttribute('aria-label', ev ? 'Événement en cours' : nouveaux ? `${nouveaux} nouvelle${nouveaux > 1 ? 's' : ''} dans le Journal` : 'Le Journal');
    $('#b-nouveautes .point').hidden = !nv; // le cadeau : une mise à jour pas encore vue
    $('#b-nouveautes').setAttribute('aria-label', nv ? `Nouveautés : ${nv} mise${nv > 1 ? 's' : ''} à jour à découvrir` : 'Les nouveautés du Fournil');
    badge($('#onglets [data-page="defis"]'), primes);
    badge($('#onglets [data-page="boulanger"]'), pts, 'lavande');
    badge($('#onglets [data-page="journal"]'), nouveaux, 'beurre');
  }
  // les messages arrivés ensemble (un grade et son trophée, une maîtrise et le niveau) passent l'un après l'autre au lieu de s'écraser
  const toastFile = [];
  function montrerToast(txt) {
    eveiller(); // un message du jeu (un événement, un client mystère, un trophée…) : la cadence de jeu revient
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
    return { init, aller, layout, get pos() { return pos; }, get y() { return y; }, get Y() { return Y; }, get glisse() { return !!drag; } };
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
  function amenager(on) { const v = on == null ? !SCENE.amenager : !!on; SCENE.setAmenager(v); document.body.classList.toggle('amenage', v); $('#b-fini').hidden = !v; $('#amenage-barre').hidden = !v; if (!v) deplacer(false); }
  // « Déplacer » (dans Aménager) : prendre un meuble acheté de la salle, il suit le doigt aimanté à la grille (vert : il peut aller là ;
  // rouge : la raison) ; le lâcher le pose, ou le remet à sa place. « Plan d'origine » (avec confirmation) remet tout comme au premier jour.
  // La place des meubles (st.amenagement) reste d'une boutique à l'autre ; la géométrie est dans VIE (valider, proposer).
  let glisse = null, astuceDeplacer = false;
  function deplacer(on) {
    const v = !!on && SCENE.amenager; if (glisse) finGlisse(true); SCENE.setDeplacer(v); document.body.classList.toggle('deplace', v);
    const b = $('#b-deplacer'); if (b) { b.setAttribute('aria-pressed', String(v)); b.querySelector('b').textContent = v ? 'Améliorer' : 'Déplacer'; b.querySelector('.ico').innerHTML = ICONS.UI[v ? 'amenager' : 'deplacer'] || ''; } // actif, le bouton ramène aux améliorations
    $('#b-origine').hidden = !v || !st.amenagement;
    if (v && VIE.amenagementDemande && !VIE.amenagementApplique) toast('Ton plan ne tient pas sur cet écran : la boutique est au plan d’origine. Le premier meuble posé part de là.'); // (VIE.proposer part du plan affiché)
    else if (v && !astuceDeplacer) { astuceDeplacer = true; toast('Glisse un meuble du doigt : il s’aimante à la grille.'); } // une fois par visite (le message couvre les boutons)
  }
  // (les réponses au geste passent tout de suite, sans attendre la file des messages : montrerToast)
  function debutGlisse(e, sx, sy) {
    const m = VIE.mobileSous(sx, sy, false); if (!m) return;
    if (!VIE.mobileAchete(m)) { son.non(); montrerToast('Ce meuble n’est pas encore acheté : sa place lui est gardée.'); return; }
    glisse = { id: m.id, pid: e.pointerId, dx: m.x - sx, dy: m.y - sy, x0: sx, y0: sy, bouge: false, cle: '', p: null };
    try { $('#scene').setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    son.tap(); buzz(6); majGlisse(sx, sy);
  }
  function majGlisse(sx, sy) {
    const g = glisse; if (!g) return; if (Math.hypot(sx - g.x0, sy - g.y0) > 6) g.bouge = true;
    const p = VIE.proposer(st, g.id, sx + g.dx, sy + g.dy); if (!p) return;
    const cle = JSON.stringify(p.a); if (cle === g.cle) return; // la même case : rien à refaire
    const avant = g.p; g.cle = cle; g.p = p; SCENE.glisser({ id: g.id, rect: p.rect, ok: p.ok, raison: p.raison, x: p.x, y: p.y, autre: p.autre });
    if (avant && avant.ok !== p.ok) buzz(p.ok ? 4 : [6, 30, 6]);
  }
  function finGlisse(annule) {
    const g = glisse; glisse = null; SCENE.glisser(null); if (!g || !g.p || annule || !g.bouge) return;
    const nom = (VIE.LAY.mobiles.find((m) => m.id === g.id) || {}).nom || 'le meuble';
    if (!g.p.ok) { son.non(); buzz([20, 40, 20]); montrerToast(`${g.p.raison} ${nom.charAt(0).toUpperCase() + nom.slice(1)} reste à sa place.`); return; }
    const a = G.nettoyerAmenagement(g.p.a), pa = g.p.a, bouge = pa.tables.some(Boolean) || !!pa.bar || !!pa.salon || pa.terrasse.some((c) => c != null);
    if (!a && bouge) { son.non(); buzz([20, 40, 20]); montrerToast(`${nom.charAt(0).toUpperCase() + nom.slice(1)} ne peut pas aller si loin : il reste à sa place.`); return; } // une place que le plan ne sait pas écrire : on n'efface jamais l'aménagement pour autant
    if (G.codeAmenagement(a) === G.codeAmenagement(st.amenagement)) return;
    if (a) st.amenagement = a; else delete st.amenagement;
    son.achat(); buzz(10); save(); $('#b-origine').hidden = !st.amenagement;
  }
  function planOrigine() {
    if (!st.amenagement) return;
    openSheet(`<h2>Revenir au plan d’origine ?</h2><p class="sous">Les tables, le bar, le coin salon et la terrasse retournent à leur place du premier jour. Tu pourras les déplacer encore.</p><button type="button" class="btn large" data-a="oui"><b>Oui, le plan d’origine</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Non, je garde mes places</b></button>`);
    on('[data-a="non"]', closeSheet); on('[data-a="oui"]', () => { delete st.amenagement; save(); closeSheet(); son.deblocage(); toast('Le plan d’origine est revenu.'); $('#b-origine').hidden = true; });
  }
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
    key: () => { const j = G.objectifsDuJour(st, st.now), sm = st.semaine, bp = G.butParcours(st); return JSON.stringify([bp.n, Math.floor(bp.part * 100), bp.gain, bp.defi && bp.defi.progres, j.objectifs.map((o) => [o.fait, o.reclame]), j.pain, j.etoileDonnee, sm && [sm.fait, sm.reclame, sm.txt], st.ev && st.ev.type, G.serieEnCours(st), cleAtelier()]); },
    html: () => {
      const j = G.objectifsDuJour(st, st.now), sm = st.semaine, serie = G.serieEnCours(st), faits = j.objectifs.filter((o) => o.fait).length, aReclamer = j.objectifs.some((o) => o.fait && !o.reclame), pain = G.PRODUITS[j.pain];
      return `${PAGE_HEAD('defis', 'Défis', serie > 0 ? `<span class="serie">${ICONS.UI.soleil}${serie} jour${serie > 1 ? 's' : ''}</span>` : '')}
      <div class="bloc">
        ${carteParcours()}
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
      onIn(sec, '[data-k]', (b) => { const r = G.reclamer(st, +b.dataset.k); if (!r.ok) { son.non(); return; } son.deblocage(); buzz([10, 30, 10]); toast(r.etoile ? `+${G.fmtEur(r.prime)} et +1 ★ : objectifs du jour réussis !${r.points ? ` +${r.points} points de boulanger` : ''}` : `+${G.fmtEur(r.prime)} de prime${r.points ? ` · +${r.points} points de boulanger` : ''}`); if (r.etoile) SCENE.fete(); renderCards(true); hud(); save(); renderPage(true); });
      onIn(sec, '[data-a="semaine"]', () => { const r = G.reclamerSemaine(st); if (!r.ok) { son.non(); return; } reussite(`Défi de la semaine : +${G.fmtEur(r.prime)} et +1 ★ ! +${G.POINTS.defi} points de boulanger`); renderPage(true); });
      onIn(sec, '[data-jeu]', (b) => { son.tap(); MINIJEUX.ouvrir(b.dataset.jeu); });
      onIn(sec, '[data-a="parcours"]', () => { son.tap(); sheetParcours(); });
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
          ${aGagner.length ? `<details class="repli"><summary><span>${aGagner.length === 1 ? 'Le dernier à gagner' : `Les ${aGagner.length} à gagner`}</span><i class="ico chev">${ICONS.UI.chevron}</i></summary><div class="trophees">${aGagner.map(troph).join('')}</div></details>` : ''}
          ${st.arriere && st.arriere.trouvee && typeof CASINO !== 'undefined' ? (() => { const ct = CASINO.trophees(st), cg = ct.filter((t) => t.gagne), ca = ct.filter((t) => !t.gagne), trC = (t) => `<div class="troph ${t.gagne ? 'gagne' : ''}" data-trophee-ar="${t.id}">${t.gagne ? `<i class="ico">${ICONS.UI.trophee}</i>` : ''}<b>${esc(t.nom)}</b><span>${esc(t.desc)}</span></div>`; // l'arrière-salle : ses trophées, une fois la petite porte trouvée (le compte de la boutique ne change pas)
            return `<h4 class="sous-titre troph-ar">L’arrière-salle · ${cg.length}/${ct.length}</h4>${cg.length ? `<div class="trophees">${cg.map(trC).join('')}</div>` : '<p class="note">Aucun pour l’instant : ils se gagnent au BlackJack et à la roulette, et ne rapportent que des skins.</p>'}${ca.length ? `<details class="repli"><summary><span>${ca.length === 1 ? 'Le dernier à gagner' : `Les ${ca.length} à gagner`}</span><i class="ico chev">${ICONS.UI.chevron}</i></summary><div class="trophees">${ca.map(trC).join('')}</div></details>` : ''}`; })() : ''}</div>
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
  const TC = typeof TCHAT !== 'undefined' ? TCHAT : null; // le chat des boulangers (src/chat.js)
  const RT = typeof RETOURS !== 'undefined' ? RETOURS : null; // les idées, les bugs et les votes (src/retours.js)
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
  // Réglages › Le jeu : la qualité graphique (st.qualite) et les images par seconde (st.images), en boutons segmentés (un groupe radio :
  // les flèches passent d'un choix à l'autre) ; la ligne d'aide dit ce que fait le choix en cours. Les gains n'en dépendent pas.
  const QUALITES = [['auto', 'Auto'], ['haute', 'Haute'], ['moyenne', 'Moyenne'], ['eco', 'Éco']];
  const NOM_PALIER = { haute: 'Haute', moyenne: 'Moyenne', eco: 'Éco' };
  const AIDE_QUALITE = { haute: 'Ombres fines, lumière douce et effets : le plus beau, le plus gourmand', moyenne: 'Ombres et lumière douce, sans les effets', eco: 'Sans ombres ni décors HD : le plus léger pour le téléphone' };
  const CHOIX_IMAGES = [['economie', 'Économie'], ['fluide', 'Fluide'], ['max', 'Maximum']];
  const AIDE_IMAGES = { economie: 'Économie : la batterie dure le plus longtemps (30 images/s, 10 au repos)', fluide: 'Fluide : plus doux, la batterie baisse un peu plus vite (60 images/s, 20 au repos)', max: 'Maximum : la vitesse de l’écran (jusqu’à 120 sur iPhone Pro), même au repos ; la batterie baisse le plus vite' };
  const palierScene = () => (typeof SCENE !== 'undefined' && SCENE.palier) || '';
  const aideQualite = () => (st.qualite === 'auto' ? `S’adapte à ton téléphone${NOM_PALIER[palierScene()] ? ` (en ce moment\u00a0: ${NOM_PALIER[palierScene()]})` : ''}` : AIDE_QUALITE[st.qualite]);
  function choisirReglage(sec, cle, v) { // cle : 'qualite' ou 'images' ; appliqué tout de suite, sauvé
    if (st[cle] === v) return; st[cle] = v; son.tap(); // (le toucher a déjà réveillé la cadence)
    if (cle === 'qualite') SCENE.choisirQualite(v); // la scène change de palier sans recharger (la HD suit : pas en éco)
    save(); renderPage(true); const b = sec.querySelector(`[data-${cle}="${v}"]`); if (b) b.focus(); // le focus reste sur le choix (le clavier, VoiceOver)
  }
  // Réglages : rangés par groupe ; ce qui sert peu vit ici (repeindre, masquer l'événement, quitter le classement, sauvegarde, partage)
  const pageReglages = {
    key: () => `${st.son}|${st.musique}|${st.vibre}|${st.qualite}|${st.images}|${st.qualite === 'auto' ? palierScene() : ''}|${st.specialite}|${st.nomBoutique}|${st.boutiques}|${st.chat ? st.chat.nom : ''}|${modeleVu()}|${st.quartier ? st.quartier.masque : ''}|${QT ? QT.fenetre(st.now).classement : ''}|${HTE ? `${HTE.visible()}${st[HTE.cle] ? st[HTE.cle].masque : ''}${chatNoir()}${chatNoirDispo()}` : ''}|${classement ? classement.resume().rejoint + classement.resume().pseudo : ''}|${cleNotifs()}`,
    html: () => {
      const q = G.QUARTIERS[G.quartier(st)], cr = classement ? classement.resume() : null;
      const ligne = (a, ico, titre, sous, droite) => `<button type="button" class="reglage" data-a="${a}"><i class="ico">${ico}</i><span><b>${titre}</b>${sous ? `<small>${sous}</small>` : ''}</span>${droite}</button>`;
      const info = (ico, titre, sous) => `<div class="reglage info"><i class="ico">${ico}</i><span><b>${titre}</b><small>${sous}</small></span><span></span></div>`; // une ligne qui informe, sans action
      const sw = (on) => `<span class="interrupteur" role="switch" aria-checked="${on}"></span>`, chev = `<i class="ico chev">${ICONS.UI.chevron}</i>`;
      const groupe = (titre, lignes) => `<h3 class="titre-section"><span>${titre}</span></h3><div class="card reglages">${lignes}</div>`;
      const choix = (cle, ico, titre, aide, options) => `<div class="reglage choix" data-choix="${cle}"><i class="ico">${ico}</i><span><b id="rg-${cle}">${titre}</b><small id="rg-${cle}-aide">${aide}</small></span><span></span>`
        + `<div class="segments" role="radiogroup" aria-labelledby="rg-${cle}" aria-describedby="rg-${cle}-aide">${options.map(([v, t]) => { const on = st[cle] === v; return `<button type="button" role="radio" data-${cle}="${v}" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="${on ? 'actif' : ''}">${t}</button>`; }).join('')}</div></div>`;
      return `${PAGE_HEAD('reglages', 'Réglages')}
      <div class="bloc">
        ${groupe('Le jeu', ligne('son', st.son ? ICONS.UI.son : ICONS.UI.sonOff, 'Sons', 'Petites notes à chaque vente et achat', sw(st.son))
          + ligne('musique', ICO_MUSIQUE(st.son && st.musique !== false), 'Musique', st.son ? 'La musique des événements, sur leur écran (la Maison hantée)' : 'Coupée avec les sons', sw(!!st.son && st.musique !== false)) + ligne('vibre', ICONS.UI.vibre, 'Vibrations', 'Un léger retour sous le doigt', sw(st.vibre))
          + choix('qualite', ICONS.UI.oeil, 'Qualité graphique', aideQualite(), QUALITES) + choix('images', ICONS.UI.eclair, 'Images par seconde', AIDE_IMAGES[st.images] || AIDE_IMAGES.economie, CHOIX_IMAGES)
          + (typeof HDM !== 'undefined' && HDM.actif ? ligne('hd', ICONS.UI.amenager, 'Décors en HD', HDM.raison === 'écran noir' ? 'Coupés : l’écran restait noir sur ce téléphone. Touche pour réessayer' : st.qualite === 'eco' && !HDM.coupe() ? 'En qualité Éco, ils ne se chargent pas : choisis Auto, Haute ou Moyenne pour les voir' : 'Boutique et événements : meubles, clients animés, rue de nuit et équipe (à couper si l’écran reste noir)', sw(!HDM.coupe())) : ''))}
        ${groupe('La boutique', ligne('nom', ICONS.UI.crayon, 'Renommer la boutique', `${esc(G.nomBoutique(st))} · ${esc(q.nom)}`, chev)
          + ligne('repeindre', ICONS.UI.amenager, 'Repeindre la boutique', 'Les meubles entourés, leurs crans et leurs prix : touche-les pour les améliorer', chev)
          + (st.specialite == null ? ligne('specialite', ICONS.UI.specialite, 'Choisir la spécialité', 'Un produit fétiche ×2 pour cette boutique', chev) : info(ICONS.UI.specialite, 'Spécialité', `${esc(G.PRODUITS[st.specialite].nom)} ×2, pour cette boutique`))
          + ligne('compagnons', ICONS.UI.patte, 'Le compagnon', st.chat ? `${esc(st.chat.nom)}, ${esc(G.compagnon(modeleVu()).nom.toLowerCase())} · ${G.COMPAGNONS.length} animaux au choix, du chat au mini-dragon` : 'Choisis l’animal de la boutique : du chat roux au mini-dragon', chev)
          + (st.chat ? ligne('chat', ICONS.UI.chat, `Renommer ${esc(st.chat.nom)}`, 'Le compagnon de la boutique', chev) : ''))}
        ${cr && cr.rejoint ? groupe('Classement', ligne('cl-quitter', ICONS.UI.quitter, 'Quitter le classement', `Ton pseudo « ${esc(cr.pseudo)} » et tes points disparaissent du classement`, chev)) : ''}
        ${blocNotifs(ligne, sw)}
        ${QT && QT.fenetre(st.now).ouvert ? groupe('Événement', ligne('quartier', ICONS.UI.quartier, 'Masquer l’événement', 'Le Quartier, une parodie réservée aux adultes : l’icône et la Planque disparaissent', sw(!!(st.quartier && st.quartier.masque))) ) : ''}
        ${HTE && HTE.fenetre() && HTE.fenetre().ouvert ? groupe('Halloween', ligne('hantee', ICONS.UI.hantee, 'Masquer la Maison hantée', 'L’icône citrouille et le manoir disparaissent ; le reste du jeu ne change pas', sw(!!(st[HTE.cle] && st[HTE.cle].masque)))) : ''}
        ${groupe('Sauvegarde et partage', ligne('sauvegarde', ICONS.UI.sauvegarde, 'Sauvegarde et transfert', 'Copier un code, le charger sur un autre appareil', chev)
          + ligne('partager', ICONS.UI.partager, 'Partager ma boutique', 'Une image de la boutique et ton score', chev)
          + (window.FOURNIL_ACCUEIL ? ligne('accueil', ICONS.UI.salle, 'Salle de jeux', 'Revenir à l’écran d’accueil et aux autres jeux', chev) : ''))}
        ${groupe('Aide', ligne('journal-retours', ICONS.UI.journal, 'Journal des retours', 'Les 10 derniers retours dans le jeu et ce que tes apprentis ont vendu', chev)
          + ligne('credits', ICO_CREDITS, 'Crédits', 'Les modèles 3D, les sons et la musique du jeu, et leurs auteurs', chev))}
        <div class="card reglages danger">${ligne('reset', ICONS.UI.recommencer, 'Recommencer de zéro', 'Efface tout, étoiles comprises', chev)}</div>
        <p class="note centre">Le Fournil · boutique n°${st.boutiques} · ${esc(q.nom)}<br>Ta boutique est enregistrée toutes les 5 secondes et à chaque achat.</p>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-a="son"]', () => { st.son = !st.son; save(); renderPage(true); if (st.son) son.tap(); if (typeof SONS !== 'undefined') SONS.majMusique(); });
      onIn(sec, '[data-a="musique"]', () => { if (!st.son) { son.non(); return; } st.musique = st.musique === false; save(); renderPage(true); son.tap(); if (typeof SONS !== 'undefined') SONS.majMusique(); }); // st.musique : absent = activée
      onIn(sec, '[data-a="credits"]', () => { son.tap(); sheetCredits(); });
      onIn(sec, '[data-a="vibre"]', () => { st.vibre = !st.vibre; save(); renderPage(true); buzz(8); });
      onIn(sec, '[data-a="nom"]', () => sheetNom(false));
      onIn(sec, '[data-a="repeindre"]', () => { son.tap(); repeindre(); });
      onIn(sec, '[data-a="chat"]', () => sheetNomChat());
      onIn(sec, '[data-a="compagnons"]', () => { son.tap(); sheetCompagnons(); });
      onIn(sec, '[data-a="specialite"]', sheetSpecialite);
      onIn(sec, '[data-a="sauvegarde"]', sheetSauvegarde);
      for (const cle of ['qualite', 'images']) {
        onIn(sec, `[data-${cle}]`, (b) => choisirReglage(sec, cle, b.dataset[cle]));
        const grp = sec.querySelector(`[data-choix="${cle}"] [role="radiogroup"]`); // les flèches : le choix voisin (le motif « groupe radio »)
        if (grp) grp.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); const bs = [...grp.querySelectorAll('[role="radio"]')], k = bs.indexOf(document.activeElement); const b = bs[((k < 0 ? 0 : k) + d + bs.length) % bs.length]; audio(); choisirReglage(sec, cle, b.dataset[cle]); });
      }
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

  // ─── la réserve de boosts (les paliers des événements, le parcours, les contrats de la nuit, les copains) : une pastille sous les objectifs, à lancer quand on veut ───
  let lastBoosts = '';
  function renderBoosts() {
    const el = $('#boosts'); if (!el) return;
    const b = st.boosts, actif = b && b.actif && b.actif.fin > st.now ? b.actif : null, reserve = b ? b.reserve : [];
    if (!actif && !reserve.length) { if (lastBoosts) { lastBoosts = ''; el.hidden = true; } return; }
    const reste = actif ? G.fmtChrono((actif.fin - st.now) / 1000) : '', key = `${actif ? actif.mult + reste : ''}|${reserve.map((x) => x.mult + ':' + x.secs).join(',')}`;
    if (key === lastBoosts) return; lastBoosts = key; el.hidden = false;
    el.className = 'ticket boosts' + (actif ? ' actif' : '');
    el.innerHTML = `<i class="ico">${ICONS.UI.eclair}</i><span class="tk-txt"><b>${actif ? `Boost ×${actif.mult} en cours` : `Boost ×${reserve[0].mult} · ${G.fmtDuree(reserve[0].secs)}`}</b><small>${actif ? `Toutes les ventes ×${actif.mult}${reserve.length ? ` · encore ${reserve.length} en réserve` : ''}` : reserve.length > 1 ? `${reserve.length} boosts en réserve` : 'En réserve : lance-le quand tu veux'}</small></span><span class="tk-pill">${actif ? reste : 'Lancer'}</span>`;
  }
  function lancerBoost() {
    const b = st.boosts; if (!b || (b.actif && b.actif.fin > st.now)) { toast('Un boost tourne déjà : attends la fin.'); return; }
    if (!b.reserve.length) return;
    if (b.reserve.length === 1) { const r = G.lancerBoostReserve(st, 0); if (r.ok) reussite(`Boost ×${r.boost.mult} lancé : toutes les ventes ×${r.boost.mult} pendant ${G.fmtDuree((r.boost.fin - st.now) / 1000)} !`); return; }
    openSheet(`<h2>La réserve de boosts</h2><p class="sous">Gagnés aux paliers des événements, sur le parcours du boulanger, aux contrats de la nuit, à ta place au classement (chaque lundi, et à la fin des événements), avec les pourboires des copains et l’objectif commun. Un seul à la fois ; il tourne sur l'horloge, même la boutique fermée.</p><div class="liste-am">${b.reserve.map((x, k) => `<div class="am"><div><h3>Boost ×${x.mult}</h3><p>Toutes les ventes ×${x.mult} pendant ${G.fmtDuree(x.secs)}</p></div><button type="button" class="btn beurre" data-k="${k}"><small>Lancer</small><b>×${x.mult}</b></button></div>`).join('')}</div>${btnRetour()}`);
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
    { txt: 'Bravo ! Au niveau 25, 50, 75, 100… les gains montent d’un cran. Et regarde tes objectifs du jour : trois défis, une étoile à la clé.', ou: 'pages', cible: () => $('#objectifs'), pret: () => true, fini: () => performance.now() > hintUntil },
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
    const bonus = G.AMELIORATIONS.filter((a) => G.ameliorationOuverte(st, a)).map((a) => { // le bonus d'une recette de boutique pas encore gagnée reste caché
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
  // la fiche d'un meuble, ouverte en le touchant dans la boutique (les neuf, bar, coin salon et terrasse compris) : nom, crans, sa phrase, le bonus actuel et le suivant, le prix
  function sheetMeuble(id) {
    const m = G.MOBILIER.find((x) => x.id === id); if (!m) return;
    const k = G.mobilierCran(st, id), max = k >= m.max, prix = G.prixMeuble(st, id), ok = !max && st.coins >= prix;
    openSheet(`<div class="meuble-fiche">${ICONS.MEUBLES[id]}<div><h2>${esc(m.nom)}</h2><p class="sous">${crans(k, m.max)} cran ${k} sur ${m.max}</p></div></div>
      ${m.phrase ? `<p class="sous meuble-phrase">${esc(m.phrase)}</p>` : ''}<div class="encadre espace">${k ? `<b>Maintenant :</b> ${esc(m.desc(k))}` : 'Pas encore installé.'}${max ? '' : `<br><b>Cran suivant :</b> ${esc(m.desc(k + 1))}`}</div>
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
    const choixSpe = nouvelle && st.specialite == null; let spe = choixSpe ? (st.boutiques + 1) % G.recettesConnues(st) : null;
    openSheet(`<h2>${nouvelle ? `Boutique n°${st.boutiques}` : 'Le nom de ta boutique'}</h2><p class="sous">${nouvelle ? `Tu t’installes dans ${esc(q.nom)}. ` : ''}Comment s’appelle ta boutique ? Le nom s’affiche sur l’enseigne.</p>
      <input class="champ" type="text" maxlength="24" value="${esc(actuel)}" aria-label="Nom de la boutique" autocomplete="off" autocorrect="off">
      ${choixSpe ? `<h3 class="titre-section">Sa spécialité</h3><p class="sous">Le produit fétiche de cette boutique rapporte <b>×2</b> le temps de la boutique. On choisit une fois.</p>${grilleSpecialite(spe)}` : ''}
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>${nouvelle ? 'C’est parti !' : 'Garder ce nom'}</b></button>
      ${nouvelle ? '' : '<button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Annuler</b></button>'}`);
    const champ = fc.querySelector('.champ');
    // le nom proposé (l'enseigne du quartier) n'est pas stocké : G.renommer le couperait à 24 caractères (« Le Grand Fournil de la C »)
    const valider = () => { const v = champ.value.replace(/\s+/g, ' ').trim(); G.renommer(st, v === q.enseigne ? '' : v); if (choixSpe && spe != null) G.choisirSpecialite(st, spe); save(); renderCards(true); hud(); closeSheet(); renderPage(true); toast(`${G.nomBoutique(st)} : bienvenue !${choixSpe && spe != null ? ` Spécialité : ${G.PRODUITS[spe].pl}.` : ''}`); };
    on('[data-a="ok"]', valider); on('[data-a="non"]', closeSheet);
    on('[data-s]', (b) => { spe = +b.dataset.s; fc.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('actif', x === b)); son.tap(); });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
    if (!nouvelle) setTimeout(() => { champ.focus(); champ.select(); }, 50);
  }
  const grilleSpecialite = (sel) => `<div class="spe-grille">${G.PRODUITS.slice(0, G.recettesConnues(st)).map((p, i) => `<button type="button" class="${i === sel ? 'actif' : ''}" data-s="${i}">${ICONS.PRODUITS[p.id]}<span>${esc(p.court || p.nom.split(' ')[0])}</span></button>`).join('')}</div>`;
  function sheetSpecialite() {
    let spe = (st.boutiques + 1) % G.recettesConnues(st);
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
  // la jauge de la prochaine étoile : la part déjà gagnée entre la dernière étoile récoltable et la suivante, ce qu'il reste, et en combien de temps au rythme actuel
  function jaugeEtoile() {
    const j = G.prochaineEtoile(st), r = G.rythme(st), pct = Math.floor(j.part * 100);
    const duree = r > 0 ? ` · ≈ ${G.fmtDuree(j.reste / r)} de gains` : '';
    return `<div class="et-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Prochaine étoile : ${pct} %">
        <div class="et-jauge-tete"><span>Prochaine étoile : <b>+${j.n + 1} ★</b></span><b>${pct} %</b></div>
        <div class="et-jauge-barre"><i style="width:${(j.part * 100).toFixed(1)}%"></i></div>
        <small>Encore ${G.fmtEur(j.reste)} à gagner dans cette boutique${duree}</small></div>`;
  }
  // ─── le parcours du boulanger (GAME.butParcours, parcoursListe) : la récompense de chaque boutique, le défi de passage, la carte des Défis ───
  const icoQuartier = (q) => { const d = (typeof VIE !== 'undefined' && VIE.decor) ? VIE.decor(q) : null, mur = d ? d.mur : '#FFF1E3', acc = d ? d.accent : '#FF9FB2', cpt = d ? d.comptoir : '#D9915C';
    return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 21L24 8l17 13v19H7z" fill="${mur}" stroke="#4A3328" stroke-width="2" stroke-linejoin="round"/><path d="M9 21h30l-2 6H11z" fill="${acc}" stroke="#4A3328" stroke-width="2" stroke-linejoin="round"/><rect x="13" y="30" width="9" height="10" rx="1.5" fill="${cpt}" stroke="#4A3328" stroke-width="2"/><rect x="26" y="30" width="9" height="6" rx="1.5" fill="#DDF3FF" stroke="#4A3328" stroke-width="2"/></svg>`; }; // une façade aux couleurs du quartier
  function icoRecompense(r) {
    if (!r) return ICONS.ETOILE;
    if (r.type === 'recette') return ICONS.PRODUITS[r.p.id];
    if (r.type === 'quartier') return icoQuartier(r.quartier);
    if (r.type === 'tenue') { const v = G.vetement(r.id); return v ? ICONS.vetement(v.forme, v.collection) : ICONS.ETOILE; }
    if (r.type === 'gains') return ICONS.AMELIORATION;
    if (r.type === 'boost') return ICONS.FEU;
    if (r.type === 'titre') return ICONS.boulanger(5);
    return ICONS.ETOILE;
  }
  const leRecompense = (r) => (!r ? '' : r.type === 'recette' ? `le ${r.p.nom}`.replace(/^le ([AEÉIOU])/, 'l’$1').replace(/^le Tarte/, 'la Tarte') : G.texteRecompense(r)); // « le Paris-Brest », « l’Opéra », « la Tarte aux myrtilles »
  // le défi de passage, encore exigé après la n°30 (celui de la n°29) : sa ligne sous « Parcours terminé », texte et progression
  const ligneDefiFin = (d) => (d ? `<p class="note">${d.fait ? '✓ ' : ''}Défi de passage : ${esc(d.txt)} · ${G.fmt(d.progres)}/${G.fmt(d.cible)}</p><div class="mini xp"><i style="width:${Math.floor(d.part * 100)}%"></i></div>` : '');
  // la carte en haut de l'onglet Défis : « Objectif : boutique n°6 · Canelé · 52 % »
  function carteParcours() {
    const b = G.butParcours(st);
    if (b.fini) return `<div class="card parcours fini" data-a="parcours" role="button" tabindex="0"><div class="c-tete"><span class="pic or">${ICONS.UI.parcours}</span><h3>Parcours terminé, félicitations !</h3><span class="compte or">${G.PARCOURS_FIN}/${G.PARCOURS_FIN}</span></div><p class="note">Les ${G.PARCOURS_FIN} boutiques sont ouvertes${G.titreParcours(st) ? ` : te voilà « ${esc(G.titreParcours(st))} »` : ''}. Touche pour revoir ton parcours.</p>${ligneDefiFin(b.defi)}</div>`;
    const r = b.recompense, pc = Math.floor(b.part * 100);
    return `<div class="card parcours ${b.pret ? 'pret' : ''}" data-a="parcours" role="button" tabindex="0" aria-label="Le parcours du boulanger : objectif boutique n°${b.n}, ${pc} %">
      <div class="c-tete"><span class="pic lav">${icoRecompense(r)}</span><h3>Objectif : boutique n°${b.n}${r ? ` · ${esc(r.type === 'recette' ? r.p.nom : r.type === 'quartier' ? r.quartier.nom : G.texteRecompense(r))}` : ''}</h3><span class="compte ${b.pret ? 'ok' : ''}">${pc} %</span></div>
      <div class="mini xp"><i style="width:${pc}%"></i></div>
      <p class="note">${b.pret ? (etoilesPretes(st, b.gain) ? 'Prête à ouvrir : touche ★ en haut.' : 'Prête à ouvrir : ouvre la feuille ★.') : `Étoiles : +${G.fmt(b.gain)} sur +${G.fmt(b.conseil)} conseillées${b.defi ? ` · Défi : ${esc(b.defi.txt)} (${G.fmt(b.defi.progres)}/${G.fmt(b.defi.cible)})` : ''}`}</p></div>`;
  }
  function sheetParcours() { // les boutiques du parcours (G.PARCOURS_FIN) : passées, actuelle, à venir ; leur quartier, leur récompense, leur défi
    const liste = G.parcoursListe(st), b = G.butParcours(st);
    const ligne = (x) => `<li class="pc-ligne ${x.etat}"><span class="pc-n">${x.n}</span><span class="pc-ico">${x.n === 1 ? icoQuartier(x.quartier) : icoRecompense(x.recompense)}</span>
      <span class="pc-txt"><b>${x.n === 1 ? 'Ta première boutique' : esc(x.texte || '—')}</b><small>${esc(x.quartier ? x.quartier.nom : '')}${x.etat === 'actuelle' ? ' · tu es ici' : ''}</small>${x.defi && x.etat !== 'passee' ? `<small class="pc-defi">Pour ouvrir la n°${x.n + 1} : ${esc(x.defiTxt)}</small>` : ''}</span>
      ${x.etat === 'passee' ? `<i class="pc-ok">${ICONS.UI.coche || '✓'}</i>` : ''}</li>`;
    openSheet(`<h2>Le parcours du boulanger</h2><p class="sous">${G.PARCOURS_FIN} boutiques, une récompense à chacune : des recettes, des quartiers, une tenue, des bonus. Dès la boutique n°6, ouvrir la suivante demande aussi un défi de passage.${G.titreParcours(st) ? ` Ton titre : <b>${esc(G.titreParcours(st))}</b>.` : ''}</p>
      ${b.fini ? `<div class="encadre doux"><b>Parcours terminé, félicitations !</b> Les ${G.PARCOURS_FIN} boutiques sont ouvertes.${b.defi ? `<br>Pour ouvrir la suivante, le défi de passage : ${esc(b.defi.txt)} · ${G.fmt(b.defi.progres)}/${G.fmt(b.defi.cible)}${b.defi.fait ? ' ✓' : ''}` : ''}</div>` : ''}
      ${ligneStanding()}
      <ol class="pc-liste">${liste.map(ligne).join('')}</ol>${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
    const ici = fc.querySelector('.pc-ligne.actuelle'); if (ici) setTimeout(() => { try { ici.scrollIntoView({ block: 'center' }); } catch (e) { /* rien */ } }, 30);
  }
  function sheetRecapParcours(liste) { // une sauvegarde d'avant le parcours : ce qu'elle reçoit d'un coup, une fois
    openSheet(`<h2>Ton parcours</h2><p class="sous">Nouveau : chaque boutique apporte sa récompense. Tu en as déjà ouvert ${st.boutiques} : voici tout ce qui t’attendait.</p>
      <ul class="detail pc-recap">${liste.map((x) => `<li><span class="pc-ico">${icoRecompense(x.r)}</span><span><b>Boutique n°${x.n}</b><small>${esc(x.texte)}</small></span></li>`).join('')}</ul>
      <button type="button" class="btn large beurre" data-a="parcours"><b>Voir le parcours</b></button>${btnRetour()}`);
    on('[data-a="close"]', closeSheet); on('[data-a="parcours"]', sheetParcours);
  }
  // le standing (GAME.standing : 6 paliers, un toutes les cinq boutiques) : la ligne des feuilles Étoiles et Parcours, et l'annonce du palier
  const pipsStanding = (s) => `<span class="sg-pips" aria-hidden="true">${G.STANDINGS.map((x, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</span>`;
  function ligneStanding() {
    if (!G.standing) return ''; const s = G.standing(st), x = G.STANDINGS[s], fin = s >= G.STANDINGS.length - 1, n = (s + 1) * G.STANDING_PAS + 1;
    return `<div class="sg-ligne"><span class="sg-txt"><small>Standing</small><b>${esc(x.nom)}</b><small>${fin ? 'Le plus beau des décors : bravo !' : `Prochain palier à la boutique n°${n}`}</small></span>${pipsStanding(s)}</div>`;
  }
  function sheetMonteeGamme(suite) {
    const s = G.standing(st), x = G.STANDINGS[s];
    openSheet(`<div class="sg-annonce"><small>Boutique n°${st.boutiques}</small><h2>Ta boutique monte en gamme !</h2><div class="sg-nom">${esc(x.nom)}</div>${pipsStanding(s)}<p class="sous">${esc(x.phrase)}</p></div>
      <p class="sous">Le décor change tout seul toutes les cinq boutiques. ${s < G.STANDINGS.length - 1 ? `Prochain palier à la boutique n°${(s + 1) * G.STANDING_PAS + 1}.` : 'C’est le dernier palier : ta boutique est un palais.'}</p>
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>Voir ma boutique</b></button>`);
    setTimeout(() => confettis(1.2), 450);
    on('[data-a="ok"]', () => { son.tap(); if (suite) suite(); else closeSheet(); });
  }
  function butEtoiles() { // la feuille Étoiles : ce que la prochaine boutique apporte, et son défi de passage
    const b = G.butParcours(st), ligneDefi = b.defi ? `<span class="et-defi ${b.defi.fait ? 'fait' : ''}">${b.defi.fait ? '✓ ' : ''}Défi de passage : ${esc(b.defi.txt)} · ${G.fmt(b.defi.progres)}/${G.fmt(b.defi.cible)}</span>` : '';
    if (b.fini) return `<div class="et-but fini"><b>Parcours terminé, félicitations !</b><small>Les ${G.PARCOURS_FIN} boutiques du parcours sont ouvertes.</small>${ligneDefi}</div>`;
    const r = b.recompense;
    return `<button type="button" class="et-but" data-a="parcours"><span class="et-but-ico">${icoRecompense(r)}</span><span class="et-but-txt"><small>Ta prochaine boutique débloque</small><b>${esc(r ? leRecompense(r) : `la boutique n°${b.n}`)}</b>${ligneDefi}</span><i class="ico chev">${ICONS.UI.chevron}</i></button>`;
  }
  function sheetEtoiles() {
    const gain = G.etoilesGagnables(st), bonus = Math.round(st.etoiles * G.ETOILE_BONUS * 100), q = G.QUARTIERS[G.quartier(st)], defi = G.defiPassage(st), bloque = !!(defi && !defi.fait), titre = G.titreParcours(st);
    openSheet(`<h2>Étoiles</h2><p class="sous"><b>${esc(G.nomBoutique(st))}</b> · boutique n°${st.boutiques}, ${esc(q.nom)} · ${st.etoiles} étoile${st.etoiles > 1 ? 's' : ''} · +${bonus} % sur tous les gains${titre ? ` · ${esc(titre)}` : ''}</p>
      ${butEtoiles()}
      <div class="encadre doux">Ouvrir une <b>nouvelle boutique</b> remet les produits et les euros à zéro, mais tu gardes tes étoiles pour toujours. Chaque étoile : <b>+${Math.round(G.ETOILE_BONUS * 100)} %</b> de gains. Plus tu as gagné dans cette boutique, plus tu en récoltes. Les objectifs du jour en donnent une aussi.</div>
      <div class="grand-nombre">+${gain} ★</div><p class="sous">à récolter maintenant (${G.fmtEur(st.lifetimeRun)} gagnés dans cette boutique)</p>
      ${jaugeEtoile()}
      <button type="button" class="btn large ${gain > 0 && !bloque ? 'beurre' : 'non'}" data-a="prestige"${bloque ? ' aria-disabled="true"' : ''}><small>${bloque ? `Défi de passage : ${esc(defi.txt)}` : gain > 0 ? 'Repartir avec' : 'Pas encore'}</small><b>${bloque ? `${G.fmt(defi.progres)} / ${G.fmt(defi.cible)}` : gain > 0 ? `+${gain} étoile${gain > 1 ? 's' : ''}` : 'Vends encore un peu'}</b></button>
      <h3 class="titre-section">Ta boutique</h3>
      ${ligneStanding()}
      <div class="stat"><span>Fournées vendues</span><b>${G.fmt(st.stats.ventes)}</b></div><div class="stat"><span>Clients servis</span><b>${G.fmt(st.stats.clients)}</b></div><div class="stat"><span>Gagné depuis le début</span><b>${G.fmtEur(st.lifetime)}</b></div>
      ${btnRetour()}`);
    const t = setInterval(() => { const j = $('#feuille-contenu .et-jauge'); if (!j || $('#feuille').hidden) { clearInterval(t); return; } j.outerHTML = jaugeEtoile(); }, 1000); // la jauge avance à l'écran
    on('[data-a="close"]', closeSheet); on('[data-a="parcours"]', () => { son.tap(); sheetParcours(); });
    on('[data-a="prestige"]', () => {
      const dp = G.defiPassage(st); if (dp && !dp.fait) { son.non(); toast(`D’abord le défi de passage : ${dp.txt}.`); return; }
      if (G.etoilesGagnables(st) <= 0) { son.non(); return; }
      openSheet(`<h2>Nouvelle boutique ?</h2><p class="sous">Tu repars de la première baguette avec <b>${st.etoiles + gain} étoiles</b> (+${Math.round((st.etoiles + gain) * G.ETOILE_BONUS * 100)} % de gains). Les bonus et le mobilier achetés sont perdus (les places des meubles restent). Tes objectifs du jour réussis sont récupérés d’office.</p>
        <button type="button" class="btn large beurre" data-a="oui"><b>Ouvrir la boutique n°${st.boutiques + 1}</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Rester ici</b></button>`);
      on('[data-a="non"]', sheetEtoiles);
      on('[data-a="oui"]', () => { const avant = G.standing ? G.standing(st) : 0, r = G.nouvelleBoutique(st, HORLOGE.maintenant()); if (r.ok) { son.deblocage(); buzz([20, 40, 20]); SCENE.fete(); confettis(1.6); const rec = r.recompenses && r.recompenses.find((x) => x.n === st.boutiques); toast(`Boutique n°${st.boutiques} ouverte : +${r.gain} ★${rec ? ` · ${rec.texte}` : ''}`); st.tuto = Math.max(st.tuto, INDICES.length); amenager(false); renderCards(true); hud(); save(); showPage('boutique'); if (G.standing && G.standing(st) > avant) sheetMonteeGamme(() => sheetNom(true)); else sheetNom(true); } }); // un nouveau palier de standing : l'annonce d'abord, puis le nom
    });
  }
  // la feuille « Nouveautés » : le récap des mises à jour (src/nouveautes.js), la plus récente dépliée en tête, « Nouveau » sur celles
  // que le joueur n'avait pas vues ; l'ouvrir marque tout comme vu (le point du cadeau s'éteint)
  function sheetNouveautes() {
    if (!NVS) return;
    const vues = st.nouveautesVues, an = new Date(HORLOGE.maintenant()).getFullYear();
    const entree = (n, k) => { const neuve = NVS.nonVue(n, vues);
      return `<details class="nv${neuve ? ' neuve' : ''}" data-nv="${esc(n.id)}"${k === 0 ? ' open' : ''}><summary><span class="nv-tete"><b>${esc(n.titre)}</b><small>${esc(NVS.dateFr(n.date, an))}</small></span>${neuve ? '<i class="nv-badge">Nouveau</i>' : ''}<i class="ico chev">${ICONS.UI.chevron}</i></summary>
        <ul class="nv-points">${n.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>`; };
    openSheet(`<h2>Nouveautés</h2><p class="sous">Ce qui a changé dans le Fournil, de la plus récente à la plus ancienne.</p>
      <div class="nv-liste">${NVS.NOUVEAUTES.map(entree).join('')}</div>${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
    st.nouveautesVues = NVS.derniere(); save(); hud();
  }
  // Réglages › Musique et Crédits : deux icônes au trait du jeu (src/icons.js), et la feuille des crédits : qui a fait quoi, sous quelle licence
  const ICO_MUSIQUE = (on) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#4A3328" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17.5V6l10-2v11.5"/><ellipse cx="6.6" cy="17.6" rx="2.6" ry="2.1" fill="#C9BCFF"/><ellipse cx="16.6" cy="15.6" rx="2.6" ry="2.1" fill="#C9BCFF"/>${on ? '' : '<path d="M4 4l16 16"/>'}</svg>`;
  const ICO_CREDITS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#4A3328" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.4.9-5.4-3.9-3.8 5.4-.8z" fill="#FFD66B"/><path d="M5 21h14"/></svg>';
  const CREDITS = [ // [titre, [[qui, quoi, licence]]] ; tout est libre : les licences CC0 n'obligent à rien, on crédite quand même
    ['La boutique en 3D', [['Kay Lousberg (kaylousberg.com)', 'KayKit : Furniture, Restaurant, City Builder, Halloween et Dungeon Bits, Spooktober, Adventurers, Skeletons (Mystery Monthly Series 4)', 'CC0'],
      ['Kenney (kenney.nl)', 'Furniture Kit, Food Kit, Mini Market et Mini Characters', 'CC0'], ['Quaternius (quaternius.com)', 'les clients : Ultimate Animated Character Pack, et le salut de la main des Ultimate Modular Men & Women', 'CC0'], ['Three.js', 'le moteur 3D (r158)', 'MIT']]],
    ['Les sons de la boutique', [['Kenney (kenney.nl)', 'les bruitages : clics, pièces, fanfare, cartes', 'MIT'], ['ZzFX (Frank Force)', 'les petits sons de synthèse', 'MIT']]],
    ['La Maison hantée', [['Kay Lousberg', 'le décor, l’équipe et les clients-monstres (KayKit)', 'CC0'], ['Asset Quest', 'les fantômes', 'CC0'], ['Kenney', 'des bonbons, le jingle d’ouverture, la vente, la louche et le plancher', 'CC0'],
      ['Poly Haven, ambientCG', 'des textures et la lumière de la nuit', 'CC0'],
      ['Tsorthan Grove', 'la musique, « Lanterns in the Hollowed Forest »', 'CC0'],
      ['qubodup, w.forster.1, PWL, AntumDeluge, Ogrebane, BMacZero, zeroisnotnull, Kerzoven', 'la sonnette, la porte qui grince, la cloche, la sorcière, le fantôme, le chaudron, le corbeau, le chat (OpenGameArt.org)', 'CC0']]],
    ['Le reste', [['canvas-confetti (Kiril Vatev)', 'les confettis', 'ISC'], ['Fredoka et Nunito', 'les polices (Google Fonts)', 'OFL']]],
  ];
  function sheetCredits() {
    openSheet(`<h2>Crédits</h2><p class="sous">Le Fournil est fait avec des modèles, des sons et une musique offerts par leurs auteurs. Merci à eux !</p>
      ${CREDITS.map(([t, l]) => `<h3 class="titre-section"><span>${esc(t)}</span></h3><ul class="detail credits">${l.map(([qui, quoi, lic]) => `<li><span><b>${esc(qui)}</b><small>${esc(quoi)}</small></span><b>${esc(lic)}</b></li>`).join('')}</ul>`).join('')}
      <p class="sous">Les licences complètes sont rangées avec les fichiers (fournil/hd/…, fournil/sons/…).</p>
      <button type="button" class="btn large menthe" data-a="close"><b>Fermer</b></button>`);
    on('[data-a="close"]', closeSheet);
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
        if (!recus.includes(c.n)) { if (c.montant > 0) G.gagner(st, c.montant, true); if (c.etoiles > 0) st.etoiles += c.etoiles; recus.push(c.n); nouveaux.push(c); }
        classement.cadeauRecu(c.n);
      }
      while (recus.length > 50) recus.shift();
      if (!nouveaux.length) return;
      save(); renderCards(true); hud();
      const total = nouveaux.reduce((a, c) => a + c.montant, 0), etoiles = nouveaux.reduce((a, c) => a + c.etoiles, 0), motifs = [...new Set(nouveaux.map((c) => c.motif).filter(Boolean))];
      const quoi = [total > 0 ? `+${G.fmtEur(total)}` : '', etoiles > 0 ? `+${G.fmt(etoiles)} étoile${etoiles > 1 ? 's' : ''}` : ''].filter(Boolean);
      const montrer = () => { son.deblocage(); buzz([20, 40, 20]); confettis(1.4); openSheet(`<h2>Un cadeau !</h2><p class="sous">${motifs.length ? esc(motifs.join(' · ')) : 'Pour ta boutique'}</p>${quoi.map((x) => `<div class="grand-nombre">${esc(x)}</div>`).join('')}${etoiles > 0 ? `<p class="sous">+${Math.round(etoiles * G.ETOILE_BONUS * 100)} % de gains, pour toujours</p>` : ''}
        <button type="button" class="btn large menthe" data-a="close"><b>Merci !</b></button>`); on('[data-a="close"]', closeSheet); };
      if ($('#feuille').hidden) montrer(); else { const t = setInterval(() => { if ($('#feuille').hidden) { clearInterval(t); montrer(); } }, 1000); }
    }).catch(() => { /* rien */ }).then(() => { cadeauxVol = false; });
  }
  // la mise à jour : la page connaît sa version (window.FOURNIL_VERSION, écrite par build.js) ; le jeu relit fournil/version.json (jamais
  // en cache) une minute après le lancement, toutes les 5 min à l'écran et à chaque retour. S'il a changé, un bandeau propose de recharger,
  // la partie sauvée juste avant. Pas de version (l'artefact, une page ouverte en fichier) : rien
  const VERSION = typeof window.FOURNIL_VERSION === 'string' ? window.FOURNIL_VERSION : '';
  let versionVol = false, versionVue = -Infinity;
  function verifierVersion() {
    if (!VERSION || versionVol || !/^https?:$/.test(location.protocol) || document.hidden || $('.maj')) return;
    if (performance.now() - versionVue < 60e3) return; // au plus une fois par minute
    versionVol = true; versionVue = performance.now();
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const v = d && typeof d.v === 'string' ? d.v : '';
      if (/^[0-9a-f]{6,40}$/.test(v) && v !== VERSION) bandeauMaj();
    }).catch(() => { /* hors ligne : on réessaiera */ }).then(() => { versionVol = false; });
  }
  function bandeauMaj() {
    if ($('.maj')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'maj';
    b.innerHTML = '<b>Nouvelle version du Fournil</b><span>Touche pour mettre à jour</span>';
    b.addEventListener('click', () => {
      b.disabled = true; b.querySelector('span').textContent = 'Mise à jour…'; save();
      const sw = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration().then((r) => (r ? r.update() : null)).catch(() => null) : Promise.resolve();
      Promise.race([sw, new Promise((res) => setTimeout(res, 1500))]).then(() => { save(); location.reload(); });
    });
    document.body.appendChild(b);
  }
  function sheetRetour(abs) {
    const detail = abs.detail.slice().sort((a, b) => b.m - a.m).map((d) => `<li><span>${esc(d.nom || G.PRODUITS[d.i].nom)} × ${G.fmt(d.n)}</span><b>${G.fmtEur(d.m)}</b></li>`).join('');
    const grades = (abs.grades || []).map((g) => `${G.APPRENTIS[g.i].prenom} passe au grade ${g.niv}`).join(' · ');
    openSheet(`<h2>Pendant ton absence</h2><p class="sous">${G.fmtDuree(abs.secs)}${abs.secs >= G.heuresAbsence(st) * 3600 ? ` (les apprentis s’arrêtent après ${G.fmtDuree(G.heuresAbsence(st) * 3600)})` : ''}</p>
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
  function majChat() { const id = modeleVu(); if (id !== dernierModele) { dernierModele = id; if (SCENE.compagnon) SCENE.compagnon(id); else if (SCENE.pelageChat) SCENE.pelageChat(id === 'chat-noir' ? 'noir' : 'roux'); } }
  const CRIS = { wouf: 'Wouf !', woufgrave: 'WOUF.', cotcot: 'Cot cot !', coincoin: 'Coin coin !', couic: 'Couic !', couac: 'Couac !' };
  function criCompagnon(id) { // la caresse : le cri d'un animal simple (src/sons.js, sinon un bip à sa hauteur), le ronron pour les autres
    const c = G.compagnon(id), n = c && c.cri;
    if (!n) { son.ronron(); return id === 'dragon' ? 'Pfffouh…' : 'Rrrr…'; }
    if (!zf(n, { vol: 0.3 })) { const f = { wouf: 220, woufgrave: 130, cotcot: 560, coincoin: 340, couic: 1250, couac: 280 }[n] || 440; beep(f, 0.09, n === 'couic' ? 'sine' : 'square', 0.035); beep(f * 0.9, 0.09, n === 'couic' ? 'sine' : 'square', 0.03, 0.13); }
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
          : prix == null ? `<span class="cp-verrou">${esc(c.verrou || 'Pendant Halloween')}</span>`
          : `<button type="button" class="btn ${assez ? 'beurre' : 'non'}" data-cp-acheter="${c.id}" aria-label="${assez ? 'Acheter' : 'Pas assez pour'} ${esc(c.nom)} : ${G.fmtEur(prix)}"><small>${assez ? 'Acheter' : 'Pas assez'}</small><b>${G.fmtEur(prix)}</b></button>`;
        return `<div class="cp-carte ${choisi ? 'choisi' : ''} ${a ? '' : 'verrou'}" data-cp="${c.id}"><span class="cp-ico">${ICONS.compagnon(choisi ? vu : c.id)}</span><b>${esc(c.nom)}</b><small class="cp-phrase">${esc(c.phrase)}</small>${c.bonus ? `<small class="cp-bonus">${esc(G.texteBonus(c.bonus).join(' · '))}</small>` : ''}<small class="cp-statut ${a ? 'a-toi' : ''}">${statut}</small>${bouton}</div>`;
      }).join('');
      const tete = st.chat ? `<b>${esc(st.chat.nom)}, ${esc(G.compagnon(vu).nom.toLowerCase())}</b><small>${G.fmt(st.chat.caresses)} caresse${st.chat.caresses > 1 ? 's' : ''} · une caresse par minute porte chance au client mystère${(() => { const b = G.compagnon(G.compagnonActif(st)); return b && b.bonus ? ` · son bonus : ${esc(G.texteBonus(b.bonus).join(' · ').toLowerCase())}` : ''; })()}</small>` : '<b>Pas encore de compagnon</b><small>Le chat arrive avec les éclairs au café. Tu peux aussi en choisir un tout de suite.</small>';
      return `<div class="cl cp" data-cl="compagnons"><div class="cl-tete"><span class="pic">${ICONS.UI.patte}</span><div><h2>Les compagnons</h2><p class="sous">L’animal de la boutique dort sur le comptoir, se promène dans la salle et porte chance quand on le caresse. Chacun a son petit bonus, seulement quand c’est lui qui t’accompagne. Acheté, il est à toi pour toujours, même dans une nouvelle boutique.</p></div></div>
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
  // le coin trop haut pour la place au-dessus du tiroir (un petit téléphone, 360 × 640 ; l'événement de la boutique affiché au-dessus du
  // tiroir) : deux colonnes. La première (à droite) garde l'ordre de haut en bas ; ce qui n'y tient pas passe dans la seconde, à gauche,
  // calée en bas, loin de l'enseigne. Recalculé quand un bouton paraît ou disparaît, quand le tiroir bouge ou l'événement s'affiche, à chaque redimension.
  let coinRaf = 0;
  function serrerCoin() {
    coinRaf = 0;
    const coin = $('#coin'), t = $('#tiroir'), ev = $('#evenement'); if (!coin || !t) return;
    const l = [...coin.children].filter((b) => !b.hidden), y = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tiroir-y')) || 0;
    let place = y - coin.offsetTop - 8;
    if (ev && !ev.hidden && t.dataset.pos !== 'ouvert') place -= ev.offsetHeight + 8;
    const tient = Math.max(1, Math.floor((place + 8) / 52)), deux = y > 0 && l.length > tient; // 52 : un bouton (44) et l'écart (8)
    coin.classList.toggle('serre', deux);
    const n = Math.max(tient, Math.ceil(l.length / 2)), k = l.length - n;
    l.forEach((b, i) => {
      if (!deux) { b.style.gridColumn = ''; b.style.gridRow = ''; return; }
      b.style.gridColumn = i < n ? '2' : '1'; b.style.gridRow = String(i < n ? i + 1 : n - k + (i - n) + 1);
    });
  }
  const serrerCoinBientot = () => { if (!coinRaf) coinRaf = requestAnimationFrame(serrerCoin); };
  // l'Atelier, d'un geste depuis l'icône du coin : les trois mini-jeux, leurs records et ce qu'ils valent au classement aujourd'hui
  function sheetAtelier() { // (avant le 26 octobre 2026, d.bareme 1 : le barème d'avant, le meilleur score de la semaine, 0 à 20, et l'annonce du nouveau)
    const d = G.detailPoints(st), ancien = d.bareme === 1, mx = d.atelierMax;
    const regle = ancien ? `Au classement : le meilleur score de la semaine de chaque mini-jeu vaut jusqu’à ${mx} points de boulanger. Cette semaine : ` : `Au classement : chaque jour, le meilleur score du jour de chaque mini-jeu vaut jusqu’à ${mx} points de boulanger. Aujourd’hui : `;
    openSheet(`<div class="cl" data-cl="atelier">${carteAtelier()}<p class="note centre">${regle}${d.atelier.map((a) => `${esc(a.nom.toLowerCase())} ${a.points}/${mx}`).join(' · ')}.${ancien ? ` ${esc(G.POINTS.annonce)} : chaque jour, jusqu’à ${G.POINTS.atelier} points par mini-jeu.` : ''}</p><button type="button" class="btn large sombre" data-a="close" style="margin-top:12px"><b>Retour à la boutique</b></button></div>`);
    on('[data-jeu]', (b) => { son.tap(); closeSheet(); MINIJEUX.ouvrir(b.dataset.jeu); });
    on('[data-a="close"]', closeSheet);
  }
  // la série de jours de suite, telle que le classement la compte (serveur v6.7 : resume().serie ; absente avant, ou pas rejoint : rien).
  // Avant le lundi 26 octobre 2026 (G.POINTS.depuis) : l'annonce du nouveau barème et de la série, à la place (le serveur n'en compte pas encore)
  function ligneSerie(d) {
    if (d && d.bareme === 1) return `<p class="pts-serie pts-annonce" data-serie="avant"><i class="ico">${ICONS.UI.etoile || ''}</i><span><b>${esc(G.POINTS.annonce)}</b> · cette semaine, les points se comptent comme avant</span></p>`;
    let se = null; try { const r = classement && classement.resume ? classement.resume() : null; se = r && r.serie; } catch (e) { se = null; }
    if (!se || typeof se !== 'object') return '';
    const P = G.POINTS.serie, n = Math.max(0, Math.floor(Number(se.jours) || 0)), b = Math.max(0, Math.floor(Number(se.bonus) || 0)), pr = se.prochain && typeof se.prochain === 'object' ? se.prochain : null;
    const dans = pr ? Math.max(0, Math.floor(Number(pr.dans) || 0)) : -1, pp = pr ? Math.max(0, Math.floor(Number(pr.points) || 0)) : 0;
    const suite = pr && pp ? (dans === 0 ? ` · +${pp} si tu joues aujourd’hui` : ` · encore ${dans} jour${dans > 1 ? 's' : ''} pour +${pp}`) : '';
    return `<p class="pts-serie" data-serie="${n}"><i class="ico">${ICONS.UI.etoile || ''}</i><span><b>Série : ${n ? `${n} jour${n > 1 ? 's' : ''} de suite` : 'à commencer'}</b> · +${P[3]} au 3e jour, +${P[7]} au 7e (comptés par le classement)${suite}${b > 0 ? ` · <b>+${b} cette semaine</b>` : ''}</span></p>`;
  }
  // ses points de la semaine, catégorie par catégorie (en brut), le jour en cours (brut → compté) et le barème (replié) : en tête de la feuille du classement
  function blocPoints() {
    const d = G.detailPoints(st), P = G.POINTS, a = d.aujourdhui, at = a.atelier, som = (o) => Object.values(o).reduce((n, v) => n + v, 0);
    const presMax = som(Object.fromEntries(Object.entries(P.presence).map(([k, v]) => [k, v[1]]))); // 224 par jour
    const case_ = (t, v, max, sous) => `<div class="pts-case"><small>${t}</small><b>${v}<i>/${max}</i></b>${sous ? `<small>${sous}</small>` : ''}</div>`;
    if (d.bareme === 1) { // une semaine d'avant le lundi 26 octobre 2026 : le barème d'avant le lot 7, tel quel (cinq cases), et l'annonce du nouveau
      return `<div class="pts-bloc" data-bareme="1"><div class="pts-tete"><span><small>Mes points cette semaine</small><b>${pts(d.total)}</b></span><span class="pts-auj">aujourd’hui ${a.journee + a.evenements + a.ameliorations}/${a.max}</span></div>${ligneSerie(d)}
      <div class="pts-cases pts-ancien">${case_('Journées', d.journees, 7 * P.journee, a.journee ? 'faite auj. ✓' : `${P.journee} par jour`)}${case_('Événements', d.evenements, 7 * P.evenementsJour, `auj. ${a.evenements}/${P.evenementsJour}`)}${case_('Améliorations', d.ameliorations, 7 * P.ameliorationsJour, `auj. ${a.ameliorations}/${P.ameliorationsJour}`)}${case_('Défi de la semaine', d.defi, P.defi, d.defi ? 'réussi ✓' : '')}${case_('Atelier', d.atelierSemaine, d.atelierMax * d.atelier.length, d.atelier.map((x) => x.points).join(' · '))}</div>
      <details class="pts-bareme"><summary><span>Comment marquer des points ?</span><i class="ico chev">${ICONS.UI.chevron}</i></summary><ul>
        <li><b>${P.journee} pts</b> par journée complète : les trois objectifs du jour réclamés.</li>
        <li><b>${P.defi} pts</b> pour le défi de la semaine.</li>
        <li><b>${P.evenement} pts</b> par événement réussi (pétrissage, commande livrée, four réparé, bonne critique, pourboire du client mystère), ${P.evenementsJour} au plus par jour.</li>
        <li><b>Jusqu’à ${d.atelierMax} pts</b> par mini-jeu de l’Atelier : ton meilleur score de la semaine.</li>
        <li><b>1 pt</b> par tranche d’améliorations valant 10 minutes de tes propres gains (niveaux, embauches, bonus, mobilier, recette de saison), <b>+${P.palier}</b> à chaque palier ×2 (niveaux 25, 50, 100…), ${P.ameliorationsJour} au plus par jour.</li>
      </ul><p class="pts-annonce-bareme"><b>${esc(P.annonce)}</b> : les objectifs réclamés, la présence (pétrissages, clients mystère, grosses commandes, descentes évitées) et les paliers d’événement compteront aussi, l’Atelier chaque jour, jusqu’à ${P.jour} points par jour (au-delà de ${P.bandes[0][0]}, chaque point compte pour moitié, puis pour un quart au-delà de ${P.bandes[1][0]}), et la série de jours de suite : +${P.serie[3]} au 3e jour, +${P.serie[7]} au 7e.</p>
      <p>Tout est relatif à ta boutique : un débutant et une grande boutique qui jouent pareil marquent autant. La fortune reste affichée en petit, pour information. Les compteurs repartent chaque lundi (heure de Paris).</p></details></div>`;
    }
    const bande = a.bande.taux === 1 ? `encore ${a.bande.reste} pts comptés en entier aujourd’hui` : a.bande.taux === 0.5 ? 'les prochains points comptent pour moitié' : a.bande.taux === 0.25 ? 'les prochains points comptent pour un quart' : 'plafond du jour atteint : reviens demain';
    const pc = (k) => P.presence[k];
    return `<div class="pts-bloc" data-bareme="2"><div class="pts-tete"><span><small>Mes points cette semaine</small><b>${pts(d.total)}</b></span><span class="pts-auj">aujourd’hui ${a.total}/${a.max}</span></div>
      <p class="pts-jour" data-taux="${a.bande.taux}">Aujourd’hui : <b>${a.brut}</b> brut → <b>${a.compte}</b> comptés${at ? ` + Atelier ${at}` : ''} · ${bande}</p>${ligneSerie(d)}
      <div class="pts-cases">${case_('Journées', d.journees + d.objectifs, 7 * (P.journee + 3 * P.objectif), `auj. ${a.journee + a.objectifs}/${P.journee + 3 * P.objectif}`)}${case_('Événements', d.evenements + d.paliers, 7 * (P.evenementsJour + P.paliersEvtJour), `auj. ${a.evenements + a.paliers}/${P.evenementsJour + P.paliersEvtJour}`)}${case_('Présence', som(d.presence), 7 * presMax, `auj. ${som(a.presence)}/${presMax}`)}${case_('Améliorations', d.ameliorations, 7 * P.ameliorationsJour, `auj. ${a.ameliorations}/${P.ameliorationsJour}`)}${case_('Défi de la semaine', d.defi, P.defi, d.defi ? 'réussi ✓' : '')}${case_('Atelier', d.atelierSemaine, 7 * P.atelierJour, `auj. ${d.atelier.map((x) => x.points).join(' · ')}`)}</div>
      <details class="pts-bareme"><summary><span>Comment marquer des points ?</span><i class="ico chev">${ICONS.UI.chevron}</i></summary><ul>
        <li><b>${P.journee} pts</b> par journée complète : les trois objectifs du jour réclamés ; et <b>${P.objectif} pts</b> pour chaque objectif réclamé.</li>
        <li><b>${P.defi} pts</b> pour le défi de la semaine.</li>
        <li><b>${P.evenement} pts</b> par événement réussi (pétrissage, commande livrée, four réparé, bonne critique, pourboire du client mystère), ${P.evenementsJour} au plus par jour.</li>
        <li><b>1 pt</b> par tranche d’améliorations valant 10 minutes de tes propres gains (niveaux, embauches, bonus, mobilier, recette de saison), <b>+${P.palier}</b> à chaque palier ×2 (niveaux 25, 50, 100…), ${P.ameliorationsJour} au plus par jour.</li>
        <li>La présence : <b>${pc('petrissage')[0]} pts</b> par pétrissage gagné (${pc('petrissage')[1]} au plus par jour), <b>${pc('mystere')[0]} pt</b> par client mystère servi (${pc('mystere')[1]}), <b>${pc('commande')[0]} pts</b> par grosse commande livrée (${pc('commande')[1]}), <b>${pc('descente')[0]} pts</b> par descente évitée pendant un événement (${pc('descente')[1]}).</li>
        <li><b>${P.palierEvt} pts</b> par palier d’événement franchi, ${P.paliersEvtJour} au plus par jour.</li>
        <li><b>Jusqu’à ${P.atelier} pts</b> par mini-jeu de l’Atelier, chaque jour : ton meilleur score du jour.</li>
        <li><b>La série</b> : +${P.serie[3]} au 3e jour de suite où tu joues, +${P.serie[7]} au 7e, puis à chaque tour de 7 (le classement les compte).</li>
      </ul><p>Au-delà de ${P.bandes[0][0]} points dans la journée, chaque point compte pour moitié, puis pour un quart au-delà de ${P.bandes[1][0]} ; ${P.jour} au plus par jour (Atelier compris). Une heure de jeu fait déjà une belle journée, les heures suivantes comptent encore, de moins en moins.</p>
      <p>Tout est relatif à ta boutique : un débutant et une grande boutique qui jouent pareil marquent autant. La fortune reste affichée en petit, pour information. Les compteurs repartent chaque lundi (heure de Paris).</p></details></div>`;
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
    dernierHtmlCl = `<div class="cl" data-cl="liste"><div class="cl-tete"><span class="pic">${ICONS.UI.podium}</span><div><h2>Classement</h2><p class="sous">Les boulangers qui ont le lien du jeu, classés en points de boulanger : la façon de jouer, pas la fortune. Chaque semaine, les trois premiers gagnent une tenue et une coupe.${classement.copains() && classement.objectifVu() ? ` Touche un copain pour ${ongletCl === 'total' ? 'voir ses statistiques' : evDe(ongletCl) ? `visiter ${lieuDe(evDe(ongletCl)).sa}` : 'visiter sa boutique'}.` : ''}</p></div></div>${carteObjectif()}${carteRecompenses()}${blocPoints()}${invitation}${seg}${corps}${pied}${btnRetour()}</div>`;
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
    const visites = classement.copains(); // classement v6 : toucher la ligne d'un copain ouvre sa boutique (semaine), sa fiche (tous les temps), sa Planque (événement)
    const evL = evDe(ongletCl), quoi = ongletCl === 'total' ? 'Voir les statistiques de' : evL ? `Visiter ${lieuDe(evL).le} de` : 'Visiter la boutique de';
    const ligne = (l, moi) => `<li class="cl-ligne${moi ? ' moi' : visites ? ' visitable' : ''}"${moi ? ' aria-current="true"' : visites ? ` data-visite="${esc(l.pseudo)}" role="button" tabindex="0" aria-label="${quoi} ${esc(l.pseudo)}"` : ''}><span class="cl-rang${l.rang <= 3 ? ' r' + l.rang : ''}">${l.rang}<small>${l.rang === 1 ? 'er' : 'e'}</small></span><span class="cl-nom">${l.enLigne || (moi && d.enLigneN > 0) ? '<i class="cl-en-ligne" role="img" aria-label="en ligne" title="En ligne"></i>' : ''}<span>${esc(l.pseudo)}</span>${etiquetteTitre(titreDe(l, moi))}${quartier ? (l.podium ? `<i class="tag">${rangDe(l.podium)} ${hantee ? 'du manoir' : 'du Quartier'}</i>` : '') : toqueDe(l.podium, l.toque, moi)}${moi ? '<i class="tag">toi</i>' : ''}</span>${val(l)}${!moi && visites ? `<i class="cl-chev" aria-hidden="true">${ICONS.UI.chevron}</i>` : ''}</li>`;
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
    const toucher = (p) => (ongletCl === 'total' ? ficheCopain(p) : visiter(p, true, evDe(ongletCl) ? ongletCl : null)); // selon l'onglet : sa fiche, sa Planque, sa boutique
    fc.querySelectorAll('[data-visite]').forEach((li) => { // un copain (classement v6)
      li.addEventListener('click', () => toucher(li.dataset.visite));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toucher(li.dataset.visite); } });
    });
  }
  // ─── la fiche d'un copain (l'onglet « Tous les temps ») : ses statistiques, sans 3D ni pourboire ───
  // Sa ligne du classement (rang, points depuis toujours, fortune, podium et toque) tout de suite ; puis sa photo (fournil_boutique) : sa
  // boutique (nom, quartier, niveau et titre, recettes, apprentis, mobilier, chat, coupes, badge) et ses records (le champ x : étoiles,
  // boutique, ventes, trophées, série, fortune de toujours). Une photo d'avant la mise à jour (sans x), ou pas de photo : ce qu'on a.
  let fiche = null; // { pseudo, l (sa ligne), joueurs, charge, etat, data (la réponse de fournil_boutique), b (sa boutique rebâtie, pour les calculs) }
  function ficheCopain(pseudo) {
    if (!classement || !pseudo) return;
    audio(); son.tap();
    const c = classement.cache('total'), d = c && c.etat === 'ok' ? c.data : null;
    const f = fiche = { pseudo: String(pseudo), l: d ? d.lignes.find((x) => x.pseudo === pseudo) || null : null, joueurs: d ? d.joueurs : 0, charge: true, etat: '', data: null, b: null };
    peindreFiche(true);
    classement.boutique(f.pseudo).then((r) => {
      if (r.etat === 'ok' && r.data && r.data.etoile) etoileRattrapee(f.pseudo); // (version 6.5 : un pourboire parti, dont la réponse s'était perdue)
      if (fiche !== f) return; // une autre fiche, ou le retour au classement
      f.charge = false; f.etat = r.etat; f.data = r.etat === 'ok' ? r.data : null;
      const ph = f.data && f.data.photo; f.b = ph ? CLM.boutiqueDepuisPhoto(ph, { G, maintenant: HORLOGE.maintenant() }) : null;
      if (vueCl === 'fiche') peindreFiche(false); // la feuille a pu être refermée entre-temps
    });
  }
  function peindreFiche(neuve) {
    const f = fiche; if (!f) return;
    const y = neuve ? 0 : feuille.scrollTop;
    openSheet(htmlFiche(f)); vueCl = 'fiche'; feuille.scrollTop = y;
    on('[data-a="fi-retour"]', () => { son.tap(); fiche = null; sheetClassement('total'); });
    on('[data-a="fi-reessayer"]', () => { son.tap(); const p = f.pseudo; fiche = null; ficheCopain(p); });
  }
  function htmlFiche(f) {
    const l = f.l, b = f.b, x = b && b.stats, ph = f.data && f.data.photo;
    const case_ = (t, v, sous) => `<div class="pts-case"><small>${t}</small><b>${v}</b>${sous ? `<small>${sous}</small>` : ''}</div>`;
    const stat = (t, v) => `<div class="stat"><span>${t}</span><b>${v}</b></div>`;
    const podium = l && (l.podium || l.toque) ? `<p class="fi-podium">${toqueDe(l.podium, l.toque, false)}<span>${[l.toque ? `Toque ${DE_METAL[l.toque]}` : '', l.podium ? `${rangDe(l.podium)} la semaine dernière` : ''].filter(Boolean).join(' · ')}</span></p>` : '';
    const tete = `<div class="pts-bloc fi-bloc">${l ? `<div class="pts-cases fi-cases">${case_('Rang', `${l.rang}<i>${l.rang === 1 ? 'er' : 'e'}</i>`, f.joueurs ? `sur ${CLM.boulangers(f.joueurs)}` : 'de tous les temps')}${case_('Points', l.points != null ? G.fmt(l.points) : '–', 'depuis toujours')}${case_('Fortune', G.fmtEur(l.valeur), 'au classement')}</div>` : '<p class="note">Sa place de tous les temps n’est plus dans la liste.</p>'}${podium}</div>`;
    let corps = '';
    if (f.charge) corps = '<div class="cl-squelette" role="status" aria-label="Chargement de sa fiche"><i></i><i></i><i></i><span>On ouvre son carnet…</span></div>';
    else if (!f.data) corps = `<div class="cl-etat" role="status"><span class="pic">${ICONS.UI.horsLigne}</span><b>${f.etat === 'pas-installe' ? 'Les fiches arrivent bientôt' : f.etat === 'refus' ? 'Ce boulanger a quitté le classement' : 'Sa fiche ne s’ouvre pas'}</b><span>${f.etat === 'pas-installe' || f.etat === 'refus' ? '' : esc(msgReseau(f.etat))}</span>${f.etat === 'pas-installe' || f.etat === 'refus' ? '' : '<button type="button" class="btn clair" data-a="fi-reessayer"><b>Réessayer</b></button>'}</div>`;
    else if (b) {
      const s = b.st, r = resumeBoutique(s), n = G.niveau(s), mets = CLM.METAUX.map((m) => [m, b.coupes.filter((k) => k === m).length]).filter(([, k]) => k);
      corps = `<div class="card stats fi-carte"><div class="c-tete"><span class="pic peche">${ICONS.UI.boutique}</span><h3>Sa boulangerie</h3></div>
        ${stat('Niveau', `${n} · ${esc(G.titre(s))}`)}${stat('Recettes ouvertes', `${r.postes} sur ${G.PRODUITS.length}`)}${stat('Apprentis', r.apprentis)}${stat('Mobilier', `${pluriel(r.crans, 'cran')} sur ${r.max}`)}
        ${s.chat ? stat('Le compagnon', `${esc(s.chat.nom)}${G.compagnon && G.compagnonActif ? `, ${esc(G.compagnon(G.compagnonActif(s)).nom.toLowerCase())}` : ''}`) : ''}${stat('Coupes', mets.length ? mets.map(([m, k]) => `${k} ${NOM_METAL[m]}`).join(' · ') : 'pas encore')}${b.badge ? stat('Badge', '« Esprit d’équipe » ✓') : ''}
        ${x ? `<h4 class="sous-titre">Records</h4>${stat('Étoiles', G.fmt(x.e))}${stat('Boutique', `n°${x.b}`)}${stat('Fournées vendues', G.fmt(x.v))}${stat('Trophées', `${Math.min(x.tr, G.TROPHEES.length)}/${G.TROPHEES.length}`)}${stat('Meilleure série d’objectifs', pluriel(x.s, 'jour'))}${stat('Gagné depuis le début', G.fmtEur(x.f))}` : ''}</div>`;
    }
    const attente = !f.charge && f.data && !x ? '<p class="note centre fi-attente">Ses statistiques détaillées arriveront après sa prochaine partie.</p>' : '';
    return `<div class="cl" data-cl="fiche"><div class="cl-tete"><span class="pic">${ICONS.UI.stats}</span><div><h2>${esc(f.pseudo)}</h2><p class="sous">${b ? `${esc(b.nom)} · ${esc(nomQuartier(ph.q))}` : 'Ses statistiques de tous les temps'}</p></div></div>${tete}${corps}${attente}
      <button type="button" class="btn large sombre" data-a="fi-retour" style="margin-top:14px"><b>Retour au classement</b></button></div>`;
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
    else { // la feuille du lundi et celle de l'événement, chacune tentée : la garde de tenterEvt fait passer le lundi d'abord ; un lundi refermé sans « Récupérer » (aPayer reste plein) ne bloque plus celle de l'événement
      if (r.aPayer && r.aPayer.length && !lundiOuvert) tenterLundi();
      if (r.evtAPayer && r.evtAPayer.length && !evtOuvert) tenterEvt();
    }
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
    const bonus = payerPlaces((r && r.aPayer ? r.aPayer : []).filter((p) => p.rang <= 3)); // version 6.5 : les étoiles et le boost des podiums, versés une fois, à l'annonce
    openSheet(`<div class="cl rec-annonce" data-cl="annonce"><div class="rec-scene ${m}" aria-hidden="true"><i class="rec-rayons"></i><span class="rec-coupe">${ICONS.coupe(m)}</span><span class="rec-boulanger">${ICONS.boulanger(1, m)}</span></div>
      <h2>Bravo ! ${rangDe(a.rang)} de la semaine</h2>
      <p class="rec-phrase">La tenue ${n} et la coupe ${n} sont à toi.</p>${bonus.n ? `
      <p class="rec-phrase rec-bonus">En prime : ${texteGain(bonus)} (le boost attend dans ta réserve).</p>` : ''}
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
  // ─── version 6.5 : les récompenses de la semaine, du 1er au 15e (src/classement.js, RECOMPENSES_RANG) ───
  // Chaque place donne, une fois par semaine, des étoiles (st.etoiles, comme les cadeaux et le parcours) et un boost dans la réserve
  // (GAME.donnerBoostReserve, comme les paliers). Les podiums les reçoivent avec leur annonce ; les autres places, avec la feuille du lundi.
  const boostTexte = (b) => `un boost ×${b.mult} de ${G.fmtDuree(b.secs)}`;
  function texteGain(g) { // « +2 étoiles et un boost ×2 de 30 min » ; plusieurs semaines : « +3 étoiles et 2 boosts »
    const e = `+${g.etoiles} étoile${g.etoiles > 1 ? 's' : ''}`;
    return g.boosts.length === 1 ? `${e} et ${boostTexte(g.boosts[0])}` : `${e} et ${g.boosts.length} boosts (${g.boosts.map((b) => `×${b.mult} ${G.fmtDuree(b.secs)}`).join(', ')})`;
  }
  function payerPlaces(liste) { // verse les places pas encore payées (le moteur le note avant : jamais deux fois) ; rend { n, etoiles, boosts }
    const g = { n: 0, etoiles: 0, boosts: [] };
    for (const p of liste || []) {
      const x = p.recompense; if (!x || !classement.placePayee(p.semaine)) continue;
      st.etoiles += x.etoiles; G.donnerBoostReserve(st, x.mult, x.secs); g.n++; g.etoiles += x.etoiles; g.boosts.push({ mult: x.mult, secs: x.secs });
    }
    if (g.n) { save(); hud(); renderBoosts(); }
    return g;
  }
  let lundiOuvert = false, lundiMinuteur = 0, lundiMontre = ''; // lundiMontre : la feuille montrée une fois par lancement (la récompense reste dans « Mes récompenses »)
  function tenterLundi() { // à la première ouverture après la fin de la semaine, une fois les autres feuilles refermées
    clearTimeout(lundiMinuteur); lundiMinuteur = 0;
    const r = recVue(); if (!r || r.annonce || !r.aPayer || !r.aPayer.length || lundiOuvert || annonceOuverte) return;
    const p = r.aPayer[r.aPayer.length - 1]; if (lundiMontre === p.semaine) return;
    if (!feuille.hidden || document.hidden || visite || copainsOuvert || retourEnCours || MINIJEUX.ouvert || (EVS && EVS.ouvert) || (AR && AR.ouvert)) { lundiMinuteur = setTimeout(tenterLundi, 1500); return; }
    sheetLundi();
  }
  function sheetLundi() {
    const r = recVue(), l = r && r.aPayer ? r.aPayer : []; if (!l.length) return;
    const p = l[l.length - 1], x = p.recompense, autres = l.length - 1;
    lundiOuvert = true; lundiMontre = p.semaine;
    openSheet(`<div class="cl rec-annonce cp-annonce" data-cl="semaine-place"><div class="rec-scene equipe" aria-hidden="true"><i class="rec-rayons"></i><span class="rec-coupe">${p.rang <= 3 ? ICONS.coupe(CLM.metal(p.rang)) : ICONS.UI.podium}</span></div>
      <h2>${esc(CLM.phrasePlace(p))}</h2>
      <p class="rec-phrase">${x.etoiles > 1 ? `+${x.etoiles} étoiles` : '+1 étoile'} et ${boostTexte(x)}</p>
      <p class="sous">Semaine du ${CLM.dateCourte(p.semaine)} : chaque lundi, les quinze premiers du classement sont récompensés. Les étoiles, c’est +${Math.round(G.ETOILE_BONUS * 100)} % de gains chacune, pour toujours ; le boost attend dans ta réserve, lance-le quand tu veux.${autres ? ` Et ${autres === 1 ? 'une autre semaine t’attendait aussi' : `${autres} autres semaines t’attendaient aussi`} : ${autres === 1 ? 'sa récompense est' : 'leurs récompenses sont'} dans le lot.` : ''}</p>
      <button type="button" class="btn large beurre" data-a="pl-recuperer"><b>Récupérer</b></button></div>`);
    vueCl = 'semaine-place';
    let touche = true; try { touche = !navigator.userActivation || navigator.userActivation.hasBeenActive; } catch (e) { /* rien */ }
    son.deblocage(); if (touche) buzz([20, 40, 20]); confettis(1);
    const fin = () => { lundiOuvert = false; };
    on('[data-a="pl-recuperer"]', () => {
      const g = payerPlaces(recVue().aPayer); fin(); closeSheet();
      if (g.n) { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); confettis(0.8); toast(`Récupéré : ${texteGain(g)} (le boost attend dans ta réserve) !`); }
      setTimeout(tenterCopains, 400);
    });
    const surFermeture = setInterval(() => { if (feuille.hidden || vueCl !== 'semaine-place') { fin(); clearInterval(surFermeture); } }, 500);
  }
  // ─── version 6.6 : les acharnés des événements (la Maison hantée) : sa place au classement FINAL, du 1er au 15e (src/classement.js,
  // RECOMPENSES_EVT) : des étoiles et un boost, une fois (classement.evtPaye) ; les trois premiers ont en plus la tenue en or (majRecompenses) ───
  function payerEvt(liste) { // verse les places d'événement pas encore payées (le moteur le note avant : jamais deux fois) ; rend { n, etoiles, boosts }
    const g = { n: 0, etoiles: 0, boosts: [] };
    for (const p of liste || []) {
      const x = p.recompense; if (!x || !classement.evtPaye(p.id)) continue;
      st.etoiles += x.etoiles; G.donnerBoostReserve(st, x.mult, x.secs); g.n++; g.etoiles += x.etoiles; g.boosts.push({ mult: x.mult, secs: x.secs });
    }
    if (g.n) { save(); hud(); renderBoosts(); }
    return g;
  }
  let evtOuvert = false, evtMinuteur = 0, evtMontre = ''; // evtMontre : la feuille montrée une fois par lancement (la récompense reste dans « Mes récompenses »)
  function tenterEvt() { // une fois les autres feuilles refermées (l'annonce du podium de la semaine, la feuille du lundi passent avant : tant qu'elle est ouverte, on réessaie toutes les 1,5 s)
    clearTimeout(evtMinuteur); evtMinuteur = 0;
    const r = recVue(); if (!r || r.annonce || !r.evtAPayer || !r.evtAPayer.length || evtOuvert || annonceOuverte) return;
    const p = r.evtAPayer[0]; if (evtMontre === p.id) return;
    if (lundiOuvert || !feuille.hidden || document.hidden || visite || copainsOuvert || retourEnCours || MINIJEUX.ouvert || (EVS && EVS.ouvert) || (AR && AR.ouvert) || (r.aPayer && r.aPayer.length && lundiMontre !== r.aPayer[r.aPayer.length - 1].semaine)) { evtMinuteur = setTimeout(tenterEvt, 1500); return; }
    sheetEvt();
  }
  const NOM_EVT_LONG = { hantee: 'la Maison hantée' };
  function sheetEvt() {
    const r = recVue(), l = r && r.evtAPayer ? r.evtAPayer : []; if (!l.length) return;
    const p = l[0], x = p.recompense, tenue = p.rang <= 3;
    evtOuvert = true; evtMontre = p.id;
    openSheet(`<div class="cl rec-annonce cp-annonce mh-acharne" data-cl="evt-place"><div class="rec-scene ${tenue ? 'or' : 'equipe'}" aria-hidden="true"><i class="rec-rayons"></i><span class="rec-coupe">${p.rang <= 3 ? ICONS.coupe(CLM.metal(p.rang)) : ICONS.UI.hantee || ICONS.UI.podium}</span></div>
      <h2>${esc(CLM.phraseEvt(p))}</h2>
      <p class="rec-phrase">${x.etoiles > 1 ? `+${x.etoiles} étoiles` : '+1 étoile'} et ${boostTexte(x)}${tenue ? ', et la tenue d’Halloween en or' : ''}</p>
      <p class="sous">${tenue ? 'Sur le podium final : les quatre pièces de la tenue d’Halloween en or sont dans ta garde-robe, à vie. ' : ''}À la fin de ${esc(NOM_EVT_LONG[p.id] || 'l’événement')}, les quinze premiers du classement final sont récompensés. Les étoiles, c’est +${Math.round(G.ETOILE_BONUS * 100)} % de gains chacune, pour toujours ; le boost attend dans ta réserve, lance-le quand tu veux.</p>
      <button type="button" class="btn large beurre" data-a="ev-recuperer"><b>Récupérer</b></button></div>`);
    vueCl = 'evt-place';
    let touche = true; try { touche = !navigator.userActivation || navigator.userActivation.hasBeenActive; } catch (e) { /* rien */ }
    son.deblocage(); if (touche) buzz([20, 40, 20]); confettis(1);
    const fin = () => { evtOuvert = false; };
    on('[data-a="ev-recuperer"]', () => {
      const g = payerEvt(recVue().evtAPayer); fin(); closeSheet();
      if (g.n) { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); confettis(0.8); toast(`Récupéré : ${texteGain(g)} (le boost attend dans ta réserve) !`); }
      setTimeout(tenterCopains, 400);
    });
    const surFermeture = setInterval(() => { if (feuille.hidden || vueCl !== 'evt-place') { fin(); clearInterval(surFermeture); } }, 500);
  }
  // le titre gagné (« Légende du Manoir », le 20e palier de la Maison hantée) : une petite étiquette à côté du pseudo (la liste du classement, la
  // visite) ; le sien se lit sur le téléphone, celui des autres vient du serveur (classement v6.6) ou de la photo de leur boutique
  const titreDe = (l, moi) => { const t = moi ? (G.distinctions ? G.distinctions(st).find(CLM.titreOk) : null) || l.titre : l.titre; return t && CLM.titreOk && CLM.titreOk(t) ? t : null; };
  const LANTERNE_TITRE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v2" stroke="#2B2533" stroke-width="1.4" stroke-linecap="round"/><path d="M3.6 6 8 2.6 12.4 6z" fill="#2B2533"/><rect x="4.4" y="6" width="7.2" height="7" rx="1" fill="#3A2E46"/><path d="M8 7.2c1.5 1.6 2.1 2.8 2.1 3.7a2.1 2.1 0 0 1-4.2 0c0-.9.6-2.1 2.1-3.7z" fill="#7CFF6B"/><rect x="3.6" y="13" width="8.8" height="1.6" rx=".8" fill="#2B2533"/></svg>'; // la lanterne de la légende, en tout petit
  const etiquetteTitre = (t) => (t ? `<i class="cl-titre" title="${esc(CLM.TITRES[t])}">${LANTERNE_TITRE}<span>${esc(CLM.TITRES[t])}</span></i>` : '');
  // l'entrée « Mes récompenses », en tête de la feuille du classement et dans l'onglet Boulanger (seulement après un premier podium)
  const cleRecompenses = () => { const r = recVue(); return r ? `${r.podiums.length}|${(r.places || []).length}|${(r.aPayer || []).length}|${(r.evtPlaces || []).length}|${(r.evtAPayer || []).length}|${G.toqueMetal(st)}` : ''; };
  function carteRecompenses() {
    const r = recVue(), places = r && r.places ? r.places : [], evp = r && r.evtPlaces ? r.evtPlaces : []; if (!r || (!r.podiums.length && !places.length && !evp.length)) return '';
    const n = r.podiums.length, dernieres = n ? r.podiums.slice(-5).map((p) => `<i class="rec-mini">${ICONS.coupe(CLM.metal(p.rang))}</i>`).join('') : `<i class="rec-mini">${ICONS.UI.podium}</i>`;
    const tm = G.toqueMetal(st), porte = tm ? `toque ${DE_METAL[tm]}` : 'toque blanche', np = places.length;
    const quoi = (r.aPayer || []).length || (r.evtAPayer || []).length ? 'une récompense t’attend' : n ? `${n} coupe${n > 1 ? 's' : ''} · ${porte}` : np ? `${np} place${np > 1 ? 's' : ''} au classement` : `${rangDe(evp[0].rang)} de ${NOM_EVT_LONG[evp[0].id] || 'l’événement'}`;
    return `<button type="button" class="rec-entree" data-a="cl-recompenses"><span class="rec-minis" aria-hidden="true">${dernieres}</span><span><b>Mes récompenses</b><small>${quoi}</small></span><i class="ico chev">${ICONS.UI.chevron}</i></button>`;
  }
  // la collection : chaque coupe et sa tenue, avec sa semaine ; la tenue se choisit pièce par pièce dans la garde-robe (onglet Boulanger)
  function sheetRecompenses(depuisCl) { // depuisCl : ouverte depuis la feuille du classement, on y revient
    if (!classement) return;
    const r = recVue(), tm = G.toqueMetal(st), tenue = tenueVue();
    for (const m of r.coupes) G.donnerCollection(st, m); // au cas où la garde-robe n'aurait pas encore reçu un podium
    const coupes = r.podiums.slice().reverse().map((p) => { const m = CLM.metal(p.rang); return `<li class="rec-carte ${m}"><span class="rec-icone">${ICONS.coupe(m)}</span><b>${rangDe(p.rang)}</b><small>Coupe et tenue ${DE_METAL[m]}</small><small>Semaine du ${CLM.dateCourte(p.semaine)}</small></li>`; }).join('');
    const places = r.places || [], aPayer = r.aPayer || [], evp = r.evtPlaces || [], evtAP = r.evtAPayer || [];
    const vide = !r.podiums.length && !places.length && !evp.length ? '<div class="cl-etat"><span class="pic">' + ICONS.coupe('or') + '</span><b>Pas encore de récompense</b><span>Termine la semaine dans les quinze premiers du classement : des étoiles et un boost t’attendent ; dans les trois premiers, une tenue et une coupe en plus.</span></div>' : '';
    // version 6.5 : l'historique des places, la plus récente d'abord (sa récompense : versée, à récupérer, ou d'avant les récompenses des places)
    const insec = (s) => String(s).replace(/ /g, '\u00A0'); // « 12 oct. », « 30 min » : sans coupure
    const etatPlace = (p) => (p.payee ? 'Récupérée' : aPayer.some((x) => x.semaine === p.semaine) ? 'À récupérer' : p.rang <= 3 ? 'Tenue et coupe' : 'Avant les récompenses');
    const lignesPlaces = places.slice().reverse().slice(0, 30).map((p) => `<li class="rec-carte${p.rang <= 3 ? ' ' + CLM.metal(p.rang) : ''}"><b>${rangDe(p.rang)}</b><small>${p.joueurs ? `sur ${p.joueurs}` : '&nbsp;'}</small><small>Semaine du ${insec(CLM.dateCourte(p.semaine))}</small>${p.recompense && (p.payee || aPayer.some((x) => x.semaine === p.semaine)) ? `<small>+${p.recompense.etoiles}\u00A0★ · ×${p.recompense.mult}\u00A0${insec(G.fmtDuree(p.recompense.secs))}</small>` : ''}<small><i>${etatPlace(p)}</i></small></li>`).join('');
    // version 6.6 : ses places au classement final des événements (la Maison hantée), leur récompense : versée ou à récupérer
    const lignesEvt = evp.map((p) => `<li class="rec-carte mh-acharne${p.rang <= 3 ? ' or' : ''}"><b>${rangDe(p.rang)}</b><small>${p.joueurs ? `sur ${p.joueurs}` : '&nbsp;'}</small><small>${esc((NOM_EVT_LONG[p.id] || '').replace(/^la /, 'La '))}</small>${p.recompense ? `<small>+${p.recompense.etoiles}\u00A0★ · ×${p.recompense.mult}\u00A0${insec(G.fmtDuree(p.recompense.secs))}${p.rang <= 3 ? ' · tenue en or' : ''}</small>` : ''}<small><i>${p.payee ? 'Récupérée' : evtAP.some((x) => x.id === p.id) ? 'À récupérer' : ''}</i></small></li>`).join('');
    const pieces = tenue ? ['tete', 'haut', 'pieds', 'accessoire'].map((p) => { const v = G.vetement(G.garderobe(st).equipe[p]); return v ? esc(v.nom.toLowerCase()) : null; }).filter(Boolean).join(', ') : '';
    openSheet(`<div class="cl" data-cl="recompenses"><div class="cl-tete"><span class="pic">${ICONS.coupe(r.coupes.length ? r.coupes[r.coupes.length - 1] : 'or')}</span><div><h2>Mes récompenses</h2><p class="sous">Chaque semaine, les quinze premiers gagnent des étoiles et un boost ; les trois premiers, en plus, une tenue (toque, tablier, chaussures, foulard) et une coupe, à garder pour toujours.${evp.length ? ' À la fin d’un événement, ses quinze premiers aussi.' : ''}</p></div></div>
      ${vide}${aPayer.length || evtAP.length ? `<button type="button" class="btn large beurre" data-a="rec-recuperer"><b>Récupérer ma récompense</b></button>` : ''}${evp.length ? `<h3 class="titre-section">Mes événements</h3><ul class="rec-coupes" aria-label="Mes places au classement final des événements">${lignesEvt}</ul>` : ''}${places.length ? `<h3 class="titre-section">Mes places</h3><ul class="rec-coupes" aria-label="Mes places au classement de la semaine">${lignesPlaces}</ul>` : ''}${r.podiums.length ? `<h3 class="titre-section">La vitrine des trophées</h3><ul class="rec-coupes" aria-label="Mes coupes">${coupes}</ul>
      <h3 class="titre-section" id="rec-titre-tenue">La tenue du boulanger</h3>
      <div class="rec-apercu" aria-hidden="true">${ICONS.boulanger(G.rangTitre(st), tenue)}<span>${tm ? `Il porte la toque ${DE_METAL[tm]}` : 'Il porte la toque blanche'}${pieces ? ` : ${pieces}.` : '.'}</span></div>
      <button type="button" class="btn large clair" data-a="rec-garderobe" style="margin-top:8px"><b>Ouvrir la garde-robe</b></button>` : ''}
      ${depuisCl ? '<button type="button" class="btn large sombre" data-a="cl-retour" style="margin-top:14px"><b>Retour au classement</b></button>' : btnRetour()}</div>`);
    vueCl = 'recompenses';
    on('[data-a="rec-recuperer"]', () => { const g = payerPlaces(recVue().aPayer), ge = payerEvt(recVue().evtAPayer); g.n += ge.n; g.etoiles += ge.etoiles; g.boosts.push(...ge.boosts); if (g.n) { son.deblocage(); buzz([10, 30, 10]); confettis(0.8); toast(`Récupéré : ${texteGain(g)} (le boost attend dans ta réserve) !`); } sheetRecompenses(depuisCl); });
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
  // Ce que fait la ligne touchée dépend de l'onglet : « Cette semaine », la visite de sa boutique (ici) ; « Tous les temps », sa fiche de
  // statistiques (ficheCopain, sans 3D) ; l'onglet d'un événement, la visite de sa Planque (ou de son Manoir) : la vraie scène de l'événement
  // (F.scene) sur un canvas à part, bâtie depuis le champ e de sa photo (CLASSEMENT.evenementDepuisPhoto), jamais sauvée, libérée au retour.
  let visite = null; // { pseudo, depuisCl, charge, etat, data (la réponse de fournil_boutique), b (la boutique rebâtie), scene (la 3D montre b), tiroir, envoi,
  //                    E (l'événement visité, sinon null), qe (sa Planque rebâtie), ev3 (la scène de l'événement), images, fini }
  const nomQuartier = (q) => { const x = G.QUARTIERS[(q | 0) % G.QUARTIERS.length]; return x ? x.nom : ''; };
  const evDe = (id) => (id === 'quartier' && EVT ? EVT : HTE && id === HTE.cle ? HTE : null); // l'écran d'un événement d'après l'onglet du classement
  function lieuDe(E) { // « La Planque » → { le: 'la Planque', sa: 'sa Planque' } ; « Le Manoir » → { le: 'le Manoir', sa: 'son Manoir' }
    const L = E && E.F && E.F.lieu ? E.F.lieu : 'La Planque', m = /^(La|Le|L’|L')\s*(.*)$/.exec(L), nom = m ? m[2] : L, fem = !m || m[1] !== 'Le';
    return { Le: L, le: L[0].toLowerCase() + L.slice(1), sa: `${fem ? 'sa' : 'son'} ${nom}`, Sa: `${fem ? 'Sa' : 'Son'} ${nom}` };
  }
  const resumeBoutique = (s) => ({ postes: s.stations.filter((x) => x.niv > 0).length, apprentis: s.stations.filter((x) => x.staff).length, crans: G.MOBILIER.reduce((n, m) => n + G.mobilierCran(s, m.id), 0), max: G.MOBILIER.reduce((n, m) => n + m.max, 0) });
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  async function visiter(pseudo, depuisCl, ev) {
    if (!classement || visite || !pseudo) return;
    audio(); son.tap();
    const E = ev ? evDe(ev) : null;
    visite = { pseudo: String(pseudo), depuisCl: !!depuisCl, charge: true, etat: '', data: null, b: null, scene: false, tiroir: tiroir.pos, envoi: false, E, qe: null, ev3: null, images: 0, fini: false };
    closeSheet(); vueCl = '';
    if (E && EVS.ouvert) EVS.ouvert.fermer(); // sa propre Planque se referme (sauvée comme à chaque sortie) : une seule scène d'événement à la fois
    $('#visite').hidden = false; document.body.classList.add('visite');
    peindreVisite();
    const v = visite, r = await classement.boutique(v.pseudo);
    if (r.etat === 'ok' && r.data && r.data.etoile) etoileRattrapee(v.pseudo); // (version 6.5 : un pourboire parti, dont la réponse s'était perdue)
    if (visite !== v) return; // refermée pendant la lecture
    v.charge = false; v.etat = r.etat; v.data = r.etat === 'ok' ? r.data : null;
    const ph = v.data && v.data.photo;
    if (E) { // sa Planque : seulement pendant l'événement, et s'il y est entré depuis la mise à jour (le champ e de sa photo)
      const f = E.fenetre(); v.fini = !!(f && f.fini);
      const re = ph && !v.fini ? CLM.evenementDepuisPhoto(ph, { R: E.R, id: E.cle, maintenant: HORLOGE.maintenant() }) : null; v.qe = re ? re.q : null;
      if (v.qe && SCENE.stats && SCENE.stats.webgl) batirEv3(v);
      peindreVisite(); return;
    }
    v.b = ph ? CLM.boutiqueDepuisPhoto(ph, { G, maintenant: HORLOGE.maintenant() }) : null;
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
    libererEv3(v); v.qe = null; // sa Planque : la scène détruite (géométries, matériaux, contexte WebGL rendu), son état jeté
    $('#visite').hidden = true; document.body.classList.remove('visite'); $('#vi-vue').innerHTML = ''; $('#vi-bas').innerHTML = ''; $('#vi-vue').classList.remove('vi-ev');
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
    const s = v.b.st, { postes, apprentis, crans, max } = resumeBoutique(s);
    const li = [`Niveau ${G.niveau(s)} · ${esc(G.titre(s))}`, `${postes} recette${postes > 1 ? 's' : ''} au four · ${apprentis} apprenti${apprentis > 1 ? 's' : ''}`, `Mobilier : ${crans} cran${crans > 1 ? 's' : ''} sur ${max}`];
    if (v.b.titre) li.push(`Le titre « ${esc(v.b.titre)} »`);
    if (s.chat) li.push(`Le compagnon : ${esc(s.chat.nom)}`); if (v.b.coupes.length) li.push(`${v.b.coupes.length} coupe${v.b.coupes.length > 1 ? 's' : ''} en vitrine`); if (v.b.badge) li.push('Le badge « Esprit d’équipe »');
    return carte(ICONS.UI.boutique, esc(v.b.nom), esc(nomQuartier(ph.q)), `<ul>${li.map((x) => `<li>${x}</li>`).join('')}</ul>`);
  }
  // « Ses recettes » : ses recettes ouvertes, leur niveau et leur apprenti (la boutique), ou les produits de sa Planque (l'événement) ;
  // un bouton sous la visite, qui déplie la liste au-dessus des boutons
  function recettesVisite(v) {
    const lignes = [];
    if (v.E && v.qe) v.qe.postes.forEach((s, i) => { const p = v.E.R.PRODUITS[i]; if (p && s.niv > 0) lignes.push({ ico: v.E.F.ico.produit(p, i), nom: p.nom, niv: s.niv, staff: s.staff ? 'apprenti' : '' }); });
    else if (v.b) v.b.st.stations.forEach((s, i) => { const p = G.PRODUITS[i]; if (p && s.niv > 0) lignes.push({ ico: ICONS.PRODUITS[p.id], nom: p.nom, niv: s.niv, staff: s.staff ? `apprenti · grade ${G.gradeApprenti(v.b.st, i)}` : '' }); });
    return lignes;
  }
  function boutonRecettes(v) {
    const l = recettesVisite(v); if (!l.length) return '';
    const liste = v.recettes ? `<ul class="vi-recettes">${l.map((r) => `<li><i class="ico">${r.ico}</i><span><b>${esc(r.nom)}</b>${r.staff ? `<small>${esc(r.staff)}</small>` : ''}</span><em>niv. ${G.fmt(r.niv)}</em></li>`).join('')}</ul>` : '';
    return `${liste}<button type="button" class="btn large clair" data-vi="recettes" aria-expanded="${v.recettes ? 'true' : 'false'}"><b>${v.recettes ? 'Masquer ses recettes' : `Ses recettes (${l.length})`}</b></button>`;
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
    return `${!v.charge && v.etat === 'ok' ? boutonRecettes(v) : ''}${pb}<button type="button" class="btn large sombre" data-vi="retour"><b>Retour</b></button>`;
  }
  // ─── la Planque (ou le Manoir) d'un copain : la vraie scène de l'événement, sur un canvas à part, en lecture seule ───
  function batirEv3(v) { // le canvas est posé une fois ; peindreVisite n'y touche plus (seuls le titre et le bas changent)
    const vue = $('#vi-vue'), L = lieuDe(v.E);
    vue.classList.remove('carte'); vue.classList.add('vi-ev');
    vue.innerHTML = `<canvas class="vi-canvas" role="img" aria-label="${esc(L.Le)} de ${esc(v.pseudo)} en 3D"></canvas><span class="vi-enseigne">${esc(v.E.F.nom)}</span><span class="vi-lecture"><i class="ico">${ICONS.UI.oeil}</i>Tu visites : rien ne change chez ${esc(v.pseudo)}</span>`;
    let sc = null; try { sc = v.E.F.scene(vue.querySelector('canvas'), { q: () => v.qe }); } catch (e) { sc = null; }
    if (!sc) { vue.innerHTML = ''; vue.classList.remove('vi-ev'); return; } // le téléphone refuse un second contexte : le résumé seul
    v.ev3 = sc; if (SCENE.alleger) SCENE.alleger(); // la boutique, cachée, rend sa passe d'effets (recréée au retour)
  }
  function libererEv3(v) { if (v && v.ev3) { try { v.ev3.detruire(); } catch (e) { /* rien */ } v.ev3 = null; } }
  function resumeEv(v) { // palier, total, équipe, décos : sous la scène, ou seul dans une carte sans 3D
    const E = v.E, R = E.R, q = v.qe, nb = q.paliers.length >= (R.PALIERS_BOSS || R.PALIERS.length) ? R.PALIERS.length : R.PALIERS_BOSS || R.PALIERS.length, n = q.postes.filter((s) => s.staff).length, d = q.decos.length;
    return [`Palier ${q.paliers.length}/${nb}`, `${E.F.fmt(q.total)}${E.cle === 'quartier' ? ' de billets' : ''} gagnés`, n ? `Équipe : ${pluriel(n, 'apprenti')}` : 'Pas encore d’équipe', ...(d ? [`${pluriel(d, 'déco')} gagnée${d > 1 ? 's' : ''}`] : [])];
  }
  function carteEv(v) { // le milieu de l'écran sans la scène de l'événement
    const E = v.E, L = lieuDe(E), pic = (E.cle === 'quartier' ? ICONS.QUARTIER.porte : ICONS.HANTEE && ICONS.HANTEE.manoir) || E.F.ico.devise;
    const carte = (titre, txt, plus) => `<div class="vi-carte ${E.F.classe || 'pq'}-carte"><span class="pic">${pic}</span><b>${titre}</b>${txt ? `<span>${txt}</span>` : ''}${plus || ''}</div>`;
    if (v.charge) return carte('On frappe à la porte…', `${esc(L.Le)} de ${esc(v.pseudo)} va s’ouvrir.`);
    if (!v.data) return carteVisite(v); // pas installé, plus au classement, ou le réseau : les mêmes cartes que la visite de la boutique
    if (v.fini) return carte(`${esc(E.F.nom)} est fini`, `${esc(L.Le)} a fermé ses portes : plus de visite.`);
    if (!v.qe) return carte('Pas encore ouvert aux visites', `${esc(L.Sa)} apparaîtra après sa prochaine partie.`);
    return carte(`${esc(L.Le)} de ${esc(v.pseudo)}`, esc(E.F.nom), `<ul>${resumeEv(v).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`); // sans 3D : le résumé seul
  }
  function peindreVisite() {
    const v = visite; if (!v) return;
    const d = v.data, ph = d && d.photo, vue = $('#vi-vue');
    if (v.E) { // sa Planque : pas de pourboire ici, un résumé sous la scène et le retour au classement
      const L = lieuDe(v.E);
      $('#vi-titre').textContent = `${L.Le} de ${v.pseudo}`;
      $('#vi-sous').textContent = v.charge ? 'On frappe à la porte…' : d ? `${d.enLigne ? 'En ligne · ' : ''}${v.E.F.nom}` : '';
      $('#vi-ligne').hidden = !(d && d.enLigne);
      if (!v.ev3) { vue.classList.remove('vi-ev'); vue.classList.add('carte'); vue.innerHTML = carteEv(v); }
      $('#vi-bas').innerHTML = `${v.ev3 ? `<p class="vi-resume">${resumeEv(v).map((x, k) => (k ? esc(x) : `<b>${esc(x)}</b>`)).join(' · ')}</p>` : ''}${v.qe ? boutonRecettes(v) : ''}<button type="button" class="btn large sombre" data-vi="retour"><b>Retour</b></button>`;
      document.querySelectorAll('#visite [data-vi]').forEach((b) => { b.onclick = () => clicVisite(b); });
      return;
    }
    $('#vi-titre').textContent = `La boutique de ${v.pseudo}`;
    $('#vi-sous').textContent = v.charge ? 'On frappe à la porte…' : d ? `${d.enLigne ? 'En ligne · ' : ''}${v.b ? `${v.b.nom} · ${nomQuartier(ph.q)}` : 'Visite'}` : '';
    $('#vi-ligne').hidden = !(d && d.enLigne);
    vue.classList.toggle('carte', !v.scene);
    const ti = v.b && v.b.titre && d && d.photo ? d.photo.ti : null; // son titre (« Légende du Manoir »), lu dans sa photo : sous son enseigne
    vue.innerHTML = v.scene ? `<span class="vi-enseigne">${esc(v.b.nom)}</span>${ti ? `<span class="vi-titre">${etiquetteTitre(ti)}</span>` : ''}<span class="vi-lecture"><i class="ico">${ICONS.UI.oeil}</i>Tu visites : rien ne change chez ${esc(v.pseudo)}</span>` : carteVisite(v);
    $('#vi-bas').innerHTML = basVisite(v);
    document.querySelectorAll('#visite [data-vi]').forEach((b) => { b.onclick = () => clicVisite(b); });
  }
  async function clicVisite(b) {
    const v = visite; if (!v) return; audio();
    const a = b.dataset.vi;
    if (a === 'retour') { son.tap(); finVisite(); return; }
    if (a === 'recettes') { son.tap(); v.recettes = !v.recettes; peindreVisite(); return; }
    if (a === 'reessayer') { son.tap(); const p = v.pseudo, cl = v.depuisCl, ev = v.E ? v.E.cle : null; libererEv3(v); visite = null; visiter(p, cl, ev); return; }
    if (a !== 'pourboire') return;
    if (b.getAttribute('aria-disabled') === 'true') { son.non(); return; }
    if (v.envoi) return;
    v.envoi = true; peindreVisite();
    const r = await classement.pourboire(v.pseudo); v.envoi = false;
    if (visite !== v) return;
    if (r.etat === 'ok') { if (r.etoile !== false) st.etoiles++; save(); hud(); son.deblocage(); buzz([10, 30, 10]); confettis(0.5); if (v.scene && SCENE.texte) SCENE.texte('Merci !'); toast(`Pourboire laissé à ${v.pseudo} !${r.etoile !== false ? ` +1 étoile pour toi (+${Math.round(G.ETOILE_BONUS * 100)} % de gains, pour toujours).` : ''}`); } // un pourboire donné : une étoile (plus de point de classement depuis le SQL 6.1)
    else if (r.etat === 'refus' && r.erreur === 'deja' && r.etoile) { etoileRattrapee(v.pseudo); son.deblocage(); } // la réponse du premier envoi s'était perdue : il était bien passé, l'étoile aussi
    else {
      son.non();
      toast(r.etat === 'refus' ? ({ deja: `Tu as déjà laissé un pourboire à ${v.pseudo} aujourd’hui.`, quota: 'Tes 3 pourboires du jour sont donnés : reviens demain.', soi: 'C’est ta propre boutique !', inconnu: 'Cette boutique a fermé ses portes.', jeton: 'Ton inscription au classement a changé : rouvre le classement.' }[r.erreur] || 'Le pourboire n’est pas passé. Réessaie dans un moment.')
        : r.etat === 'pas-installe' ? 'Les pourboires arrivent bientôt.' : r.etat === 'pas-rejoint' ? 'Rejoins le classement pour laisser un pourboire.' : msgReseau(r.etat));
    }
    peindreVisite();
  }
  // un pourboire donné dont la réponse s'était perdue (le serveur dit « deja », pour un copain dont l'étoile n'a pas encore été versée sur ce téléphone :
  // le moteur le sait, src/classement.js) : l'étoile du donneur, une fois par copain et par jour
  function etoileRattrapee(pseudo) { st.etoiles++; save(); hud(); toast(`Ton pourboire à ${pseudo} était bien passé : +1 étoile pour toi (+${Math.round(G.ETOILE_BONUS * 100)} % de gains, pour toujours).`); }
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
    if (!feuille.hidden || document.hidden || visite || annonceOuverte || lundiOuvert || retourEnCours || MINIJEUX.ouvert || (EVS && EVS.ouvert) || (AR && AR.ouvert)) { copainsMinuteur = setTimeout(tenterCopains, 1500); return; }
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
  const CAS_NOTIFS = [['pleine', 'Ta boutique est pleine', 'Quand tes heures d’absence sont atteintes'], ['evenements', 'Les événements', 'L’ouverture et la fin'], ['pourboires', 'Les pourboires', 'Quand un copain t’en laisse un'], ['objectif', 'L’objectif commun', 'Quand il est réussi, et ta place du lundi']];
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

  // ─── la cadence (la batterie) : 30 images/s au plus en jouant, 10 après 15 s sans toucher l'écran ni le clavier (et sans message du jeu,
  //     ni écran ouvert ou fermé : l'Atelier, la Planque, l'arrière-salle…), 30 de nouveau au premier toucher. requestAnimationFrame garde
  //     la synchro avec l'écran (60 Hz, 120 Hz ProMotion) : les images trop tôt ne font rien (la gigue tolérée : 33,3 ms visées, 30,3
  //     acceptées, pour ne pas tomber à 20). G.tick reçoit toujours le vrai temps écoulé depuis la dernière image traitée : les gains ne
  //     dépendent pas de la cadence. Pleine cadence pendant un glisser (un meuble en mode Déplacer, la poignée du tiroir) ; les mini-jeux de
  //     l'Atelier et des événements ont leur propre boucle, jamais bridée ; l'arrière-salle (BlackJack, roulette) passe la boucle à pleine cadence. ?cadence=0 coupe la limite (tests, débogage).
  //     Le joueur choisit (Réglages › Le jeu › Images par seconde, st.images) : Économie (30 puis 10, par défaut), Fluide (60 puis 20) ou
  //     Maximum (la vitesse de l'écran, 60 à 120, sans ralentir au repos). Le choix s'applique à l'image suivante.
  const CADENCE = { jeu: 30, repos: 10, calmeMs: 15e3, gigue: 3 }, sansLimite = /[?&]cadence=0(&|$)/.test(location.search);
  const IMAGES = { economie: { jeu: CADENCE.jeu, repos: CADENCE.repos }, fluide: { jeu: 60, repos: 20 }, max: { jeu: 0, repos: 0 } }; // 0 : pas de limite
  const modeImages = () => (st && Object.prototype.hasOwnProperty.call(IMAGES, st.images) ? IMAGES[st.images] : IMAGES.economie);
  let dernierGeste = performance.now(), rafPrec = 0, apresImage = false, msImage = 0, nImages = 0, sautees = 0; // sautees : les rafraîchissements laissés passer depuis la dernière image
  const instantsImages = new Float64Array(128); // les instants des dernières images traitées (la cadence mesurée, pour les tests ; taille fixe)
  function eveiller() { dernierGeste = performance.now(); }
  const auRepos = (t) => t - dernierGeste > CADENCE.calmeMs;
  // l'arrière-salle (le BlackJack, la roulette) n'est jamais bridée : tant qu'elle est ouverte, pleine cadence et pas de repos, quel que soit le
  // choix des images par seconde (la boutique, cachée derrière, ne se dessine pas : la 3D attend, sa passe d'effets est rendue)
  const arriereOuverte = () => !!(AR && AR.ouvert);
  function cadenceCible(t) { const m = modeImages(); if (sansLimite || glisse || tiroir.glisse || arriereOuverte() || !m.jeu) return 0; return auRepos(t) ? m.repos : m.jeu; } // 0 : pleine cadence
  function cadence() {
    const t = performance.now(); let n = 0; for (let k = 0; k < instantsImages.length; k++) if (instantsImages[k] > 0 && t - instantsImages[k] <= 1000) n++;
    const limite = !sansLimite && modeImages().jeu > 0;
    return { cible: cadenceCible(t), mesuree: n, repos: limite && !arriereOuverte() && auRepos(t), limite, mode: st.images, travail: Math.round(msImage * 10) / 10 };
  }

  // ─── boucle ───
  let derniereImage = 0;
  function frame(now) {
    // l'intervalle qui suit une image traitée : son vrai coût (rendu compris), que la qualité de la scène mesure ; les images que la cadence
    // espace volontairement (33 ou 100 ms) ne sont pas de la lenteur
    const ecartRaf = rafPrec ? now - rafPrec : 0; rafPrec = now; if (apresImage) { apresImage = false; msImage = ecartRaf; }
    verifierReveil(); // chaque image : la page vient-elle de dormir ?
    if (retourEnCours) { lastFrame = now; derniereImage = now; requestAnimationFrame(frame); return; } // l'absence n'est pas encore comptée : rien ne bouge
    const cible = cadenceCible(now); if (cible && now - lastFrame < 1000 / cible - CADENCE.gigue) { sautees++; requestAnimationFrame(frame); return; } // trop tôt : cette image ne fait rien
    instantsImages[nImages++ & 127] = now; apresImage = true; const espacee = sautees > 0; sautees = 0; // espacée par la cadence (pas par la lenteur du téléphone)
    const dt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    // le filet : plus de 5 s entre deux images sans qu'aucun retour soit parti (une page gelée que le détecteur a manquée, vue « cachée » au
    // dégel) ; on ne tique pas par-dessus (le temps serait perdu, puis lastSeen recollé à maintenant) : le retour compte l'absence depuis le
    // dernier lastSeen sauvé. Les sauts de l'heure sûre ne passent pas par ici (pas de trou entre les images) : payerSaut les plafonne.
    const trou = derniereImage ? now - derniereImage : 0; derniereImage = now;
    if (absencePrete && trou > 5000 && reprendre('saut')) { requestAnimationFrame(frame); return; }
    const ecranEv = EVS ? EVS.ouvert : null, planque = !!ecranEv, atelier = MINIJEUX.ouvert || planque || !!(AR && AR.ouvert) || !!visite || !!(TC && TC.ouvert); // pendant l'Atelier, la Planque ou une visite : pas d'événement, de client mystère, d'habitué ni de chat qui surgissent sous l'écran
    // sous l'écran, l'événement de la boutique qui se joue au doigt (le critique, le pétrissage, la panne) est EN PAUSE, comme pendant une
    // courte sortie (G.absence) : ses échéances avancent du vrai temps écoulé depuis le dernier pas (un trou de plus de PAUSE_EV ne se compte
    // pas ici) ; on le retrouve en refermant. Les autres continuent : le coup de feu, le meunier et l'anniversaire ne demandent rien (les ventes
    // de dessous l'écran en profitent déjà : en pause, ils dureraient autant qu'on reste dans la Planque), et la commande se remplit seule
    // (prête, elle attend déjà sa livraison ; en pause, elle aurait tout le temps de se remplir)
    const tPas = HORLOGE.maintenant(), ecoule = tPas - st.now, evPause = atelier && st.ev && ['critique', 'petrissage', 'panne'].includes(st.ev.type) && ecoule > 0 && ecoule <= G.PAUSE_EV * 1000 ? st.ev : null;
    if (atelier) { st.evTimer = Math.max(st.evTimer, 5); st.mystereTimer = Math.max(st.mystereTimer, 5); if (st.chatAttente != null) st.chatAttente = Math.max(st.chatAttente, 5); if (evPause) for (const k of ['debut', 'fin']) if (Number.isFinite(evPause[k])) evPause[k] += ecoule; }
    const out = G.tick(st, dt, tPas, atelier ? () => 0.999 : undefined, !!evPause); // la panne en pause n'arrête pas son four (G.tick)
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
    if (!atelier) SCENE.frame(dt, st, HORLOGE.maintenant(), msImage, espacee); // l'écran de l'Atelier (ou de l'arrière-salle) couvre la boutique : la 3D attend
    else if (visite && visite.scene) { const t = HORLOGE.maintenant(); visite.b.st.now = t; SCENE.frame(dt, visite.b.st, t, msImage, espacee); } // la visite : la scène montre la boutique du copain (rien n'est sauvé)
    else if (visite && visite.ev3) { // sa Planque : la scène de l'événement tourne sur son état rebâti (aucun tick : rien ne s'y vend, rien ne se sauve)
      const e3 = visite.ev3;
      if (!e3.perdu) { e3.frame(dt, visite.qe); visite.images++; } else if (performance.now() - e3.perdu > 1000) { libererEv3(visite); peindreVisite(); } // le contexte perdu ne revient pas : le résumé seul
    }
    if (planque) ecranEv.frame(dt, HORLOGE.maintenant(), msImage, espacee); // l'écran de l'événement (la Planque, le Manoir) vit tant qu'il est ouvert (fermé, il rattrape une absence) ; la boutique hantée mesure sa qualité comme la boutique
    if (now - tChat > 500) { tChat = now; majChat(); } // le chat noir arrive (ou repart) avec la Maison hantée
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
    reveilW = Date.now(); reveilP = performance.now(); eveiller(); // le détecteur repart d'ici : pas de second retour pour le même sommeil
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
  // opération lancés pendant l'avance) revient à maintenant, avec le temps qui lui restait ; les absences recomptent aussitôt
  function reculer(ms) {
    if (!st || !(ms > 0)) return;
    const t = HORLOGE.maintenant(), avant = st.lastSeen;
    // la vraie heure de la dernière sauvegarde : l'heure du téléphone d'alors (st.vuTel), sinon l'heure sûre qu'elle gardait (st.horloge.sure,
    // les sauvegardes d'avant cette version) ; jamais après lastSeen ni après maintenant (le recul n'est possible que si le téléphone n'a pas
    // mené le jeu en avance : src/horloge.js (e))
    const est = Number.isFinite(st.vuTel) ? st.vuTel : st.horloge && Number.isFinite(st.horloge.sure) ? st.horloge.sure : avant - ms;
    const base = Number.isFinite(avant) ? Math.min(t, avant, est) : t;
    const rendu = Number.isFinite(avant) ? Math.max(0, avant - base) : 0;
    // ce qui a commencé dans le futur revient à maintenant avec le temps qui lui RESTAIT à l'heure du jeu (ref : son ancien now), pas sa durée
    // entière : l'heure sûre peut n'arriver que des minutes après le lancement (relue toutes les 30 min), ce temps-là est déjà joué
    const dec = (o, ref) => { if (!o || typeof o !== 'object') return; if (Number.isFinite(o.debut) && o.debut > t) { if (Number.isFinite(o.fin)) o.fin = t + Math.max(0, o.fin - (Number.isFinite(ref) ? Math.max(ref, o.debut) : o.debut)); o.debut = t; } };
    const etat = (o, r) => { if (!o || typeof o !== 'object') return; if (Number.isFinite(o.lastSeen)) o.lastSeen = Math.min(o.lastSeen - r, t); const ref = o.now; if (Number.isFinite(o.now)) o.now = Math.min(o.now, t); dec(o.ev, ref); dec(o.boost, ref); dec(o.operation, ref); };
    if (Number.isFinite(avant)) st.lastSeen = base;
    // les boosts aussi (le coup de feu d'une critique, celui de la réserve) : lancés pendant l'avance, ils gardent à partir de maintenant le temps qui leur restait
    // (un boost d'avant cette version, sans debut, reste tel quel)
    const ref = st.now; if (Number.isFinite(st.now)) st.now = Math.min(st.now, t); dec(st.ev, ref); dec(st.boost, ref); dec(st.boosts && st.boosts.actif, ref);
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
    if (EVS && EVS.ouvert && EVS.ouvert.saut) EVS.ouvert.saut(paye); // l'écran d'un événement ouvert (la Planque, le Manoir) : ses apprentis aussi, pour le même temps
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
    if (NVS && typeof st.nouveautesVues !== 'string') st.nouveautesVues = NVS.vueNeuve(); // une sauvegarde neuve, ou d'avant les nouveautés : tout est vu, sauf la plus récente
    document.querySelectorAll('[data-ico]').forEach((el) => { el.innerHTML = ICONS.UI[el.dataset.ico] || ''; });
    SCENE.choisirQualite(st.qualite); // Réglages › Qualité graphique : la scène naît à ce palier (Auto : la mesure décide)
    if (!SCENE.init($('#scene'), $('#scene-ui'))) $('#sans-3d').hidden = false; // sans WebGL : la boutique vit quand même, sans image
    SCENE.surServi = (r) => { if (visite) return; if (r.cadeau) { reussite(`${r.hb.nom}, fidèle depuis ${r.jours} jours, t’offre ${G.fmtEur(r.cadeau)} !`); } else if (r.jours > 1) toast(`${r.hb.nom} : ${r.jours}e jour de suite !`); };
    tiroir.init();
    layout();
    tiroir.aller(['ouvert', 'mi', 'ferme'].includes(st.tiroir) ? st.tiroir : 'mi', false);
    if (window.ResizeObserver) new ResizeObserver(layout).observe($('#corps'));
    $('#b-fini').addEventListener('click', () => { audio(); son.tap(); amenager(false); });
    $('#b-deplacer').addEventListener('click', () => { audio(); son.tap(); deplacer(!SCENE.deplacer); });
    $('#b-origine').addEventListener('click', () => { audio(); son.tap(); planOrigine(); });
    { const sc = $('#scene'), pos = (e) => { const r = sc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }; // le meuble qui suit le doigt (mode Déplacer)
      sc.addEventListener('pointermove', (e) => { if (glisse && e.pointerId === glisse.pid) majGlisse(...pos(e)); });
      sc.addEventListener('pointerup', (e) => { if (glisse && e.pointerId === glisse.pid) { majGlisse(...pos(e)); finGlisse(false); } });
      sc.addEventListener('pointercancel', (e) => { if (glisse && e.pointerId === glisse.pid) finGlisse(true); }); }
    $('#b-atelier').addEventListener('click', () => { audio(); son.tap(); sheetAtelier(); });
    $('#b-classement').addEventListener('click', () => { audio(); son.tap(); sheetClassement(); });
    $('#b-quartier').addEventListener('click', () => { audio(); son.tap(); if (EVT) EVT.ouvrir(); });
    $('#b-hantee').addEventListener('click', () => { audio(); son.tap(); if (HTE) HTE.ouvrir(); });
    $('#boosts').addEventListener('click', () => { audio(); son.tap(); lancerBoost(); });
    // l'événement « Le Quartier » : la Planque, ses paliers et leurs récompenses, l'annonce, le bilan (src/evenement.js)
    // les événements (src/evenement.js) : « Le Quartier » (la Planque) et « La Maison hantée » (le Manoir) ; leurs paliers et récompenses, l'annonce, le bilan
    const depsEv = (cle) => ({ st: () => st, son, buzz, audio, maintenant: () => HORLOGE.maintenant(), sure: () => { try { const e = HORLOGE.etat(); return e ? e.sure : null; } catch (e) { return null; } }, save, toast, fete: () => SCENE.fete(), openSheet, closeSheet, on, recompenses: recVue, confettis,
      classement: () => sheetClassement(cle), rang: () => { try { if (!classement || !classement.disponible() || !periodes().some(([id]) => id === cle)) return null; const r = classement.resume(), x = r[cle] || (r.evenements && r.evenements[cle]); return r.rejoint && x ? x.rang : 0; } catch (e) { return null; } },
      ouvert: () => { closeSheet(); eveiller(); }, ferme: () => { eveiller(); lastFrame = performance.now(); majCoin(); majChat(); renderCards(true); hud(); renderPage(true); if (feteEnAttente) { feteEnAttente = false; SCENE.fete(); } },
      apres: () => { renderCards(true); hud(); lastPage = ''; renderPage(true); } });
    if (EVT) EVT.init(depsEv('quartier'));
    if (HTE) HTE.init(depsEv(HTE.cle));
    majChat();
    buildCards();
    MINIJEUX.init({ st: () => st, son, buzz, audio, maintenant: () => HORLOGE.maintenant(), fete: () => SCENE.fete(),
      ouvert: () => { closeSheet(); eveiller(); }, ferme: () => { eveiller(); lastFrame = performance.now(); renderPage(true); if (feteEnAttente) { feteEnAttente = false; SCENE.fete(); } },
      apres: () => { renderCards(true); hud(); save(); renderPage(true); } });
    if (AR) AR.init({ st: () => st, son, buzz, audio, save, confettis,
      ouvert: () => { closeSheet(); eveiller(); if (SCENE.alleger) SCENE.alleger(); }, // la boutique, cachée, rend sa passe d'effets (recréée au retour) ferme: () => { eveiller(); lastFrame = performance.now(); renderCards(true); hud(); lastPage = ''; renderPage(true); if (feteEnAttente) { feteEnAttente = false; SCENE.fete(); } },
      apres: () => { hud(); } });
    document.querySelectorAll('.modes button').forEach((b) => { b.classList.toggle('actif', String(st.mode) === b.dataset.mode); b.addEventListener('click', () => { st.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCards(true); save(); }); });
    $('#cartes').addEventListener('click', onCardClick);
    $('#b-ameliorations').addEventListener('click', () => { audio(); sheetAmeliorations(); });
    $('#b-etoiles').addEventListener('click', () => { audio(); sheetEtoiles(); });
    $('#objectifs').addEventListener('click', () => { audio(); showPage('defis'); });
    $('#enseigne').addEventListener('click', () => { audio(); sheetNom(false); });
    $('#b-cloche').addEventListener('click', () => { audio(); if (st.ev) { if (tiroir.pos === 'ouvert') tiroir.aller('mi'); if (!evEtendu) basculerEvenement(); } else { son.tap(); showPage('journal'); } }); // la cloche : l'événement en cours, sinon le fil des nouvelles
    $('#b-nouveautes').addEventListener('click', () => { audio(); son.tap(); sheetNouveautes(); }); // le cadeau : les nouveautés
    $('#evenement').addEventListener('click', (e) => { if (e.target.closest('button')) return; audio(); basculerEvenement(); });
    document.querySelectorAll('#onglets button').forEach((b) => b.addEventListener('click', () => { audio(); if (b.dataset.page !== pageActive) { son.tap(); showPage(b.dataset.page); } else if (tiroir.pos === 'ferme') tiroir.aller('mi'); else $('#pages').scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }));
    $('#scene').addEventListener('pointerdown', (e) => {
      audio();
      const r = $('#scene').getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (SCENE.deplacer) { if (!glisse) debutGlisse(e, sx, sy); return; } // le mode Déplacer : on prend un meuble, rien d'autre
      const porte = !SCENE.amenager && SCENE.hitArriere && SCENE.hitArriere(sx, sy); if (!porte) toquees = []; // la petite porte du fond : cinq touches de suite
      if (SCENE.hit(sx, sy)) { const tip = G.encaisserPourboire(st); son.pourboire(); buzz([10, 20, 10, 20, 10]); SCENE.texte(`+${G.fmtEur(tip)} de pourboire !`); toast(`Le client mystère laisse ${G.fmtEur(tip)} de pourboire !`); renderCards(true); hud(); save(); }
      else if (SCENE.hitChat && SCENE.hitChat(sx, sy)) caresserChat(); // le chat dort dans la zone du boulanger : il passe avant
      else if (classement && SCENE.hitTrophees && SCENE.hitTrophees(sx, sy)) { son.tap(); sheetRecompenses(); } // la vitrine des trophées, la coupe du comptoir
      else if (SCENE.hitBoulanger(sx, sy)) showPage('boulanger');
      else if (porte) toquer(sx, sy);
      else { const id = SCENE.hitMeuble ? SCENE.hitMeuble(sx, sy) : null; if (id) sheetMeuble(id); else SCENE.tap(); }
    });
    // au retour dans le jeu : une heure sûre fraîche (2,5 s au plus) avant de compter l'absence ; le jeu attend, sans rien sauver entre-temps
    document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); return; } reprendre('visible'); setTimeout(verifierVersion, 4000); });
    setTimeout(verifierVersion, 60e3); setInterval(verifierVersion, 5 * 60e3);
    window.addEventListener('pageshow', (e) => { if (e.persisted) reprendre('cache'); else verifierReveil(); });
    for (const ev of ['focus', 'resume']) (ev === 'resume' ? document : window).addEventListener(ev, verifierReveil);
    setInterval(verifierReveil, 1000);
    document.addEventListener('pointerdown', () => { dernierToucher = performance.now(); }, true);
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) document.addEventListener(ev, eveiller, { capture: true, passive: true }); // un geste : la cadence de jeu (30 images/s) revient
    document.addEventListener('pointerdown', () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* rien */ } }, { once: true });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    document.addEventListener('freeze', save);
    window.addEventListener('blur', save);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (visite && $('#feuille').hidden) finVisite(); else closeSheet(); } });
    // le parcours du boulanger : une sauvegarde déjà avancée reçoit une fois les récompenses des boutiques passées, AVANT l'absence (ses bonus de
    // gains et ses étoiles comptent dès cette absence) ; la feuille « Ton parcours » vient après (après celle du retour, si elle est ouverte)
    const rattrape = fresh ? [] : G.rattraperParcours(st);
    if (!fresh) { const t = HORLOGE.maintenant(), sortie = t - st.lastSeen, abs = G.absence(st, t); absencePayee = abs.secs * 1000; const montre = abs.total > 0 && abs.secs > 90; if (montre) sheetRetour(abs); noterRetour('lancement', abs, sortie, montre, HORLOGE.info().source !== 'telephone'); }
    absencePrete = true;
    if (rattrape.length) { save(); const montrer = () => { sheetRecapParcours(rattrape); renderCards(true); hud(); }; if ($('#feuille').hidden) montrer(); else { const t = setInterval(() => { if ($('#feuille').hidden) { clearInterval(t); montrer(); } }, 1000); } }
    HORLOGE.surSaut(payerSaut);
    if (EVS) { setTimeout(() => { if ($('#feuille').hidden) EVS.annoncer(true); else { const t = setInterval(() => { if ($('#feuille').hidden) { clearInterval(t); EVS.annoncer(true); } }, 1500); } }, 800); } // l'annonce d'un événement (ou son bilan) attend que la feuille du retour soit refermée ; le bilan du Quartier passe avant l'annonce de la Maison hantée
    // l'écran d'un événement se prépare en arrière-plan (5 s après le lancement) pour qui y est déjà entré : il s'ouvrira directement en HD
    if (EVT) setTimeout(() => { try { if (EVT.visible() && st.quartier && st.quartier.majeur && SCENE.precharger) SCENE.precharger('planque'); } catch (e) { /* rien */ } }, 5000);
    if (HTE) setTimeout(() => { try { if (HTE.visible() && st[HTE.cle] && st[HTE.cle].ouvertLe && SCENE.precharger) SCENE.precharger('hantee'); } catch (e) { /* rien */ } }, 5000);
    if (EVS) setInterval(() => { majCoinQuartier(); majChat(); if (!EVS.ouvert && !MINIJEUX.ouvert && !(AR && AR.ouvert) && !visite && !document.hidden && $('#feuille').hidden) EVS.annoncer(); }, 20e3); // midi sonne (ou la fin) pendant qu'on joue : l'icône, l'annonce ou le bilan arrivent sans relancer
    // le classement : après les gains hors ligne, un premier envoi (si on l'a rejoint), puis toutes les 5 min et au passage en arrière-plan
    // ce qui part : ses points de boulanger de la semaine (et leur lundi, heure de Paris sur l'horloge de confiance), et sa fortune pour information
    // classement v6 : la photo de sa boutique (pour les visites des copains), et l'heure où elle sera pleine (la notification, en quittant le jeu)
    // + ses statistiques (x) et l'événement EN COURS (e) : seulement pendant sa fenêtre, s'il y est entré (la porte passée, ouvertLe) et ne l'a pas masqué
    const evPhoto = () => { for (const E of [EVT, HTE]) { if (!E) continue; const f = E.fenetre(), q = st[E.cle]; if (f && f.ouvert && q && q.ouvertLe > 0 && E.majeur() && !q.masque) return { id: E.cle, q }; } return null; };
    const photo = () => { if (!st || !CLM.photo) return null; const r = recVue(); return CLM.photo(st, { G, coupes: r ? r.coupes : [], badge: !!(r && r.badge), dh: HTE && st[HTE.cle] ? st[HTE.cle].decos : [], ev: evPhoto() }); };
    const pleineA = () => (st ? HORLOGE.maintenant() + G.heuresAbsence(st) * 3600e3 : null);
    try { classement = CLM ? CLM.navigateur({ fortune: () => (st ? st.lifetime : NaN), points: () => (st ? mesPoints() : null), quartier: () => (st && st.quartier && QT && QT.envoiBillets(HORLOGE.maintenant()) ? st.quartier.total : null), ...envoiHantee(), maintenant: () => HORLOGE.maintenant(), photo, pleineA }) : null; } catch (e) { classement = null; }
    // le chat des boulangers : son bouton rond sous les icônes des événements (seulement avec la configuration), la pastille des non-lus, sa feuille plein écran
    if (TC) TC.init({ classement: () => classement, st: () => st, save, son, buzz, audio, ouvert: () => { closeSheet(); eveiller(); }, ferme: () => { eveiller(); lastFrame = performance.now(); }, rejoindre: () => sheetClassement() });
    if (RT) RT.init({ classement: () => classement, st: () => st, save, son, buzz, audio, ouvert: () => { closeSheet(); eveiller(); }, ferme: () => { eveiller(); lastFrame = performance.now(); }, rejoindre: () => sheetClassement(), quartier: () => { const q = G.QUARTIERS[G.quartier(st)]; return q ? q.nom : ''; } });
    try { // le coin se resserre au besoin (serrerCoin)
      const mo = new MutationObserver(serrerCoinBientot);
      mo.observe($('#coin'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
      mo.observe($('#tiroir'), { attributes: true, attributeFilter: ['data-pos'] });
      mo.observe($('#evenement'), { attributes: true, attributeFilter: ['hidden'] });
    } catch (e) { /* rien */ }
    window.addEventListener('resize', serrerCoinBientot); serrerCoinBientot();
    if (classement) { classement.ecouter(() => { rafraichirClassement(); majRecompenses(); majCoin(); if (TC) TC.majBouton(); if (RT) RT.surClassement(); if (pageActive === 'reglages') renderPage(); if (visite) peindreVisite(); tenterCopains(); }); majRecompenses(); classement.demarrer(); setTimeout(verifierCadeaux, 3000); setInterval(() => { if (document.visibilityState === 'visible') verifierCadeaux(); }, 10 * 60e3); setInterval(majRecompenses, 60e3);
    // la liste ouverte se relit toute seule toutes les 30 s (qui vient d'arriver « en ligne », les points qui bougent) : seulement
    // sur l'onglet de la liste, page visible, sans doubler une lecture en vol ; la feuille fermée, plus rien
    setInterval(() => { if (vueCl === 'liste' && !feuille.hidden && document.visibilityState === 'visible' && !classement.enChargement(ongletCl)) classement.charger(ongletCl); }, (window.__relireClassement | 0) || 30e3); } // la tenue et la coupe changent aussi au lundi
    majCoin();
    lastNiveau = G.niveau(st);
    renderCards(true); hud(); renderObjectifs(); renderEvenement();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    window.__fournil = { get st() { return st; }, get retour() { return { enCours: retourEnCours, dernier: dernierRetour }; }, journalRetours: sheetJournalRetours, nouveautes: sheetNouveautes, cadeaux: verifierCadeaux, G, SCENE, save, son, confettis, audio, reset: () => { fige = true; return effacer().then(() => location.reload()); }, absence: (ms) => { st.lastSeen = HORLOGE.maintenant() - ms; const abs = G.absence(st, HORLOGE.maintenant()); sheetRetour(abs); renderCards(true); return abs; }, give: (n) => { G.gagner(st, n, true); renderCards(true); hud(); }, rush: () => G.lancerRush(st), commande: () => G.lancerCommande(st, Math.random), ev: (type) => G.lancerEvenement(st, Math.random, type), mystere: () => SCENE.mystere(), xp: (n) => G.gagnerXp(st, n), meuble: (id) => { const r = G.ameliorerMeuble(st, id); renderCards(true); hud(); save(); return r; }, fiche: sheetMeuble, ficheMeuble: sheetMeuble, tiroir: (p) => (p ? tiroir.aller(p, false) : tiroir.pos), amenager: (on) => { amenager(on); return SCENE.amenager; }, page: showPage, boulanger: () => showPage('boulanger'), scene: (o) => SCENE.forcer(o), journal: () => showPage('journal'), classement: () => classement, feuilleClassement: sheetClassement, recompenses: sheetRecompenses, majRecompenses, habitue: (id) => SCENE.habitue(G.HABITUES.find((h) => h.id === id)),
      apprentiXp: (i, sec) => { const g = G.creditApprenti(st, i, sec / G.temps(st, i)); if (g) annoncerGrade(g); renderCards(true); return G.gradeApprenti(st, i); },
      chat: () => sheetChat(), ficheApprenti: (i) => sheetApprenti(i), parcours: sheetParcours, etoiles: sheetEtoiles, monteeGamme: sheetMonteeGamme, saison: (id) => { G.forcerRecette(id); G.objectifsDuJour(st, HORLOGE.maintenant()); renderCards(true); return st.saison; }, stats: () => SCENE.stats, cadence, atelier: () => MINIJEUX.etat(), ouvrirAtelier: (id) => MINIJEUX.ouvrir(id), fermerAtelier: () => MINIJEUX.fermer(), points: () => G.detailPoints(st), garderobe: (piece) => { if (GRU) GRU.ouvrir(ctxGarderobe(), piece); }, vetement: (id) => { const r = G.donnerVetement(st, id); save(); lastPage = ''; renderPage(true); return r; }, rafraichir: () => { renderCards(true); hud(); save(); lastPage = ''; renderPage(true); }, coin: () => { majCoin(); const b = $('#b-classement'), p = b.querySelector('.rang-pastille'); return { classement: !b.hidden, pastille: p.hidden ? '' : p.textContent, label: b.getAttribute('aria-label'), quartier: !$('#b-quartier').hidden, hantee: !$('#b-hantee').hidden }; },
      quartier: () => (EVT ? EVT.ouvrir() : false), evenement: EVT, Q: QT,
      hantee: () => (HTE ? HTE.ouvrir() : false), fermerHantee: () => { if (HTE) HTE.fermer(); }, evHantee: HTE, HT, annoncerEvenements: (f) => (EVS ? EVS.annoncer(f !== false) : false), chatNoir, compagnons: (retour) => sheetCompagnons(retour), choisirCompagnon: (id) => { const r = G.choisirCompagnon(st, id); if (r.ok) { save(); majChat(); } return r; }, boosts: () => st.boosts, lancerBoost, renderBoosts,
      visiter: (p, ev) => visiter(p, true, ev), finVisite, visite: () => (visite ? { pseudo: visite.pseudo, scene: visite.scene, charge: visite.charge, etat: visite.etat, nom: visite.b ? visite.b.nom : null, ev: visite.E ? visite.E.cle : null, ev3: !!visite.ev3, images: visite.images, calls: visite.ev3 ? visite.ev3.calls : 0, q: visite.qe ? { postes: visite.qe.postes.map((x) => [x.niv, x.staff]), paliers: visite.qe.paliers.length, total: visite.qe.total, decos: visite.qe.decos.slice() } : null } : null), // classement v6 (pour les tests)
      fiche: () => (fiche ? { pseudo: fiche.pseudo, charge: fiche.charge, etat: fiche.etat, photo: !!(fiche.data && fiche.data.photo), stats: !!(fiche.b && fiche.b.stats) } : null),
      tchat: TC,
      retours: RT,
      arriere: () => (AR ? AR.etat() : null), ouvrirArriere: () => (AR ? AR.ouvrir() : false), BJ: typeof BLACKJACK !== 'undefined' ? BLACKJACK : null, zonePorte: () => (SCENE.zoneArriere ? SCENE.zoneArriere() : null) };
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  return { get st() { return st; } };
})();
