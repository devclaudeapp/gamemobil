/* LE FOURNIL — l'Atelier : trois mini-jeux lancés à volonté (jamais en surprise), en plein écran par-dessus la boutique.
   1. Enfournement en rythme (canvas), 2. Façonnage au doigt (canvas), 3. Mémoire du pâtissier (boutons).
   Les règles, les scores, les records et les gains plafonnés par jour sont dans game.js (purs, testés dans Node) ; ici, le dessin et les touches.
   Le temps des parties est celui de performance.now(), avancé par petits pas de 1/60 s (aucune fenêtre de touche n'est sautée, même quand
   les images se font rares) ; un trou de plus d'une seconde (le téléphone en arrière-plan) est une pause. Une touche fait d'abord
   avancer la partie jusqu'à son propre instant, puis elle est jugée. Aucune heure du téléphone n'entre en jeu : seule la fin de partie
   lit HORLOGE.maintenant(). */
const MINIJEUX = (() => {
  'use strict';
  const G = GAME, $ = (s) => document.querySelector(s);
  let d = null, el, zone, titre, sous, chrono, bandeau, consigne;
  let ecran = '', jeu = null, partie = null, raf = 0, horloge = 0, resultat = null;
  const PAS = 1 / 60, TROU = 1; // le pas logique (s), et le trou au-delà duquel le temps écoulé est une pause (arrière-plan)
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = () => d.st();
  const fmtPts = (n) => `${G.fmt(n)} point${n > 1 ? 's' : ''}`;

  function init(deps) {
    d = deps; el = $('#atelier'); zone = $('#at-zone'); titre = $('#at-titre'); sous = $('#at-sous'); chrono = $('#at-chrono'); bandeau = $('#at-bandeau'); consigne = $('#at-consigne');
    el.querySelector('[data-at="fermer"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) fermer(); });
    window.addEventListener('resize', () => { if (partie && partie.redim) partie.redim(); });
  }
  const ouvert = () => !!el && !el.hidden;
  function fermer() { arreter(); el.hidden = true; zone.innerHTML = ''; ecran = ''; jeu = null; resultat = null; if (d.ferme) d.ferme(); }
  function arreter() { cancelAnimationFrame(raf); raf = 0; if (partie && partie.fin) partie.fin(); partie = null; }
  function entete(t, s, montrerChrono) { titre.textContent = t; sous.textContent = s || ''; chrono.hidden = !montrerChrono; bandeau.hidden = true; bandeau.innerHTML = ''; consigne.textContent = ''; consigne.classList.remove('l2'); }

  // ─── l'accueil d'un mini-jeu : les règles, le record, ce que paie la partie aujourd'hui ───
  const REGLES = {
    four: ['Les plaques défilent sur le tapis : touche quand elles passent sous la bouche du four.', 'Touche encore quand le pain est doré : ni pâle, ni brûlé.', 'Les cuissons parfaites d’affilée font un combo. Ça accélère !'],
    faconnage: ['Trace au doigt le geste du modèle, en suivant les pointillés.', 'Commence au rond numéroté, dans le sens des flèches, trait par trait.', 'Trois formes, quinze secondes chacune : la précision fait la note.'],
    memoire: ['Une recette s’affiche quelques secondes : retiens l’ordre des ingrédients.', 'Puis touche-les dans le même ordre.', 'Chaque recette réussie s’allonge d’un ingrédient. Une erreur, et c’est fini.'],
  };
  const DUREE = { four: `${G.FOUR.duree} s`, faconnage: `${G.FACONNAGE.ordre.length * G.FACONNAGE.parForme} s au plus`, memoire: `${G.MEMOIRE.duree} s au plus` };
  function ligneGain(id) {
    const s = st(), reste = G.restantesAtelier(s, id), a = G.atelierDuJour(s);
    return reste > 0 ? `<b>Aujourd’hui : ${a.payees[id]}/${G.ATELIER.parJour} parties payées.</b> Une belle partie rapporte jusqu’à <b>${G.fmtEur(G.primePleineAtelier(s))}</b>.`
      : `<b>Plafond du jour atteint</b> (${G.fmtEur(a.gains[id])} gagnés). Tu peux jouer pour le record, sans gain : rendez-vous demain, après minuit.`;
  }
  function ouvrir(id) {
    const j = G.jeuAtelier(id); if (!j) return;
    arreter(); jeu = j; ecran = 'accueil'; resultat = null; el.hidden = false; d.ouvert();
    entete(j.nom, 'L’Atelier');
    const rec = G.atelierDuJour(st()).records[id];
    zone.innerHTML = `<div class="at-carte at-accueil"><span class="at-icone">${ICONS.ATELIER[id]}</span>
      <ol class="at-regles">${REGLES[id].map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      <div class="at-infos"><span><small>Record</small><b>${rec ? fmtPts(rec) : '—'}</b></span><span><small>Durée</small><b>${DUREE[id]}</b></span></div>
      <p class="at-gain">${ligneGain(id)}</p>
      <button type="button" class="btn large beurre" data-at="jouer"><b>C’est parti !</b></button></div>`;
    zone.querySelector('[data-at="jouer"]').addEventListener('click', () => { d.audio(); d.son.tap(); demarrer(id); });
  }
  function demarrer(id) {
    arreter(); ecran = 'jeu'; zone.innerHTML = '';
    horloge = performance.now();
    partie = ({ four: jeuFour, faconnage: jeuFaconnage, memoire: jeuMemoire })[id]();
    const boucle = () => {
      if (!partie) return;
      rattraper(performance.now());
      if (partie && partie.termine) { terminer(partie.score, partie.bilan()); return; }
      partie.vue();
      raf = requestAnimationFrame(boucle);
    };
    raf = requestAnimationFrame(boucle);
  }
  // amène la partie jusqu'à l'instant `t` (ms, horloge de performance.now()) par pas de 1/60 s au plus ; un long trou est une pause
  function rattraper(t) {
    if (!partie) return;
    let dt = (t - horloge) / 1000; if (!(dt > 0)) return; horloge = t;
    if (dt > TROU) return;
    while (dt > 1e-6 && partie && !partie.termine) { const h = Math.min(PAS, dt); partie.pas(h); dt -= h; }
  }
  // l'instant d'une touche (Event.timeStamp, même horloge que performance.now()), borné à ce qui est possible
  const instant = (ev) => { const n = performance.now(), t = ev && ev.timeStamp; return Number.isFinite(t) && t > 0 ? Math.min(n, Math.max(horloge, t)) : n; };
  // ─── la fin de partie : le record, la prime (ou le plafond du jour) ───
  function terminer(score, bilan) {
    const id = jeu.id; arreter();
    const s = st(); s.now = d.maintenant();
    const r = G.finirAtelier(s, id, score); resultat = r; ecran = 'resultat';
    d.apres(r);
    if (r.prime > 0 || r.record) { d.son.deblocage(); d.buzz([10, 30, 10]); if (d.fete) d.fete(); } else d.son.tap();
    entete(jeu.nom, 'Partie terminée');
    const gain = r.prime > 0 ? `<p class="at-prime">+${G.fmtEur(r.prime)}</p><p class="at-gain">${r.reste > 0 ? `Encore ${r.reste} partie${r.reste > 1 ? 's' : ''} payée${r.reste > 1 ? 's' : ''} aujourd’hui.` : 'C’était la dernière partie payée du jour : la suite, pour le record !'}</p>`
      : r.pourLeRecord ? '<p class="at-gain"><b>Plafond du jour atteint :</b> pas de gain, mais le record compte. Les gains reviennent demain.</p>'
        : '<p class="at-gain">Pas de gain cette fois : vise un meilleur score pour remplir la caisse.</p>';
    zone.innerHTML = `<div class="at-carte at-resultat${r.record ? ' record' : ''}">${r.record ? '<span class="at-ruban">Nouveau record !</span>' : ''}
      <span class="at-icone">${ICONS.ATELIER[id]}</span>
      <p class="at-score" data-score="${r.score}">${G.fmt(r.score)}<small>point${r.score > 1 ? 's' : ''}</small></p>
      <p class="at-bilan">${esc(bilan)}</p>
      <div class="at-infos"><span><small>Record</small><b>${fmtPts(G.atelierDuJour(s).records[id])}</b></span><span><small>Gagné aujourd’hui</small><b>${G.fmtEur(G.atelierDuJour(s).gains[id])}</b></span></div>
      ${gain}
      <button type="button" class="btn large beurre" data-at="rejouer"><b>Rejouer</b></button>
      <button type="button" class="btn large clair" data-at="retour" style="margin-top:8px"><b>Retour à l’atelier</b></button></div>`;
    // les touches en rafale de la fin de partie ne doivent pas tomber sur « Rejouer » ou « Retour » : les boutons attendent un instant
    const carte = zone.querySelector('.at-resultat'); carte.classList.add('repos'); setTimeout(() => carte.classList.remove('repos'), 600);
    zone.querySelector('[data-at="rejouer"]').addEventListener('click', () => { d.audio(); d.son.tap(); ouvrir(id); });
    zone.querySelector('[data-at="retour"]').addEventListener('click', () => { d.son.tap(); fermer(); });
  }
  function pilules(html) { bandeau.hidden = false; if (bandeau.innerHTML !== html) bandeau.innerHTML = html; }

  // ─── un canvas net (finesse de l'écran) qui remplit la zone de jeu ───
  // Le bandeau, le titre et la consigne se remplissent après sa création, et la consigne peut changer de hauteur : la toile se remesure
  // dès que la zone change (ResizeObserver, et une vérification à chaque image), et un doigt se lit toujours d'après le rectangle affiché.
  function toile() {
    const cv = document.createElement('canvas'); cv.className = 'at-toile'; zone.appendChild(cv);
    const o = { cv, ctx: cv.getContext('2d'), W: 0, H: 0, k: 1 };
    o.redim = () => { const k = Math.min(3, window.devicePixelRatio || 1); o.k = k; o.W = Math.max(1, zone.clientWidth); o.H = Math.max(1, zone.clientHeight); cv.width = Math.round(o.W * k); cv.height = Math.round(o.H * k); o.ctx.setTransform(k, 0, 0, k, 0, 0); };
    o.ajuster = () => { if (Math.abs(zone.clientWidth - o.W) > 0.5 || Math.abs(zone.clientHeight - o.H) > 0.5) { o.redim(); return true; } return false; };
    o.point = (ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * o.W / (r.width || 1), (ev.clientY - r.top) * o.H / (r.height || 1)]; }; // pixels CSS → coordonnées du dessin
    o.ecran = (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + x * r.width / o.W, r.top + y * r.height / o.H]; }; // et l'inverse
    let obs = null; if (window.ResizeObserver) { obs = new ResizeObserver(() => o.ajuster()); obs.observe(zone); }
    o.fin = () => { if (obs) obs.disconnect(); obs = null; };
    o.redim(); return o;
  }
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const TRAIT = '#4A3328';
  function texteFlottant(c, f, t) { // un mot qui monte et s'efface
    const a = Math.min(1, (t - f.t0) / 0.15), age = t - f.t0, y = f.y - age * 40, al = Math.max(0, 1 - Math.max(0, age - 0.5) / 0.5);
    c.save(); c.globalAlpha = al; c.font = `700 ${f.taille || 22}px Fredoka, Nunito, sans-serif`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = '#fff'; c.lineJoin = 'round';
    const s = 0.8 + 0.2 * a; c.translate(f.x, y); c.scale(s, s); c.strokeText(f.txt, 0, 0); c.fillStyle = f.couleur; c.fillText(f.txt, 0, 0); c.restore();
  }

  // ═══ 1. Enfournement en rythme ═══
  const TEINTES = [[0, [246, 231, 200]], [0.6, [242, 204, 134]], [1, [226, 156, 64]], [1.3, [169, 101, 43]], [1.7, [62, 42, 32]]];
  function teinte(c) { // la couleur de la croûte selon la cuisson (0 : pâte crue, 1 : doré parfait, 1,7 : brûlé)
    c = Math.max(0, Math.min(1.7, c)); let k = 1; while (k < TEINTES.length - 1 && c > TEINTES[k][0]) k++;
    const [a, ca] = TEINTES[k - 1], [b, cb] = TEINTES[k], f = (c - a) / (b - a || 1);
    return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * f)).join(',')})`;
  }
  function pain(c, type, x, y, s, coul) { // un pain sur la plaque : baguette, croissant ou pain au chocolat
    c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 1.6; c.strokeStyle = TRAIT; c.fillStyle = coul;
    if (type === 0) { c.rotate(-0.12); rrect(c, -17, -5, 34, 10, 5); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.4; c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(k * 9 - 3, 2); c.lineTo(k * 9 + 3, -2); } c.stroke(); }
    else if (type === 1) { c.beginPath(); c.moveTo(-15, 4); c.quadraticCurveTo(-12, -11, 0, -10); c.quadraticCurveTo(12, -11, 15, 4); c.quadraticCurveTo(9, -2, 0, -2); c.quadraticCurveTo(-9, -2, -15, 4); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = 'rgba(120,70,30,.35)'; c.beginPath(); c.moveTo(-6, -8); c.lineTo(-4, -3); c.moveTo(6, -8); c.lineTo(4, -3); c.stroke(); }
    else { rrect(c, -12, -7, 24, 14, 5); c.fill(); c.stroke(); c.fillStyle = 'rgba(91,58,41,.8)'; c.fillRect(-7, -4, 3, 8); c.fillRect(4, -4, 3, 8); }
    c.restore();
  }
  function plaque(c, type, x, y, s, coul) { c.save(); c.fillStyle = '#9AA3AD'; c.strokeStyle = TRAIT; c.lineWidth = 2; rrect(c, x - 44 * s, y - 2 * s, 88 * s, 9 * s, 4 * s); c.fill(); c.stroke(); c.restore(); for (let k = -1; k <= 1; k++) pain(c, type, x + k * 27 * s, y - 6 * s, s * 0.78, coul); }
  function jeuFour() {
    const T = toile(), e = G.fourNouveau(), fl = [], grille = []; let anim = null, chute = null, flash = 0, temps = 0;
    const geo = () => { // de haut en bas : le four, la jauge de cuisson, la fenêtre d'enfournement, le tapis, la grille où refroidissent les fournées
      const W = T.W, H = T.H, bx = 10, bw = W - 20, porteX = bx + G.FOUR.porte * bw, oy = Math.round(H * 0.03), ow = Math.min(W * 0.74, 330), oh = Math.max(120, Math.min(ow, H * 0.45, H - 200 - oy));
      const jaugeY = oy + oh + 14, tapisY = jaugeY + 36 + Math.max(44, (H - jaugeY - 36 - 90) * 0.55), grilleY = Math.min(H - 34, tapisY + 40 + Math.max(8, (H - tapisY - 74) * 0.5));
      return { W, H, bx, bw, porteX, ox: Math.max(ow / 2 + 6, Math.min(W - ow / 2 - 6, porteX)), oy, ow, oh, jaugeY, tapisY, grilleY }; };
    const X = (g, x) => g.bx + x * g.bw;
    function toucher(ev) {
      ev.preventDefault(); d.audio(); rattraper(instant(ev)); if (e.fini) return; // la partie avance jusqu'à l'instant de la touche, puis on juge
      const g = geo(), avant = e.phase, type = e.k % 3, x = X(g, e.x), c0 = e.c, r = G.fourToucher(e); if (!r) return;
      if (r.type === 'enfournee') { anim = { de: [x, g.tapisY], t0: temps, type }; d.son.tap(); d.buzz(8); fl.push({ txt: r.parfait ? 'Pile !' : 'Enfourné', x: g.ox, y: g.tapisY - 30, t0: temps, couleur: r.parfait ? '#3FB889' : '#8C6F62', taille: 18 }); }
      else if (r.type === 'tot') { chute = { x, t0: temps, type }; d.son.non(); d.buzz(30); fl.push({ txt: 'Trop tôt !', x, y: g.tapisY - 30, t0: temps, couleur: '#E1496C' }); }
      else if (r.type === 'sortie') {
        grille.push({ type, c: c0, verdict: r.verdict }); if (grille.length > 5) grille.shift();
        const txt = { parfait: r.combo > 1 ? `Parfait ! ×${r.combo}` : 'Parfait !', bon: 'Bien doré', pale: 'Trop pâle…', brulee: 'Brûlé !' }[r.verdict];
        fl.push({ txt, x: g.ox, y: g.oy + g.oh * 0.55, t0: temps, couleur: r.verdict === 'parfait' ? '#3FB889' : r.verdict === 'bon' ? '#E0A61E' : '#E1496C', taille: r.verdict === 'parfait' ? 26 : 22 });
        if (r.verdict === 'parfait') { d.son.vente(Math.pow(10, Math.min(6, r.combo))); d.buzz(r.combo >= 3 ? [10, 30, 10] : 12); flash = temps; }
        else if (r.verdict === 'bon') { d.son.tap(); d.buzz(8); } else { d.son.non(); d.buzz(40); }
      }
      if (avant !== e.phase) majConsigne();
    }
    T.cv.addEventListener('pointerdown', toucher);
    const majConsigne = () => { consigne.textContent = e.phase === 'tapis' ? 'Touche quand la plaque passe sous le four.' : e.phase === 'four' ? 'Touche quand c’est doré !' : ''; };
    function dessiner() {
      const c = T.ctx, g = geo(), W = g.W, H = g.H; c.clearRect(0, 0, W, H);
      // le mur de faïence
      c.fillStyle = '#FFF7EC'; c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(217,204,194,.45)'; c.lineWidth = 1;
      for (let y = 0; y < g.tapisY; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = (y / 26) % 2 ? 0 : 20; x < W; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 26); c.stroke(); } }
      // le four : voûte de briques, bouche sombre, feu qui rougeoie quand il cuit
      const { ox, oy, ow, oh } = g, cuit = e.phase === 'four', lx = ox - ow / 2;
      if (lx > 54) { const px = lx * 0.45; c.save(); c.translate(px, oy + oh * 0.5); c.rotate(0.12); c.fillStyle = '#C8935F'; c.strokeStyle = TRAIT; c.lineWidth = 2; rrect(c, -4, -oh * 0.45, 8, oh * 0.7, 4); c.fill(); c.stroke(); rrect(c, -19, oh * 0.22, 38, oh * 0.28, 9); c.fillStyle = '#E9C79A'; c.fill(); c.stroke(); c.restore(); }
      c.fillStyle = '#7A655C'; rrect(c, ox + ow * 0.22, oy - 6, ow * 0.12, 22, 4); c.fill();
      c.beginPath(); c.moveTo(lx, oy + oh); c.lineTo(lx, oy + oh * 0.45); c.ellipse(ox, oy + oh * 0.45, ow / 2, oh * 0.45, 0, Math.PI, 0); c.lineTo(lx + ow, oy + oh); c.closePath();
      c.fillStyle = '#C8864F'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = TRAIT; c.stroke();
      c.save(); c.clip(); c.strokeStyle = 'rgba(168,98,31,.55)'; c.lineWidth = 2; for (let y = oy + 14, r = 0; y < oy + oh; y += 16, r++) { c.beginPath(); c.moveTo(lx, y); c.lineTo(lx + ow, y); c.stroke(); for (let x = lx + (r % 2 ? 0 : 18); x < lx + ow; x += 36) { c.beginPath(); c.moveTo(x, y - 16); c.lineTo(x, y); c.stroke(); } } c.restore();
      const mw = ow * 0.66, mh = oh * 0.5, my = oy + oh - mh;
      c.beginPath(); c.moveTo(ox - mw / 2, oy + oh); c.lineTo(ox - mw / 2, my + mh * 0.4); c.ellipse(ox, my + mh * 0.4, mw / 2, mh * 0.4, 0, Math.PI, 0); c.lineTo(ox + mw / 2, oy + oh); c.closePath();
      c.fillStyle = '#3B2F2A'; c.fill(); c.lineWidth = 2.5; c.stroke();
      c.save(); c.clip(); const lueur = c.createRadialGradient(ox, oy + oh, 4, ox, oy + oh, mw * 0.7); const fort = cuit ? 0.55 + 0.15 * Math.sin(temps * 9) : 0.18;
      lueur.addColorStop(0, `rgba(255,159,74,${fort})`); lueur.addColorStop(1, 'rgba(255,159,74,0)'); c.fillStyle = lueur; c.fillRect(ox - mw, my, mw * 2, mh);
      if (cuit && !anim) plaque(c, e.k % 3, ox, oy + oh - 12, 0.9, teinte(e.c));
      c.restore();
      c.fillStyle = '#7A655C'; rrect(c, lx - 6, oy + oh - 4, ow + 12, 12, 5); c.fill(); c.lineWidth = 2; c.strokeStyle = TRAIT; c.stroke();
      // la jauge de cuisson : pâle, doré (la zone parfaite au centre), brûlé
      const jx = lx, jw = ow, jy = g.jaugeY, jh = 18, k = (v) => jx + (v / G.FOUR.brule) * jw, tol = e.niv.tolDore;
      const gr = c.createLinearGradient(jx, 0, jx + jw, 0); TEINTES.forEach(([v]) => gr.addColorStop(v / G.FOUR.brule, teinte(v))); c.fillStyle = gr; rrect(c, jx, jy, jw, jh, 9); c.fill();
      c.globalAlpha = cuit ? 1 : 0.45;
      c.fillStyle = 'rgba(95,211,164,.35)'; c.fillRect(k(1 - tol), jy, k(1 + tol) - k(1 - tol), jh);
      c.fillStyle = 'rgba(95,211,164,.85)'; c.fillRect(k(1 - tol * 0.4), jy, k(1 + tol * 0.4) - k(1 - tol * 0.4), jh);
      c.globalAlpha = 1; c.lineWidth = 2; c.strokeStyle = TRAIT; rrect(c, jx, jy, jw, jh, 9); c.stroke();
      c.font = '700 12px Nunito, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#8C6F62'; c.fillText('pâle', jx + 22, jy + jh + 14); c.fillText('doré', k(1), jy + jh + 14); c.fillText('brûlé', jx + jw - 24, jy + jh + 14);
      if (cuit) { const nx = k(e.c); c.fillStyle = '#fff'; c.strokeStyle = TRAIT; c.lineWidth = 2; c.beginPath(); c.moveTo(nx, jy - 2); c.lineTo(nx - 7, jy - 12); c.lineTo(nx + 7, jy - 12); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(nx, jy); c.lineTo(nx, jy + jh); c.stroke(); }
      // le tapis, ses rouleaux qui tournent, et la fenêtre de la bouche du four
      const ty = g.tapisY, roule = temps * e.niv.vitesse * g.bw;
      c.fillStyle = '#7A655C'; rrect(c, g.bx - 4, ty, g.bw + 8, 22, 11); c.fill(); c.lineWidth = 2; c.strokeStyle = TRAIT; c.stroke();
      c.save(); rrect(c, g.bx - 4, ty, g.bw + 8, 22, 11); c.clip(); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 3; for (let x = g.bx - 30 + (roule % 30); x < g.bx + g.bw + 30; x += 30) { c.beginPath(); c.moveTo(x, ty + 2); c.lineTo(x - 8, ty + 20); c.stroke(); } c.restore();
      for (let x = g.bx + 12; x < g.bx + g.bw; x += 34) { c.fillStyle = '#5B4A42'; c.beginPath(); c.arc(x, ty + 28, 5, 0, Math.PI * 2); c.fill(); }
      const fx0 = X(g, G.FOUR.porte - e.niv.tolPorte), fx1 = X(g, G.FOUR.porte + e.niv.tolPorte), fp0 = X(g, G.FOUR.porte - e.niv.tolPorte * 0.4), fp1 = X(g, G.FOUR.porte + e.niv.tolPorte * 0.4);
      const haut = g.jaugeY + 40; c.fillStyle = 'rgba(255,200,74,.26)'; rrect(c, fx0, haut, fx1 - fx0, ty + 22 - haut, 8); c.fill(); c.fillStyle = 'rgba(255,200,74,.5)'; rrect(c, fp0, ty - 30, fp1 - fp0, 52, 6); c.fill();
      c.setLineDash([5, 5]); c.strokeStyle = '#E0A61E'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx0, haut + 6); c.lineTo(fx0, ty + 22); c.moveTo(fx1, haut + 6); c.lineTo(fx1, ty + 22); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#E0A61E'; const fy = Math.max(haut + 16, ty - 52); c.beginPath(); c.moveTo(g.porteX, fy); c.lineTo(g.porteX - 9, fy + 12); c.lineTo(g.porteX + 9, fy + 12); c.closePath(); c.fill();
      // la plaque sur le tapis, celle qui tombe, celle qui monte au four
      if (e.phase === 'tapis' && !e.perdue) plaque(c, e.k % 3, X(g, e.x), ty - 4, 1, teinte(0));
      if (e.phase === 'tapis' && e.perdue && !chute) plaque(c, e.k % 3, X(g, e.x), ty - 4, 1, teinte(0));
      if (chute) { const a = temps - chute.t0; if (a > 0.7) chute = null; else { c.save(); c.globalAlpha = 1 - a / 0.7; c.translate(chute.x, ty - 4 + a * a * 500); c.rotate(a * 2); plaque(c, chute.type, 0, 0, 1, teinte(0)); c.restore(); } }
      if (anim) { const a = Math.min(1, (temps - anim.t0) / 0.2); if (a >= 1) anim = null; else plaque(c, anim.type, anim.de[0] + (ox - anim.de[0]) * a, anim.de[1] - 4 + (oy + oh - 12 - anim.de[1] + 4) * a, 1 - 0.1 * a, teinte(0)); }
      // la grille : les dernières fournées sorties
      const gy = g.grilleY; c.fillStyle = '#EADFD6'; rrect(c, 14, gy, W - 28, 30, 10); c.fill(); c.strokeStyle = '#D9CCC2'; c.lineWidth = 2; for (let x = 30; x < W - 20; x += 16) { c.beginPath(); c.moveTo(x, gy + 3); c.lineTo(x, gy + 27); c.stroke(); }
      grille.forEach((p, k) => { const x = W - 50 - (grille.length - 1 - k) * ((W - 70) / 5); pain(c, p.type, x, gy + 15, 0.8, teinte(p.c)); if (p.verdict === 'parfait') { c.fillStyle = '#FFC84A'; c.font = '700 13px Fredoka, sans-serif'; c.fillText('★', x + 16, gy + 8); } });
      if (flash && temps - flash < 0.25) { c.fillStyle = `rgba(255,236,170,${0.35 * (1 - (temps - flash) / 0.25)})`; c.fillRect(0, 0, W, H); }
      for (let i = fl.length - 1; i >= 0; i--) { if (temps - fl[i].t0 > 1) fl.splice(i, 1); else texteFlottant(c, fl[i], temps); }
    }
    let phaseVue = '';
    const P = {
      redim: () => T.redim(), fin: () => T.fin(), termine: false, get score() { return e.score; },
      pas(dt) { // la logique seule, par petits pas
        temps += dt; const avant = e.phase, r = G.fourAvancer(e, dt), g = geo();
        if (r && r.type === 'passee') { d.son.non(); d.buzz(30); fl.push({ txt: 'Raté !', x: Math.min(g.W - 40, X(g, e.x)), y: g.tapisY - 30, t0: temps, couleur: '#E1496C' }); }
        if (r && r.type === 'brulee') { d.son.non(); d.buzz(40); grille.push({ type: (e.k - 1) % 3, c: G.FOUR.brule, verdict: 'brulee' }); if (grille.length > 5) grille.shift(); fl.push({ txt: 'Brûlé !', x: g.ox, y: g.oy + g.oh * 0.55, t0: temps, couleur: '#E1496C' }); }
        if (avant !== e.phase || phaseVue !== e.phase) { phaseVue = e.phase; majConsigne(); }
        if (e.fini) P.termine = true;
      },
      vue() { // l'image
        T.ajuster();
        chrono.textContent = G.fmtChrono(Math.ceil(Math.max(0, G.FOUR.duree - e.t)));
        pilules(`<span class="at-pill"><small>Score</small><b>${G.fmt(e.score)}</b></span><span class="at-pill${e.combo > 1 ? ' chaud' : ''}"><small>Combo</small><b>×${e.combo}</b></span><span class="at-pill"><small>Record</small><b>${G.fmt(G.atelierDuJour(st()).records.four)}</b></span>`);
        dessiner();
      },
      bilan: () => `${e.parfaits} cuisson${e.parfaits > 1 ? 's' : ''} parfaite${e.parfaits > 1 ? 's' : ''}, ${e.bons} bien dorée${e.bons > 1 ? 's' : ''}, ${e.rates} ratée${e.rates > 1 ? 's' : ''} · meilleur combo ×${e.comboMax}`,
      etat: () => { const g = geo(), r = T.cv.getBoundingClientRect(), [tx, ty] = T.ecran(g.porteX, g.tapisY - 60); return { jeu: 'four', phase: e.phase, x: e.x, c: e.c, perdue: e.perdue, k: e.k, t: e.t, score: e.score, combo: e.combo, comboMax: e.comboMax, parfaits: e.parfaits, rates: e.rates, porte: G.FOUR.porte, niv: e.niv, toile: { x: r.left, y: r.top, w: r.width, h: r.height }, touche: { x: tx, y: ty } }; },
    };
    entete(jeu.court, 'Enfourne, puis sors au doré', true); majConsigne(); P.pas(0); P.vue();
    return P;
  }

  // ═══ 2. Façonnage au doigt ═══
  // les pointillés de chaque trait : brun ; le second brin de la tresse en lavande (et son rond « 2 » aussi), pour qu'on sache lequel est lequel
  const TEINTES_TRAIT = { tresse: [['168,98,31', '#FFC84A'], ['122,98,220', '#B8A6FF']] };
  const teinteTrait = (m, i) => (TEINTES_TRAIT[m.id] || [])[i] || ['168,98,31', '#FFC84A'];
  function jeuFaconnage() {
    const T = toile(), ordre = G.FACONNAGE.ordre, notes = [], farine = [];
    for (let k = 0; k < 40; k++) farine.push([Math.random(), Math.random(), 0.6 + Math.random() * 1.6]);
    let forme = 0, traces = [], courant = null, reste = G.FACONNAGE.parForme, verdict = null, temps = 0, valider = 0;
    const BAS = 60; // sous le plan de travail, la place (toujours réservée) du bouton « Recommencer »
    const geo = () => { const S = Math.max(120, Math.min(T.W - 28, T.H - 46 - BAS - 8, 460)), ox = (T.W - S) / 2, oy = 46 + Math.max(0, (T.H - 46 - S - BAS) / 2); return { S, ox, oy }; };
    const versUnite = (g, x, y) => [(x - g.ox) / g.S, (y - g.oy) / g.S];
    const modele = () => G.MODELES_FACONNAGE[ordre[forme]];
    // « Recommencer » : un vrai bouton de 44 px sous le plan de travail, toujours à sa place (caché quand il n'y a rien à effacer)
    const effacer = document.createElement('button'); effacer.type = 'button'; effacer.className = 'btn clair at-effacer'; effacer.dataset.at = 'effacer'; effacer.innerHTML = '<b>Recommencer</b>'; zone.appendChild(effacer);
    effacer.addEventListener('click', () => { if (verdict || !traces.length) return; traces = []; courant = null; valider = 0; d.son.tap(); P.vue(); });
    let boutonVu = '';
    const majBouton = () => { const g = geo(), v = `${Math.round(g.oy + g.S + 16)}|${traces.length && !verdict ? 1 : 0}`; if (v === boutonVu) return; boutonVu = v; const [top, vis] = v.split('|'); effacer.style.top = top + 'px'; effacer.style.visibility = vis === '1' ? 'visible' : 'hidden'; };
    // la forme est notée dès que les tracés couvrent le modèle ; sinon, après un moment sans toucher (le doigt a pu se lever en route)
    const programmer = () => { const m = modele(); valider = traces.length >= m.traits.length ? (G.couvertureFaconnage(m.id, traces) >= G.FACONNAGE.couvert ? 0.35 : 1.5) : 0; };
    function poser(ev) {
      ev.preventDefault(); d.audio(); if (verdict || courant || P.termine) return;
      try { T.cv.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ }
      T.ajuster(); const [x, y] = T.point(ev); courant = { id: ev.pointerId, pts: [versUnite(geo(), x, y)] }; valider = 0;
    }
    function glisser(ev) { if (!courant || ev.pointerId !== courant.id) return; ev.preventDefault(); const [x, y] = T.point(ev), p = versUnite(geo(), x, y), q = courant.pts[courant.pts.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.004) courant.pts.push(p); }
    function lever(ev) {
      if (!courant || ev.pointerId !== courant.id) return;
      const t = courant.pts; courant = null;
      let L = 0; for (let k = 1; k < t.length; k++) L += Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1]);
      if (L >= G.FACONNAGE.minTrait) { traces = G.ajouterTrait(traces, t).traces; d.son.tap(); d.buzz(6); } // une simple touche ne compte pas ; un trait repris là où l'autre s'arrêtait le prolonge
      programmer();
    }
    T.cv.addEventListener('pointerdown', poser); T.cv.addEventListener('pointermove', glisser); T.cv.addEventListener('pointerup', lever); T.cv.addEventListener('pointercancel', lever);
    const majConsigne = () => { consigne.textContent = verdict ? verdict.txt : modele().consigne; };
    function noter() {
      const m = modele(), r = G.noterFaconnage(m.id, traces); notes.push(r.note);
      const defauts = [r.oublies ? `${r.oublies} trait${r.oublies > 1 ? 's' : ''} oublié${r.oublies > 1 ? 's' : ''}` : '', r.envers ? 'à l’envers' : '', r.desordre ? 'dans le désordre' : '', r.enTrop ? `${r.enTrop} trait${r.enTrop > 1 ? 's' : ''} en trop` : ''].filter(Boolean);
      const mot = r.note >= 90 ? 'Du travail de compagnon !' : r.note >= 70 ? 'Joli geste.' : r.note >= 40 ? 'Ça prend forme.' : 'La pâte a résisté…';
      verdict = { note: r.note, t0: temps, txt: `${r.note}/100 · ${mot}${defauts.length ? ' (' + defauts.join(', ') + ')' : ''}` };
      if (r.note >= 70) { d.son.vente(Math.pow(10, r.note / 20)); d.buzz([10, 30, 10]); } else if (r.note >= 40) d.son.tap(); else d.son.non();
      majConsigne();
    }
    function dessiner() {
      const c = T.ctx, g = geo(), { S, ox, oy } = g, m = modele(), W = T.W, H = T.H; c.clearRect(0, 0, W, H);
      c.fillStyle = '#FFF7EC'; c.fillRect(0, 0, W, H);
      c.fillStyle = TRAIT; c.font = '700 19px Fredoka, Nunito, sans-serif'; c.textAlign = 'center'; c.fillText(`${forme + 1}. ${m.nom}`, W / 2, oy - 18, W - 24);
      // le plan de travail en bois, fariné
      c.fillStyle = '#E9C79A'; rrect(c, ox - 8, oy - 8, S + 16, S + 16, 24); c.fill(); c.strokeStyle = '#C8935F'; c.lineWidth = 2; c.stroke();
      c.save(); rrect(c, ox - 8, oy - 8, S + 16, S + 16, 24); c.clip(); c.strokeStyle = 'rgba(168,110,60,.25)'; c.lineWidth = 1.5; for (let y = oy; y < oy + S; y += 22) { c.beginPath(); c.moveTo(ox - 8, y); c.bezierCurveTo(ox + S * 0.3, y + 6, ox + S * 0.6, y - 6, ox + S + 8, y + 3); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.7)'; farine.forEach(([x, y, r]) => { c.beginPath(); c.arc(ox + x * S, oy + y * S, r, 0, Math.PI * 2); c.fill(); }); c.restore();
      // la pâte de la forme
      c.fillStyle = '#F6E2B8'; c.strokeStyle = '#C8935F'; c.lineWidth = 2.5; c.beginPath();
      if (m.id === 'entailles') { rrect(c, ox + 0.04 * S, oy + 0.36 * S, 0.92 * S, 0.28 * S, 0.14 * S); }
      else if (m.id === 'spirale') { c.arc(ox + 0.5 * S, oy + 0.5 * S, 0.45 * S, 0, Math.PI * 2); }
      else { c.ellipse(ox + 0.5 * S, oy + 0.5 * S, 0.32 * S, 0.47 * S, 0, 0, Math.PI * 2); }
      c.fill(); c.stroke();
      if (m.id === 'spirale') { c.fillStyle = '#6B3E26'; [[0.2, 0.3], [0.78, 0.36], [0.27, 0.74], [0.7, 0.8], [0.84, 0.6], [0.14, 0.52]].forEach(([x, y]) => { c.beginPath(); c.ellipse(ox + x * S, oy + y * S, 4, 3, 0.6, 0, Math.PI * 2); c.fill(); }); }
      // le modèle : pointillés, flèches dans le sens du geste, ronds numérotés au départ de chaque trait (écartés s'ils se touchent)
      const P2 = (p) => [ox + p[0] * S, oy + p[1] * S], fini = !!verdict, ronds = [];
      m.traits.forEach((t, i) => {
        const [rgb, rond] = teinteTrait(m, i);
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = fini ? 'rgba(63,184,137,.55)' : `rgba(${rgb},.55)`; c.lineWidth = 9; c.setLineDash([1, 14]);
        c.beginPath(); t.forEach((p, k) => { const [x, y] = P2(p); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); c.restore();
        const fl = (u) => { const n = t.length - 1, k = Math.min(n - 1, Math.floor(u * n)), a = P2(t[k]), b = P2(t[k + 1]), an = Math.atan2(b[1] - a[1], b[0] - a[0]); c.save(); c.translate(a[0], a[1]); c.rotate(an); c.fillStyle = fini ? 'rgba(63,184,137,.8)' : `rgba(${rgb},.8)`; c.beginPath(); c.moveTo(8, 0); c.lineTo(-5, -6); c.lineTo(-5, 6); c.closePath(); c.fill(); c.restore(); };
        (t.length > 20 ? [0.3, 0.55, 0.8] : [0.62]).forEach(fl);
        let [sx, sy] = P2(t[0]); ronds.forEach(([x, y]) => { if (Math.hypot(sx - x, sy - y) < 24) sx += sx >= x ? 24 : -24; }); ronds.push([sx, sy]);
        c.fillStyle = rond; c.strokeStyle = TRAIT; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 11, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = TRAIT; c.font = '700 13px Fredoka, Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), sx, sy + 0.5); c.textBaseline = 'alphabetic';
      });
      // les tracés du joueur : des sillons dans la pâte
      const sillon = (pts) => { if (pts.length < 2) return; c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, k) => { const [x, y] = P2(p); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.strokeStyle = '#8B5A3C'; c.lineWidth = 8; c.stroke(); c.strokeStyle = 'rgba(255,240,210,.55)'; c.lineWidth = 2.5; c.stroke(); c.restore(); };
      traces.forEach(sillon); if (courant) sillon(courant.pts);
      if (verdict) { const a = Math.min(1, (temps - verdict.t0) / 0.2); c.save(); c.globalAlpha = a; c.font = `700 ${Math.round(S * 0.13)}px Fredoka, Nunito, sans-serif`; c.textAlign = 'right'; c.lineWidth = 7; c.strokeStyle = '#fff'; c.lineJoin = 'round'; const y = oy + S * 0.14, x = ox + S - 12; c.strokeText(String(verdict.note), x, y); c.fillStyle = verdict.note >= 70 ? '#3FB889' : verdict.note >= 40 ? '#E0A61E' : '#E1496C'; c.fillText(String(verdict.note), x, y); c.restore(); }
    }
    const P = {
      redim: () => T.redim(), fin: () => T.fin(), termine: false, get score() { return notes.reduce((a, b) => a + b, 0); },
      pas(dt) {
        temps += dt;
        if (verdict) { if (temps - verdict.t0 > 1.4) { verdict = null; forme++; traces = []; courant = null; valider = 0; reste = G.FACONNAGE.parForme; if (forme >= ordre.length) { P.termine = true; return; } majConsigne(); } }
        else { reste -= dt; if (valider > 0) { valider -= dt; if (valider <= 0) noter(); } else if (reste <= 0) { courant = null; noter(); } }
      },
      vue() {
        T.ajuster();
        chrono.textContent = G.fmtChrono(Math.ceil(Math.max(0, reste)));
        pilules(`<span class="at-pill"><small>Forme</small><b>${Math.min(forme + 1, ordre.length)}/${ordre.length}</b></span><span class="at-pill"><small>Score</small><b>${G.fmt(P.score)}</b></span><span class="at-pill"><small>Record</small><b>${G.fmt(G.atelierDuJour(st()).records.faconnage)}</b></span>`);
        dessiner(); majBouton();
      },
      bilan: () => ordre.map((id, k) => `${({ entailles: 'entailles', spirale: 'spirale', tresse: 'tresse' })[id]} ${notes[k] != null ? notes[k] : 0}/100`).join(' · '),
      // le modèle en coordonnées d'écran (celles que voit le doigt), et la toile : taille affichée et taille de son dessin
      etat: () => { const g = geo(), m = modele(), r = T.cv.getBoundingClientRect(); return { jeu: 'faconnage', forme, id: m && m.id, traces: traces.length, notes: notes.slice(), verdict: !!verdict, reste, valider, toile: { css: [r.width, r.height], dessin: [T.cv.width / T.k, T.cv.height / T.k] }, modele: m ? m.traits.map((t) => t.map((p) => T.ecran(g.ox + p[0] * g.S, g.oy + p[1] * g.S))) : [] }; },
    };
    entete(jeu.court, 'Trace le geste du modèle', true); consigne.classList.add('l2'); majConsigne(); P.vue();
    return P;
  }

  // ═══ 3. Mémoire du pâtissier ═══
  function jeuMemoire() {
    const graine = Math.floor(Math.random() * 1e9), ING = G.INGREDIENTS;
    let manche = 0, phase = 'montre', reste = 0, total = G.MEMOIRE.duree, saisie = [], recette = [], pause = 0, erreur = -1, reussies = 0;
    zone.innerHTML = `<div class="mem"><div class="mem-carte"><div class="mem-tete"><b data-m="titre"></b><small data-m="sous"></small></div><div class="mem-slots" data-m="slots"></div><i class="mem-barre"><i data-m="barre"></i></i></div>
      <div class="mem-grille" data-m="grille">${ING.map((g) => `<button type="button" class="mem-ing" data-ing="${g.id}" aria-label="${esc(g.nom)}">${ICONS.INGREDIENTS[g.id]}<span>${esc(g.nom)}</span></button>`).join('')}</div></div>`;
    const Z = (k) => zone.querySelector(`[data-m="${k}"]`), grille = Z('grille');
    function nouvelleManche() {
      recette = G.memoireRecette(graine, G.MEMOIRE.debut + manche); saisie = []; phase = 'montre'; reste = G.memoireMontre(recette.length); erreur = -1;
      Z('titre').textContent = `Recette n°${manche + 1}`; Z('sous').textContent = `${recette.length} ingrédients`;
      const n = recette.length, parLigne = n <= 5 ? n : Math.ceil(n / Math.ceil(n / 5)); // des lignes équilibrées : 6 → 3 + 3, 7 → 4 + 3
      Z('slots').dataset.n = n > 8 ? 'l' : n > 4 ? 'm' : 's'; Z('slots').style.gridTemplateColumns = `repeat(${parLigne}, auto)`; dessinerSlots(); grille.classList.add('attend'); consigne.textContent = 'Retiens la recette…';
    }
    function dessinerSlots() {
      Z('slots').innerHTML = recette.map((id, k) => { const vu = phase === 'montre' || phase === 'revele' || k < saisie.length, faux = k === erreur; return `<span class="mem-slot${vu ? ' plein' : ''}${faux ? ' faux' : ''}${phase === 'bravo' ? ' bravo' : ''}"><i>${k + 1}</i>${vu ? ICONS.INGREDIENTS[faux ? saisie[k] : id] : '<b>?</b>'}</span>`; }).join('');
    }
    grille.addEventListener('pointerdown', (ev) => {
      const b = ev.target.closest('[data-ing]'); if (!b) return; ev.preventDefault(); d.audio();
      rattraper(instant(ev)); if (phase !== 'saisie' || P.termine) return;
      saisie.push(b.dataset.ing); const r = G.memoireSaisir(recette, saisie);
      b.classList.remove('touche'); void b.offsetWidth; b.classList.add('touche'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('touche'), 220);
      if (!r.ok) { erreur = saisie.length - 1; phase = 'revele'; pause = 1.6; d.son.non(); d.buzz([30, 40, 30]); dessinerSlots(); consigne.textContent = `Raté : c’était ${ING.find((g) => g.id === recette[erreur]).nom.toLowerCase()} !`; grille.classList.add('attend'); return; }
      d.son.tap(); d.buzz(6);
      if (r.complet) { reussies++; phase = 'bravo'; pause = 0.8; d.son.vente(Math.pow(10, Math.min(6, recette.length - 2))); d.buzz([10, 30, 10]); consigne.textContent = `Recette réussie : +${recette.length} points !`; grille.classList.add('attend'); }
      dessinerSlots();
    });
    const P = {
      termine: false, get score() { return G.memoireScore(reussies); },
      pas(dt) {
        total -= dt;
        if (total <= 0 && phase !== 'revele') { P.termine = true; return; } // la minute est écoulée : la recette en cours ne compte pas
        if (phase === 'montre') { reste -= dt; if (reste <= 0) { phase = 'saisie'; dessinerSlots(); grille.classList.remove('attend'); consigne.textContent = 'À toi : les ingrédients dans l’ordre !'; Z('barre').style.width = '0%'; } }
        else if (phase === 'bravo') { pause -= dt; if (pause <= 0) { manche++; nouvelleManche(); } }
        else if (phase === 'revele') { pause -= dt; if (pause <= 0) { P.termine = true; return; } }
      },
      vue() {
        if (phase === 'montre') Z('barre').style.width = Math.max(0, reste / G.memoireMontre(recette.length) * 100) + '%';
        chrono.textContent = G.fmtChrono(Math.ceil(Math.max(0, total)));
        pilules(`<span class="at-pill"><small>Recettes</small><b>${reussies}</b></span><span class="at-pill"><small>Score</small><b>${G.fmt(P.score)}</b></span><span class="at-pill"><small>Record</small><b>${G.fmt(G.atelierDuJour(st()).records.memoire)}</b></span>`);
      },
      bilan: () => (reussies ? `${reussies} recette${reussies > 1 ? 's' : ''} réussie${reussies > 1 ? 's' : ''}, la plus longue de ${G.MEMOIRE.debut + reussies - 1} ingrédients` : 'Aucune recette réussie cette fois.'),
      etat: () => ({ jeu: 'memoire', phase, manche, recette: recette.slice(), saisie: saisie.slice(), reussies, total }),
    };
    entete(jeu.court, 'Retiens, puis remets en ordre', true); nouvelleManche(); P.vue();
    return P;
  }

  return {
    init, ouvrir, fermer, get ouvert() { return ouvert(); },
    etat: () => ({ ouvert: ouvert(), ecran, jeu: jeu && jeu.id, partie: partie && partie.etat ? partie.etat() : null, resultat }),
    teinte, reduceMotion,
  };
})();
