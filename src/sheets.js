/* ŒILLETS — feuilles basses et pages (DOM) : fiche de parcelle, creuser, carnet, coopérative, retour, hivernage, garde, confirmations. */
const SHEETS = (() => {
  'use strict';
  const S = SIM, t = COPY.t, pl = COPY.pl, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const feuille = $('#feuille'), fc = $('#feuille-contenu'), page = $('#page'), pc = $('#page-contenu'), voile = $('#voile');
  let onCloseSheet = null;

  function openSheet(html, onClose) { fc.innerHTML = html; feuille.hidden = false; voile.hidden = false; feuille.scrollTop = 0; onCloseSheet = onClose || null; }
  function closeSheet() { if (feuille.hidden) return; feuille.hidden = true; voile.hidden = true; fc.innerHTML = ''; const f = onCloseSheet; onCloseSheet = null; if (f) f(); }
  function openPage(html) { pc.innerHTML = html; page.hidden = false; page.scrollTop = 0; }
  function closePage() { page.hidden = true; pc.innerHTML = ''; }
  const isOpen = () => !feuille.hidden || !page.hidden;
  voile.addEventListener('click', closeSheet);
  const on = (root, sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { UI.buzz(6); fn(el, e); }));
  const bouton = (id, txt, cls) => `<button type="button" class="btn ${cls || ''}" data-a="${id}">${txt}</button>`;
  const typeName = (type) => t('type_' + type);

  // ─── fiche de parcelle ───
  function fiche(cell) {
    const st = UI.st, env = UI.env, Sg = S.salinity(cell), kg = S.kgOf(cell.crust);
    const nom = cell.type === 'vasiere' ? t('type_vasiere').toUpperCase() : `${typeName(cell.type).toUpperCase()} ${cell.num}`;
    const alg = COPY.T.algues_etats[cell.algae < 0.15 ? 0 : cell.algae < 0.45 ? 1 : cell.algae < 0.8 ? 2 : 3];
    let lignes = '';
    if (cell.type === 'vasiere') lignes += ligne(t('fiche_vasiere', { cm: UI.fmt(cell.depth, 0), max: UI.fmt(S.maxDepth(st, cell), 0), etat: st.etierOpen ? t('etier_ouvert') : t('etier_ferme') }), '');
    else lignes += ligne(t('fiche_niveau', { cm: UI.fmt(cell.depth, 1) }), `${UI.fmt(S.TYPES[cell.type].max, 0)} cm max`);
    lignes += ligne(t('fiche_salinite', { gl: UI.fmt(Sg, 0) }), Sg >= S.P.SAT - 2 ? 'saturée' : Sg >= 220 ? 'presque' : Sg >= 150 ? 'rose' : Sg >= 80 ? 'en chemin' : 'eau jeune');
    lignes += ligne(t('fiche_temperature', { c: UI.fmt(env.T, 0) }), t('fiche_surface', { n: S.TYPES[cell.type].area, s: pl(S.TYPES[cell.type].area) }));
    lignes += ligne(t('fiche_argile', { pct: UI.fmt(cell.integ * 100, 0) }), cell.integ < 0.8 ? `<span style="color:var(--rouge)">${t('fiche_fissure')}</span>` : '');
    lignes += ligne(t('fiche_algues', { etat: alg }), cell.algae >= 0.5 ? '+25 % d’évaporation' : '');
    if (cell.type === 'oeillet') { lignes += ligne(t('fiche_sel', { kg: UI.fmt(kg, 1) }), kg > 0 ? 'glisse pour tirer' : ''); if (cell.fleur > 0.05) lignes += ligne(t('fiche_fleur', { kg: UI.fmt(cell.fleur, 2) }), st.items.lousse ? 'touche pour écumer' : t('lousse_absente')); }
    else if (kg > 1) lignes += ligne(t('fiche_croute', { kg: UI.fmt(kg, 0) }), '');
    if (cell.depth <= 0.02 && cell.dryH > 0.5) lignes += ligne(t('fiche_a_sec', { h: UI.fmt(cell.dryH, 0) }), cell.dryH > S.P.CRACK_AFTER[cell.type] ? 'l’argile fissure' : `fissures après ${S.P.CRACK_AFTER[cell.type]} h`);
    const pr = S.projection(st, env, cell);
    let proj = '';
    if (pr.kind === 'sature') proj = t('fiche_projection_saturation', { heure: UI.fmtHeure(UI.simNow() + pr.hours * 3.6e6) });
    else if (pr.kind === 'sec') proj = t('fiche_projection_sec', { h: UI.fmt(pr.hours, 0) });
    else if (pr.kind === 'tenu') proj = t('fiche_projection_stable');
    // trappes
    let trappes = '';
    for (const g of S.cellGates(st, cell)) {
      const other = g.a === cell ? g.b : g.a, open = S.gateOpen(st, g.key), fl = S.gateFlow(st, g);
      const dir = other.type === 'vasiere' ? 'N' : other.r < cell.r ? 'N' : other.r > cell.r ? 'S' : other.c < cell.c ? 'O' : 'E';
      const vers = other.type === 'vasiere' ? t('type_vasiere') : `${typeName(other.type)} ${other.num}`;
      const debit = open && fl.cmH > 0 ? `${UI.fmt(Math.min(fl.cmH, 99), 1)} cm/h vers ${fl.v === cell ? 'ici' : 'l’aval'}` : open ? 'rien ne coule' : '';
      trappes += `<li class="trappe"><span><b>${t('directions.' + dir) === 'directions.' + dir ? COPY.T.directions[dir] : ''}</b> · ${esc(vers)}<br><span class="pale">${open ? 'ouverte' : 'fermée'}${debit ? ' · ' + debit : ''}</span></span>${bouton('gate:' + g.key, open ? 'Fermer' : 'Ouvrir', 'petit ' + (open ? '' : 'jaune'))}</li>`;
    }
    const actions = [];
    if (cell.type !== 'vasiere' && cell.integ < S.P.REPAIR_BELOW) actions.push(bouton('repair', t('btn_rhabiller'), st.cash >= S.P.COST.rhabillage ? 'jaune' : ''));
    if (cell.type === 'vasiere') actions.push(bouton('etier', st.etierOpen ? 'Fermer l’étier' : 'Ouvrir l’étier', 'jaune'));
    actions.push(bouton(st.enEau ? 'lever' : 'eneau', st.enEau ? t('btn_lever_eau') : t('btn_mettre_en_eau'), ''));
    openSheet(`<p class="sur">${esc(typeName(cell.type))}${cell.type === 'oeillet' ? ' · ' + t('creuser_conseil_oeillet') : ''}</p><h2>${esc(nom)}</h2>
      ${proj ? `<p class="ital">${esc(proj)}</p>` : ''}
      <div>${lignes}</div>
      ${trappes ? `<h3>Trappes</h3><ul class="liste">${trappes}</ul>` : ''}
      <div class="rang" style="margin-top:12px">${actions.join('')}</div>${bouton('close', t('btn_fermer'), 'plein')}`, () => { UI.select(null); });
    UI.select(cell);
    on(fc, '[data-a]', (el) => {
      const a = el.dataset.a;
      if (a === 'close') closeSheet();
      else if (a.startsWith('gate:')) { S.toggleGate(st, a.slice(5)); UI.changed(); fiche(cell); }
      else if (a === 'repair') { const r = S.repair(st, cell); if (!r.ok) UI.flash(t('creuser_impossible_argent', { eur: UI.fmt(r.missing, 0) })); UI.changed(); fiche(cell); }
      else if (a === 'etier') { S.toggleEtier(st); UI.changed(); fiche(cell); }
      else if (a === 'eneau') confirm(t('mise_en_eau_confirm'), () => { S.miseEnEau(st); UI.changed(); });
      else if (a === 'lever') confirm(t('lever_eau_confirm'), () => { S.leverEau(st); UI.changed(); });
    });
  }
  const ligne = (a, b) => `<div class="ligne"><span>${a}</span><span class="pale" style="text-align:right">${b}</span></div>`;

  // ─── creuser ───
  function creuser(r, c) {
    const st = UI.st;
    let choix = '', sel = null;
    for (const type of S.DIG_TYPES) {
      const chk = S.canDig(st, r, c, type), prix = UI.fmt(chk.cost, 0);
      const raison = chk.ok ? `<span class="pourquoi conseil">${t('creuser_conseil_' + type)}</span>`
        : `<span class="pourquoi rouge">${chk.reason === 'argent' ? t('creuser_impossible_argent', { eur: UI.fmt(chk.missing, 0) }) : t('creuser_impossible_' + chk.reason)}</span>`;
      choix += `<button type="button" data-type="${type}" class="${chk.ok ? '' : 'non'}"><span class="nom">${esc(typeName(type))}</span><span class="etiquette">${prix} €</span>${raison}</button>`;
    }
    openSheet(`<p class="sur">${t('btn_creuser')}</p><h2>${t('creuser_titre', { r, c: c + 1 })}</h2><p class="pale">${t('creuser_aide')}</p>
      <div class="choix">${choix}</div>${bouton('dig', t('btn_confirmer'), 'plein')}${bouton('close', t('btn_annuler'), '')}`, () => { UI.selectFree(null); });
    UI.selectFree([r, c]);
    const digBtn = fc.querySelector('[data-a="dig"]'); digBtn.disabled = true;
    on(fc, '[data-type]', (el) => {
      if (el.classList.contains('non')) return;
      fc.querySelectorAll('[data-type]').forEach((b) => b.classList.remove('actif'));
      el.classList.add('actif'); sel = el.dataset.type; digBtn.disabled = false;
      digBtn.textContent = `${t('btn_confirmer')} · ${esc(typeName(sel))} · ${UI.fmt(S.plotCost(st, sel), 0)} €`;
    });
    on(fc, '[data-a]', (el) => {
      if (el.dataset.a === 'close') closeSheet();
      else if (el.dataset.a === 'dig' && sel) { const res = S.dig(st, r, c, sel); if (res.ok) { UI.buzz(12); UI.changed(); closeSheet(); } else UI.flash(t('creuser_impossible_' + res.reason, { eur: UI.fmt(res.missing || 0, 0) })); }
    });
  }
  function agrandir() {
    const st = UI.st, max = st.vasEnl >= S.P.VAS_MAX, prix = UI.fmt(S.plotCost(st, 'vasiere'), 0);
    openSheet(`<p class="sur">${t('type_vasiere')}</p><h2>Agrandir la vasière</h2>
      <p>${max ? t('creuser_vasiere_max') : t('creuser_vasiere', { prix })}</p>
      <p class="pale">Réserve actuelle : ${UI.fmt(S.TYPES.vasiere.max * Math.pow(1.5, st.vasEnl), 0)} cm · ${t('carnet_reserve', { jours: UI.fmt(S.reserveDays(st), 1) })}</p>
      ${max ? '' : bouton('go', `Agrandir · ${prix} €`, 'plein')}${bouton('close', t('btn_annuler'), '')}`);
    on(fc, '[data-a]', (el) => {
      if (el.dataset.a === 'close') closeSheet();
      else { const r = S.enlargeVasiere(st); if (r.ok) { UI.buzz(12); UI.changed(); closeSheet(); } else UI.flash(t('creuser_impossible_argent', { eur: UI.fmt(r.missing || 0, 0) })); }
    });
  }

  // ─── confirmation ───
  function confirm(texte, oui, labelOui) {
    openSheet(`<div class="confirm"><p>${esc(texte)}</p><div class="rang">${bouton('oui', labelOui || 'Oui', 'plein')}${bouton('non', t('btn_annuler'), '')}</div></div>`);
    on(fc, '[data-a]', (el) => { closeSheet(); if (el.dataset.a === 'oui') oui(); });
  }

  // ─── carnet ───
  function carnet(premiere) {
    const st = UI.st, now = UI.simNow(), env = UI.env;
    const hts = S.nextHighTides(now, 2), A = S.tideAmp(hts[0]);
    const etat = COPY.T.carnet_marees_etats[A > 1.0 ? 0 : A > S.P.SILL ? 1 : 2];
    const prev = UI.forecast();
    const day = S.seasonDay(st, now), rec = S.recordKgPerOeilletDay(st), best = Math.max(rec, ...st.records.map((r) => r.record));
    let obs = '';
    const list = st.carnet.slice().reverse();
    for (const o of list.slice(0, 40)) obs += `<div class="obs ${o.season < st.seasonIndex ? 'vieille' : ''}"><small>Saison ${o.season} · jour ${o.day}</small>${esc(o.text)}</div>`;
    let sacs = '';
    for (const r of st.records.slice().reverse()) sacs += sac(r);
    const dicton = COPY.DICTONS[(day + st.seasonIndex * 3) % COPY.DICTONS.length];
    const fermer = st.phase === 'play' ? (day >= 14 ? bouton('fermer', t('btn_fermer_marais'), '') : `<p class="pale">${t('carnet_fermer_trop_tot')}</p>`) : '';
    openPage(`<p class="sur canard">${t('carnet_saison', { n: st.seasonIndex, climat: COPY.T.climats[st.climate], jour: day })}</p><h2>${t('carnet_titre')}</h2>
      <p class="ital">${t('carnet_titre_jour', { jour: UI.fmtJour(now), phase: UI.lune(now) })}</p>
      ${premiere ? `<p class="ital" style="background:var(--soleil);padding:8px 10px;border:2px solid var(--encre)">${t('carnet_premiere_page', { h1: UI.fmtHeure(hts[0]), h2: UI.fmtHeure(hts[1]), prevision: prev.phrase })}</p>` : ''}
      <p>${t('carnet_marees', { h1: UI.fmtHeure(hts[0]), h2: UI.fmtHeure(hts[1]), etat })}</p>
      <p>${esc(prev.phrase)}</p>
      <p>${t('carnet_reserve', { jours: UI.fmt(S.reserveDays(st), 1) })}${env.A < 0.9 ? ' <span class="pale">Mortes-eaux.</span>' : env.A > 1.2 ? ' <span class="pale">Vives-eaux.</span>' : ''}</p>
      <p>${t('carnet_record', { kg: UI.fmt(rec, 1), best: best > 0 ? UI.fmt(best, 1) : '—' })}</p>
      <p class="ital pale">« ${esc(dicton)} »</p>
      ${UI.speed !== 1 ? `<p class="pale">Horloge accélérée ×${UI.speed} (test).</p>` : ''}
      ${fermer}
      <h3>${t('carnet_observations')}</h3>${obs || `<p class="ital pale">${t('carnet_vide')}</p>`}
      <h3>${t('carnet_saisons_passees')}</h3>${sacs ? `<div class="sacs">${sacs}</div>` : `<p class="pale">${t('coop_mur_vide')}</p>`}
      ${bouton('close', t('btn_retour'), 'plein')}`);
    pc.querySelectorAll('canvas[data-rec]').forEach((cv) => { const r = st.records[+cv.dataset.rec]; if (r) RENDER.drawThumb(cv, r, S.P.COLS); });
    on(pc, '[data-a]', (el) => {
      if (el.dataset.a === 'close') closePage();
      else if (el.dataset.a === 'fermer') confirm(t('fermer_confirm', { j: day, eur: UI.fmt(st.cash, 0) }), () => { closePage(); UI.startHivernage(false); }, t('btn_fermer_marais'));
    });
  }
  function sac(r) {
    const idx = UI.st.records.indexOf(r);
    return `<div class="sac"><span>Saison ${r.season}</span><b>${UI.fmt(r.tonnes, 1)} t</b><span>${UI.fmt(r.record, 1)} kg/œ/j</span><span class="cl">${esc(COPY.T.climats[r.climate] || r.climate)}</span><canvas data-rec="${idx}" width="84" height="${Math.max(36, r.rows * 10)}" style="width:84px;margin-top:6px"></canvas></div>`;
  }

  // ─── coopérative ───
  function coop() {
    const st = UI.st, eurGros = st.mulon * S.P.PRICE_GROS, eurFleur = st.fleurStock * S.P.PRICE_FLEUR;
    let items = '';
    for (const id of ['clapet', 'barometre', 'lousse']) {
      const owned = st.items[id], prix = S.P.COST[id];
      items += `<li><div class="trappe"><span><b class="pochoir" style="font-size:15px">${esc(COPY.T.objets[id])}</b><br><span class="pale">${t('coop_' + id)}</span></span>
        ${owned ? `<span class="etiquette">${t('coop_possede')}</span>` : bouton('buy:' + id, `${UI.fmt(prix, 0)} €`, 'petit ' + (st.cash >= prix ? 'jaune' : ''))}</div></li>`;
    }
    let sacs = '';
    for (const r of st.records.slice().reverse()) sacs += sac(r);
    openPage(`<p class="sur canard">Kerbrun</p><h2>${t('btn_cooperative')}</h2>
      <p><span class="etiquette">${t('coop_etiquette')}</span></p>
      <div style="margin:14px 0">
        ${st.mulon > 0.05 || st.fleurStock > 0.005 ? `<p class="tampon">${t('coop_vente', { kg: UI.fmt(st.mulon, 1), eur: UI.fmt(eurGros, 2) })}</p>${st.fleurStock > 0.005 ? `<p class="tampon" style="transform:rotate(1.5deg)">${t('coop_vente_fleur', { kg: UI.fmt(st.fleurStock, 2), eur: UI.fmt(eurFleur, 2) })}</p>` : ''}
          ${bouton('sell', `${t('btn_vendre')} · ${UI.fmt(eurGros + eurFleur, 2)} €`, 'plein')}` : `<p class="ital pale">${t('coop_vide')}</p>`}
      </div>
      <h3>Étagère</h3><ul class="liste">${items}<li><span class="pale">${t('coop_rhabillage')}</span></li></ul>
      <h3>Mur des sacs</h3>${sacs ? `<div class="sacs">${sacs}</div>` : `<p class="pale">${t('coop_mur_vide')}</p>`}
      ${bouton('close', t('btn_retour'), 'plein')}`);
    pc.querySelectorAll('canvas[data-rec]').forEach((cv) => { const r = st.records[+cv.dataset.rec]; if (r) RENDER.drawThumb(cv, r, S.P.COLS); });
    on(pc, '[data-a]', (el) => {
      const a = el.dataset.a;
      if (a === 'close') closePage();
      else if (a === 'sell') { const r = S.sell(st); UI.buzz([10, 30, 10]); UI.onSold(r); UI.changed(); coop(); }
      else if (a.startsWith('buy:')) { const r = S.buyItem(st, a.slice(4)); if (!r.ok) UI.flash(t('creuser_impossible_argent', { eur: UI.fmt(r.missing || 0, 0) })); else UI.buzz(12); UI.changed(); coop(); }
    });
  }

  // ─── retour d'absence ───
  function retour(rep) {
    const st = UI.st;
    const glyphes = rep.glyphs.map((g) => COPY.T.glyphes[g]).join(' ');
    let averses = t('retour_aucune_averse');
    if (rep.rains.length) {
      const det = rep.rains.slice(0, 3).map((r) => t('retour_detail_pluie', { jour: UI.fmtJourCourt(r.ms), heure: UI.fmtHeure(r.ms), kg: UI.fmt(r.kg || 0, 0) })).join(' ; ');
      averses = t('retour_averses', { n: rep.rains.length, s: pl(rep.rains.length), detail: det });
    }
    let corps = rep.enEau ? t('retour_en_eau') + ' ' : '';
    corps += t('retour_corps', { n_marees: rep.tides, s1: pl(rep.tides), averses, kg: UI.fmt(rep.kgFormed, 0), fleur: UI.fmt(rep.fleur, 1) });
    if (rep.adernePink) corps += ' ' + t('retour_ligne_aderne', { n: rep.adernePink.num });
    if (rep.oeilletDry) corps += ' ' + t('retour_ligne_sec', { n: rep.oeilletDry.num, h: UI.fmt(rep.oeilletDry.dryH, 0) });
    if (rep.hivernage) corps += ' ' + t('retour_hivernage', { tonnes: UI.fmt((st.stats.kgRaked + st.stats.kgFleur) / 1000, 1) });
    openPage(`<p class="sur canard">${t('retour_titre', { jour: UI.fmtJour(rep.fromMs) + ' ' + UI.fmtHeure(rep.fromMs) })}</p><h2>Pendant ton absence</h2>
      <p class="glyphes">${glyphes}</p><p class="ital">${esc(corps)}</p>${bouton('close', t('btn_voir_marais'), 'plein')}`);
    on(pc, '[data-a]', () => { closePage(); if (rep.hivernage) UI.startHivernage(true); });
  }

  // ─── hivernage ───
  function hivernagePage() {
    const st = UI.st, ls = st.lastSeason, rec = ls.rec;
    const perdues = ls.lost ? t('hivernage_perdues', { n: ls.lost, s: pl(ls.lost) }) : t('hivernage_aucune_perdue');
    openPage(`<p class="sur canard">${t('carnet_saison', { n: rec.season, climat: COPY.T.climats[rec.climate], jour: Math.round((rec.endMs - rec.startMs) / 864e5) })}</p><h2>${t('hivernage_titre')}</h2>
      <p class="ital">${t('hivernage_corps', { n: rec.season, climat: COPY.T.climats[rec.climate], tonnes: UI.fmt(rec.tonnes, 1), record: UI.fmt(rec.record, 1), perdues })}</p>
      <p>Vendu à la coopérative : <b>${UI.fmt(rec.eur, 0)} €</b>. Tu gardes <b>${UI.fmt(st.cash, 0)} €</b>.</p>
      <div class="sacs" style="max-width:160px">${sac(rec)}</div>
      <p class="ital" style="margin-top:14px">${t('climat_annonce', { climat: COPY.T.climats[st.nextClimate] })} <span class="pale">${esc(COPY.T.climat_effets[st.nextClimate])}</span> La commune accorde ${st.rows - 1} rangées.</p>
      ${bouton('go', t('rhabillage_titre'), 'plein')}`);
    pc.querySelectorAll('canvas[data-rec]').forEach((cv) => { const r = st.records[+cv.dataset.rec]; if (r) RENDER.drawThumb(cv, r, S.P.COLS); });
    on(pc, '[data-a]', () => { closePage(); UI.setMode('hiver'); });
  }
  function hiverBar() {
    const st = UI.st, bar = $('#hiver-bar'), probs = S.winterProblems(st);
    const types = ['cobier', 'fare', 'aderne', 'oeillet', 'vase'];
    bar.innerHTML = `<div class="compteur">${t('rhabillage_compteur', { n: st.winterBank, s: pl(st.winterBank), rows: st.rows - 1 })}</div>
      <div class="menu-types">${types.map((ty) => `<button type="button" data-ty="${ty}" class="${UI.winterType === ty ? 'actif' : ''}">${ty === 'vase' ? 'Vase' : esc(typeName(ty))}</button>`).join('')}</div>
      <p class="${probs.length ? 'rouge' : ''}">${probs.length ? t('rhabillage_probleme', { n: probs.length, s: pl(probs.length) }) : t('rhabillage_aide')}</p>
      <button type="button" class="btn plein" data-a="open" ${probs.length ? 'disabled' : ''} style="margin-top:0">${t('btn_ouvrir_saison')}</button>`;
    bar.hidden = false;
    on(bar, '[data-ty]', (el) => { UI.winterType = el.dataset.ty; hiverBar(); });
    on(bar, '[data-a="open"]', () => { if (S.winterProblems(st).length) return; S.openSeason(st, Date.now()); UI.resetClock(); bar.hidden = true; UI.setMode('play'); UI.changed(); UI.flash(t('marge_fin_journee', { heure: UI.fmtHeure(S.nextHighTides(UI.simNow(), 1)[0]) })); });
  }

  // ─── page de garde ───
  function garde() {
    const now = Date.now();
    openPage(`<div class="garde"><div><p class="sur">Carnet de paludier · ${esc(UI.fmtJour(now))}</p><h1 class="titre">${t('titre')}</h1><p class="ital" style="font-size:22px;margin-top:8px">${t('sous_titre')}</p>
      <div class="lune-ligne"><canvas id="lune-garde" width="44" height="44" style="width:44px;height:44px"></canvas><span>lune ${UI.lune(now)} · pleine mer ${UI.fmtHeure(S.nextHighTides(now, 1)[0])}</span></div></div>
      <div class="bas"><p class="ital">Tu es paludier. La mer monte deux fois par jour avec la vraie lune, le soleil évapore, et le sel ne vient que si tu comprends comment l’eau circule dans ton marais. Pas de multiplicateur, pas de minuteur : seulement la géométrie de tes bassins et ta lecture du ciel.</p>
      <p class="pale">La première journée se joue en dix minutes. Ensuite, le marais vit à l’heure réelle de ton téléphone : reviens voir la mer quand elle monte.</p>
      <button type="button" class="toucher" data-a="go">${t('garde_toucher')}</button></div></div>`);
    const cv = $('#lune-garde'), g = cv.getContext('2d'), ph = S.moonPhase(now);
    g.fillStyle = '#2A2B33'; g.beginPath(); g.arc(23, 23, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#F7C843'; g.beginPath(); const k = Math.cos(ph * Math.PI * 2);
    if (ph < 0.5) { g.arc(22, 22, 18, -Math.PI / 2, Math.PI / 2); g.ellipse(22, 22, Math.abs(k) * 18, 18, 0, Math.PI / 2, -Math.PI / 2, k < 0); } else { g.arc(22, 22, 18, Math.PI / 2, -Math.PI / 2); g.ellipse(22, 22, Math.abs(k) * 18, 18, 0, -Math.PI / 2, Math.PI / 2, k < 0); }
    g.fill();
    page.addEventListener('click', function h() { page.removeEventListener('click', h); closePage(); UI.startTutorial(); }, { once: false });
  }

  return { openSheet, closeSheet, openPage, closePage, isOpen, fiche, creuser, agrandir, confirm, carnet, coop, retour, hivernagePage, hiverBar, garde, esc };
})();
