/* LE FOURNIL — interface : barre d'onglets (Boutique, Défis, Boulanger, Journal, Réglages), cartes compactes, ticket des objectifs,
   bannière d'événement sur la scène, cloche, badges, feuilles, sons, sauvegarde, boucle. */
const UI = (() => {
  'use strict';
  const G = GAME, $ = (s) => document.querySelector(s), KEY = 'fournil.v2';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let st, lastFrame = 0, lastSave = 0, cards = [], carteSaison = null, lastHud = '', lastObj = '', lastEv = '', lastPage = '', hintStep = -1, hintUntil = 0, hintDefile = -1, toastTimer = 0, lastNiveau = 0, vuBoulanger = false;
  let pageActive = 'boutique', evEtendu = false;
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
    st.lastSeen = Date.now(); lastSave = performance.now();
    let raw; try { raw = JSON.stringify(st); } catch (e) { return; }
    try { localStorage.setItem(KEY, raw); } catch (e) { /* stockage indisponible */ }
    idbEcrire(raw);
  }
  function lire(raw) {
    try {
      if (!raw) return null;
      const s = JSON.parse(raw); if (!s || s.v !== 2 || !Array.isArray(s.stations)) return null;
      const fresh = G.newState(Date.now());
      for (const k in fresh) if (!(k in s)) s[k] = fresh[k];
      while (s.stations.length < G.PRODUITS.length) s.stations.push({ niv: 0, staff: false, prog: 0, actif: false });
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

  // ─── sons (Web Audio, sans fichier) ───
  let actx = null;
  function audio() { if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { actx = new AC(); } catch (e) { actx = null; } }
  function beep(freq, dur, type, vol, delay) {
    if (!actx || !st.son || actx.state !== 'running') return;
    const t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const son = {
    tap: () => beep(520, 0.08, 'triangle', 0.06),
    vente: (m) => { const k = Math.min(6, Math.floor(Math.log10(Math.max(1, m)))); beep(660 + k * 80, 0.12, 'sine', 0.05); beep(990 + k * 80, 0.16, 'sine', 0.04, 0.06); },
    achat: () => { beep(440, 0.1, 'triangle', 0.06); beep(660, 0.14, 'triangle', 0.06, 0.08); },
    deblocage: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.07, i * 0.09)); },
    embauche: () => { [784, 988].forEach((f, i) => beep(f, 0.2, 'sine', 0.06, i * 0.12)); },
    evenement: () => { [659, 784, 659, 988].forEach((f, i) => beep(f, 0.14, 'square', 0.035, i * 0.1)); },
    pourboire: () => { [1047, 1319, 1568].forEach((f, i) => beep(f, 0.2, 'sine', 0.06, i * 0.07)); },
    non: () => beep(200, 0.12, 'square', 0.03),
    ronron: () => { beep(300, 0.25, 'sine', 0.05); beep(420, 0.28, 'sine', 0.04, 0.12); },
  };
  function buzz(p) { if (!st.vibre) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* pas de vibreur */ } }

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
        ${s.niv ? `<div class="palier"><span>Collection <b>${Math.min(f, G.SAISON.maitrise)}</b>/${G.SAISON.maitrise}${coll && coll.maitrisee ? ' · maîtrisée ✓' : ''}</span><span>niveau ${s.niv}</span><i style="width:${pct(Math.min(f, G.SAISON.maitrise), G.SAISON.maitrise)}"></i></div>
        <div class="barre"><i></i><span class="rev">+${G.fmtEur(G.revenuSaison(st))}</span>${s.actif ? `<span class="tps">${G.fmtDuree(G.tempsSaison(st))}</span>` : '<span class="cuire">Touche !</span>'}</div>` : `<p>${esc(r.desc)} Une recette de saison, à cuire à la main : cent fournées pour la maîtriser.</p>`}</div>
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
            ${s.staff ? (() => { const g = G.gradeApprenti(st, i); return `<button type="button" class="staff-ok" data-a="apprenti" aria-label="${esc(p.staffNom)}, grade ${g} : voir sa fiche">${ICONS.apprenti(i, g)}<span>${esc(p.staffNom.split(' ').pop())}</span><i class="grade g${g}">${g}</i></button>`; })() : `<button type="button" class="btn beurre ${st.coins >= G.prixStaff(st, i) ? '' : 'non'}" data-a="embaucher"><small>Embaucher</small><b>${G.fmtEur(G.prixStaff(st, i))}</b></button>`}</div>`;
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
        if (a === 'debloquer') { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); toast(`${G.PRODUITS[i].nom} : nouvelle recette !`); } else { son.achat(); buzz(8); }
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
      if (res.niv === 1) { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); toast(`${r.nom} : au menu jusqu’au ${r.fin[1]} ${MOIS[r.fin[0] - 1]} ! Touche la carte pour en cuire.`); } else { son.achat(); buzz(8); }
      renderCards(true); hud(); save(); return;
    }
    if (G.lancerSaison(st)) { son.tap(); buzz(6); SCENE.tap(); renderCards(); }
  }
  // la fiche d'un apprenti : son grade, ce qu'il apporte, son talent, le temps avant le grade suivant
  function sheetApprenti(i) {
    const p = G.PRODUITS[i], a = G.APPRENTIS[i], pr = G.progresApprenti(st, i), g = pr.n, vit = Math.round(G.APPRENTI_VITESSE * (g - 1) * 100), staffe = st.stations[i].staff;
    const restant = g < 5 ? (pr.prochain - pr.reste) * G.temps(st, i) / p.temps : 0;
    openSheet(`<div class="apprenti-tete">${ICONS.apprenti(i, g)}<div><h2>${esc(p.staffNom)}</h2><p class="sous">Grade <b>${g}</b> sur 5 · s’occupe des ${esc(p.pl)}</p></div></div>
      <div class="encadre doux"><div class="stat"><span>Fournées</span><b>${vit ? `${vit} % plus rapides` : 'à la vitesse normale'}</b></div>
        <div class="stat"><span>Talent au grade 3 : ${esc(a.talent)}</span><b>${g >= 3 ? '✓ ' : ''}${esc(G.effetTalentApprenti(i))}</b></div></div>
      ${g < 5 ? `<div class="stat"><span>Grade ${g + 1}</span><b>${staffe ? `encore ≈ ${G.fmtDuree(restant)} de fournil` : 'à l’embauche, il reprend où il en était'}</b></div><div class="mini xp"><i style="width:${pct(pr.reste, pr.prochain)}"></i></div>` : '<p class="note">Grade maximum : un pilier de la boutique.</p>'}
      <p class="note">Un apprenti prend du métier à chaque fournée, même pendant ton absence, et garde son grade d’une boutique à l’autre : −2 % de temps de cuisson par grade, et son talent au grade 3.</p>${btnRetour()}`);
    on('[data-a="close"]', closeSheet);
  }
  function annoncerGrade(g) { const a = G.APPRENTIS[g.i]; son.embauche(); buzz([10, 30, 10]); toast(`${a.prenom} passe au grade ${g.niv}${g.talent ? ` : ${a.talent} !` : ' !'}`); renderCards(true); }
  // le chat qui miaule à la porte : on l'adopte et on le nomme, ou il repassera
  function sheetChat() {
    st.chatAttente = 300; // fermée sans choisir, la feuille revient dans cinq minutes
    openSheet(`<div class="chat-tete">${ICONS.CHAT}</div><h2>Un chat miaule à la porte</h2><p class="sous">Il a senti les éclairs et veut rester. Comment l’appelles-tu ?</p>
      <input class="champ" type="text" maxlength="16" value="${G.CHAT.defaut}" aria-label="Nom du chat" autocomplete="off" autocorrect="off">
      <button type="button" class="btn large beurre" data-a="adopter" style="margin-top:12px"><b>L’adopter</b></button>
      <button type="button" class="btn large non" data-a="plus-tard" style="margin-top:8px"><b>Pas aujourd’hui</b></button>`);
    const champ = fc.querySelector('.champ');
    const ok = () => { const r = G.adopterChat(st, champ.value); closeSheet(); if (r.ok) { reussite(`${r.chat.nom} a adopté la boutique ! Caresse-le : il porte chance.`); renderPage(true); } };
    on('[data-a="adopter"]', ok); on('[data-a="plus-tard"]', () => { G.refuserChat(st); save(); closeSheet(); toast('Le chat repassera demain.'); });
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }
  function sheetNomChat() {
    if (!st.chat) return;
    openSheet(`<div class="chat-tete">${ICONS.CHAT}</div><h2>Le nom du chat</h2><input class="champ" type="text" maxlength="16" value="${esc(st.chat.nom)}" aria-label="Nom du chat" autocomplete="off" autocorrect="off">
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>Garder ce nom</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Annuler</b></button>`);
    const champ = fc.querySelector('.champ'), ok = () => { G.renommerChat(st, champ.value); save(); closeSheet(); renderPage(true); toast(`${st.chat.nom} ronronne.`); };
    on('[data-a="ok"]', ok); on('[data-a="non"]', closeSheet); champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    setTimeout(() => { champ.focus(); champ.select(); }, 50);
  }
  function caresserChat() { const r = G.caresser(st); if (!r.ok) return; son.ronron(); buzz(6); if (SCENE.ronron) SCENE.ronron(); if (r.chance) toast(`Rrrr… ${st.chat.nom} porte chance : le client mystère passera plus tôt.`); }

  // ─── en-tête, enseigne, cloche et badges des onglets ───
  const trophesGagnes = () => G.TROPHEES.filter((t) => (st.trophees || {})[t.id]).length;
  const primesAReclamer = () => { const j = G.objectifsDuJour(st, st.now), sm = st.semaine; return j.objectifs.filter((o) => o.fait && !o.reclame).length + (sm && sm.fait && !sm.reclame ? 1 : 0); };
  function badge(el, n, cls) { const b = el.querySelector('.badge'); if (!b) return; b.hidden = !n; b.textContent = n > 0 && cls !== 'point' ? n : ''; b.className = 'badge' + (cls ? ' ' + cls : ''); }
  function hud() {
    const taux = G.tauxParSeconde(st), gain = G.etoilesGagnables(st), marche = G.jourDeMarche(st.now), boost = st.boost && st.boost.fin > st.now ? st.boost.mult : 0;
    const bonus = G.AMELIORATIONS.filter((a) => !st.ameliorations[a.id] && st.coins >= G.prixBonus(st, a)).length + G.MOBILIER.filter((m) => G.mobilierCran(st, m.id) < m.max && st.coins >= G.prixMeuble(st, m.id)).length, primes = primesAReclamer(), pts = G.ptsTalents(st);
    if (st.vu && pageActive === 'journal' && tiroir.pos !== 'ferme') st.vu.trophees = trophesGagnes(); // un trophée gagné pendant qu'on lit le Journal est vu aussitôt
    const nouveaux = Math.max(0, trophesGagnes() - (st.vu ? st.vu.trophees : 0)), nom = G.nomBoutique(st), ev = st.ev ? st.ev.type : '';
    const key = `${G.fmtEur(st.coins)}|${G.fmtEur(taux)}|${st.etoiles}|${gain}|${marche}|${boost}|${bonus}|${primes}|${pts}|${nouveaux}|${nom}|${ev}`;
    if (key === lastHud) return; lastHud = key;
    $('#coins').textContent = G.fmtEur(st.coins);
    $('#taux').innerHTML = (taux > 0 ? `<b>+${G.fmtEur(taux)}</b> par seconde` : 'Touche la baguette !') + (marche || boost ? '<br>' : '') + (marche ? '<span class="marche">Marché ×1,5</span>' : '') + (boost ? `<span class="marche">Bonne critique ×${boost}</span>` : '');
    $('#etoiles-n').textContent = gain > 0 ? `${st.etoiles} · +${gain}` : st.etoiles;
    $('#b-etoiles').classList.toggle('pret', gain >= 3);
    $('#b-ameliorations').classList.toggle('pret', bonus > 0); badge($('#b-ameliorations'), bonus);
    $('#enseigne span').textContent = nom;
    $('#b-cloche').classList.toggle('actif', !!ev); $('#b-cloche .point').hidden = !ev;
    badge($('#onglets [data-page="defis"]'), primes);
    badge($('#onglets [data-page="boulanger"]'), pts, 'lavande');
    badge($('#onglets [data-page="journal"]'), nouveaux, 'beurre');
  }
  function toast(txt) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = txt; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2400); }
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
    if (id === 'journal' && st.vu) { st.vu.trophees = trophesGagnes(); }
    lastPage = ''; renderPage(true);
    if (tiroir.y > tiroir.Y.mi) tiroir.aller('mi');
    hud();
  }
  // le mode Aménager : les meubles entourés, nommés, avec leurs crans et le prix du cran suivant
  function amenager(on) { const v = on == null ? !SCENE.amenager : !!on; SCENE.setAmenager(v); $('#b-amenager').classList.toggle('actif', v); $('#b-amenager').setAttribute('aria-pressed', v); }
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
  const pageDefis = {
    key: () => { const j = G.objectifsDuJour(st, st.now), sm = st.semaine; return JSON.stringify([j.objectifs.map((o) => [o.fait, o.reclame]), j.pain, j.etoileDonnee, sm && [sm.fait, sm.reclame, sm.txt], st.ev && st.ev.type, G.serieEnCours(st)]); },
    html: () => {
      const j = G.objectifsDuJour(st, st.now), sm = st.semaine, serie = G.serieEnCours(st), faits = j.objectifs.filter((o) => o.fait).length, aReclamer = j.objectifs.some((o) => o.fait && !o.reclame), pain = G.PRODUITS[j.pain];
      return `${PAGE_HEAD('defis', 'Défis', serie > 0 ? `<span class="serie">${ICONS.UI.soleil}${serie} jour${serie > 1 ? 's' : ''}</span>` : '')}
      <div class="bloc">
        <div class="card ${aReclamer ? 'pret' : ''}"><div class="c-tete"><span class="pic peche">${ICONS.CIBLE}</span><h3>Objectifs du jour</h3><span class="compte ${aReclamer ? 'ok' : j.etoileDonnee ? 'or' : ''}">${aReclamer ? 'Prime !' : j.etoileDonnee ? 'Terminés ★' : `${faits}/3`}</span></div>
          ${j.objectifs.map((o, k) => `<div class="ligne ${o.fait ? 'fait' : ''}"><div class="t"><span>${esc(o.txt)}</span><span class="p" data-p="${k}"></span></div>
            ${o.reclame ? '<span class="ok">Récupéré ✓</span>' : `<button type="button" class="btn ${o.fait ? 'menthe' : 'non'}" data-k="${k}"><small>${o.fait ? 'Récupérer' : 'Prime'}</small><b>${G.fmtEur(o.prime)}</b></button>`}
            <div class="mini"><i data-b="${k}"></i></div></div>`).join('')}
          <p class="note">${j.etoileDonnee ? 'Bravo : une étoile de plus pour toujours. De nouveaux défis demain !' : 'Les trois réussis : <b>+1 étoile</b>, pour toujours.'}</p></div>
        <div class="card pain"><span class="icone">${ICONS.PRODUITS[pain.id]}</span><div><b>Pain du jour : ${esc(pain.nom)} ×${G.PAIN_DU_JOUR_MULT.toString().replace('.', ',')}</b><span>Toute la journée, chaque fournée de ${esc(pain.pl)} rapporte moitié plus. Demain, un autre produit.</span></div></div>
        ${sm ? `<div class="card ${sm.fait && !sm.reclame ? 'pret' : ''}"><div class="c-tete"><span class="pic lav">${ICONS.UI.etoile}</span><h3>Défi de la semaine</h3><span class="compte ${sm.reclame ? 'or' : sm.fait ? 'ok' : ''}">${sm.reclame ? 'Réussi ★' : sm.fait ? 'Prime !' : 'jusqu’à dimanche'}</span></div>
          <div class="ligne ${sm.fait ? 'fait' : ''}"><div class="t"><span>${esc(sm.txt)}</span><span class="p" data-p="s"></span></div>
            ${sm.reclame ? '<span class="ok">Récupéré ✓</span>' : `<button type="button" class="btn ${sm.fait ? 'beurre' : 'non'}" data-a="semaine"><small>${sm.fait ? 'Récupérer' : 'Récompense'}</small><b>+1 ★</b></button>`}
            <div class="mini beurre"><i data-b="s"></i></div></div></div>` : ''}
        <div class="card ev-liste"><div class="c-tete"><span class="pic rose">${ICONS.UI.cloche}</span><h3>Événements</h3><span class="compte" data-p="ev"></span></div>
          ${EV_LISTE.map(([type, ico, nom, desc]) => `<div class="ligne ${st.ev && st.ev.type === type ? 'en-cours' : ''}"><div class="t"><span class="ev-ico">${ico()}</span><span><b>${nom}</b><small>${desc}</small></span></div>${st.ev && st.ev.type === type ? '<span class="chrono-pill" data-p="chrono"></span>' : ''}</div>`).join('')}
          <p class="note">Ils arrivent tout seuls pendant que tu joues, toutes les quelques minutes. La cloche en haut te prévient.</p></div>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-k]', (b) => { const r = G.reclamer(st, +b.dataset.k); if (!r.ok) { son.non(); return; } son.deblocage(); buzz([10, 30, 10]); toast(r.etoile ? `+${G.fmtEur(r.prime)} et +1 ★ : objectifs du jour réussis !` : `+${G.fmtEur(r.prime)} de prime`); if (r.etoile) SCENE.fete(); renderCards(true); hud(); save(); renderPage(true); });
      onIn(sec, '[data-a="semaine"]', () => { const r = G.reclamerSemaine(st); if (!r.ok) { son.non(); return; } reussite(`Défi de la semaine : +${G.fmtEur(r.prime)} et +1 ★ !`); renderPage(true); });
    },
    maj: (sec) => {
      const j = G.objectifsDuJour(st, st.now), sm = st.semaine;
      j.objectifs.forEach((o, k) => { const p = sec.querySelector(`[data-p="${k}"]`), b = sec.querySelector(`[data-b="${k}"]`); if (p) p.textContent = o.fait ? '✓' : `${G.fmt(Math.floor(o.progres))} / ${G.fmt(o.cible)}`; if (b) b.style.width = pct(o.progres, o.cible); });
      if (sm) { const p = sec.querySelector('[data-p="s"]'), b = sec.querySelector('[data-b="s"]'); if (p) p.textContent = sm.fait ? '✓' : `${G.fmt(sm.progres)} / ${G.fmt(sm.cible)}`; if (b) b.style.width = pct(sm.progres, sm.cible); }
      const e = sec.querySelector('[data-p="ev"]'); if (e) e.textContent = st.ev ? 'en cours' : `prochain dans ~${Math.max(1, Math.ceil(st.evTimer / 60))} min`;
      const c = sec.querySelector('[data-p="chrono"]'); if (c && st.ev) c.textContent = G.fmtChrono(Math.max(0, (st.ev.fin - st.now) / 1000));
    },
  };
  // Boulanger : niveau, savoir-faire, talents permanents
  const pageBoulanger = {
    key: () => `${st.xp}|${G.ptsTalents(st)}|${JSON.stringify(st.talents)}`,
    html: () => {
      const np = G.niveauPour(st.xp), pts = G.ptsTalents(st), rang = G.rangTitre(st), suivant = G.TITRES.find((t) => t[0] > np.n);
      return `${PAGE_HEAD('boulanger', 'Boulanger', pts ? `<span class="serie lav">${pts} point${pts > 1 ? 's' : ''}</span>` : '')}
      <div class="bloc">
        <div class="card boulanger-tete">${ICONS.boulanger(rang)}<div><h3>${esc(G.titre(st))}</h3><p class="sous">Niveau ${np.n} · ${G.fmt(np.reste)} / ${G.fmt(np.prochain)} savoir-faire${suivant ? `<br>${esc(suivant[1])} au niveau ${suivant[0]}` : ''}</p><div class="mini xp"><i style="width:${pct(np.reste, np.prochain)}"></i></div></div></div>
        <div class="encadre doux">Le savoir-faire vient des défis du jour, des événements réussis, des recettes, des embauches et des nouvelles boutiques. Chaque niveau donne <b>un point de talent</b>. Les talents sont à toi pour toujours, même en changeant de boutique.</div>
        <h3 class="titre-section">Talents${pts ? ` · <span class="pts">${pts} point${pts > 1 ? 's' : ''} à dépenser</span>` : ''}</h3>
        <div class="liste-am">${G.TALENTS.map((t) => { const k = G.talent(st, t.id), max = k >= t.max; return `<div class="am talent ${k ? 'appris' : ''}"><div><h3>${esc(t.nom)} <span class="crans">${'●'.repeat(k)}${'○'.repeat(t.max - k)}</span></h3><p>${k ? esc(t.desc(k)) : 'Cran 1 : ' + esc(t.desc(1))}${k && !max ? `<br><em>Cran suivant : ${esc(t.desc(k + 1))}</em>` : ''}</p></div>${max ? '<span class="ok">Maîtrisé ✓</span>' : `<button type="button" class="btn ${pts ? 'lavande' : 'non'}" data-t="${t.id}"><small>Apprendre</small><b>1 point</b></button>`}</div>`; }).join('')}</div>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-t]', (b) => {
        const r = G.apprendre(st, b.dataset.t);
        if (!r.ok) { son.non(); toast(G.ptsTalents(st) ? 'Ce talent est déjà au maximum.' : 'Pas encore de point : gagne du savoir-faire.'); return; }
        son.deblocage(); buzz([10, 30, 10]); toast(`${r.talent.nom} : ${r.talent.desc(r.cran)}`); renderCards(true); hud(); save(); renderPage(true);
      });
    },
  };
  const QUAND_SAISON = { galette: 'en janvier', crepe: 'début février', paques: 'en avril', glace: 'cet été', citrouille: 'à la mi-octobre', buche: 'en décembre' };
  // Journal : records, collection des saisons, habitués, trophées, derniers événements, partage
  const ilYA = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : s < 86400 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };
  const pageJournal = {
    key: () => `${trophesGagnes()}|${(st.carnetEv || []).length}|${(st.carnetEv || []).length ? st.carnetEv[st.carnetEv.length - 1].t : 0}|${JSON.stringify(st.habitues)}|${st.stats.commandes}|${st.stats.critiques}|${st.stats.petrissages}|${st.stats.pannes}|${JSON.stringify(st.collection)}|${st.saison ? st.saison.id + st.saison.niv : ''}|${st.chat ? st.chat.nom + st.chat.caresses : ''}`,
    html: () => {
      const S = st.stats, tr = st.trophees || {}, gagnes = trophesGagnes();
      return `${PAGE_HEAD('journal', 'Journal', `<span class="serie or">${ICONS.UI.trophee}${gagnes}/${G.TROPHEES.length}</span>`)}
      <div class="bloc">
        <p class="sous">${esc(G.nomBoutique(st))} · ${G.fmt(S.ventes)} fournées, ${G.fmt(S.clients)} clients depuis le début.</p>
        <div class="card"><div class="c-tete"><span class="pic peche">${ICONS.UI.etoile}</span><h3>Records</h3></div>
          <div class="stat"><span>Plus grosse commande livrée</span><b>${S.meilleureCommande ? G.fmtEur(S.meilleureCommande) : '—'}</b></div>
          <div class="stat"><span>Meilleur pourboire</span><b>${S.meilleurPourboire ? G.fmtEur(S.meilleurPourboire) : '—'}</b></div>
          <div class="stat"><span>Pétrissage le plus rapide</span><b>${S.petrissageRecord ? S.petrissageRecord.toFixed(1).replace('.', ',') + ' s' : '—'}</b></div>
          <div class="stat"><span>Meilleure série d’objectifs</span><b>${S.serieMax || 0} jour${(S.serieMax || 0) > 1 ? 's' : ''}</b></div>
          <div class="stat"><span>Commandes · critiques · pétrissages · fours</span><b>${S.commandes || 0} · ${S.critiques || 0} · ${S.petrissages || 0} · ${S.pannes || 0}</b></div>${st.chat ? `
          <div class="stat"><span>Caresses à ${esc(st.chat.nom)}</span><b>${G.fmt(st.chat.caresses)}</b></div>` : ''}</div>
        <div class="card"><div class="c-tete"><span class="pic peche">${ICONS.SAISON.citrouille}</span><h3>Recettes de saison</h3></div>
          ${G.RECETTES_SAISON.map((r) => { const c = (st.collection || {})[r.id], enCours = st.saison && st.saison.id === r.id; return `<div class="ligne saison"><span class="ev-ico">${ICONS.SAISON[r.id]}</span><div class="t"><span><b>${esc(r.nom)}</b><small>${c && c.maitrisee ? `maîtrisée ✓ (${c.annee})` : c ? `${c.fournees}/${G.SAISON.maitrise} fournées${enCours ? ', en ce moment' : ''}` : enCours ? 'en ce moment : prépare-la !' : `revient ${QUAND_SAISON[r.id]}`}</small></span></div>${c && !c.maitrisee ? `<div class="mini beurre"><i style="width:${pct(c.fournees, G.SAISON.maitrise)}"></i></div>` : ''}</div>`; }).join('')}
          <p class="note">Chaque saison sa recette, cuite à la main : cent fournées pour la maîtriser.</p></div>
        <div class="card"><div class="c-tete"><span class="pic lav">${ICONS.UI.boulanger}</span><h3>Les habitués</h3></div>
          ${G.HABITUES.map((h) => { const e = (st.habitues || {})[h.id]; return `<div class="ligne habitue"><span class="pastille-hab" style="background:${h.haut}"></span><div class="t"><span><b>${esc(h.nom)}</b><small>Passe entre ${h.debut}h et ${Math.floor(h.fin)}h${h.fin % 1 ? '30' : ''} · ${e && e.jours ? `fidèle depuis ${e.jours} jour${e.jours > 1 ? 's' : ''}` : 'première visite à venir'}</small></span></div></div>`; }).join('')}
          <p class="note">Sers un habitué cinq jours de suite : il t’offre un cadeau.</p></div>
        <h3 class="titre-section">Trophées · ${gagnes}/${G.TROPHEES.length}</h3>
        <div class="trophees">${G.TROPHEES.map((t) => `<div class="troph ${tr[t.id] ? 'gagne' : ''}"><b>${esc(t.nom)}</b><span>${esc(t.desc)}</span></div>`).join('')}</div>
        <h3 class="titre-section">Derniers événements</h3>
        <div class="carnet">${(st.carnetEv || []).slice().reverse().map((e) => `<div><span>${esc(e.txt)}</span><small>${ilYA(e.t)}</small></div>`).join('') || '<p class="sous">Rien encore : joue un peu !</p>'}</div>
        <button type="button" class="btn large lavande" data-a="partager" style="margin-top:14px"><b>Partager ma boutique</b></button>
      </div>`;
    },
    bind: (sec) => { onIn(sec, '[data-a="partager"]', partager); },
  };
  // Réglages : son, vibrations, nom, spécialité, sauvegarde, partage, remise à zéro
  const pageReglages = {
    key: () => `${st.son}|${st.vibre}|${st.specialite}|${st.nomBoutique}|${st.boutiques}|${st.chat ? st.chat.nom : ''}`,
    html: () => {
      const q = G.QUARTIERS[G.quartier(st)];
      const ligne = (a, ico, titre, sous, droite) => `<button type="button" class="reglage" data-a="${a}"><i class="ico">${ico}</i><span><b>${titre}</b>${sous ? `<small>${sous}</small>` : ''}</span>${droite}</button>`;
      const sw = (on) => `<span class="interrupteur" role="switch" aria-checked="${on}"></span>`, chev = `<i class="ico chev">${ICONS.UI.chevron}</i>`;
      return `${PAGE_HEAD('reglages', 'Réglages')}
      <div class="bloc">
        <div class="card reglages">
          ${ligne('son', st.son ? ICONS.UI.son : ICONS.UI.sonOff, 'Sons', 'Petites notes à chaque vente et achat', sw(st.son))}
          ${ligne('vibre', ICONS.UI.vibre, 'Vibrations', 'Un léger retour sous le doigt', sw(st.vibre))}
        </div>
        <div class="card reglages">
          ${ligne('nom', ICONS.UI.crayon, 'Renommer la boutique', `${esc(G.nomBoutique(st))} · ${esc(q.nom)}`, chev)}
          ${st.specialite == null ? ligne('specialite', ICONS.UI.specialite, 'Choisir la spécialité', 'Un produit fétiche ×2 pour cette boutique', chev) : ligne('specialite-ok', ICONS.UI.specialite, 'Spécialité', `${esc(G.PRODUITS[st.specialite].nom)} ×2, pour cette boutique`, '')}
          ${st.chat ? ligne('chat', ICONS.CHAT, `Renommer ${esc(st.chat.nom)}`, 'Le chat de la boutique', chev) : ''}
          ${ligne('sauvegarde', ICONS.UI.sauvegarde, 'Sauvegarde et transfert', 'Copier un code, le charger sur un autre appareil', chev)}
          ${ligne('partager', ICONS.UI.partager, 'Partager ma boutique', 'Une image de la boutique et ton score', chev)}
        </div>
        <div class="card reglages">
          ${ligne('reset', ICONS.UI.recommencer, 'Recommencer de zéro', 'Efface tout, étoiles comprises', chev)}
        </div>
        <p class="note centre">Le Fournil · boutique n°${st.boutiques} · ${esc(q.nom)}<br>Ta boutique est enregistrée toutes les 5 secondes et à chaque achat.</p>
      </div>`;
    },
    bind: (sec) => {
      onIn(sec, '[data-a="son"]', () => { st.son = !st.son; save(); renderPage(true); if (st.son) son.tap(); });
      onIn(sec, '[data-a="vibre"]', () => { st.vibre = !st.vibre; save(); renderPage(true); buzz(8); });
      onIn(sec, '[data-a="nom"]', () => sheetNom(false));
      onIn(sec, '[data-a="chat"]', sheetNomChat);
      onIn(sec, '[data-a="specialite"]', sheetSpecialite);
      onIn(sec, '[data-a="sauvegarde"]', sheetSauvegarde);
      onIn(sec, '[data-a="partager"]', partager);
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

  // ─── événements : une bannière compacte posée sur la scène, qu'on déplie en la touchant ───
  const TXT_EV = { rush: 'Coup de feu : les clients affluent !', commande: 'Un client passe une commande spéciale !', critique: 'Le critique gastronomique entre dans la boutique !', meunier: 'Le meunier passe : tout à −40 % !', petrissage: 'Concours de pétrissage : touche vite !', panne: 'Un four tombe en panne !', anniversaire: 'Un goûter d’anniversaire dans la boutique !' };
  const FIN_EV = { rush: 'Le coup de feu est passé.', commande: 'Trop tard, le client reviendra une autre fois.', critique: 'Le critique est reparti sans conclure…', meunier: 'Le meunier est reparti.', petrissage: 'Trop tard, la pâte a trop levé.', panne: 'Le four s’est réparé tout seul.', anniversaire: 'Le goûter est terminé.' };
  const Maj = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function reussite(txt) { son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); toast(txt); renderCards(true); hud(); save(); }
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
    { txt: 'Ton salon de thé ! Touche un meuble dans la boutique (les tables, le four, la vitrine…) pour l’améliorer, ou le bouton Aménager en haut à droite pour les voir tous.', ou: 'scene', cible: () => zoneCible('tables'), pret: () => G.MOBILIER.some((m) => G.mobilierCran(st, m.id) < m.max && st.coins >= G.prixMeuble(st, m.id)), fini: () => (st.stats.meubles || 0) > 0 },
  ];
  // une cible d'indice posée sur une zone de la scène (le canvas n'a pas d'éléments)
  function zoneCible(id) {
    const z = SCENE.zones && SCENE.zones()[id]; if (!z) return $('#scene');
    const r = $('#scene').getBoundingClientRect();
    return { getBoundingClientRect: () => ({ left: r.left + z.x, top: r.top + z.y, right: r.left + z.x + z.w, bottom: r.top + z.y + z.h, width: z.w, height: z.h }) };
  }
  function indices() {
    const el = $('#indice');
    if (st.tuto >= INDICES.length || !$('#feuille').hidden) { el.hidden = true; return; }
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
  function openSheet(html) { fc.innerHTML = html; feuille.hidden = false; voile.hidden = false; feuille.scrollTop = 0; openedAt = performance.now(); }
  function closeSheet() { feuille.hidden = true; voile.hidden = true; fc.innerHTML = ''; }
  voile.addEventListener('pointerdown', (e) => { if (performance.now() - openedAt > 300) { e.preventDefault(); closeSheet(); } });
  const on = (sel, fn) => fc.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  const btnRetour = (a) => `<button type="button" class="btn large sombre" data-a="${a || 'close'}" style="margin-top:14px"><b>Retour</b></button>`;
  let ongletBonus = 'bonus';
  const crans = (k, max) => `<span class="crans">${'●'.repeat(k)}${'○'.repeat(max - k)}</span>`;
  function sheetAmeliorations(tab) {
    if (tab) ongletBonus = tab;
    const bonus = G.AMELIORATIONS.map((a) => {
      const fait = st.ameliorations[a.id], prix = G.prixBonus(st, a), ok = st.coins >= prix;
      return `<div class="am ${fait ? 'fait' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p></div>${fait ? '<span class="ok">Acheté ✓</span>' : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
    }).join('');
    const meubles = G.MOBILIER.map((m) => {
      const k = G.mobilierCran(st, m.id), max = k >= m.max, prix = G.prixMeuble(st, m.id), ok = !max && st.coins >= prix;
      return `<div class="am meuble ${max ? 'fait' : ''}">${ICONS.MEUBLES[m.id]}<div><h3>${esc(m.nom)} ${crans(k, m.max)}</h3><p>${k ? esc(m.desc(k)) : 'Pas encore installé'}${max ? '' : `<br><em>Cran suivant : ${esc(m.desc(k + 1))}</em>`}</p></div>${max ? '<span class="ok">Au max ✓</span>' : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-m="${m.id}"><small>Améliorer</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
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
    son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); toast(`${r.m.nom} : ${r.m.desc(r.cran)}`); renderCards(true); hud(); save(); if (apres) apres();
  }
  // la fiche d'un meuble, ouverte en le touchant dans la boutique
  function sheetMeuble(id) {
    const m = G.MOBILIER.find((x) => x.id === id); if (!m) return;
    const k = G.mobilierCran(st, id), max = k >= m.max, prix = G.prixMeuble(st, id), ok = !max && st.coins >= prix;
    openSheet(`<div class="meuble-fiche">${ICONS.MEUBLES[id]}<div><h2>${esc(m.nom)}</h2><p class="sous">${crans(k, m.max)} cran ${k} sur ${m.max}</p></div></div>
      <div class="encadre espace">${k ? `<b>Maintenant :</b> ${esc(m.desc(k))}` : 'Pas encore installé.'}${max ? '' : `<br><b>Cran suivant :</b> ${esc(m.desc(k + 1))}`}</div>
      ${max ? '<p class="sous">Ce meuble est au maximum ✓</p>' : `<button type="button" class="btn large ${ok ? 'lavande' : 'non'}" data-m="${id}"><small>Améliorer</small><b>${G.fmtEur(prix)}</b></button>`}
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
      on('[data-a="oui"]', () => { const r = G.nouvelleBoutique(st, Date.now()); if (r.ok) { son.deblocage(); buzz([20, 40, 20]); SCENE.fete(); toast(`Boutique n°${st.boutiques} ouverte : +${r.gain} ★`); st.tuto = Math.max(st.tuto, INDICES.length); amenager(false); renderCards(true); hud(); save(); showPage('boutique'); sheetNom(true); } });
    });
  }
  function sheetRetour(abs) {
    const detail = abs.detail.slice().sort((a, b) => b.m - a.m).map((d) => `<li><span>${esc(d.nom || G.PRODUITS[d.i].nom)} × ${G.fmt(d.n)}</span><b>${G.fmtEur(d.m)}</b></li>`).join('');
    const grades = (abs.grades || []).map((g) => `${G.APPRENTIS[g.i].prenom} passe au grade ${g.niv}`).join(' · ');
    openSheet(`<h2>Pendant ton absence</h2><p class="sous">${G.fmtDuree(abs.secs)}${abs.secs >= G.heuresAbsence(st) * 3600 ? ` (les apprentis s’arrêtent après ${G.heuresAbsence(st)} h)` : ''}</p>
      <div class="grand-nombre">+${G.fmtEur(abs.total)}</div><p class="sous">vendus par tes apprentis</p><ul class="detail">${detail}</ul>${grades ? `<p class="sous">${esc(grades)} !</p>` : ''}
      <button type="button" class="btn large menthe" data-a="close"><b>Super !</b></button>`);
    on('[data-a="close"]', closeSheet);
  }

  // ─── boucle ───
  function frame(now) {
    const dt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    const out = G.tick(st, dt, Date.now());
    if (out.ventes.length) {
      const gros = out.ventes.reduce((a, v) => a + v.montant, 0), first = out.ventes[0];
      if (G.PRODUITS[first.i].temps >= 3 || Math.random() < 0.15) { SCENE.vente(first.i, gros, '+' + G.fmtEur(gros), !st.stations[first.i].staff); son.vente(gros); }
      if (!st.stations[first.i].staff && pageActive === 'boutique' && tiroir.pos !== 'ferme') { const r = cards[first.i].el.querySelector('.barre').getBoundingClientRect(); if (r.top > $('#tiroir').getBoundingClientRect().top + 20 && r.bottom < $('#onglets').getBoundingClientRect().top) flottant(r.left + r.width / 2 - 30, r.top - 10, '+' + G.fmtEur(first.montant)); }
    }
    if (out.nouvelEv) { son.evenement(); buzz([15, 40, 15]); toast(TXT_EV[out.nouvelEv.type]); }
    if (out.finEv) { toast(FIN_EV[out.finEv.type]); if (out.finEv.type === 'critique' || out.finEv.type === 'petrissage') son.non(); }
    if (out.mystere && $('#feuille').hidden) { if (SCENE.mystere()) toast('Un client mystère ! Touche-le vite.'); }
    if (out.habitue) { SCENE.habitue(out.habitue); son.achat(); toast(`${out.habitue.nom} : « ${out.habitue.phrase} »`); }
    if (out.grades && out.grades.length) annoncerGrade(out.grades[0]);
    if (out.chat && $('#feuille').hidden) sheetChat();
    if (out.saison) { son.evenement(); toast(`Nouvelle recette de saison : ${out.saison.nom.toLowerCase()}, jusqu’au ${out.saison.fin[1]} ${MOIS[out.saison.fin[0] - 1]} !`); renderCards(true); }
    if (out.venteSaison) { SCENE.vente(0, out.venteSaison.montant, '+' + G.fmtEur(out.venteSaison.montant), true); son.vente(out.venteSaison.montant); }
    if (out.maitrise) reussite(`${out.maitrise.nom} : recette maîtrisée !`);
    if (out.trophees && out.trophees.length) { const t0 = out.trophees[0]; son.deblocage(); buzz([10, 30, 10, 30, 10]); SCENE.fete(); toast(`Trophée : ${t0.nom} !${out.trophees.length > 1 ? ` (+${out.trophees.length - 1})` : ''}`); }
    const nv = G.niveau(st);
    if (nv > lastNiveau) { lastNiveau = nv; son.deblocage(); buzz([15, 40, 15, 40, 15]); SCENE.fete(); toast(`Niveau ${nv} : ${G.titre(st)} ! Un point de talent à apprendre.`); }
    renderCards(); hud(); renderObjectifs(); renderEvenement(); renderPage();
    SCENE.frame(dt, st, Date.now());
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

  // ─── démarrage ───
  async function boot() {
    st = await load();
    const fresh = !st;
    if (fresh) st = G.newState(Date.now());
    st.now = Date.now();
    if (!st.vu) st.vu = { trophees: trophesGagnes() };
    document.querySelectorAll('[data-ico]').forEach((el) => { el.innerHTML = ICONS.UI[el.dataset.ico] || ''; });
    if (!SCENE.init($('#scene'), $('#scene-ui'))) $('#sans-3d').hidden = false; // sans WebGL : la boutique vit quand même, sans image
    SCENE.surServi = (r) => { if (r.cadeau) { reussite(`${r.hb.nom}, fidèle depuis ${r.jours} jours, t’offre ${G.fmtEur(r.cadeau)} !`); } else if (r.jours > 1) toast(`${r.hb.nom} : ${r.jours}e jour de suite !`); };
    tiroir.init();
    layout();
    tiroir.aller(['ouvert', 'mi', 'ferme'].includes(st.tiroir) ? st.tiroir : 'mi', false);
    if (window.ResizeObserver) new ResizeObserver(layout).observe($('#corps'));
    $('#b-amenager').addEventListener('click', () => { audio(); son.tap(); amenager(); });
    buildCards();
    document.querySelectorAll('.modes button').forEach((b) => { b.classList.toggle('actif', String(st.mode) === b.dataset.mode); b.addEventListener('click', () => { st.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCards(true); save(); }); });
    $('#cartes').addEventListener('click', onCardClick);
    $('#b-ameliorations').addEventListener('click', () => { audio(); sheetAmeliorations(); });
    $('#b-etoiles').addEventListener('click', () => { audio(); sheetEtoiles(); });
    $('#objectifs').addEventListener('click', () => { audio(); showPage('defis'); });
    $('#enseigne').addEventListener('click', () => { audio(); sheetNom(false); });
    $('#b-cloche').addEventListener('click', () => { audio(); if (st.ev) { if (tiroir.pos === 'ouvert') tiroir.aller('mi'); if (!evEtendu) basculerEvenement(); } else showPage('defis'); });
    $('#evenement').addEventListener('click', (e) => { if (e.target.closest('button')) return; audio(); basculerEvenement(); });
    document.querySelectorAll('#onglets button').forEach((b) => b.addEventListener('click', () => { audio(); if (b.dataset.page !== pageActive) { son.tap(); showPage(b.dataset.page); } else if (tiroir.pos === 'ferme') tiroir.aller('mi'); else $('#pages').scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }));
    $('#scene').addEventListener('pointerdown', (e) => {
      audio();
      const r = $('#scene').getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (SCENE.hit(sx, sy)) { const tip = G.encaisserPourboire(st); son.pourboire(); buzz([10, 20, 10, 20, 10]); SCENE.texte(`+${G.fmtEur(tip)} de pourboire !`); toast(`Le client mystère laisse ${G.fmtEur(tip)} de pourboire !`); renderCards(true); hud(); save(); }
      else if (SCENE.hitChat && SCENE.hitChat(sx, sy)) caresserChat(); // le chat dort dans la zone du boulanger : il passe avant
      else if (SCENE.hitBoulanger(sx, sy)) showPage('boulanger');
      else { const id = SCENE.hitMeuble ? SCENE.hitMeuble(sx, sy) : null; if (id) sheetMeuble(id); else SCENE.tap(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else { const abs = G.absence(st, Date.now()); if (abs.total > 0 && abs.secs > 90) { sheetRetour(abs); renderCards(true); } lastFrame = performance.now(); } });
    document.addEventListener('pointerdown', () => { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* rien */ } }, { once: true });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    document.addEventListener('freeze', save);
    window.addEventListener('blur', save);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    if (!fresh) { const abs = G.absence(st, Date.now()); if (abs.total > 0 && abs.secs > 90) sheetRetour(abs); }
    lastNiveau = G.niveau(st);
    renderCards(true); hud(); renderObjectifs(); renderEvenement();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    window.__fournil = { get st() { return st; }, G, SCENE, save, reset: () => { fige = true; return effacer().then(() => location.reload()); }, absence: (ms) => { st.lastSeen = Date.now() - ms; const abs = G.absence(st, Date.now()); sheetRetour(abs); renderCards(true); return abs; }, give: (n) => { G.gagner(st, n, true); renderCards(true); hud(); }, rush: () => G.lancerRush(st), commande: () => G.lancerCommande(st, Math.random), ev: (type) => G.lancerEvenement(st, Math.random, type), mystere: () => SCENE.mystere(), xp: (n) => G.gagnerXp(st, n), meuble: (id) => { const r = G.ameliorerMeuble(st, id); renderCards(true); hud(); save(); return r; }, fiche: sheetMeuble, tiroir: (p) => (p ? tiroir.aller(p, false) : tiroir.pos), tiroirY: () => tiroir.y, amenager: (on) => { amenager(on); return SCENE.amenager; }, page: showPage, boulanger: () => showPage('boulanger'), nommer: (n) => G.renommer(st, n), scene: (o) => SCENE.forcer(o), journal: () => showPage('journal'), habitue: (id) => SCENE.habitue(G.HABITUES.find((h) => h.id === id)), partager,
      apprentiXp: (i, sec) => { const g = G.creditApprenti(st, i, sec / G.PRODUITS[i].temps); if (g) annoncerGrade(g); renderCards(true); return G.gradeApprenti(st, i); },
      chat: () => sheetChat(), caresser: caresserChat, saison: (id) => { G.forcerRecette(id); G.objectifsDuJour(st, Date.now()); renderCards(true); return st.saison; }, stats: () => SCENE.stats, qualite: (q) => SCENE.qualite(q) };
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  return { get st() { return st; } };
})();
