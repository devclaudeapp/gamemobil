/* LE FOURNIL — interface : cartes des produits, achats, indices du tutoriel, feuilles, sons, sauvegarde, boucle. */
const UI = (() => {
  'use strict';
  const G = GAME, $ = (s) => document.querySelector(s), KEY = 'fournil.v2';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let st, lastFrame = 0, lastSave = 0, cards = [], lastHud = '', hintStep = -1, hintUntil = 0, toastTimer = 0;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ─── sauvegarde ───
  function save() { try { st.lastSeen = Date.now(); localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* stockage indisponible */ } lastSave = performance.now(); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return null;
      const s = JSON.parse(raw); if (!s || s.v !== 2 || !Array.isArray(s.stations)) return null;
      const fresh = G.newState(Date.now());
      for (const k in fresh) if (!(k in s)) s[k] = fresh[k];
      while (s.stations.length < G.PRODUITS.length) s.stations.push({ niv: 0, staff: false, prog: 0, actif: false });
      return s;
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
    non: () => beep(200, 0.12, 'square', 0.03),
  };
  function buzz(p) { if (!st.vibre) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* pas de vibreur */ } }

  // ─── cartes ───
  function buildCards() {
    const box = $('#cartes'); box.innerHTML = ''; cards = [];
    G.PRODUITS.forEach((p, i) => {
      const el = document.createElement('article'); el.className = 'carte'; el.dataset.i = i;
      box.appendChild(el); cards.push({ el, html: '' });
    });
    renderCards(true);
  }
  function renderCards(force) {
    G.PRODUITS.forEach((p, i) => {
      const s = st.stations[i], c = cards[i];
      let html, cls;
      if (s.niv === 0) {
        const prev = i === 0 || st.stations[i - 1].niv > 0, ok = st.coins >= p.cout;
        cls = 'carte verrou' + (prev ? '' : ' secret');
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${esc(p.desc)} Rapporte ${G.fmtEur(p.rev)} la fournée.</p>
          <button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>Débloquer</small><b>${G.fmtEur(p.cout)}</b></button></div>`;
      } else {
        const n = G.quantite(st, i), prix = G.coutNiveaux(i, s.niv, n), ok = st.coins >= prix, pal = G.prochainPalier(s.niv);
        const rapide = p.temps <= 1.5 && s.staff;
        cls = 'carte' + (s.staff ? ' auto' : ' manuel') + (s.actif ? ' actif' : '');
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}</div>
          <div class="corps"><h3>${esc(p.nom)} <span class="niv">Niv. ${s.niv}${pal ? ` <i>· palier ${pal}</i>` : ''}</span></h3>
            <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${G.fmtEur(G.revenu(st, i))}</span>${s.staff || s.actif ? `<span class="tps">${G.fmtDuree(p.temps)}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
          <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'}" data-a="ameliorer"><small>Améliorer ×${n}</small><b>${G.fmtEur(prix)}</b></button>
            ${s.staff ? `<div class="staff-ok">${ICONS.apprenti(i)}<span>${esc(p.staffNom.split(' ').pop())}<br>s’en occupe</span></div>` : `<button type="button" class="btn beurre ${st.coins >= p.staff ? '' : 'non'}" data-a="embaucher"><small>Embaucher</small><b>${G.fmtEur(p.staff)}</b></button>`}</div>`;
      }
      if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); }
      else if (c.el.className !== cls) c.el.className = cls;
      if (c.bar && !c.bar.classList.contains('rapide')) c.bar.style.width = (s.niv > 0 && s.actif ? Math.min(100, s.prog / G.PRODUITS[i].temps * 100) : 0).toFixed(1) + '%';
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
    if (st.stations[i].niv > 0 && !st.stations[i].staff) { if (G.lancer(st, i)) { son.tap(); buzz(6); SCENE.tap(); renderCards(); } }
  }

  // ─── en-tête ───
  function hud() {
    const taux = G.tauxParSeconde(st), gain = G.etoilesGagnables(st);
    const key = `${G.fmtEur(st.coins)}|${G.fmtEur(taux)}|${st.etoiles}|${gain}`;
    if (key === lastHud) return; lastHud = key;
    $('#coins').textContent = G.fmtEur(st.coins);
    $('#taux').innerHTML = taux > 0 ? `<b>+${G.fmtEur(taux)}</b> par seconde` : 'Touche la baguette !';
    $('#etoiles-n').textContent = gain > 0 ? `${st.etoiles} · +${gain}` : st.etoiles;
    $('#b-etoiles').classList.toggle('pret', gain >= 3);
    $('#b-ameliorations').classList.toggle('pret', G.AMELIORATIONS.some((a) => !st.ameliorations[a.id] && st.coins >= a.cout));
  }
  function toast(txt) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); } el.textContent = txt; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2200); }
  function flottant(x, y, txt) { const el = document.createElement('div'); el.className = 'flottant'; el.textContent = txt; el.style.left = x + 'px'; el.style.top = y + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 900); }

  // ─── indices : une seule consigne à la fois, qui pointe l'élément concerné ───
  const INDICES = [
    { txt: 'Touche la baguette pour la cuire et la vendre !', cible: () => cards[0].el.querySelector('.barre'), fini: () => st.stats.ventes >= 1 },
    { txt: 'Avec tes euros, améliore la baguette : chaque niveau rapporte plus.', cible: () => cards[0].el.querySelector('[data-a="ameliorer"]'), pret: () => st.coins >= G.coutNiveau(0, st.stations[0].niv), fini: () => st.stations[0].niv >= 2 },
    { txt: 'Débloque les croissants : 20 € la fournée !', cible: () => cards[1].el.querySelector('[data-a="debloquer"]'), pret: () => st.coins >= G.PRODUITS[1].cout, fini: () => st.stations[1].niv >= 1 },
    { txt: 'Embauche Léo : il cuit les baguettes tout seul, même quand tu n’es pas là.', cible: () => cards[0].el.querySelector('[data-a="embaucher"]'), pret: () => st.coins >= G.PRODUITS[0].staff, fini: () => st.stations[0].staff },
    { txt: 'Bravo ! Au niveau 25, 50, 100… les gains doublent. Continue d’améliorer et d’embaucher.', cible: () => null, pret: () => true, fini: () => performance.now() > hintUntil },
  ];
  function indices() {
    const el = $('#indice');
    if (st.tuto >= INDICES.length || !$('#feuille').hidden) { el.hidden = true; return; }
    const h = INDICES[st.tuto];
    if (h.fini()) { st.tuto++; hintUntil = performance.now() + 6000; save(); el.hidden = true; return; }
    if (h.pret && !h.pret()) { el.hidden = true; return; }
    if (st.tuto !== hintStep) { hintStep = st.tuto; $('#indice-txt').textContent = h.txt; if (st.tuto === 4) hintUntil = performance.now() + 6000; }
    const cible = h.cible();
    el.hidden = false;
    if (!cible) { el.classList.remove('haut'); el.style.left = '50%'; el.style.transform = 'translateX(-50%)'; el.style.top = (window.innerHeight * 0.42) + 'px'; el.querySelector('.main').hidden = true; return; }
    el.querySelector('.main').hidden = false;
    const r = cible.getBoundingClientRect(), bw = Math.min(window.innerWidth * 0.78, 320);
    let x = r.left + r.width / 2 - bw / 2; x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
    el.style.left = x + 'px'; el.style.transform = 'none';
    const hauteur = el.offsetHeight || 90;
    if (r.bottom + hauteur + 6 < window.innerHeight - 20) { el.classList.add('haut'); el.style.top = (r.bottom + 6) + 'px'; } // de préférence sous la cible, pour ne rien cacher
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
      const fait = st.ameliorations[a.id], ok = st.coins >= a.cout;
      return `<div class="am ${fait ? 'fait' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p></div>${fait ? '<span class="ok">Acheté ✓</span>' : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${G.fmtEur(a.cout)}</b></button>`}</div>`;
    }).join('');
    openSheet(`<h2>Améliorations</h2><p class="sous">Des recettes et des équipements qui multiplient tes gains, pour toujours.</p><div class="liste-am">${items}</div>`);
    on('[data-id]', (b) => { const r = G.amelioration(st, b.dataset.id); if (!r.ok) { son.non(); toast(`Il manque ${G.fmtEur(G.AMELIORATIONS.find((a) => a.id === b.dataset.id).cout - st.coins)}`); return; } son.deblocage(); buzz([10, 30, 10]); toast(`${r.a.nom} : ${r.a.desc}`); renderCards(true); hud(); save(); sheetAmeliorations(); });
  }
  function sheetEtoiles() {
    const gain = G.etoilesGagnables(st), bonus = Math.round(st.etoiles * G.ETOILE_BONUS * 100);
    openSheet(`<h2>Étoiles</h2><p class="sous">Boutique n°${st.boutiques} · ${st.etoiles} étoile${st.etoiles > 1 ? 's' : ''} · +${bonus} % sur tous les gains</p>
      <div class="encadre doux">Ouvrir une <b>nouvelle boutique</b> remet les produits et les euros à zéro, mais tu gardes tes étoiles pour toujours. Chaque étoile : <b>+${Math.round(G.ETOILE_BONUS * 100)} %</b> de gains. Plus tu as gagné dans cette boutique, plus tu en récoltes.</div>
      <div class="grand-nombre">+${gain} ★</div><p class="sous">à récolter maintenant (${G.fmtEur(st.lifetimeRun)} gagnés dans cette boutique)</p>
      <button type="button" class="btn large ${gain > 0 ? 'beurre' : 'non'}" data-a="prestige"><small>${gain > 0 ? 'Repartir avec' : 'Pas encore'}</small><b>${gain > 0 ? `+${gain} étoile${gain > 1 ? 's' : ''}` : 'Vends encore un peu'}</b></button>
      <h3 style="margin:18px 0 6px;font:700 16px/1 var(--titre)">Ta boutique</h3>
      <div class="stat"><span>Fournées vendues</span><b>${G.fmt(st.stats.ventes)}</b></div><div class="stat"><span>Clients servis</span><b>${G.fmt(st.stats.clients)}</b></div><div class="stat"><span>Gagné depuis le début</span><b>${G.fmtEur(st.lifetime)}</b></div>
      <div class="ligne-reglage"><span>Vibrations</span><button type="button" class="interrupteur" role="switch" aria-checked="${st.vibre}" data-a="vibre"></button></div>
      <button type="button" class="btn large" data-a="close" style="background:var(--texte);box-shadow:0 4px 0 #2b1d16"><b>Retour</b></button>`);
    on('[data-a="close"]', closeSheet);
    on('[data-a="vibre"]', (b) => { st.vibre = !st.vibre; b.setAttribute('aria-checked', st.vibre); save(); });
    on('[data-a="prestige"]', () => {
      if (G.etoilesGagnables(st) <= 0) { son.non(); return; }
      openSheet(`<h2>Nouvelle boutique ?</h2><p class="sous">Tu repars de la première baguette avec <b>${st.etoiles + gain} étoiles</b> (+${Math.round((st.etoiles + gain) * G.ETOILE_BONUS * 100)} % de gains). Les améliorations achetées sont perdues.</p>
        <button type="button" class="btn large beurre" data-a="oui"><b>Ouvrir la boutique n°${st.boutiques + 1}</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Rester ici</b></button>`);
      on('[data-a="non"]', sheetEtoiles);
      on('[data-a="oui"]', () => { const r = G.nouvelleBoutique(st, Date.now()); if (r.ok) { son.deblocage(); buzz([20, 40, 20]); SCENE.fete(); closeSheet(); toast(`Boutique n°${st.boutiques} ouverte : +${r.gain} ★`); st.tuto = Math.max(st.tuto, INDICES.length); renderCards(true); hud(); save(); } });
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
    const ventes = G.tick(st, dt);
    if (ventes.length) {
      const gros = ventes.reduce((a, v) => a + v.montant, 0);
      const first = ventes[0];
      if (G.PRODUITS[first.i].temps >= 3 || Math.random() < 0.15) { SCENE.vente(first.i, gros, '+' + G.fmtEur(gros)); son.vente(gros); }
      if (!st.stations[first.i].staff) { const r = cards[first.i].el.querySelector('.barre').getBoundingClientRect(); flottant(r.left + r.width / 2 - 30, r.top - 10, '+' + G.fmtEur(first.montant)); }
      renderCards();
    } else renderCards();
    hud();
    SCENE.frame(dt, st, Date.now());
    indices();
    if (now - lastSave > 5000) save();
    requestAnimationFrame(frame);
  }
  function layout() {
    const h = Math.max(150, Math.min(240, Math.round(window.innerHeight * 0.27)));
    SCENE.resize(window.innerWidth, h);
  }

  // ─── démarrage ───
  function boot() {
    st = load();
    const fresh = !st;
    if (fresh) st = G.newState(Date.now());
    SCENE.init($('#scene'));
    layout();
    buildCards();
    document.querySelectorAll('.modes button').forEach((b) => { b.classList.toggle('actif', String(st.mode) === b.dataset.mode); b.addEventListener('click', () => { st.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; document.querySelectorAll('.modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCards(true); save(); }); });
    $('#cartes').addEventListener('click', onCardClick);
    $('#b-ameliorations').addEventListener('click', () => { audio(); sheetAmeliorations(); });
    $('#b-etoiles').addEventListener('click', () => { audio(); sheetEtoiles(); });
    $('#b-son').addEventListener('click', () => { audio(); st.son = !st.son; $('#b-son').setAttribute('aria-pressed', st.son); $('#son-on').hidden = !st.son; $('#son-off').hidden = st.son; save(); if (st.son) son.tap(); });
    $('#son-on').hidden = !st.son; $('#son-off').hidden = st.son; $('#b-son').setAttribute('aria-pressed', st.son);
    $('#scene').addEventListener('pointerdown', () => { audio(); SCENE.tap(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else { const abs = G.absence(st, Date.now()); if (abs.total > 0 && abs.secs > 90) { sheetRetour(abs); renderCards(true); } lastFrame = performance.now(); } });
    window.addEventListener('pagehide', save);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    if (!fresh) { const abs = G.absence(st, Date.now()); if (abs.total > 0 && abs.secs > 90) sheetRetour(abs); }
    renderCards(true); hud();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    window.__fournil = { get st() { return st; }, G, save, reset: () => { try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } location.reload(); }, absence: (ms) => { st.lastSeen = Date.now() - ms; const abs = G.absence(st, Date.now()); sheetRetour(abs); renderCards(true); return abs; }, give: (n) => { G.gagner(st, n); renderCards(true); hud(); } };
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') setTimeout(boot, 0);
  return { get st() { return st; } };
})();
