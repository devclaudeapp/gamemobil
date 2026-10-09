/* OPÉRATION PONCIN — l'affichage tête haute, en DOM par-dessus la 3D : viseur dynamique (s'élargit avec la dispersion, rouge sur
   une cible), marqueur de touche, chiffres de dégâts, vie et armure, munitions et anneau de recharge, chrono, score, fil des
   éliminations (« X a repeint Y »), minicarte ronde de Poncin (canvas : bâtiments, eau, rues, ta position et ton cap, les ennemis
   vus), flèches de direction des dégâts, tableau des scores, écran de fin, annonces. Rien n'est écrit dans le DOM si la valeur
   n'a pas changé ; les animations courtes (touche, chiffres, flèches) sont menées à la main, sans reflow. */
const PHUD = (() => {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NOM_ARME = { rafale: 'Blaster rafale', pompe: 'Pompe à peinture', precision: 'Long-tir' };
  const COUL_ARME = { rafale: '#FF6B8B', pompe: '#5FD3A4', precision: '#B8A6FF' };
  let racine = null, actions = {}, W = 1, H = 1, DPR = 1, tactile = false;
  let jeuVu = null, moi = null, idMoi = 'moi', tPrec = 0, px = 0, pz = 0, vitesse = 0, gonfle = 0, tMort = -1, parQui = null, armeMort = '', scoresOuverts = false, scoresT = 0, finie = false;
  const el = {}; // les éléments
  const vu = {}; // les dernières valeurs écrites
  const coupsDe = new Map(); // id → dernier tir (temps de jeu) : un tireur se trahit sur la minicarte
  let vusCache = new Map(), vusT = -1, objets = [], objetsT = -1, carteT = 0;

  // ─── icônes ───
  const SVG_ARME = {
    rafale: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M6 14h34l5-5h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9l-4-3H26l-3 11a2 2 0 0 1-2 1.5h-6a2 2 0 0 1-2-2.5l2.5-10H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z" fill="#FF6B8B" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><rect x="16" y="6" width="14" height="8" rx="3" fill="#FFC84A" stroke="#2B2A4C" stroke-width="3"/></svg>',
    pompe: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M4 15h46a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H24l-4 10a2 2 0 0 1-2 1.3h-6a2 2 0 0 1-1.8-2.8L14 25H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" fill="#5FD3A4" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><rect x="30" y="24" width="18" height="7" rx="3" fill="#FFC84A" stroke="#2B2A4C" stroke-width="3"/></svg>',
    precision: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M2 19h50l6-3h3v8h-3l-6-3H26l-5 12a2 2 0 0 1-2 1.3h-5a2 2 0 0 1-1.8-2.8L16 23H4a2 2 0 0 1-2-2z" fill="#B8A6FF" stroke="#2B2A4C" stroke-width="3" stroke-linejoin="round"/><rect x="22" y="7" width="20" height="8" rx="4" fill="#7FB3FF" stroke="#2B2A4C" stroke-width="3"/></svg>',
  };
  const SVG_COEUR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z" fill="#FF6B8B" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  const SVG_BOUCLIER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="#7FB3FF" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  const SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1.6" fill="#2B2A4C"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.6" fill="#2B2A4C"/></svg>';
  const SVG_SCORES = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#FFC84A" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8 20h8l-1-3H9z" fill="none" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  const SPLAT = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8c6 0 7 12 13 13s14-9 18-4-5 13-1 18 16 3 16 10-13 6-14 12 9 13 4 17-13-4-18 0-4 18-12 18-6-14-12-15-13 10-18 5 4-14 0-19-17-3-17-10 14-6 15-12-8-14-3-18 13 5 18 1 5-16 12-16z" fill="currentColor"/></svg>';

  // ─── construction ───
  function init(r, o) {
    racine = r; o = o || {}; actions = o.actions || o || {};
    if (!racine) return;
    racine.classList.add('hud');
    racine.innerHTML = `
      <div class="h-vignette" aria-hidden="true"></div>
      <div class="h-splat" aria-hidden="true">${SPLAT}</div>
      <div class="h-noms" aria-hidden="true">${'<span class="h-nom"></span>'.repeat(4)}</div>
      <div class="h-nombres" aria-hidden="true">${'<b class="h-nombre"></b>'.repeat(12)}</div>
      <div class="h-centre" aria-hidden="true">
        <div class="h-viseur"><i class="h-v h-v1"></i><i class="h-v h-v2"></i><i class="h-v h-v3"></i><i class="h-v h-v4"></i><i class="h-rond"></i><i class="h-point"></i></div>
        <svg class="h-recharge" viewBox="0 0 64 64"><circle class="fond" cx="32" cy="32" r="26"/><circle class="arc" cx="32" cy="32" r="26" pathLength="100"/></svg>
        <div class="h-touche"><i></i><i></i><i></i><i></i></div>
        ${'<div class="h-fleche"><i></i></div>'.repeat(4)}
        <div class="h-sous"></div>
      </div>
      <div class="h-haut">
        <div class="h-carte"><canvas></canvas><span class="h-n">N</span></div>
        <div class="h-tableau">
          <div class="h-equipe h-moi"><span class="h-pastille"></span><b>0</b></div>
          <div class="h-chrono"><b>3:00</b><small>premier à 25</small></div>
          <div class="h-equipe h-eux"><span class="h-pastille"></span><b>0</b></div>
        </div>
        <div class="h-btns">
          <button type="button" class="h-btn h-b-scores" aria-label="Tableau des scores">${SVG_SCORES}</button>
          <button type="button" class="h-btn h-b-pause" aria-label="Pause">${SVG_PAUSE}</button>
        </div>
      </div>
      <div class="h-fil" aria-live="polite"></div>
      <div class="h-annonces" aria-live="polite"><div class="h-annonce"></div></div>
      <div class="h-bas">
        <div class="h-vie">
          <div class="h-ligne h-armure-l">${SVG_BOUCLIER}<div class="h-barre armure"><i></i></div><b class="h-armure-n">0</b></div>
          <div class="h-ligne">${SVG_COEUR}<div class="h-barre vie"><i></i><em></em></div><b class="h-vie-n">100</b></div>
        </div>
        <div class="h-mun"><span class="h-arme-ico"></span><div><b class="h-mun-n">30</b><small class="h-mun-r">/ 120</small><em class="h-arme-nom">Blaster rafale</em></div></div>
      </div>
      <div class="h-ramasse"></div>
      <div class="h-mort" hidden><div class="h-mort-carte"><small>Oups !</small><b class="h-mort-par">Repeint !</b><span class="h-mort-arme"></span><div class="h-mort-retour">Retour dans <b>3</b></div></div></div>
      <div class="h-scores" hidden><div class="h-scores-carte"></div></div>
      <div class="h-fin" hidden></div>`;
    const q = (s) => racine.querySelector(s);
    Object.assign(el, {
      vignette: q('.h-vignette'), splat: q('.h-splat'), centre: q('.h-centre'), viseur: q('.h-viseur'), vs: Array.from(racine.querySelectorAll('.h-v')), rond: q('.h-rond'),
      recharge: q('.h-recharge'), rechargeArc: q('.h-recharge .arc'), touche: q('.h-touche'), fleches: Array.from(racine.querySelectorAll('.h-fleche')), sous: q('.h-sous'),
      carte: q('.h-carte canvas'), nord: q('.h-n'), chrono: q('.h-chrono b'), objectif: q('.h-chrono small'), scoreMoi: q('.h-moi b'), scoreEux: q('.h-eux b'), pastMoi: q('.h-moi .h-pastille'), pastEux: q('.h-eux .h-pastille'),
      fil: q('.h-fil'), annonce: q('.h-annonce'), vieBarre: q('.h-barre.vie i'), vieFant: q('.h-barre.vie em'), vieN: q('.h-vie-n'), armureL: q('.h-armure-l'), armureBarre: q('.h-barre.armure i'), armureN: q('.h-armure-n'), vie: q('.h-vie'),
      mun: q('.h-mun'), munN: q('.h-mun-n'), munR: q('.h-mun-r'), armeIco: q('.h-arme-ico'), armeNom: q('.h-arme-nom'), ramasse: q('.h-ramasse'),
      mort: q('.h-mort'), mortPar: q('.h-mort-par'), mortArme: q('.h-mort-arme'), mortRetour: q('.h-mort-retour b'), scores: q('.h-scores'), scoresCarte: q('.h-scores-carte'), fin: q('.h-fin'),
      noms: Array.from(racine.querySelectorAll('.h-nom')), nombres: Array.from(racine.querySelectorAll('.h-nombre')),
    });
    nombres = el.nombres.map((e) => ({ el: e, t: -1, x: 0, y: 0, z: 0, dx: 0 }));
    fleches = el.fleches.map((e) => ({ el: e, t: -1, x: 0, z: 0 }));
    noms = el.noms.map((e) => ({ el: e, id: null, txt: '', vu: false }));
    ctxCarte = el.carte.getContext('2d');
    q('.h-b-pause').addEventListener('click', () => { if (actions.pause) actions.pause(); });
    q('.h-b-scores').addEventListener('click', () => scores(!scoresOuverts));
    el.scores.addEventListener('click', () => scores(false));
    el.fin.addEventListener('click', (e) => { const b = e.target.closest('[data-fin]'); if (!b || b.disabled) return; const a = b.dataset.fin; if (typeof actions[a] === 'function') { try { actions[a](); } catch (err) { console.warn('[Poncin] fin', a, err); } } }); // rejouer, menu, salon…
    taille();
  }
  let nombres = [], fleches = [], noms = [], ctxCarte = null, tailleCarte = 112;
  function taille(w, h) {
    if (!racine) return;
    W = w || racine.clientWidth || window.innerWidth; H = h || racine.clientHeight || window.innerHeight; DPR = Math.min(2, window.devicePixelRatio || 1);
    tailleCarte = Math.round(Math.max(84, Math.min(124, H * 0.29)));
    el.carte.width = Math.round(tailleCarte * DPR); el.carte.height = Math.round(tailleCarte * DPR);
    el.carte.style.width = el.carte.style.height = tailleCarte + 'px'; el.carte.parentNode.style.width = el.carte.parentNode.style.height = tailleCarte + 'px';
    vu.ecart = -1;
  }

  // ─── la minicarte : le fond (bâtiments, eau, rues, végétation, limite de l'arène) peint une fois ───
  let fond = null, kFond = 1, Lcarte = 600, limite = null, mondeCarte = null, ox = 0, oz = 0; // (ox, oz) : le coin nord-ouest du fond, en mètres
  function carte(c, m) {
    fond = null; mondeCarte = m || null; if (!c) return;
    try {
      Lcarte = (m && m.L) || c.taille || 600;
      const a0 = c.zones && c.zones.arene; // en Arène, on ne peint que l'arène et ses abords (moins de mémoire) ; sinon tout le carré
      const cote = a0 ? Math.min(Lcarte, 2 * (a0.rayon + 80)) : Lcarte;
      ox = a0 ? a0.centre[0] - cote / 2 : -Lcarte / 2; oz = a0 ? a0.centre[1] - cote / 2 : -Lcarte / 2;
      kFond = Math.min(2.2, 1400 / cote);
      const S = Math.ceil(cote * kFond), cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const g = cv.getContext('2d'), PX = (v) => (v - ox) * kFond, PZ = (v) => (v - oz) * kFond;
      const trace = (p) => { g.beginPath(); for (let i = 0; i < p.length; i++) { const x = PX(p[i][0]), z = PZ(p[i][1]); if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.closePath(); };
      const ligne = (l) => { g.beginPath(); for (let i = 0; i < l.length; i++) { const x = PX(l[i][0]), z = PZ(l[i][1]); if (i) g.lineTo(x, z); else g.moveTo(x, z); } };
      g.fillStyle = '#D8EDC2'; g.fillRect(0, 0, S, S);
      const VEG = { bois: '#A9D79A', vigne: '#D6E7A2', pre: '#DDF0C6', jardin: '#C6E8AE' };
      for (const v of c.vegetation || []) { if (!v.p || v.p.length < 3) continue; g.fillStyle = VEG[v.t] || '#D0EAB8'; trace(v.p); g.fill(); }
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const r of c.rues || []) { if (!r.l || r.l.length < 2) continue; g.strokeStyle = '#E2D3BF'; g.lineWidth = Math.max(2.5, (r.w || 5) * kFond) + 2; ligne(r.l); g.stroke(); }
      for (const r of c.rues || []) { if (!r.l || r.l.length < 2) continue; g.strokeStyle = r.t === 'chemin' ? '#F4EBDD' : '#FFFDF8'; g.lineWidth = Math.max(2, (r.w || 5) * kFond); ligne(r.l); g.stroke(); }
      for (const e of c.eau || []) { if (!e.p || e.p.length < 3) continue; g.fillStyle = '#8DD0F2'; trace(e.p); g.fill(); g.strokeStyle = '#5DB4E2'; g.lineWidth = 1.5; g.stroke(); }
      for (const p of c.ponts || []) { if (!p.l) continue; g.strokeStyle = '#2B2A4C'; g.globalAlpha = 0.5; g.lineWidth = (p.w || 6) * kFond + 2; ligne(p.l); g.stroke(); g.globalAlpha = 1; g.strokeStyle = '#F6E7D2'; g.lineWidth = (p.w || 6) * kFond; g.stroke(); }
      const BAT = { eglise: '#FFD98A', chateau: '#D9CCFF', mairie: '#FFE2A8', tour: '#FFC9A8', commerce: '#FFD0DC', annexe: '#EBDCD0', maison: '#F7CDBE' };
      const bats = (m && m.batiments) || c.batiments || [];
      g.lineWidth = 1.4;
      for (const b of bats) { if (!b.p || b.p.length < 3) continue; g.fillStyle = BAT[b.t] || '#F7CDBE'; trace(b.p); g.fill(); g.strokeStyle = 'rgba(43,42,76,.55)'; g.stroke(); }
      for (const z of c.interdit || []) { if (!z.p || z.p.length < 3) continue; g.fillStyle = 'rgba(255,107,139,.22)'; trace(z.p); g.fill(); g.setLineDash([4, 3]); g.strokeStyle = '#E1496C'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); }
      const a = c.zones && c.zones.arene; limite = a ? { x: a.centre[0], z: a.centre[1], r: a.rayon } : null;
      if (limite) { // hors de l'arène : grisé
        g.beginPath(); g.rect(0, 0, S, S); g.arc(PX(limite.x), PZ(limite.z), limite.r * kFond, 0, TAU, true); g.fillStyle = 'rgba(43,42,76,.38)'; g.fill('evenodd');
        g.beginPath(); g.arc(PX(limite.x), PZ(limite.z), limite.r * kFond, 0, TAU); g.strokeStyle = '#FFFFFF'; g.lineWidth = 3; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
      }
      fond = cv;
    } catch (e) { fond = null; }
  }
  const RAYON_CARTE = 62; // mètres montrés du centre au bord
  function dessinerCarte(jeu) {
    const g = ctxCarte; if (!g || !moi) return;
    const S = el.carte.width, R = S / 2, s = R / RAYON_CARTE, yaw = moi.yaw || 0, c = Math.cos(yaw), sn = Math.sin(yaw);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(R, R, R - 1.5 * DPR, 0, TAU); g.clip();
    g.fillStyle = fond ? '#9C9BB3' : '#C9E3B0'; g.fillRect(0, 0, S, S); // au-delà du fond peint : le grisé du hors-arène
    if (fond) { g.translate(R, R); g.rotate(yaw); g.scale(s / kFond, s / kFond); g.translate(-(moi.x - ox) * kFond, -(moi.z - oz) * kFond); g.drawImage(fond, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); }
    // les objets à ramasser
    for (let i = 0; i < objets.length; i++) {
      const o = objets[i]; if (!o || o.dispo === false) continue;
      const u = (o.x - moi.x) * s, v = (o.z - moi.z) * s, X = R + u * c - v * sn, Y = R + u * sn + v * c;
      if ((X - R) * (X - R) + (Y - R) * (Y - R) > (R - 6 * DPR) * (R - 6 * DPR)) continue;
      g.fillStyle = o.objet === 'soin' ? '#5FD3A4' : o.objet === 'armure' ? '#7FB3FF' : COUL_ARME[o.objet] || '#FFC84A';
      g.strokeStyle = '#2B2A4C'; g.lineWidth = 1.5 * DPR; g.beginPath(); g.rect(X - 3.5 * DPR, Y - 3.5 * DPR, 7 * DPR, 7 * DPR); g.fill(); g.stroke();
    }
    // les autres : alliés toujours, ennemis s'ils sont vus ou s'ils viennent de tirer
    const es = jeu.entites, equipes = estEquipes(jeu);
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (e === moi || !e.vivant) continue;
      const allie = equipes && e.equipe === moi.equipe;
      if (!allie && !vusCache.get(e.id)) { const t = coupsDe.get(e.id); if (t == null || jeu.temps - t > 1.6) continue; }
      const u = (e.x - moi.x) * s, v = (e.z - moi.z) * s, X = R + u * c - v * sn, Y = R + u * sn + v * c;
      if ((X - R) * (X - R) + (Y - R) * (Y - R) > (R - 5 * DPR) * (R - 5 * DPR)) continue;
      g.beginPath(); g.arc(X, Y, 4.6 * DPR, 0, TAU); g.fillStyle = allie ? '#7FB3FF' : '#FF4D6D'; g.fill(); g.lineWidth = 1.8 * DPR; g.strokeStyle = '#FFFFFF'; g.stroke();
    }
    // moi : un cône de vue et une flèche vers le haut (la carte tourne avec le cap)
    g.beginPath(); g.moveTo(R, R); g.arc(R, R, R * 0.62, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); g.closePath(); g.fillStyle = 'rgba(255,255,255,.32)'; g.fill();
    g.beginPath(); g.moveTo(R, R - 8 * DPR); g.lineTo(R + 6 * DPR, R + 6 * DPR); g.lineTo(R, R + 3 * DPR); g.lineTo(R - 6 * DPR, R + 6 * DPR); g.closePath();
    g.fillStyle = moi.couleur || '#FFC84A'; g.fill(); g.lineWidth = 2 * DPR; g.strokeStyle = '#2B2A4C'; g.lineJoin = 'round'; g.stroke();
    g.restore();
    g.beginPath(); g.arc(R, R, R - 1.5 * DPR, 0, TAU); g.lineWidth = 3 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke();
    const nx = Math.sin(yaw) * (R - 9 * DPR) / DPR, ny = -Math.cos(yaw) * (R - 9 * DPR) / DPR; // le nord (-z) à l'écran
    const kN = Math.round(nx) * 1000 + Math.round(ny);
    if (kN !== vu.nord) { vu.nord = kN; el.nord.style.transform = `translate(${(R / DPR + nx).toFixed(1)}px, ${(R / DPR + ny).toFixed(1)}px) translate(-50%, -50%)`; }
  }
  function majVus(jeu) { // les ennemis en ligne de vue (une fois tous les dixièmes de seconde)
    if (jeu.temps - vusT < 0.12 && vusT >= 0) return; vusT = jeu.temps;
    const m = jeu.monde || mondeCarte, es = jeu.entites, oy = moi.y + 1.5;
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (e === moi) continue;
      let ok = false;
      if (e.vivant) { const dx = e.x - moi.x, dz = e.z - moi.z, d2 = dx * dx + dz * dz; if (d2 < 70 * 70) { try { ok = m && m.vue ? m.vue(moi.x, oy, moi.z, e.x, e.y + 1.2, e.z) : d2 < 30 * 30; } catch (err) { ok = false; } } }
      vusCache.set(e.id, ok);
    }
  }

  // ─── utilitaires ───
  function trouver(jeu, id) { const es = jeu.entites; for (let i = 0; i < es.length; i++) if (es[i].id === id) return es[i]; return null; }
  let equipesPartie = false; // donné par PUI à reinit, au cas où le jeu n'expose pas ses options
  const estEquipes = (jeu) => !!(jeu.options && jeu.options.equipes != null ? jeu.options.equipes : jeu.equipes != null ? jeu.equipes : equipesPartie);
  function duree(jeu) { const id = (jeu.mode && jeu.mode.id) || 'arene'; return (typeof PREGLES !== 'undefined' && PREGLES.MODES[id] && PREGLES.MODES[id].duree) || 180; }
  function objectif(jeu) { const id = (jeu.mode && jeu.mode.id) || 'arene'; return (typeof PREGLES !== 'undefined' && PREGLES.MODES[id] && PREGLES.MODES[id].scoreVictoire) || 25; }
  const kills = (e) => (e && e.score ? e.score.kills || 0 : 0);
  const points = (e) => (e && e.score ? e.score.points || 0 : e && e.points || 0);
  function ecrire(cle, elem, v, pre) { if (vu[cle] !== v) { vu[cle] = v; elem.textContent = pre ? pre + v : String(v); } } // le texte n'est construit que si la valeur change
  function projeter(x, y, z) { if (typeof PRENDU !== 'undefined' && PRENDU.projeter) { try { return PRENDU.projeter(x, y, z); } catch (e) { return null; } } return null; }
  function nomDe(jeu, id) { const e = trouver(jeu, id); return e ? (e.id === idMoi ? 'Toi' : e.nom) : '?'; }
  function relance(elem, cls) { elem.classList.remove(cls); void elem.offsetWidth; elem.classList.add(cls); } // relance une animation CSS (événements rares)

  // ─── les événements de l'image ───
  let toucheT = -1, toucheType = '', vignette = 0, splatT = -1, sousT = -1, ramasseT = -1;
  function lireEvenements(jeu, evs) {
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.t) {
        case 'tir': if (e.id === idMoi) gonfle = Math.min(1, gonfle + (e.arme === 'pompe' ? 0.8 : e.arme === 'precision' ? 1 : 0.22)); else coupsDe.set(e.id, jeu.temps); break;
        case 'touche':
          if (e.de === idMoi && e.a !== idMoi) {
            const nv = e.mort ? 'mort' : e.tete ? 'tete' : 'corps'; if (toucheT < 0 || jeu.temps - toucheT > 0.05 || nv === 'mort' || (nv === 'tete' && toucheType === 'corps')) toucheType = nv; toucheT = jeu.temps;
            const v = trouver(jeu, e.a); if (v) nombre(jeu, v, e.degats, e.tete, e.mort);
          } else if (e.a === idMoi) {
            vignette = Math.min(1, vignette + Math.max(0.25, (e.degats || 10) / 45));
            const de = trouver(jeu, e.de); if (de) { fleche(jeu, de); splat(de.couleur); }
          }
          break;
        case 'mort': {
          ajouterFil(jeu, e);
          if (e.par === idMoi && e.a !== idMoi) { sous(`Tu as repeint ${esc(nomDe(jeu, e.a))}`, '+' + ((typeof PREGLES !== 'undefined' && PREGLES.MODES.arene.points.kill) || 100)); }
          if (e.a === idMoi) { tMort = jeu.temps; parQui = e.par; armeMort = e.arme || ''; }
          break;
        }
        case 'reapparition': if (e.id === idMoi) { tMort = -1; vignette = 0; } break;
        case 'annonce': annonce(e.texte); break;
        case 'ramasse': if (e.id === idMoi) ramasse(e.objet); break;
      }
    }
  }
  function nombre(jeu, v, degats, tete, mort) { // un chiffre de dégâts qui monte au-dessus de la victime
    let n = nombres[0]; for (let i = 0; i < nombres.length; i++) { if (nombres[i].t < 0) { n = nombres[i]; break; } if (nombres[i].t < n.t) n = nombres[i]; }
    n.t = jeu.temps; n.x = v.x; n.y = v.y + 1.95; n.z = v.z; n.dx = (Math.random() - 0.5) * 30;
    n.el.textContent = String(Math.round(degats || 0)); n.el.className = 'h-nombre' + (mort ? ' mort' : tete ? ' tete' : '');
  }
  function fleche(jeu, de) { let f = fleches[0]; for (let i = 0; i < fleches.length; i++) { if (fleches[i].t < 0 || jeu.temps - fleches[i].t > 1.2) { f = fleches[i]; break; } if (fleches[i].t < f.t) f = fleches[i]; } f.t = jeu.temps; f.x = de.x; f.z = de.z; }
  function splat(couleur) { splatT = performance.now(); el.splat.style.color = couleur || '#FF6B8B'; const coin = (Math.random() * 2) | 0; el.splat.dataset.coin = String(coin); el.splat.style.setProperty('--r', ((Math.random() * 360) | 0) + 'deg'); }
  function sous(txt, plus) { el.sous.innerHTML = `${plus ? `<b>${esc(plus)}</b>` : ''}<span>${txt}</span>`; relance(el.sous, 'vu'); sousT = performance.now(); }
  function ramasse(o) {
    const type = typeof o === 'string' ? o : o && (o.objet || o.type || o.arme);
    const R = typeof PREGLES !== 'undefined' ? PREGLES.OBJETS[type] : null;
    const txt = type === 'soin' ? `+${R ? R.vie : 50} vie` : type === 'armure' ? `+${R ? R.armure : 50} armure` : `${NOM_ARME[type] || 'Arme'} !`;
    el.ramasse.innerHTML = `${type === 'soin' ? SVG_COEUR : type === 'armure' ? SVG_BOUCLIER : SVG_ARME[type] || ''}<span>${esc(txt)}</span>`; relance(el.ramasse, 'vu'); ramasseT = performance.now();
  }
  function ajouterFil(jeu, e) { // « X a repeint Y »
    const tueur = trouver(jeu, e.par), victime = trouver(jeu, e.a);
    const row = document.createElement('div'); row.className = 'h-fil-l' + (e.par === idMoi ? ' moi' : '') + (e.a === idMoi ? ' victime' : '');
    const nom = (e2) => `<span class="h-fil-n"><i style="background:${esc(e2 && e2.couleur || '#ccc')}"></i>${esc(e2 ? e2.nom : '?')}</span>`, ico = `<span class="h-fil-a">${SVG_ARME[e.arme] || ''}</span>`;
    row.innerHTML = !tueur || e.par === e.a ? `${nom(victime)}<span>s’est repeint tout seul</span>`
      : e.par === idMoi ? `${ico}<span>Tu as repeint</span>${nom(victime)}`
      : e.a === idMoi ? `${nom(tueur)}${ico}<span>t’a repeint</span>`
      : `${nom(tueur)}${ico}<span>a repeint</span>${nom(victime)}`; // « X a repeint Y »
    row._t = performance.now();
    el.fil.prepend(row); while (el.fil.children.length > 4) el.fil.lastChild.remove();
  }
  let annT = -1;
  function annonce(texte, cls) { if (!el.annonce || !texte) return; el.annonce.textContent = texte; el.annonce.className = 'h-annonce ' + (cls || ''); relance(el.annonce, 'vu'); annT = performance.now(); }

  // ─── la mise à jour, une fois par image ───
  function maj(jeu, id, evs, aide) {
    if (!racine || !jeu) return;
    if (jeu !== jeuVu) { jeuVu = jeu; idMoi = id; moi = trouver(jeu, id); px = moi ? moi.x : 0; pz = moi ? moi.z : 0; tPrec = +jeu.temps || 0; }
    idMoi = id; moi = trouver(jeu, id); // retrouvé à chaque image (sept entités au plus) : rien ne casse si le jeu remplace l'objet
    if (!moi) return;
    const tj = +jeu.temps || 0, now = performance.now(), dt = Math.max(0, Math.min(0.1, tj - tPrec)); tPrec = tj;
    if (evs && evs.length) lireEvenements(jeu, evs);
    // vitesse lissée (le viseur s'ouvre en courant)
    if (dt > 0) { const v = Math.sqrt((moi.x - px) * (moi.x - px) + (moi.z - pz) * (moi.z - pz)) / dt; vitesse += (Math.min(8, v) - vitesse) * Math.min(1, dt * 10); }
    px = moi.x; pz = moi.z; gonfle = Math.max(0, gonfle - dt * 3.2);
    const R = typeof PREGLES !== 'undefined' ? PREGLES : null, A = R ? R.arme(moi.arme) : { dispersion: 0.02, dispersionMouvement: 0.02, recharge: 1.6, chargeur: 30 };
    // viseur : écart = dispersion (arme + mouvement + recul) convertie en pixels avec le champ de vision vertical
    const fov = (typeof PRENDU !== 'undefined' && PRENDU.fov) || 70, pxRad = (H / 2) / Math.tan(fov * DEG / 2);
    const vmax = R ? R.JOUEUR.vitesse : 5.2, mvt = Math.min(1, vitesse / vmax) + (moi.auSol === false ? 0.6 : 0);
    const disp = A.dispersion * (moi.accroupi ? 0.7 : 1) + (A.dispersionMouvement || 0) * mvt + gonfle * (A.recul || 0.02) * 1.6;
    const ecart = Math.round(Math.max(4, Math.min(80, disp * pxRad)) * 2) / 2;
    if (ecart !== vu.ecart || moi.arme !== vu.armeV) {
      vu.ecart = ecart; vu.armeV = moi.arme; el.viseur.dataset.arme = moi.arme;
      el.viseur.style.setProperty('--e', ecart + 'px');
    }
    const cible = !!(aide && aide.surCible) && moi.vivant;
    if (cible !== vu.cible) { vu.cible = cible; el.viseur.classList.toggle('cible', cible); }
    // marqueur de touche
    const at = toucheT < 0 ? 1 : (jeu.temps - toucheT) / 0.28;
    if (at < 1) { if (vu.toucheType !== toucheType) { vu.toucheType = toucheType; el.touche.className = 'h-touche ' + toucheType; } el.touche.style.opacity = (1 - at * at).toFixed(2); el.touche.style.transform = `scale(${(toucheType === 'mort' ? 1.35 : 1.1) - at * 0.25})`; vu.toucheVis = true; }
    else if (vu.toucheVis) { vu.toucheVis = false; el.touche.style.opacity = '0'; }
    // recharge : l'anneau autour du viseur
    let p = -1; if (moi.rechargeJusqua > jeu.temps) p = 1 - (moi.rechargeJusqua - jeu.temps) / (A.recharge || 1.6);
    const pq = p < 0 ? -1 : Math.round(Math.max(0, Math.min(1, p)) * 100);
    if (pq !== vu.rech) { vu.rech = pq; el.recharge.classList.toggle('vu', pq >= 0); if (pq >= 0) el.rechargeArc.style.strokeDashoffset = String(100 - pq); }
    // vie, armure
    const vie = Math.max(0, Math.round(moi.vie || 0)), arm = Math.max(0, Math.round(moi.armure || 0)), vieMax = R ? R.JOUEUR.vie : 100, armMax = R ? R.JOUEUR.armureMax : 50;
    if (vie !== vu.vie) {
      el.vieBarre.style.transform = `scaleX(${(vie / vieMax).toFixed(3)})`; el.vieN.textContent = String(vie);
      if (vu.vie != null && vie < vu.vie) { vu.fant = Math.max(vu.fant || 0, vu.vie); vu.fantT = now; }
      el.vie.classList.toggle('bas', vie > 0 && vie <= 30); vu.vie = vie;
    }
    if (vu.fant) { const k = (now - vu.fantT) / 600; const f = k < 0.5 ? vu.fant : vie + (vu.fant - vie) * Math.max(0, 1 - (k - 0.5) * 2); el.vieFant.style.transform = `scaleX(${(f / vieMax).toFixed(3)})`; if (k > 1) { vu.fant = 0; el.vieFant.style.transform = 'scaleX(0)'; } } // la vie perdue s'efface doucement
    if (arm !== vu.arm) { vu.arm = arm; el.armureBarre.style.transform = `scaleX(${(arm / armMax).toFixed(3)})`; el.armureN.textContent = String(arm); el.armureL.classList.toggle('vide', arm <= 0); }
    const inv = (moi.invincible || 0) > 0; if (inv !== vu.inv) { vu.inv = inv; el.vie.classList.toggle('protege', inv); }
    // munitions
    const mun = moi.munitions ? moi.munitions[moi.arme] : 0, res = moi.reserve ? moi.reserve[moi.arme] : 0;
    ecrire('mun', el.munN, mun == null ? 0 : mun); ecrire('res', el.munR, moi.arme === 'rafale' ? '∞' : res == null ? 0 : res, '/ '); // le blaster rafale recharge à l'infini
    if (moi.arme !== vu.arme) { vu.arme = moi.arme; el.armeIco.innerHTML = SVG_ARME[moi.arme] || ''; el.armeNom.textContent = (R && R.arme(moi.arme).nom) || NOM_ARME[moi.arme] || ''; }
    const bas = mun != null && A.chargeur ? mun <= Math.ceil(A.chargeur * 0.25) : false; if (bas !== vu.munBas) { vu.munBas = bas; el.mun.classList.toggle('bas', bas); }
    const vide = mun === 0 && !(moi.rechargeJusqua > jeu.temps) && moi.vivant; if (vide !== vu.vide) { vu.vide = vide; el.centre.classList.toggle('vide', vide); }
    // chrono et scores
    const reste = Math.max(0, typeof jeu.reste === 'number' ? jeu.reste : duree(jeu) - (jeu.temps || 0)), sec = Math.ceil(reste);
    if (sec !== vu.sec) { vu.sec = sec; el.chrono.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; el.chrono.parentNode.classList.toggle('fin', sec <= 15); }
    majScores(jeu);
    // vignette de dégâts et vie basse
    vignette = Math.max(vie > 0 && vie <= 30 ? 0.35 + 0.12 * Math.sin(now / 260) : 0, vignette - dt * 1.4);
    const vg = Math.round(vignette * 50) / 50; if (vg !== vu.vg) { vu.vg = vg; el.vignette.style.opacity = String(vg); }
    const sk = splatT < 0 ? 1 : (now - splatT) / 900; if (sk < 1) { el.splat.style.opacity = (0.75 * (1 - sk)).toFixed(2); vu.splatVis = true; } else if (vu.splatVis) { vu.splatVis = false; el.splat.style.opacity = '0'; }
    // flèches de direction des dégâts (elles suivent ton cap)
    const cy = Math.cos(moi.yaw || 0), sy = Math.sin(moi.yaw || 0);
    for (let i = 0; i < fleches.length; i++) {
      const f = fleches[i]; if (f.t < 0) continue; const k = (jeu.temps - f.t) / 1.2;
      if (k >= 1 || k < 0) { f.t = -1; f.el.style.opacity = '0'; continue; }
      const dx = f.x - moi.x, dz = f.z - moi.z, av = -dx * sy - dz * cy, dr = dx * cy - dz * sy, ang = Math.atan2(dr, av);
      f.el.style.transform = `rotate(${(ang / DEG).toFixed(1)}deg)`; f.el.style.opacity = (1 - k * k).toFixed(2);
    }
    // chiffres de dégâts
    for (let i = 0; i < nombres.length; i++) {
      const n = nombres[i]; if (n.t < 0) continue; const k = (jeu.temps - n.t) / 0.85;
      if (k >= 1 || k < 0) { n.t = -1; n.el.style.opacity = '0'; continue; }
      const pr = projeter(n.x, n.y + k * 0.7, n.z);
      if (pr && pr.devant === false) { n.el.style.opacity = '0'; continue; }
      const nx = pr ? pr.x : W / 2 + 26, ny = pr ? pr.y : H / 2 - 30 - k * 30; // sans projection : au-dessus du viseur
      n.el.style.transform = `translate3d(${(nx + n.dx * k).toFixed(1)}px, ${ny.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3).toFixed(2)})`;
      n.el.style.opacity = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2);
    }
    // noms des alliés au-dessus des têtes
    majNoms(jeu);
    // fil : on efface les vieilles lignes
    const fil = el.fil; if (fil.lastChild && now - fil.lastChild._t > 6000) fil.lastChild.remove();
    // repeint : l'écran d'attente
    const mort = !moi.vivant && tMort >= 0;
    if (mort !== vu.mort) { vu.mort = mort; el.mort.hidden = !mort; racine.classList.toggle('mort', mort); if (mort) { el.mortPar.textContent = parQui && parQui !== idMoi ? `Repeint par ${nomDe(jeu, parQui)} !` : 'Repeint !'; el.mortArme.innerHTML = SVG_ARME[armeMort] || ''; } }
    if (mort) { const rr = Math.max(0, ((R && R.MODES.arene.reapparition) || 3) - (jeu.temps - tMort)); ecrire('retour', el.mortRetour, Math.ceil(rr)); }
    // minicarte
    if (jeu.temps - objetsT > 0.5 || objetsT < 0) { objetsT = jeu.temps; try { const M = jeu.mode && jeu.mode.objets ? jeu.mode : typeof PARENE !== 'undefined' ? PARENE : null; objets = M && M.objets ? M.objets(jeu) || [] : []; } catch (e) { objets = []; } }
    majVus(jeu); if (now - carteT > 32) { carteT = now; dessinerCarte(jeu); } // la minicarte à ~30 images/s
    if (scoresOuverts && now - scoresT > 300) remplirScores(jeu);
  }
  function majScores(jeu) {
    const es = jeu.entites, eq = estEquipes(jeu);
    let a = 0, b = 0, cB = '#FF6B8B', rang = 1;
    if (eq) { for (let i = 0; i < es.length; i++) { const e = es[i]; if (e.equipe === moi.equipe) a += kills(e); else { b += kills(e); cB = e.couleur || cB; } } }
    else { a = kills(moi); let meil = null; for (let i = 0; i < es.length; i++) { const e = es[i]; if (e === moi) continue; if (!meil || kills(e) > kills(meil)) meil = e; if (kills(e) > kills(moi) || (kills(e) === kills(moi) && points(e) > points(moi))) rang++; } b = meil ? kills(meil) : 0; cB = meil ? meil.couleur : cB; } // le rang : les repeints, puis les points (comme la fin)
    ecrire('sa', el.scoreMoi, a); ecrire('sb', el.scoreEux, b);
    const cA = moi.couleur || '#FFC84A'; if (cA !== vu.cA) { vu.cA = cA; el.pastMoi.style.background = cA; } // en équipes, la couleur de l'équipe (celle du joueur)
    if (cB !== vu.cB) { vu.cB = cB; el.pastEux.style.background = cB; }
    const cleObj = eq ? -1 : rang; if (cleObj !== vu.obj) { vu.obj = cleObj; el.objectif.textContent = `${eq ? 'équipe' : rang === 1 ? '1er' : rang + 'e'} · premier à ${objectif(jeu)}`; }
  }
  function majNoms(jeu) {
    const eq = estEquipes(jeu), es = jeu.entites; let k = 0;
    if (eq) for (let i = 0; i < es.length && k < noms.length; i++) {
      const e = es[i]; if (e === moi || !e.vivant || e.equipe !== moi.equipe) continue;
      const pr = projeter(e.x, e.y + 2.15, e.z); if (!pr || pr.devant === false) continue;
      const n = noms[k++]; if (n.txt !== e.nom) { n.txt = e.nom; n.el.textContent = e.nom; }
      n.el.style.transform = `translate3d(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px, 0) translate(-50%, -100%)`; if (!n.vu) { n.vu = true; n.el.style.opacity = '1'; }
    }
    for (; k < noms.length; k++) if (noms[k].vu) { noms[k].vu = false; noms[k].el.style.opacity = '0'; }
  }

  // ─── tableau des scores ───
  function lignes(jeu) { // les entités triées (classement du jeu s'il existe)
    let c = null; try { c = jeu.classement ? jeu.classement() : null; } catch (e) { c = null; }
    if (!Array.isArray(c) || !c.length) c = jeu.entites.slice().sort((x, y) => kills(y) - kills(x) || points(y) - points(x));
    return c.map((x) => { const e = x && x.score ? x : trouver(jeu, x && x.id) || x || {}; const s = e.score || x || {}; return { id: e.id, nom: e.id === idMoi ? (e.nom || 'Toi') : e.nom, couleur: e.couleur, equipe: e.equipe, bot: e.bot, kills: s.kills || 0, morts: s.morts || 0, points: s.points || 0 }; });
  }
  function tableHtml(jeu, ls) {
    const eq = estEquipes(jeu);
    return `<table class="h-table"><thead><tr><th></th><th>Joueur</th><th>Repeints</th><th>Subis</th><th>Points</th></tr></thead><tbody>${ls.map((l, i) => `<tr class="${l.id === idMoi ? 'moi' : ''}${eq ? (l.equipe === (moi && moi.equipe) ? ' allie' : ' ennemi') : ''}"><td>${i + 1}</td><td><i style="background:${esc(l.couleur || '#ccc')}"></i>${esc(l.nom)}${l.bot ? ' <small>robot</small>' : ''}</td><td>${l.kills}</td><td>${l.morts}</td><td><b>${l.points}</b></td></tr>`).join('')}</tbody></table>`;
  }
  function remplirScores(jeu) { scoresT = performance.now(); if (!jeu) return; el.scoresCarte.innerHTML = `<h2>Scores</h2>${tableHtml(jeu, lignes(jeu))}<p class="h-note">Touche pour fermer</p>`; }
  function scores(on) { scoresOuverts = !!on && !!jeuVu && !finie; if (!el.scores) return; el.scores.hidden = !scoresOuverts; if (scoresOuverts) remplirScores(jeuVu); if (actions.scores) actions.scores(scoresOuverts); }

  // ─── écran de fin ───
  function fin(res, jeu, id, infos) {
    if (!racine) return; finie = true; scores(false); infos = infos || {};
    jeu = jeu || jeuVu; idMoi = id || idMoi;
    let ls = []; try { ls = jeu ? lignes(jeu) : []; } catch (e) { ls = []; }
    const eq = jeu ? estEquipes(jeu) : false, me = ls.find((l) => l.id === idMoi) || { points: 0, kills: 0, morts: 0 }, rang = ls.findIndex((l) => l.id === idMoi) + 1;
    let titre, gagne;
    if (eq) { const mien = me.equipe; let a = 0, b = 0; ls.forEach((l) => { if (l.equipe === mien) a += l.kills; else b += l.kills; }); gagne = a > b; titre = a > b ? 'Victoire de ton équipe !' : a === b ? 'Égalité !' : 'Défaite… revanche ?'; }
    else { gagne = rang === 1; titre = rang === 1 ? 'Victoire !' : rang === 2 ? '2e place, presque !' : `${rang}e place`; }
    if (infos.titre) { titre = infos.titre; gagne = false; } // une partie interrompue (l'hôte est parti) : ni victoire ni place
    const podium = ls.slice(0, 3).map((l, i) => `<div class="h-pod p${i + 1}${l.id === idMoi ? ' moi' : ''}"><span class="h-pod-nom"><i style="background:${esc(l.couleur || '#ccc')}"></i>${esc(l.nom)}</span><div class="h-pod-socle"><b>${i + 1}</b><small>${l.points} pts</small></div></div>`);
    const ordre = [podium[1] || '', podium[0] || '', podium[2] || ''].join('');
    const boutons = Array.isArray(infos.boutons) && infos.boutons.length ? infos.boutons : [{ fin: 'rejouer', texte: 'Rejouer', cls: 'menthe' }, { fin: 'menu', texte: 'Menu', cls: 'blanc' }];
    el.fin.innerHTML = `<div class="h-fin-carte ${gagne ? 'gagne' : ''}">
      <div class="h-fin-g"><small>${esc(infos.mode || 'Arène')} · fin de partie</small><h2>${esc(titre)}</h2>
        ${infos.message ? `<div class="h-fin-msg">${esc(infos.message)}</div>` : ''}
        <div class="h-podium">${ordre}</div>
        <div class="h-fin-moi"><span><b>${me.points}</b> points</span><span><b>${me.kills}</b> repeints</span><span><b>${me.morts}</b> fois repeint</span></div>
        ${infos.record ? '<div class="h-record">Nouveau record !</div>' : infos.meilleur ? `<div class="h-record ancien">Record : ${infos.meilleur} points</div>` : ''}
      </div>
      <div class="h-fin-d">${tableHtml(jeu || { entites: [] }, ls.slice(0, 6))}
        ${infos.attente ? `<p class="h-fin-attente">${esc(infos.attente)}</p>` : ''}
        <div class="h-fin-btns${boutons.length > 2 ? ' trois' : ''}">${boutons.map((b) => `<button type="button" class="bouton ${esc(b.cls || 'blanc')}" data-fin="${esc(b.fin)}"${b.disabled ? ' disabled' : ''}>${esc(b.texte)}</button>`).join('')}</div></div>
    </div>`;
    el.fin.hidden = false; el.mort.hidden = true; vu.mort = false; racine.classList.add('finie'); racine.classList.remove('mort');
    return { gagne, rang, points: me.points, kills: me.kills };
  }
  function reinit(o) { // une nouvelle partie
    if (!racine) return; equipesPartie = !!(o && o.equipes);
    finie = false; jeuVu = null; moi = null; tMort = -1; parQui = null; gonfle = 0; vitesse = 0; vignette = 0; toucheT = -1; splatT = -1; objets = []; objetsT = -1; vusT = -1;
    coupsDe.clear(); vusCache.clear(); for (const k in vu) delete vu[k]; vu.ecart = -1; carteT = 0;
    racine.classList.remove('finie', 'mort'); el.fil.innerHTML = ''; el.fin.hidden = true; el.fin.innerHTML = ''; el.mort.hidden = true; el.scores.hidden = true; scoresOuverts = false;
    el.touche.style.opacity = '0'; el.splat.style.opacity = '0'; el.vignette.style.opacity = '0'; el.vieFant.style.transform = 'scaleX(0)';
    for (const n of nombres) { n.t = -1; n.el.style.opacity = '0'; } for (const f of fleches) { f.t = -1; f.el.style.opacity = '0'; } for (const n of noms) { n.vu = false; n.el.style.opacity = '0'; }
    el.annonce.classList.remove('vu'); el.sous.classList.remove('vu'); el.ramasse.classList.remove('vu');
  }
  return { init, carte, taille, maj, fin, reinit, annonce, scores, get scoresOuverts() { return scoresOuverts; }, get finie() { return finie; } };
})();
