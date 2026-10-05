/* LE FOURNIL — interface : cartes des produits, objectifs du jour, événements, indices du tutoriel, feuilles, sons, sauvegarde, boucle. */
const UI = (() => {
  'use strict';
  const G = GAME, $ = (s) => document.querySelector(s), KEY = 'fournil.v2';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let st, lastFrame = 0, lastSave = 0, cards = [], lastHud = '', lastObj = '', lastEv = '', hintStep = -1, hintUntil = 0, toastTimer = 0, lastNiveau = 0, vuBoulanger = false;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  };
  function buzz(p) { if (!st.vibre) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* pas de vibreur */ } }

  // ─── cartes des produits ───
  function buildCards() {
    const box = $('#cartes'); box.innerHTML = ''; cards = [];
    G.PRODUITS.forEach((p, i) => { const el = document.createElement('article'); el.className = 'carte'; el.dataset.i = i; box.appendChild(el); cards.push({ el, html: '' }); });
    renderCards(true);
  }
  function renderCards(force) {
    const remise = G.remise(st), critique = st.ev && st.ev.type === 'critique' ? st.ev.restants : [];
    G.PRODUITS.forEach((p, i) => {
      const s = st.stations[i], c = cards[i];
      let html, cls;
      if (s.niv === 0) {
        const prev = i === 0 || st.stations[i - 1].niv > 0, ok = st.coins >= p.cout * remise;
        cls = 'carte verrou' + (prev ? '' : ' secret');
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${esc(p.desc)} Rapporte ${G.fmtEur(p.rev)} la fournée.</p>
          <button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>${remise < 1 ? `Débloquer −${Math.round((1 - remise) * 100)} %` : 'Débloquer'}</small><b>${G.fmtEur(p.cout * remise)}</b></button></div>`;
      } else {
        const n = G.quantite(st, i), prix = G.prixNiveaux(st, i, n), ok = st.coins >= prix, pal = G.prochainPalier(s.niv);
        const rapide = p.temps <= 1.5 && s.staff;
        cls = 'carte' + (s.staff ? ' auto' : ' manuel') + (s.actif ? ' actif' : '') + (critique.includes(i) ? ' gouter' : '');
        html = `${critique.includes(i) ? '<span class="badge-critique">Sers le critique !</span>' : ''}<div class="icone">${ICONS.PRODUITS[p.id]}</div>
          <div class="corps"><h3>${esc(p.nom)}${st.jour && st.jour.pain === i ? ' <span class="tag">Pain du jour ×1,5</span>' : ''}${st.specialite === i ? ' <span class="tag spe">Spécialité ×2</span>' : ''} <span class="niv">Niv. ${s.niv}${pal ? ` <i>· palier ${pal}</i>` : ''}</span></h3>
            <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${G.fmtEur(G.revenuFournee(st, i))}</span>${s.staff || s.actif ? `<span class="tps">${G.fmtDuree(G.temps(st, i))}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
          <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'} ${remise < 1 ? 'promo' : ''}" data-a="ameliorer"><small>${remise < 1 ? `−${Math.round((1 - remise) * 100)} % ×${n}` : `Améliorer ×${n}`}</small><b>${G.fmtEur(prix)}</b></button>
            ${s.staff ? `<div class="staff-ok">${ICONS.apprenti(i)}<span>${esc(p.staffNom.split(' ').pop())}<br>s’en occupe</span></div>` : `<button type="button" class="btn beurre ${st.coins >= G.prixStaff(st, i) ? '' : 'non'}" data-a="embaucher"><small>Embaucher</small><b>${G.fmtEur(G.prixStaff(st, i))}</b></button>`}</div>`;
      }
      if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); }
      else if (c.el.className !== cls) c.el.className = cls;
      if (c.bar && !c.bar.classList.contains('rapide')) c.bar.style.width = (s.niv > 0 && s.actif ? Math.min(100, s.prog / G.temps(st, i) * 100) : 0).toFixed(1) + '%';
    });
  }
  function onCardClick(e) {
    const art = e.target.closest('.carte'); if (!art) return;
    const i = +art.dataset.i, btn = e.target.closest('button[data-a]');
    audio();
    if (btn) {
      const a = btn.dataset.a;
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

  // ─── en-tête ───
  function hud() {
    const taux = G.tauxParSeconde(st), gain = G.etoilesGagnables(st), marche = G.jourDeMarche(st.now), boost = st.boost && st.boost.fin > st.now ? st.boost.mult : 0;
    const key = `${G.fmtEur(st.coins)}|${G.fmtEur(taux)}|${st.etoiles}|${gain}|${marche}|${boost}`;
    if (key === lastHud) return; lastHud = key;
    $('#coins').textContent = G.fmtEur(st.coins);
    $('#taux').innerHTML = (taux > 0 ? `<b>+${G.fmtEur(taux)}</b> par seconde` : 'Touche la baguette !') + (marche || boost ? '<br>' : '') + (marche ? '<span class="marche">Marché ×1,5</span>' : '') + (boost ? `<span class="marche">Bonne critique ×${boost}</span>` : '');
    $('#etoiles-n').textContent = gain > 0 ? `${st.etoiles} · +${gain}` : st.etoiles;
    $('#b-etoiles').classList.toggle('pret', gain >= 3);
    $('#b-ameliorations').classList.toggle('pret', G.AMELIORATIONS.some((a) => !st.ameliorations[a.id] && st.coins >= G.prixBonus(st, a)));
  }
  function toast(txt) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = txt; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2400); }
  function flottant(x, y, txt) { const el = document.createElement('div'); el.className = 'flottant'; el.textContent = txt; el.style.left = x + 'px'; el.style.top = y + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 900); }

  // ─── objectifs du jour : carte compacte, feuille détaillée ───
  function renderObjectifs() {
    const j = G.objectifsDuJour(st, st.now), sm = st.semaine, faits = j.objectifs.filter((o) => o.fait).length, aReclamer = j.objectifs.some((o) => o.fait && !o.reclame) || (sm && sm.fait && !sm.reclame);
    const key = JSON.stringify(j.objectifs.map((o) => [o.progres, o.fait, o.reclame])) + faits + '|' + j.pain + '|' + (sm ? sm.progres + ':' + sm.fait + ':' + sm.reclame : '');
    if (key === lastObj) return; lastObj = key;
    const el = $('#objectifs');
    el.className = 'obj' + (aReclamer ? ' pret' : '') + (j.etoileDonnee ? ' complet' : '');
    el.innerHTML = `<div class="obj-tete"><span class="obj-titre">${ICONS.CIBLE}Objectifs du jour</span><span class="obj-compte">${aReclamer ? 'Prime à récupérer !' : j.etoileDonnee ? 'Terminés ★' : `${faits}/3`}</span></div>
      <div class="obj-extra">Pain du jour : <b>${esc(G.PRODUITS[j.pain].pl)}</b> ×1,5${sm ? ` · Défi de la semaine : <b>${sm.reclame ? 'réussi ★' : `${G.fmt(sm.progres)}/${G.fmt(sm.cible)}`}</b>` : ''}</div>
      <div class="obj-lignes">${j.objectifs.map((o) => `<div class="obj-ligne ${o.fait ? 'fait' : ''}"><span>${esc(o.txt)}</span><em>${o.fait ? '✓' : `${G.fmt(Math.floor(o.progres))}/${G.fmt(o.cible)}`}</em><i style="width:${Math.min(100, o.progres / o.cible * 100).toFixed(0)}%"></i></div>`).join('')}</div>`;
  }
  function sheetObjectifs() {
    const j = G.objectifsDuJour(st, st.now), serie = G.serieEnCours(st), sm = st.semaine;
    openSheet(`<h2>Objectifs du jour</h2><p class="sous">Trois défis par jour, calibrés sur ta boutique. Les trois réussis : <b>+1 étoile</b>.${serie > 0 ? ` Série : <b>${serie} jour${serie > 1 ? 's' : ''}</b>.` : ''}</p>
      <div class="liste-am">${j.objectifs.map((o, k) => `<div class="am ${o.reclame ? 'fait' : ''}"><div><h3>${esc(o.txt)}</h3><p>${o.fait ? 'Réussi !' : `${G.fmt(Math.floor(o.progres))} / ${G.fmt(o.cible)}`}</p><div class="mini"><i style="width:${Math.min(100, o.progres / o.cible * 100).toFixed(0)}%"></i></div></div>
        ${o.reclame ? '<span class="ok">Récupéré ✓</span>' : `<button type="button" class="btn ${o.fait ? 'menthe' : 'non'}" data-k="${k}"><small>${o.fait ? 'Récupérer' : 'Prime'}</small><b>${G.fmtEur(o.prime)}</b></button>`}</div>`).join('')}</div>
      ${j.etoileDonnee ? '<div class="encadre doux">Bravo, les trois objectifs sont réussis : une étoile de plus pour toujours. De nouveaux défis demain !</div>' : ''}
      <h3 class="titre-section">Pain du jour</h3>
      <div class="am pain">${ICONS.PRODUITS[G.PRODUITS[j.pain].id]}<div><h3>${esc(G.PRODUITS[j.pain].nom)} ×1,5</h3><p>Toute la journée, chaque fournée de ${esc(G.PRODUITS[j.pain].pl)} rapporte moitié plus. Demain, un autre produit.</p></div></div>
      ${sm ? `<h3 class="titre-section">Défi de la semaine</h3>
      <div class="am ${sm.reclame ? 'fait' : ''}"><div><h3>${esc(sm.txt)}</h3><p>${sm.reclame ? 'Réussi ! Un nouveau défi lundi.' : sm.fait ? 'Réussi !' : `${G.fmt(sm.progres)} / ${G.fmt(sm.cible)} · jusqu’à dimanche`}</p><div class="mini"><i style="width:${Math.min(100, sm.progres / sm.cible * 100).toFixed(0)}%"></i></div></div>
        ${sm.reclame ? '<span class="ok">Récupéré ✓</span>' : `<button type="button" class="btn ${sm.fait ? 'beurre' : 'non'}" data-a="semaine"><small>${sm.fait ? 'Récupérer' : 'Récompense'}</small><b>+1 ★</b></button>`}</div>` : ''}
      <button type="button" class="btn large" data-a="close" style="margin-top:14px;background:var(--texte);box-shadow:0 4px 0 #2b1d16"><b>Retour</b></button>`);
    on('[data-a="close"]', closeSheet);
    on('[data-a="semaine"]', () => { const r = G.reclamerSemaine(st); if (!r.ok) { son.non(); return; } reussite(`Défi de la semaine : +${G.fmtEur(r.prime)} et +1 ★ !`); sheetObjectifs(); });
    on('[data-k]', (b) => { const r = G.reclamer(st, +b.dataset.k); if (!r.ok) { son.non(); return; } son.deblocage(); buzz([10, 30, 10]); toast(r.etoile ? `+${G.fmtEur(r.prime)} et +1 ★ : objectifs du jour réussis !` : `+${G.fmtEur(r.prime)} de prime`); if (r.etoile) SCENE.fete(); renderCards(true); hud(); save(); sheetObjectifs(); });
  }

  // ─── événements : sept cartes, une interaction différente chacune ───
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
      lastEv = key; box.hidden = false; SCENE.setRush(ev.type === 'rush');
      const chrono = '<b class="ev-chrono"></b>', barre = '<i class="ev-barre"></i>';
      const html = {
        rush: () => `<div class="ev rush">${ICONS.FEU}<div class="ev-txt"><b>Coup de feu !</b><span>Toutes les ventes ×${G.RUSH.mult}</span></div>${chrono}${barre}</div>`,
        commande: () => `<div class="ev commande ${prete ? 'prete' : ''}">${ICONS.PRODUITS[p.id]}<div class="ev-txt"><b>Commande spéciale</b><span>${G.fmt(ev.n)} ${esc(ev.n > 1 ? p.pl : p.nom.toLowerCase())} · prime <b>${G.fmtEur(ev.prime)}</b></span><span class="ev-prog"></span></div>${prete ? '<button type="button" class="btn menthe" data-a="livrer"><small>C’est prêt</small><b>Livrer !</b></button>' : chrono}${barre}</div>`,
        critique: () => `<div class="ev critique">${ICONS.CRITIQUE}<div class="ev-txt"><b>Le critique est là !</b><span>Sers-lui trois recettes : tout ×${G.CRITIQUE.mult} pendant ${G.CRITIQUE.boost / 60} min</span><span class="ev-prog"></span></div>${chrono}${barre}</div>`,
        meunier: () => `<div class="ev meunier">${ICONS.SAC}<div class="ev-txt"><b>Le meunier passe</b><span>Niveaux et recettes à −${Math.round(G.MEUNIER.remise * 100)} % : c’est le moment d’acheter !</span></div>${chrono}${barre}</div>`,
        petrissage: () => `<div class="ev petrissage">${ICONS.PATE}<div class="ev-txt"><b>Concours de pétrissage</b><span>${ev.n} touches en ${G.PETRISSAGE.duree} s · prime <b>${G.fmtEur(ev.prime)}</b></span></div><button type="button" class="btn tapote" data-a="petrir"><small>Pétris !</small><b class="ev-compte">0/${ev.n}</b></button>${barre}</div>`,
        panne: () => `<div class="ev panne">${ICONS.PANNE}<div class="ev-txt"><b>Panne de four !</b><span>${esc(Maj(p.pl))} à l’arrêt · répare pour <b>${G.fmtEur(ev.prime)}</b></span></div><button type="button" class="btn tapote" data-a="reparer"><small>Répare !</small><b class="ev-compte">0/${ev.n}</b></button>${barre}</div>`,
        anniversaire: () => `<div class="ev anniversaire">${ICONS.BALLON}<div class="ev-txt"><b>Goûter d’anniversaire</b><span>${esc(Maj(p.pl))} ×${ev.mult}${st.stations[ev.i].staff ? '' : ' · touche pour cuire !'}</span></div>${chrono}${barre}</div>`,
      };
      box.innerHTML = html[ev.type]();
      const livrer = box.querySelector('[data-a="livrer"]');
      if (livrer) livrer.addEventListener('click', () => { audio(); const r = G.livrer(st); if (r.ok) reussite(`Commande livrée : +${G.fmtEur(r.prime)}`); });
      const petrir = box.querySelector('[data-a="petrir"]');
      if (petrir) petrir.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); const r = G.petrir(st); if (!r.ok) return; son.tap(); buzz(8); if (r.fini) reussite(`Pétrissage gagné : +${G.fmtEur(r.prime)}`); else petrir.querySelector('.ev-compte').textContent = `${r.taps}/${ev.n}`; });
      const reparer = box.querySelector('[data-a="reparer"]');
      if (reparer) reparer.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); const r = G.reparer(st); if (!r.ok) return; son.tap(); buzz(8); if (r.fini) reussite(`Four réparé : +${G.fmtEur(r.prime)}`); else reparer.querySelector('.ev-compte').textContent = `${r.coups}/${ev.n}`; });
    }
    const prog = box.querySelector('.ev-prog');
    if (prog && ev.type === 'commande') prog.textContent = prete ? 'Le client attend sa commande.' : `${G.fmt(ev.fait)} / ${G.fmt(ev.n)} fournées${st.stations[ev.i].staff ? '' : ' · touche pour cuire !'}`;
    if (prog && ev.type === 'critique') prog.textContent = 'Touche les cartes : ' + ev.restants.map((i) => G.PRODUITS[i].nom.toLowerCase()).join(', ');
    const ch = box.querySelector('.ev-chrono'); if (ch) ch.textContent = G.fmtChrono(reste);
    box.querySelector('.ev-barre').style.width = (prete ? 100 : pct) + '%';
  }


  // ─── indices : une seule consigne à la fois, qui pointe l'élément concerné ───
  const INDICES = [
    { txt: 'Touche la baguette pour la cuire et la vendre !', cible: () => cards[0].el.querySelector('.barre'), fini: () => st.stats.ventes >= 1 },
    { txt: 'Avec tes euros, améliore la baguette : chaque niveau rapporte plus.', cible: () => cards[0].el.querySelector('[data-a="ameliorer"]'), pret: () => st.coins >= G.coutNiveau(0, st.stations[0].niv), fini: () => st.stations[0].niv >= 2 },
    { txt: 'Débloque les croissants : 20 € la fournée !', cible: () => cards[1].el.querySelector('[data-a="debloquer"]'), pret: () => st.coins >= G.PRODUITS[1].cout, fini: () => st.stations[1].niv >= 1 },
    { txt: 'Embauche Léo : il cuit les baguettes tout seul, même quand tu n’es pas là.', cible: () => cards[0].el.querySelector('[data-a="embaucher"]'), pret: () => st.coins >= G.PRODUITS[0].staff, fini: () => st.stations[0].staff },
    { txt: 'Bravo ! Au niveau 25, 50, 100… les gains doublent. Et regarde tes objectifs du jour : trois défis, une étoile à la clé.', cible: () => $('#objectifs'), pret: () => true, fini: () => performance.now() > hintUntil },
    { txt: 'Le boulanger a un point de talent ! Touche-le dans la boutique pour l’apprendre.', cible: () => $('#scene'), pret: () => G.ptsTalents(st) > 0, fini: () => vuBoulanger },
  ];
  function indices() {
    const el = $('#indice');
    if (st.tuto >= INDICES.length || !$('#feuille').hidden) { el.hidden = true; return; }
    const h = INDICES[st.tuto];
    if (h.fini()) { st.tuto++; hintUntil = performance.now() + 8000; save(); el.hidden = true; return; }
    if (h.pret && !h.pret()) { el.hidden = true; return; }
    if (st.tuto !== hintStep) { hintStep = st.tuto; $('#indice-txt').textContent = h.txt; if (st.tuto === 4) hintUntil = performance.now() + 8000; }
    const cible = h.cible();
    el.hidden = false;
    if (!cible) { el.classList.remove('haut'); el.style.left = '50%'; el.style.transform = 'translateX(-50%)'; el.style.top = (window.innerHeight * 0.42) + 'px'; el.querySelector('.main').hidden = true; return; }
    el.querySelector('.main').hidden = false;
    const r = cible.getBoundingClientRect(), bw = Math.min(window.innerWidth * 0.78, 320);
    let x = r.left + r.width / 2 - bw / 2; x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
    el.style.left = x + 'px'; el.style.transform = 'none';
    const hauteur = el.offsetHeight || 90;
    if (r.bottom + hauteur + 6 < window.innerHeight - 20) { el.classList.add('haut'); el.style.top = (r.bottom + 6) + 'px'; }
    else { el.classList.remove('haut'); el.style.top = (r.top - hauteur - 6) + 'px'; }
    if (r.bottom < 0 || r.top > window.innerHeight) el.hidden = true;
  }

  // ─── feuilles ───
  const feuille = $('#feuille'), fc = $('#feuille-contenu'), voile = $('#voile');
  let openedAt = 0;
  function openSheet(html) { fc.innerHTML = html; feuille.hidden = false; voile.hidden = false; feuille.scrollTop = 0; openedAt = performance.now(); }
  function closeSheet() { feuille.hidden = true; voile.hidden = true; fc.innerHTML = ''; }
  voile.addEventListener('pointerdown', (e) => { if (performance.now() - openedAt > 300) { e.preventDefault(); closeSheet(); } });
  const on = (sel, fn) => fc.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  function sheetAmeliorations() {
    const items = G.AMELIORATIONS.map((a) => {
      const fait = st.ameliorations[a.id], prix = G.prixBonus(st, a), ok = st.coins >= prix;
      return `<div class="am ${fait ? 'fait' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p></div>${fait ? '<span class="ok">Acheté ✓</span>' : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
    }).join('');
    openSheet(`<h2>Bonus</h2><p class="sous">Des recettes et des équipements qui multiplient tes gains, pour toujours (jusqu’à la prochaine boutique).</p><div class="liste-am">${items}</div>`);
    on('[data-id]', (b) => { const r = G.amelioration(st, b.dataset.id); if (!r.ok) { son.non(); toast(`Il manque ${G.fmtEur(r.prix - st.coins)}`); return; } son.deblocage(); buzz([10, 30, 10]); toast(`${r.a.nom} : ${r.a.desc}`); renderCards(true); hud(); save(); sheetAmeliorations(); });
  }
  function sheetSauvegarde() {
    save();
    openSheet(`<h2>Sauvegarde</h2><p class="sous">Ta boutique est enregistrée ici toutes les 5 secondes et à chaque achat. Attention : Safari et l’app installée ont chacun leur sauvegarde, et supprimer l’app efface la sienne. Pour la mettre à l’abri ou la transférer, copie ce code et garde-le quelque part.</p>
      <h3 style="margin:14px 0 6px;font:700 16px/1 var(--titre)">Ton code</h3>
      <textarea class="code" readonly data-r="code" aria-label="Code de sauvegarde">${esc(codeSauvegarde())}</textarea>
      <button type="button" class="btn large menthe" data-a="copier"><b>Copier le code</b></button>
      <h3 style="margin:18px 0 6px;font:700 16px/1 var(--titre)">Charger un code</h3>
      <textarea class="code" data-r="entree" placeholder="Colle un code ici" aria-label="Code à charger"></textarea>
      <button type="button" class="btn large lavande" data-a="charger"><b>Charger ce code</b></button>
      <button type="button" class="btn large" data-a="retour" style="margin-top:8px;background:var(--texte);box-shadow:0 4px 0 #2b1d16"><b>Retour</b></button>`);
    on('[data-a="retour"]', sheetEtoiles);
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
      on('[data-a="etoiles"]', () => { st.etoiles = Math.max(st.etoiles, s2.etoiles); if ((s2.xp || 0) > (st.xp || 0)) { st.xp = s2.xp; st.talents = s2.talents || {}; } lastNiveau = G.niveau(st); son.deblocage(); buzz([10, 30, 10]); SCENE.fete(); toast(`${st.etoiles} étoiles : +${Math.round(st.etoiles * G.ETOILE_BONUS * 100)} % de gains`); renderCards(true); hud(); save(); sheetEtoiles(); });
    });
  }
  function sheetBoulanger() {
    vuBoulanger = true;
    const np = G.niveauPour(st.xp), pts = G.ptsTalents(st), rang = G.rangTitre(st), suivant = G.TITRES.find((t) => t[0] > np.n);
    openSheet(`<div class="boulanger-tete">${ICONS.boulanger(rang)}<div><h2>${esc(G.titre(st))}</h2><p class="sous">Niveau ${np.n} · ${G.fmt(np.reste)} / ${G.fmt(np.prochain)} savoir-faire${suivant ? ` · ${esc(suivant[1])} au niveau ${suivant[0]}` : ''}</p><div class="mini xp"><i style="width:${(np.reste / np.prochain * 100).toFixed(0)}%"></i></div></div></div>
      <div class="encadre doux">Le savoir-faire vient des défis du jour, des événements réussis, des recettes, des embauches et des nouvelles boutiques. Chaque niveau donne <b>un point de talent</b>. Les talents sont à toi pour toujours, même en changeant de boutique.</div>
      <h3 class="titre-section">Talents${pts ? ` · <span class="pts">${pts} point${pts > 1 ? 's' : ''} à dépenser</span>` : ''}</h3>
      <div class="liste-am">${G.TALENTS.map((t) => { const k = G.talent(st, t.id), max = k >= t.max; return `<div class="am talent ${k ? 'appris' : ''}"><div><h3>${esc(t.nom)} <span class="crans">${'●'.repeat(k)}${'○'.repeat(t.max - k)}</span></h3><p>${k ? esc(t.desc(k)) : 'Cran 1 : ' + esc(t.desc(1))}${k && !max ? `<br><em>Cran suivant : ${esc(t.desc(k + 1))}</em>` : ''}</p></div>${max ? '<span class="ok">Maîtrisé ✓</span>' : `<button type="button" class="btn ${pts ? 'lavande' : 'non'}" data-t="${t.id}"><small>Apprendre</small><b>1 point</b></button>`}</div>`; }).join('')}</div>
      <button type="button" class="btn large" data-a="close" style="margin-top:14px;background:var(--texte);box-shadow:0 4px 0 #2b1d16"><b>Retour</b></button>`);
    on('[data-a="close"]', closeSheet);
    on('[data-t]', (b) => {
      const r = G.apprendre(st, b.dataset.t);
      if (!r.ok) { son.non(); toast(G.ptsTalents(st) ? 'Ce talent est déjà au maximum.' : 'Pas encore de point : gagne du savoir-faire.'); return; }
      son.deblocage(); buzz([10, 30, 10]); toast(`${r.talent.nom} : ${r.talent.desc(r.cran)}`); renderCards(true); hud(); save(); sheetBoulanger();
    });
  }
  // le nom de la boutique : demandé à chaque ouverture, modifiable depuis la feuille des étoiles
  function sheetNom(nouvelle) {
    const q = G.QUARTIERS[G.quartier(st)], actuel = st.nomBoutique || q.enseigne;
    const choixSpe = nouvelle && st.specialite == null; let spe = choixSpe ? (st.boutiques + 1) % G.PRODUITS.length : null;
    openSheet(`<h2>${nouvelle ? `Boutique n°${st.boutiques}` : 'Le nom de ta boutique'}</h2><p class="sous">${nouvelle ? `Tu t’installes dans ${esc(q.nom)}. ` : ''}Comment s’appelle ta boutique ? Le nom s’affiche sur l’enseigne.</p>
      <input class="champ" type="text" maxlength="24" value="${esc(actuel)}" aria-label="Nom de la boutique" autocomplete="off" autocorrect="off">
      ${choixSpe ? `<h3 class="titre-section">Sa spécialité</h3><p class="sous">Le produit fétiche de cette boutique rapporte <b>×2</b> le temps de la boutique. On choisit une fois.</p>${grilleSpecialite(spe)}` : ''}
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>${nouvelle ? 'C’est parti !' : 'Garder ce nom'}</b></button>
      ${nouvelle ? '' : '<button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Annuler</b></button>'}`);
    const champ = fc.querySelector('.champ');
    const valider = () => { G.renommer(st, champ.value); if (choixSpe && spe != null) G.choisirSpecialite(st, spe); save(); renderCards(true); closeSheet(); toast(`${G.nomBoutique(st)} : bienvenue !${choixSpe && spe != null ? ` Spécialité : ${G.PRODUITS[spe].pl}.` : ''}`); };
    on('[data-a="ok"]', valider); on('[data-a="non"]', sheetEtoiles);
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
    on('[data-a="ok"]', () => { if (G.choisirSpecialite(st, spe).ok) { reussite(`Spécialité : ${G.PRODUITS[spe].pl} ×2 !`); } sheetEtoiles(); });
    on('[data-a="non"]', sheetEtoiles);
  }
  const ilYA = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : s < 86400 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };
  function sheetJournal() {
    const S = st.stats, tr = st.trophees || {}, gagnes = G.TROPHEES.filter((t) => tr[t.id]).length;
    openSheet(`<h2>Journal</h2><p class="sous">${esc(G.nomBoutique(st))} · ${G.fmt(S.ventes)} fournées, ${G.fmt(S.clients)} clients depuis le début.</p>
      <h3 class="titre-section">Records</h3>
      <div class="stat"><span>Plus grosse commande livrée</span><b>${S.meilleureCommande ? G.fmtEur(S.meilleureCommande) : '—'}</b></div>
      <div class="stat"><span>Meilleur pourboire</span><b>${S.meilleurPourboire ? G.fmtEur(S.meilleurPourboire) : '—'}</b></div>
      <div class="stat"><span>Pétrissage le plus rapide</span><b>${S.petrissageRecord ? S.petrissageRecord.toFixed(1).replace('.', ',') + ' s' : '—'}</b></div>
      <div class="stat"><span>Meilleure série d’objectifs</span><b>${S.serieMax || 0} jour${(S.serieMax || 0) > 1 ? 's' : ''}</b></div>
      <div class="stat"><span>Commandes · critiques · pétrissages · fours</span><b>${S.commandes || 0} · ${S.critiques || 0} · ${S.petrissages || 0} · ${S.pannes || 0}</b></div>
      <h3 class="titre-section">Les habitués</h3>
      <div class="liste-am">${G.HABITUES.map((h) => { const e = (st.habitues || {})[h.id]; return `<div class="am habitue"><span class="pastille-hab" style="background:${h.haut}"></span><div><h3>${esc(h.nom)}</h3><p>Passe entre ${h.debut}h et ${Math.floor(h.fin)}h${h.fin % 1 ? '30' : ''} · ${e && e.jours ? `fidèle depuis ${e.jours} jour${e.jours > 1 ? 's' : ''}` : 'première visite à venir'}</p></div></div>`; }).join('')}</div>
      <p class="sous" style="margin-top:6px">Sers un habitué cinq jours de suite : il t’offre un cadeau.</p>
      <h3 class="titre-section">Trophées · ${gagnes}/${G.TROPHEES.length}</h3>
      <div class="trophees">${G.TROPHEES.map((t) => `<div class="troph ${tr[t.id] ? 'gagne' : ''}"><b>${esc(t.nom)}</b><span>${esc(t.desc)}</span></div>`).join('')}</div>
      <h3 class="titre-section">Derniers événements</h3>
      <div class="carnet">${(st.carnetEv || []).slice().reverse().map((e) => `<div><span>${esc(e.txt)}</span><small>${ilYA(e.t)}</small></div>`).join('') || '<p class="sous">Rien encore : joue un peu !</p>'}</div>
      <button type="button" class="btn large lavande" data-a="partager" style="margin-top:14px"><b>Partager ma boutique</b></button>
      <button type="button" class="btn large" data-a="retour" style="margin-top:8px;background:var(--texte);box-shadow:0 4px 0 #2b1d16"><b>Retour</b></button>`);
    on('[data-a="retour"]', sheetEtoiles);
    on('[data-a="partager"]', partager);
  }
  // partager : une image de la boutique avec une légende, sinon le texte, sinon le presse-papiers
  async function partager() {
    const texte = `${G.nomBoutique(st)} · boutique n°${st.boutiques} · ${st.etoiles} ★ · ${G.titre(st)} niveau ${G.niveau(st)} · ${G.fmtEur(st.lifetime)} gagnés — Le Fournil`;
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) {
        const cv = $('#scene'), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height + 56 * (cv.width / cv.clientWidth);
        const x = c2.getContext('2d'), k = cv.width / cv.clientWidth; x.fillStyle = '#FFF7EC'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0);
        x.fillStyle = '#4A3328'; x.font = `700 ${16 * k}px Fredoka, Nunito, sans-serif`; x.textAlign = 'center'; x.fillText(texte.replace(' — Le Fournil', ''), c2.width / 2, cv.height + 34 * k, c2.width - 20 * k);
        const blob = await new Promise((r) => c2.toBlob(r, 'image/png'));
        const files = blob ? [new File([blob], 'ma-boutique.png', { type: 'image/png' })] : [];
        if (files.length && navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: 'Le Fournil', text: texte, url }); return; }
        await navigator.share({ title: 'Le Fournil', text: texte, url }); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${texte}\n${url}`); toast('Texte copié : colle-le où tu veux.'); } catch (e) { toast(texte); }
  }
  function sheetEtoiles() {
    const gain = G.etoilesGagnables(st), bonus = Math.round(st.etoiles * G.ETOILE_BONUS * 100), serie = G.serieEnCours(st), q = G.QUARTIERS[G.quartier(st)];
    openSheet(`<h2>Étoiles</h2><p class="sous"><b>${esc(G.nomBoutique(st))}</b> · boutique n°${st.boutiques}, ${esc(q.nom)} · ${st.etoiles} étoile${st.etoiles > 1 ? 's' : ''} · +${bonus} % sur tous les gains</p>
      <div class="encadre doux">Ouvrir une <b>nouvelle boutique</b> remet les produits et les euros à zéro, mais tu gardes tes étoiles pour toujours. Chaque étoile : <b>+${Math.round(G.ETOILE_BONUS * 100)} %</b> de gains. Plus tu as gagné dans cette boutique, plus tu en récoltes. Les objectifs du jour en donnent une aussi.</div>
      <div class="grand-nombre">+${gain} ★</div><p class="sous">à récolter maintenant (${G.fmtEur(st.lifetimeRun)} gagnés dans cette boutique)</p>
      <button type="button" class="btn large ${gain > 0 ? 'beurre' : 'non'}" data-a="prestige"><small>${gain > 0 ? 'Repartir avec' : 'Pas encore'}</small><b>${gain > 0 ? `+${gain} étoile${gain > 1 ? 's' : ''}` : 'Vends encore un peu'}</b></button>
      <h3 style="margin:18px 0 6px;font:700 16px/1 var(--titre)">Ta boutique</h3>
      <div class="stat"><span>Fournées vendues</span><b>${G.fmt(st.stats.ventes)}</b></div><div class="stat"><span>Clients servis</span><b>${G.fmt(st.stats.clients)}</b></div><div class="stat"><span>Gagné depuis le début</span><b>${G.fmtEur(st.lifetime)}</b></div><div class="stat"><span>Série d’objectifs</span><b>${serie} jour${serie > 1 ? 's' : ''}</b></div>
      <div class="ligne-reglage"><span>Vibrations</span><button type="button" class="interrupteur" role="switch" aria-checked="${st.vibre}" data-a="vibre"></button></div>
      <button type="button" class="btn large" data-a="close" style="background:var(--texte);box-shadow:0 4px 0 #2b1d16"><b>Retour</b></button>
      <button type="button" class="lien" data-a="boulanger">Le boulanger et ses talents</button>
      <button type="button" class="lien" data-a="journal">Journal, trophées et partage</button>
      ${st.specialite == null ? '<button type="button" class="lien" data-a="specialite">Choisir la spécialité de cette boutique</button>' : ''}
      <button type="button" class="lien" data-a="nom">Renommer la boutique</button>
      <button type="button" class="lien" data-a="sauvegarde">Sauvegarde et transfert</button>
      <button type="button" class="lien" data-a="reset">Recommencer une partie de zéro</button>`);
    on('[data-a="close"]', closeSheet);
    on('[data-a="sauvegarde"]', sheetSauvegarde);
    on('[data-a="boulanger"]', sheetBoulanger);
    on('[data-a="nom"]', () => sheetNom(false));
    on('[data-a="journal"]', sheetJournal);
    on('[data-a="specialite"]', sheetSpecialite);
    on('[data-a="vibre"]', (b) => { st.vibre = !st.vibre; b.setAttribute('aria-checked', st.vibre); save(); });
    on('[data-a="reset"]', () => { openSheet(`<h2>Tout effacer ?</h2><p class="sous">Euros, recettes, apprentis, bonus et étoiles : tout repart de la première baguette. Impossible de revenir en arrière.</p><button type="button" class="btn large" data-a="oui" style="background:var(--fraise);box-shadow:0 4px 0 var(--fraise-sombre)"><b>Oui, tout effacer</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Non, je garde ma boutique</b></button>`); on('[data-a="non"]', sheetEtoiles); on('[data-a="oui"]', () => { fige = true; effacer().then(() => location.reload()); }); });
    on('[data-a="prestige"]', () => {
      if (G.etoilesGagnables(st) <= 0) { son.non(); return; }
      openSheet(`<h2>Nouvelle boutique ?</h2><p class="sous">Tu repars de la première baguette avec <b>${st.etoiles + gain} étoiles</b> (+${Math.round((st.etoiles + gain) * G.ETOILE_BONUS * 100)} % de gains). Les bonus achetés sont perdus.</p>
        <button type="button" class="btn large beurre" data-a="oui"><b>Ouvrir la boutique n°${st.boutiques + 1}</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Rester ici</b></button>`);
      on('[data-a="non"]', sheetEtoiles);
      on('[data-a="oui"]', () => { const r = G.nouvelleBoutique(st, Date.now()); if (r.ok) { son.deblocage(); buzz([20, 40, 20]); SCENE.fete(); toast(`Boutique n°${st.boutiques} ouverte : +${r.gain} ★`); st.tuto = Math.max(st.tuto, INDICES.length); renderCards(true); hud(); save(); sheetNom(true); } });
    });
  }
  function sheetRetour(abs) {
    const detail = abs.detail.slice().sort((a, b) => b.m - a.m).map((d) => `<li><span>${esc(G.PRODUITS[d.i].nom)} × ${G.fmt(d.n)}</span><b>${G.fmtEur(d.m)}</b></li>`).join('');
    openSheet(`<h2>Pendant ton absence</h2><p class="sous">${G.fmtDuree(abs.secs)}${abs.secs >= G.ABSENCE_MAX_H * 3600 ? ' (les apprentis s’arrêtent après 8 h)' : ''}</p>
      <div class="grand-nombre">+${G.fmtEur(abs.total)}</div><p class="sous">vendus par tes apprentis</p><ul class="detail">${detail}</ul>
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
      if (!st.stations[first.i].staff) { const r = cards[first.i].el.querySelector('.barre').getBoundingClientRect(); flottant(r.left + r.width / 2 - 30, r.top - 10, '+' + G.fmtEur(first.montant)); }
    }
    if (out.nouvelEv) { son.evenement(); buzz([15, 40, 15]); toast(TXT_EV[out.nouvelEv.type]); }
    if (out.finEv) { toast(FIN_EV[out.finEv.type]); if (out.finEv.type === 'critique' || out.finEv.type === 'petrissage') son.non(); }
    if (out.mystere && $('#feuille').hidden) { if (SCENE.mystere()) toast('Un client mystère ! Touche-le vite.'); }
    if (out.habitue) { SCENE.habitue(out.habitue); son.achat(); toast(`${out.habitue.nom} : « ${out.habitue.phrase} »`); }
    if (out.trophees && out.trophees.length) { const t0 = out.trophees[0]; son.deblocage(); buzz([10, 30, 10, 30, 10]); SCENE.fete(); toast(`Trophée : ${t0.nom} !${out.trophees.length > 1 ? ` (+${out.trophees.length - 1})` : ''}`); }
    const nv = G.niveau(st);
    if (nv > lastNiveau) { lastNiveau = nv; son.deblocage(); buzz([15, 40, 15, 40, 15]); SCENE.fete(); toast(`Niveau ${nv} : ${G.titre(st)} ! Un point de talent à apprendre.`); }
    renderCards(); hud(); renderObjectifs(); renderEvenement();
    SCENE.frame(dt, st, Date.now());
    indices();
    if (now - lastSave > 5000) save();
    requestAnimationFrame(frame);
  }
  function layout() { SCENE.resize(window.innerWidth, Math.max(150, Math.min(240, Math.round(window.innerHeight * 0.27)))); }

  // ─── démarrage ───
  async function boot() {
    st = await load();
    const fresh = !st;
    if (fresh) st = G.newState(Date.now());
    st.now = Date.now();
    SCENE.init($('#scene'));
    SCENE.surServi = (r) => { if (r.cadeau) { reussite(`${r.hb.nom}, fidèle depuis ${r.jours} jours, t’offre ${G.fmtEur(r.cadeau)} !`); } else if (r.jours > 1) toast(`${r.hb.nom} : ${r.jours}e jour de suite !`); };
    layout();
    buildCards();
    document.querySelectorAll('.modes button').forEach((b) => { b.classList.toggle('actif', String(st.mode) === b.dataset.mode); b.addEventListener('click', () => { st.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCards(true); save(); }); });
    $('#cartes').addEventListener('click', onCardClick);
    $('#b-ameliorations').addEventListener('click', () => { audio(); sheetAmeliorations(); });
    $('#b-etoiles').addEventListener('click', () => { audio(); sheetEtoiles(); });
    $('#objectifs').addEventListener('click', () => { audio(); sheetObjectifs(); });
    $('#b-son').addEventListener('click', () => { audio(); st.son = !st.son; $('#b-son').setAttribute('aria-pressed', st.son); $('#son-on').hidden = !st.son; $('#son-off').hidden = st.son; save(); if (st.son) son.tap(); });
    $('#son-on').hidden = !st.son; $('#son-off').hidden = st.son; $('#b-son').setAttribute('aria-pressed', st.son);
    $('#scene').addEventListener('pointerdown', (e) => {
      audio();
      const r = $('#scene').getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (SCENE.hit(sx, sy)) { const tip = G.encaisserPourboire(st); son.pourboire(); buzz([10, 20, 10, 20, 10]); SCENE.texte(`+${G.fmtEur(tip)} de pourboire !`); toast(`Le client mystère laisse ${G.fmtEur(tip)} de pourboire !`); renderCards(true); hud(); save(); }
      else if (SCENE.hitBoulanger(sx, sy)) sheetBoulanger();
      else SCENE.tap();
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
    window.__fournil = { get st() { return st; }, G, SCENE, save, reset: () => { fige = true; return effacer().then(() => location.reload()); }, absence: (ms) => { st.lastSeen = Date.now() - ms; const abs = G.absence(st, Date.now()); sheetRetour(abs); renderCards(true); return abs; }, give: (n) => { G.gagner(st, n, true); renderCards(true); hud(); }, rush: () => G.lancerRush(st), commande: () => G.lancerCommande(st, Math.random), ev: (type) => G.lancerEvenement(st, Math.random, type), mystere: () => SCENE.mystere(), xp: (n) => G.gagnerXp(st, n), boulanger: () => sheetBoulanger(), nommer: (n) => G.renommer(st, n), scene: (o) => SCENE.forcer(o), journal: () => sheetJournal(), habitue: (id) => SCENE.habitue(G.HABITUES.find((h) => h.id === id)), partager };
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  return { get st() { return st; } };
})();
