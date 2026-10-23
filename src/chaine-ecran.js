/* LE FOURNIL — « Ma chaîne de boutiques » : l'écran (global CHAINE_ECRAN). Les règles sont dans src/chaine.js (CHAINE) : cet écran ne fait
   que les montrer et les appeler.
   - « Ma chaîne » : un écran plein, la petite planète en haut (src/planete.js, API PLANETE : une boutique par numéro, dans son quartier, à
     son standing), la liste dessous (accessible au clavier et au lecteur d'écran ; seule quand la planète est coupée : pas de 3D, ou
     PLANETE absent). Une ligne par boutique : son n°, son nom, son quartier, son standing, la jauge de la Boutique d'or (fait/max ; d'or :
     l'enseigne), « Prendre N jetons », son gérant (niveau, part, heures, « encore X h ») ou « Embaucher », sa caisse et ce qui attend.
   - La boutique des jetons : trois rayons (les gérants, les objets rares, les boosts : un par semaine).
   - Le carnet « Mes décos » : toutes les familles de collection avec leur compteur ; les décos posables se posent ou se rangent dans la
     boutique où l'on est (6 au plus) ; ce qui manque est grisé, avec comment l'obtenir. CARNET_IMAGES : les vignettes (fournil/img/carnet/).
   - Dans une boutique de la chaîne : ses cartes de recettes (sa caisse, ses niveaux, ses apprentis), ses bonus et ses meubles, son bandeau.
     Tout s'écrit par CHAINE (la vue v et la boutique compacte v.b) : jamais par GAME.acheter & co., jamais dans st à la place de la vue.
   src/ui.js le branche par init(deps) : l'état (st), l'heure du jeu, la sauvegarde, les sons, les feuilles, entrer dans une boutique. */
const CHAINE_ECRAN = (() => {
  'use strict';
  const CH = typeof CHAINE !== 'undefined' ? CHAINE : null;
  const API = { actif: !!CH, ouvert: false, init() {}, ouvrir: () => false, fermer() {}, maj() {}, jetons() {}, carnet() {}, gerant() {}, CARNET_IMAGES: {} };
  if (!CH || typeof document === 'undefined') return API;
  const G = GAME, L = '#4A3328';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const pluriel = (n, un, plus) => `${G.fmt(n)} ${n > 1 ? (plus || un + 's') : un}`;
  const jetonsTxt = (n) => pluriel(n, 'jeton');
  const pct = (a, b) => (b ? Math.min(100, a / b * 100) : 0).toFixed(0) + '%';
  let D = null; // les dépendances données par src/ui.js
  const st = () => D.st(), maintenant = () => D.maintenant();
  const ico = (id) => (typeof ICONS !== 'undefined' && ICONS.UI[id]) || '';
  const CLE = () => ico('cleChaine'), PLANETE_ICO = () => ico('planete'), GERANT_ICO = () => ico('gerant'), OR_ICO = () => ico('enseigneOr');
  const okChip = (t) => `<span class="ok"><i class="ico">${ico('coche')}</i>${esc(t)}</span>`;
  // la couleur d'une boutique : l'accent de son décor (VIE.decor, celui de la scène et de la planète)
  const accent = (q, s) => { try { const d = typeof VIE !== 'undefined' && VIE.decor ? VIE.decor(G.QUARTIERS[q], s) : null; if (d && d.accent) return d.accent; } catch (e) { /* rien */ } return '#FF6B8B'; };
  const clair = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return true; const v = parseInt(m[1], 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55; };
  const nomStanding = (s) => (G.STANDINGS && G.STANDINGS[s] ? G.STANDINGS[s].nom : '');
  // les vignettes du carnet (contrat § 4.6) : id → chemin d'une image (fournil/img/carnet/<famille>/<id>.webp, 256 px), chargée seulement à
  // l'ouverture du carnet (loading="lazy") ; sans elle, l'icône dessinée de sa famille. Ajouter une image : un fichier et une ligne ici.
  const CARNET_IMAGES = {};

  // ─── « Ma chaîne » : la planète et la liste ───
  let el = null, planete = false, choisie = 0, minuteur = 0, cleLignes = '';
  const fiches = () => CH.liste(st(), maintenant());
  function ouvrir(o) {
    if (API.ouvert) return true; o = o || {};
    D.encaisser(); // les gérants versent ce qu'ils ont gagné (idempotent : rien de plus si c'est déjà fait)
    const s = st(); if (!s.vu) s.vu = {};
    el = document.createElement('div'); el.id = 'chaine'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ch-titre');
    el.innerHTML = `<div class="at-haut ch-haut"><button type="button" class="at-fermer" data-a="fermer" aria-label="Fermer Ma chaîne"><i class="ico">${ico('fermer')}</i></button>
      <div class="at-titre"><b id="ch-titre">Ma chaîne</b><small class="ch-sous"></small></div>
      <button type="button" class="ch-jetons" data-a="jetons"><i class="ico">${CLE()}</i><b>0</b></button></div>
      <div class="ch-planete" hidden></div>
      <div class="ch-bas"><div class="ch-actions"></div><p class="ch-note" hidden></p><div class="ch-liste" role="list" aria-label="Les boutiques de ta chaîne"></div><div class="ch-cartes"></div></div>`;
    document.body.appendChild(el); API.ouvert = true; choisie = 0; cleLignes = '';
    el.addEventListener('click', clic);
    document.addEventListener('keydown', echap, true); // (en capture : une feuille ouverte par-dessus se referme seule, l'écran reste)
    const l = fiches(), zone = el.querySelector('.ch-planete');
    planete = false;
    if (typeof PLANETE !== 'undefined' && PLANETE.actif && o.planete !== false) {
      zone.hidden = false;
      try { planete = PLANETE.ouvrir(zone, l, { qualite: D.qualite(), boutiques: s.boutiques, heure: o.heure != null ? o.heure : D.heure(), onToucher: (n) => choisir(n, false), onEntrer: (n) => D.entrer(n, 'planete') }); } catch (e) { planete = false; }
      if (!planete) zone.hidden = true;
    }
    el.classList.toggle('sans-planete', !planete);
    // une fois : les anciennes boutiques rouvrent dans le quartier d'aujourd'hui (le parcours a pu changer le quartier des n°11 à 29)
    if (!s.vu.chaine && l.length) { const p = el.querySelector('.ch-note'); p.hidden = false; p.textContent = 'Tes anciennes boutiques rouvrent dans leur quartier d’aujourd’hui, chacune à son standing.'; s.vu.chaine = 1; D.save(); }
    maj(true);
    minuteur = setInterval(() => { if (API.ouvert && document.visibilityState === 'visible') majDynamique(); }, 1000);
    return true;
  }
  function fermer() {
    if (!API.ouvert) return; API.ouvert = false;
    clearInterval(minuteur); minuteur = 0; document.removeEventListener('keydown', echap, true);
    if (planete && typeof PLANETE !== 'undefined') { try { PLANETE.fermer(); } catch (e) { /* rien */ } }
    planete = false; if (el) el.remove(); el = null;
    if (D && D.ferme) D.ferme();
  }
  const echap = (e) => { const f = document.querySelector('#feuille'); if (e.key === 'Escape' && API.ouvert && (!f || f.hidden)) fermer(); };
  // tout redessiner (après une action) ; la planète reçoit les mêmes fiches (ses drapeaux, ses enseignes d'or), sans rebâtir sa géométrie
  function maj(force) {
    if (!el) return; const s = st(), r = CH.resume(s, maintenant()), l = fiches();
    el.querySelector('.ch-sous').textContent = l.length ? `${pluriel(r.boutiques, 'boutique')} · ${pluriel(r.gerants, 'gérant')}${r.or ? ` · ${pluriel(r.or, 'Boutique d’or', 'Boutiques d’or')}` : ''}` : 'Ta chaîne commence à ta 2e boutique';
    const pj = el.querySelector('.ch-jetons'); pj.querySelector('b').textContent = G.fmt(r.jetons); pj.setAttribute('aria-label', `${jetonsTxt(r.jetons)} de chaîne : la boutique des jetons`);
    el.querySelector('.ch-actions').innerHTML = `${r.aPrendre ? `<button type="button" class="btn beurre ch-tout" data-a="prendre-tout"><small>Dans tes boutiques</small><b>Prendre ${jetonsTxt(r.aPrendre)}</b></button>` : ''}
      <button type="button" class="ch-bouton" data-a="jetons"><i class="ico">${CLE()}</i><span>La boutique des jetons</span></button>
      <button type="button" class="ch-bouton" data-a="carnet"><i class="ico">${ico('decos')}</i><span>Mes décos</span></button>`;
    const cle = l.map((f) => `${f.n}|${f.nom}|${f.jetons}|${f.or}|${f.jauge.fait}/${f.jauge.max}|${f.gerant ? f.gerant.rythme + ':' + f.gerant.duree : '-'}|${G.fmtEur(f.caisse)}`).join(';') + '|' + r.prochainGerant + '|' + r.jetons;
    if (force || cle !== cleLignes) {
      cleLignes = cle; const box = el.querySelector('.ch-liste');
      box.innerHTML = l.length ? l.map((f) => ligne(f, r)).join('') : `<div class="vide"><span class="pic">${PLANETE_ICO()}</span><b>Pas encore de boutique dans ta chaîne</b><span>Ouvre ta 2e boutique : la première s’installera ici, dans son quartier, et un gérant (offert) la fera tourner pour toi.</span></div>`;
      el.querySelector('.ch-cartes').innerHTML = cartesPostales(l);
      if (planete) { try { PLANETE.maj(l); } catch (e) { /* rien */ } }
      if (choisie) marquer(choisie);
    }
    majDynamique();
  }
  // ce qui bouge chaque seconde sans redessiner la liste (un doigt posé sur un bouton ne le perd pas) : ce qui attend, le temps qui reste au gérant
  function majDynamique() {
    if (!el) return;
    for (const f of fiches()) {
      const a = el.querySelector(`[data-attente="${f.n}"]`); if (a) { const t = f.enAttente > 0 ? `+${G.fmtEur(f.enAttente)} en attente` : ''; if (a.textContent !== t) a.textContent = t; }
      const g = el.querySelector(`[data-reste="${f.n}"]`); if (g && f.gerant) { const t = f.gerant.reste > 0 ? `encore ${G.fmtDuree(f.gerant.reste)}` : 'à l’arrêt : passe le voir'; if (g.textContent !== t) g.textContent = t; }
    }
  }
  function ligne(f, r) {
    const acc = f.or ? '#FFC84A' : accent(G.QUARTIERS.findIndex((q) => q.id === f.quartier), f.standing), enc = clair(acc) ? L : '#FFFFFF';
    const j = f.jauge, ger = f.gerant;
    const jauge = f.or ? `<div class="ch-or"><i class="ico">${OR_ICO()}</i><span><b>Boutique d’or</b><small>L’enseigne dorée brille à sa porte</small></span></div>`
      : `<div class="ch-jauge"><span>Vers la Boutique d’or <b>${j.fait}/${j.max}</b></span><small>chaque recette au niveau ${j.niv}</small><i style="width:${pct(j.fait, j.max)}"></i></div>`;
    const gerant = ger ? `<div class="ch-gerant"><i class="ico">${GERANT_ICO()}</i><span><b>Un gérant la fait tourner</b><small>${Math.round(ger.part * 100)} % du rythme · ${ger.heures} h · <span data-reste="${f.n}"></span></small></span><button type="button" class="btn lavande" data-a="gerant" data-n="${f.n}"><small>Gérant</small><b>Améliorer</b></button></div>`
      : `<div class="ch-gerant sans"><i class="ico">${GERANT_ICO()}</i><span><b>Pas de gérant</b><small>Sans toi, la boutique ne vend rien</small></span><button type="button" class="btn ${r.prochainGerant === 0 || r.jetons >= r.prochainGerant ? 'beurre' : 'non'}" data-a="embaucher-gerant" data-n="${f.n}"><small>Embaucher</small><b>${r.prochainGerant ? jetonsTxt(r.prochainGerant) : 'Offert'}</b></button></div>`;
    return `<article class="ch-ligne${f.or ? ' or' : ''}" role="listitem" data-n="${f.n}" style="--acc:${acc};--enc:${enc}">
      <div class="ch-tete"><b class="ch-num" aria-hidden="true">${f.n}</b><div class="ch-nom"><h3>${esc(f.nom)}</h3><small>${esc(capital(f.quartierNom))} · ${esc(nomStanding(f.standing))}</small></div>
        <button type="button" class="btn ch-entrer" data-a="entrer" data-n="${f.n}" aria-label="Entrer dans la boutique n°${f.n}"><b>Entrer</b></button></div>
      ${jauge}
      <div class="ch-caisse"><span>Caisse <b>${G.fmtEur(f.caisse)}</b></span><small data-attente="${f.n}"></small></div>
      ${gerant}
      ${f.jetons ? `<button type="button" class="btn beurre ch-prendre" data-a="prendre" data-n="${f.n}"><small>${f.or ? 'Paliers et paquet de la Boutique d’or' : 'Paliers franchis'}</small><b>Prendre ${jetonsTxt(f.jetons)}</b></button>` : ''}
    </article>`;
  }
  // les cartes postales : une par quartier où la chaîne a une boutique, prise sur la planète (PLANETE.photo) et rangée au carnet
  function cartesPostales(l) {
    if (!planete) return '';
    const c = CH.etat(st()), prises = Array.isArray(c.cartes) ? c.cartes : [], qs = [...new Set(l.map((f) => f.quartier))];
    if (!qs.length) return '';
    return `<h3 class="titre-section"><span>Cartes postales</span><span class="pts">${prises.length}/${G.QUARTIERS.length}</span></h3>
      <div class="ch-postales">${qs.map((id) => { const q = G.QUARTIERS.find((x) => x.id === id); return `<button type="button" class="ch-postale${prises.includes(id) ? ' prise' : ''}" data-a="carte" data-q="${id}"><i class="ico">${ico('photo')}</i><span>${esc(capital(q.nom))}</span>${prises.includes(id) ? `<i class="ico ok">${ico('coche')}</i>` : ''}</button>`; }).join('')}</div>`;
  }
  function marquer(n) { if (!el) return; el.querySelectorAll('.ch-ligne').forEach((x) => x.classList.toggle('choisie', +x.dataset.n === n)); }
  // une boutique touchée sur la planète : sa ligne s'éclaire et vient se montrer sous la planète ; touchée dans la liste : la planète la vise
  function choisir(n, viser) {
    choisie = n; marquer(n);
    const x = el && el.querySelector(`.ch-ligne[data-n="${n}"]`); if (x) { const box = el.querySelector('.ch-bas'); box.scrollTo({ top: Math.max(0, x.offsetTop - box.offsetTop - 8), behavior: D.reduit ? 'auto' : 'smooth' }); }
    if (viser && planete) { try { PLANETE.viser(n); } catch (e) { /* rien */ } }
  }
  function clic(e) {
    const b = e.target.closest('[data-a]'); if (!b || !el || !el.contains(b)) { const li = e.target.closest('.ch-ligne'); if (li) choisir(+li.dataset.n, true); return; }
    D.audio(); const a = b.dataset.a, n = +b.dataset.n || 0, s = st();
    if (a === 'fermer') { D.son.tap(); fermer(); return; }
    if (a === 'entrer') { D.son.tap(); D.entrer(n, 'liste'); return; }
    if (a === 'jetons') { D.son.tap(); boutiqueJetons(); return; }
    if (a === 'carnet') { D.son.tap(); carnet({ cible: 0 }); return; }
    if (a === 'gerant') { D.son.tap(); sheetGerant(n); return; }
    if (a === 'embaucher-gerant') { embaucherGerant(n, () => maj()); return; }
    if (a === 'prendre') { const k = CH.prendreJetons(s, n); if (k) { D.son.pieces(); D.buzz([8, 30, 8]); D.toast(`+${jetonsTxt(k)} de chaîne`); D.save(); maj(); D.rafraichir(); } return; }
    if (a === 'prendre-tout') { const k = CH.prendreTout(s); if (k) { D.son.pieces(); D.buzz([10, 30, 10]); D.toast(`+${jetonsTxt(k)} de chaîne, pris dans tes boutiques`); D.save(); maj(); D.rafraichir(); } return; }
    if (a === 'carte') { D.son.tap(); cartePostale(b.dataset.q); }
  }
  function cartePostale(id) {
    if (!planete) return; const q = G.QUARTIERS.find((x) => x.id === id); if (!q) return;
    PLANETE.photo(id).then((url) => {
      if (!url) { D.toast('La photo n’a pas pu se faire.'); return; }
      const c = CH.etat(st()), neuve = !(Array.isArray(c.cartes) && c.cartes.includes(id));
      if (!Array.isArray(c.cartes)) c.cartes = []; if (neuve) { c.cartes.push(id); D.save(); }
      D.openSheet(`<h2>Carte postale</h2><p class="sous">${esc(capital(q.nom))}, vu de ta petite planète.${neuve ? ' Elle rejoint ton carnet.' : ''}</p>
        <img class="ch-photo" src="${url}" alt="La carte postale de ${esc(q.nom)} : sa région de la petite planète, vue de près">
        <button type="button" class="btn large menthe" data-a="close" style="margin-top:14px"><b>${neuve ? 'Dans le carnet !' : 'Retour'}</b></button>`);
      D.on('[data-a="close"]', D.closeSheet);
      if (neuve) { D.son.deblocage(); maj(true); }
    }).catch(() => D.toast('La photo n’a pas pu se faire.'));
  }

  // ─── les gérants (la ligne d'une boutique, et le rayon de la boutique des jetons) ───
  function embaucherGerant(n, apres) {
    const s = st(), r = CH.embaucherGerant(s, n, maintenant());
    if (!r.ok) { D.son.non(); D.toast(r.raison === 'jetons' ? `Il manque ${jetonsTxt(r.prix - CH.etat(s).jetons)} de chaîne.` : 'Cette boutique a déjà son gérant.'); return false; }
    D.son.embauche(); D.buzz([10, 30, 10]); D.toast(`Boutique n°${n} : un gérant la fait tourner pour toi${r.prix ? '' : ' (le premier est offert)'} !`); D.save(); if (apres) apres(); D.rafraichir(); return true;
  }
  function ameliorerGerant(n, quoi, apres) {
    const s = st(), r = CH.ameliorerGerant(s, n, quoi);
    if (!r.ok) { D.son.non(); D.toast(r.raison === 'jetons' ? `Il manque ${jetonsTxt(r.prix - CH.etat(s).jetons)} de chaîne.` : r.raison === 'max' ? 'Déjà au maximum.' : 'Pas de gérant ici.'); return false; }
    D.son.achat(); D.buzz(8); D.toast(quoi === 'duree' ? `Le gérant de la n°${n} reste ${CH.GERANT.heures[r.niveau]} h` : `Le gérant de la n°${n} : ${Math.round(CH.GERANT.part[r.niveau] * 100)} % du rythme`); D.save(); if (apres) apres(); D.rafraichir(); return true;
  }
  const crans = (k, max) => `<span class="crans" aria-label="niveau ${k} sur ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</span>`;
  function blocGerant(f, r, court) { // les deux réglages d'un gérant, avec leur prix en jetons (court : le rayon de la boutique des jetons, une ligne par boutique)
    const R = CH.GERANT, ger = f.gerant;
    if (!ger) return `<div class="am"><div><h3>${court ? 'Pas encore de gérant' : 'Embaucher un gérant'}</h3><p>${court ? `${Math.round(R.part[0] * 100)} % du rythme, ${R.heures[0]} h au plus` : `Il fait tourner la boutique quand tu n’y es pas : ${Math.round(R.part[0] * 100)} % de son rythme, ${R.heures[0]} h au plus par absence. Ce qu’il gagne reste dans sa caisse.`}</p></div><button type="button" class="btn ${r.prochainGerant === 0 || r.jetons >= r.prochainGerant ? 'beurre' : 'non'}" data-g="embaucher" data-n="${f.n}"><small>Embaucher</small><b>${r.prochainGerant ? jetonsTxt(r.prochainGerant) : 'Offert'}</b></button></div>`;
    const pr = ger.rythme < R.prixRythme.length ? R.prixRythme[ger.rythme] : 0, pd = ger.duree < R.prixDuree.length ? R.prixDuree[ger.duree] : 0;
    return `<div class="am ${pr ? '' : 'fait'}"><div><h3>Son rythme ${crans(ger.rythme, R.prixRythme.length)}</h3><p>${Math.round(R.part[ger.rythme] * 100)} % du rythme de la boutique${pr ? `<br><em>Niveau suivant : ${Math.round(R.part[ger.rythme + 1] * 100)} %</em>` : ''}</p></div>${pr ? `<button type="button" class="btn ${r.jetons >= pr ? 'lavande' : 'non'}" data-g="rythme" data-n="${f.n}"><small>Améliorer</small><b>${jetonsTxt(pr)}</b></button>` : okChip('Au max')}</div>
      <div class="am ${pd ? '' : 'fait'}"><div><h3>Ses heures ${crans(ger.duree, R.prixDuree.length)}</h3><p>${ger.heures} h au plus quand tu n’es pas là${pd ? `<br><em>Niveau suivant : ${R.heures[ger.duree + 1]} h</em>` : ''}</p></div>${pd ? `<button type="button" class="btn ${r.jetons >= pd ? 'lavande' : 'non'}" data-g="duree" data-n="${f.n}"><small>Allonger</small><b>${jetonsTxt(pd)}</b></button>` : okChip('Au max')}</div>`;
  }
  function lierGerants(apres) {
    D.on('[data-g]', (b) => { const n = +b.dataset.n, g = b.dataset.g; if (g === 'embaucher') embaucherGerant(n, apres); else ameliorerGerant(n, g, apres); });
  }
  function sheetGerant(n) {
    const s = st(), f = fiches().find((x) => x.n === n); if (!f) return; const r = CH.resume(s, maintenant());
    D.openSheet(`<div class="ch-fiche-tete"><i class="ico">${GERANT_ICO()}</i><div><h2>Le gérant</h2><p class="sous">${esc(f.nom)} · boutique n°${n}</p></div><span class="ch-solde"><i class="ico">${CLE()}</i>${G.fmt(r.jetons)}</span></div>
      <div class="encadre doux">Il vend pour toi pendant ton absence, sur l’heure du jeu, et ses gains restent dans la caisse de sa boutique. Quand tu joues dans la boutique, c’est toi qui la fais tourner : il se repose.</div>
      <div class="liste-am" style="margin-top:12px">${blocGerant(f, r)}</div>
      <button type="button" class="btn large sombre" data-a="close" style="margin-top:14px"><b>Retour</b></button>`);
    D.on('[data-a="close"]', D.closeSheet); lierGerants(() => { maj(); sheetGerant(n); });
  }

  // ─── la boutique des jetons : gérants, objets rares, boosts (un par semaine) ───
  let rayon = 'gerants';
  function boutiqueJetons(r_) {
    if (r_) rayon = r_;
    const s = st(), c = CH.etat(s), r = CH.resume(s, maintenant()), l = fiches();
    const seg = (id, t) => `<button type="button" role="tab" data-r="${id}" aria-selected="${rayon === id}" class="${rayon === id ? 'actif' : ''}">${t}</button>`;
    let corps = '';
    if (rayon === 'gerants') {
      corps = l.length ? `<p class="sous">Le premier gérant est offert, puis ${CH.prixGerant(1)}, ${CH.prixGerant(2)}, ${CH.prixGerant(3)}… jusqu’à ${CH.prixGerant(99)} jetons. Le prochain : <b>${r.prochainGerant ? jetonsTxt(r.prochainGerant) : 'offert'}</b>.</p>
        <div class="liste-am">${l.map((f) => `<h3 class="titre-section ch-sec"><span>N°${f.n} · ${esc(f.nom)}</span>${f.gerant ? `<span class="pts">${Math.round(f.gerant.part * 100)} % · ${f.gerant.heures} h</span>` : ''}</h3>${blocGerant(f, r, true)}`).join('')}</div>`
        : '<div class="vide"><b>Pas encore de boutique dans ta chaîne</b><span>Ta 2e boutique fera de la 1re la première de ta chaîne.</span></div>';
    } else if (rayon === 'objets') {
      const fam = { deco: 'Déco · dans Mes décos', tenue: 'Tenue · sans bonus', compagnon: 'Compagnon · sans bonus' };
      corps = `<p class="sous">Des objets rares pour le plaisir : aucun ne fait gagner plus à la boulangerie.</p><div class="liste-am">${CH.OBJETS.map((o) => {
        const a = c.objets.includes(o.id);
        return `<div class="am ${a ? 'fait' : ''}"><div><h3>${esc(o.nom)}</h3><p>${esc(o.desc)}<br><em>${fam[o.famille] || ''}</em></p></div>${a ? okChip(o.famille === 'deco' ? 'Au carnet' : 'À toi') : `<button type="button" class="btn ${c.jetons >= o.prix ? 'lavande' : 'non'}" data-o="${o.id}"><small>Acheter</small><b>${jetonsTxt(o.prix)}</b></button>`}</div>`;
      }).join('')}</div>`;
    } else {
      const reste = CH.boostsRestants(s, maintenant());
      corps = `<p class="sous">Un boost par semaine (du lundi au dimanche), rangé dans la réserve de ta boulangerie : tu le lances quand tu veux.</p>
        <div class="liste-am">${CH.BOOSTS.map((o) => `<div class="am ${reste ? '' : 'fait'}"><div><h3>${esc(o.nom)}</h3><p>Toute la boulangerie ×${o.mult} pendant ${G.fmtDuree(o.secs)}.</p></div>${reste ? `<button type="button" class="btn ${c.jetons >= o.prix ? 'beurre' : 'non'}" data-b="${o.id}"><small>1 cette semaine</small><b>${jetonsTxt(o.prix)}</b></button>` : '<span class="ok gris">Pris cette semaine</span>'}</div>`).join('')}</div>
        ${reste ? '' : '<p class="note">Le prochain boost se prend lundi.</p>'}`;
    }
    D.openSheet(`<div class="ch-fiche-tete"><i class="ico">${CLE()}</i><div><h2>La boutique des jetons</h2><p class="sous">Les jetons de chaîne se gagnent dans tes boutiques : un par palier de recette, un paquet à chaque Boutique d’or.</p></div></div>
      <div class="ch-solde-l"><span class="ch-solde grand"><i class="ico">${CLE()}</i>${G.fmt(c.jetons)}<small>${c.jetons > 1 ? 'jetons de chaîne' : 'jeton de chaîne'}</small></span>${r.aPrendre ? `<button type="button" class="btn beurre" data-a="prendre-tout"><small>À prendre</small><b>+${G.fmt(r.aPrendre)}</b></button>` : ''}</div>
      <div class="segments" role="tablist">${seg('gerants', 'Gérants')}${seg('objets', 'Objets rares')}${seg('boosts', 'Boosts')}</div>
      ${corps}<button type="button" class="btn large sombre" data-a="close" style="margin-top:14px"><b>Retour</b></button>`);
    D.on('[data-a="close"]', D.closeSheet);
    D.on('[data-r]', (b) => { D.son.tap(); boutiqueJetons(b.dataset.r); });
    D.on('[data-a="prendre-tout"]', () => { const k = CH.prendreTout(st()); if (k) { D.son.pieces(); D.toast(`+${jetonsTxt(k)} de chaîne`); D.save(); maj(); D.rafraichir(); } boutiqueJetons(); });
    lierGerants(() => { maj(); boutiqueJetons(); });
    D.on('[data-o]', (b) => {
      const res = CH.acheterObjet(st(), b.dataset.o);
      if (!res.ok) { D.son.non(); D.toast(res.raison === 'jetons' ? `Il manque ${jetonsTxt(res.prix - CH.etat(st()).jetons)} de chaîne.` : 'Tu l’as déjà.'); return; }
      D.son.deblocage(); D.buzz([10, 30, 10]); D.confettis(0.6);
      D.toast(res.objet.famille === 'deco' ? `${res.objet.nom} : pose-la depuis « Mes décos ».` : res.objet.famille === 'tenue' ? `${res.objet.nom} : dans ta garde-robe.` : `${res.objet.nom} : un nouveau compagnon !`);
      D.save(); maj(); D.rafraichir(); boutiqueJetons();
    });
    D.on('[data-b]', (b) => {
      const res = CH.acheterBoost(st(), b.dataset.b, maintenant());
      if (!res.ok) { D.son.non(); D.toast(res.raison === 'semaine' ? 'Un boost par semaine : le prochain, lundi.' : `Il manque ${jetonsTxt(res.prix - CH.etat(st()).jetons)} de chaîne.`); return; }
      D.son.deblocage(); D.buzz([10, 30, 10]); D.toast(`${res.boost.nom} : dans ta réserve. Lance-le quand tu veux !`); D.save(); maj(); D.rafraichir(); boutiqueJetons();
    });
  }

  // ─── le carnet « Mes décos » ───
  // cible : 0 = la boulangerie (st.decos = { v: 1, d: code } ; absent : le plan d'origine), n = la boutique n° de la chaîne (CHAINE.poser)
  const PLACES_NOM = { m1: 'au mur, le cadre', m2: 'au-dessus de l’étagère', m3: 'la porte du fond', m4: 'entre l’horloge et le diplôme', s1: 'le coin déco', s2: 'la place du sapin', s3: 'le coin de la porte',
    c1: 'le comptoir, aux fleurs', c2: 'le comptoir, à la recette', r1: 'la fenêtre, à gauche', r2: 'la fenêtre, à droite', x1: 'le trottoir' };
  const TYPES = { mur: 'au mur', sol: 'au sol', comptoir: 'sur le comptoir', rebord: 'sur la fenêtre', dehors: 'dehors' };
  const A_VENIR = [['feves', 'Les fèves', 'En janvier, avec la galette'], ['rares', 'Les recettes rares', 'Le livre de recettes'], ['apprentis', 'Les apprentis rares', 'Des apprentis à rareté']];
  let carnetEtat = { cible: 0, choix: '', ouvertes: {} };
  const ext = () => (D.recompenses ? D.recompenses() : null) || { coupes: [], badge: false };
  const casino = () => (typeof CASINO !== 'undefined' ? CASINO : null);
  // les décos posées dans une boutique (null : la boulangerie au plan d'origine)
  function posesDe(cible) {
    const s = st();
    if (cible) { const b = CH.boutique(s, cible); return b ? CH.posesDe(b) : []; }
    const d = s.decos && typeof s.decos === 'object' && typeof s.decos.d === 'string' ? CH.decosDepuisCode(s.decos.d) : null;
    return d || null;
  }
  // le plan d'origine de la boulangerie mis en disposition (la première fois qu'on pose ou range) : ses décos gagnées, chacune à la
  // première place libre de son type, 6 au plus (la scène les montrait à leurs places d'aujourd'hui)
  function depuisOrigine(familles) {
    const out = [];
    for (const f of familles) { if (!['quartier', 'hantee', 'podium'].includes(f.id)) continue; for (const x of f.items) { if (!x.gagne || !x.place) continue; const p = CH.PLACES.find((q) => q.type === x.place && !out.some((o) => o[1] === q.id)); if (p && out.length < CH.DECOS_MAX) out.push([x.id, p.id]); } }
    return CH.nettoyerPoses(out);
  }
  function poserListe(cible, l) {
    const s = st();
    if (cible) CH.poser(s, cible, l);
    else if (l === null) delete s.decos;
    else s.decos = { v: 1, d: CH.codeDecos(l) };
    D.save(); if (D.decosChangees) D.decosChangees(cible);
  }
  const qualite = () => (D.qualite ? D.qualite() : 'eco');
  function carnet(o) {
    if (o) carnetEtat = { cible: o.cible || 0, choix: '', ouvertes: carnetEtat.ouvertes || {} };
    const s = st(), cible = carnetEtat.cible, b = cible ? CH.boutique(s, cible) : null;
    if (cible && !b) return;
    const fam = CH.carnet(s, ext(), casino()), poses = posesDe(cible), liste = poses || depuisOrigine(fam), origine = !poses && !cible;
    const places = new Set(liste.map((x) => x[1]));
    const total = fam.reduce((k, f) => k + f.total, 0), gagnes = fam.reduce((k, f) => k + f.gagnes, 0);
    const vignette = (f, x) => { const src = CARNET_IMAGES[x.id]; return `<span class="cn-vig cn-${f.id}${x.gagne ? '' : ' gris'}">${src && x.gagne ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : `<i class="ico">${iconeCarnet(f.id, x.id)}</i>`}</span>`; };
    const objet = (f, x) => {
      if (!f.posable || !x.place) return `<li class="cn-objet${x.gagne ? '' : ' gris'}">${vignette(f, x)}<span class="t"><b>${esc(x.nom)}</b>${x.gagne ? '' : `<small>${esc(x.obtenir)}</small>`}</span></li>`;
      const pose = liste.find((p) => p[0] === x.id), ici = TYPES[x.place] || '';
      let act = '';
      if (x.gagne && carnetEtat.choix !== x.id) act = pose ? `<button type="button" class="btn non cn-btn" data-ranger="${x.id}"><b>Ranger</b></button>` : `<button type="button" class="btn ${liste.length < CH.DECOS_MAX ? 'menthe' : 'non'} cn-btn" data-poser="${x.id}"><b>Poser</b></button>`;
      const choix = x.gagne && carnetEtat.choix === x.id ? `<div class="cn-places" role="group" aria-label="Où poser ${esc(x.nom)} ?">${CH.PLACES.filter((p) => p.type === x.place).map((p) => { const libre = !places.has(p.id), ok = libre && CH.peutPoser(liste, x.id, p.id, qualite()).ok; return `<button type="button" class="cn-place${ok ? '' : ' prise'}" data-place="${p.id}" data-deco="${x.id}"${ok ? '' : ' aria-disabled="true"'}>${esc(PLACES_NOM[p.id] || p.id)}${libre ? '' : ' · prise'}</button>`; }).join('')}<button type="button" class="cn-place annuler" data-place="" data-deco="">Annuler</button></div>` : '';
      return `<li class="cn-objet posable${x.gagne ? '' : ' gris'}${pose ? ' pose' : ''}">${vignette(f, x)}<span class="t"><b>${esc(x.nom)}</b><small>${x.gagne ? (pose ? `Posée : ${esc(PLACES_NOM[pose[1]] || pose[1])}` : `Se pose ${ici}`) : esc(x.obtenir)}</small></span>${act}${choix}</li>`;
    };
    const famille = (f) => {
      const g = f.items.filter((x) => x.gagne), m = f.items.filter((x) => !x.gagne), ouverte = !!carnetEtat.ouvertes[f.id];
      return `<div class="card cn-famille" data-famille="${f.id}"><div class="c-tete"><span class="pic">${iconeFamille(f.id)}</span><h3>${esc(f.nom)}</h3><span class="compte ${f.gagnes === f.total ? 'ok' : f.gagnes ? 'or' : ''}">${f.gagnes}/${f.total}</span></div>
        ${g.length ? `<ul class="${f.posable ? 'cn-liste' : 'cn-grille'}">${g.map((x) => objet(f, x)).join('')}</ul>` : '<p class="note">Rien encore dans cette famille.</p>'}
        ${m.length ? `<details class="repli"${ouverte ? ' open' : ''} data-repli="${f.id}"><summary><span>${m.length === 1 ? 'Le dernier à gagner' : `Les ${m.length} à gagner`}</span><i class="ico chev">${ico('chevron')}</i></summary><ul class="${f.posable ? 'cn-liste' : 'cn-grille'}">${m.map((x) => objet(f, x)).join('')}</ul></details>` : ''}</div>`;
    };
    const ou = cible ? `${esc(CH.nomDe(b))} · n°${cible}` : 'Ta boulangerie';
    D.openSheet(`<div class="ch-fiche-tete"><i class="ico">${ico('decos')}</i><div><h2>Mes décos</h2><p class="sous">${gagnes}/${total} objets dans ton carnet</p></div></div>
      <div class="cn-ici"><span><small>Les décos de</small><b>${ou}</b></span><span class="cn-compte${liste.length >= CH.DECOS_MAX ? ' plein' : ''}">${origine ? 'plan d’origine' : `${liste.length}/${CH.DECOS_MAX} posées`}</span></div>
      ${origine ? `<p class="note">Tes décos gagnées sont à leurs places de toujours. Poser ou ranger en fait ta disposition, ${CH.DECOS_MAX} au plus ; « Plan d’origine » la remet comme avant.</p>`
    : `<div class="cn-outils"><button type="button" class="lien" data-a="origine">${cible ? 'Revenir à sa déco d’office' : 'Plan d’origine'}</button></div>`}
      ${fam.map(famille).join('')}
      ${A_VENIR.map(([id, nom, txt]) => `<div class="card cn-famille avenir" data-famille="${id}"><div class="c-tete"><span class="pic">${iconeFamille('avenir')}</span><h3>${esc(nom)}</h3><span class="compte">à venir</span></div><p class="note">${esc(txt)}.</p></div>`).join('')}
      <button type="button" class="btn large sombre" data-a="close" style="margin-top:14px"><b>Retour</b></button>`);
    D.on('[data-a="close"]', D.closeSheet);
    document.querySelectorAll('#feuille-contenu [data-repli]').forEach((d) => d.addEventListener('toggle', () => { carnetEtat.ouvertes[d.dataset.repli] = d.open; }));
    const garderPlace = (f) => { const box = document.querySelector('#feuille'), y = box.scrollTop; f(); box.scrollTop = y; }; // (redessiné, le carnet reste où l'on lisait)
    D.on('[data-a="origine"]', () => { D.son.tap(); if (cible) { const bb = CH.boutique(st(), cible); if (bb) delete bb.d; D.save(); if (D.decosChangees) D.decosChangees(cible); } else poserListe(0, null); D.toast(cible ? 'Sa déco d’office est revenue.' : 'Le plan d’origine est revenu.'); garderPlace(() => carnet()); });
    D.on('[data-ranger]', (x) => { poserListe(cible, liste.filter((p) => p[0] !== x.dataset.ranger)); D.son.tap(); garderPlace(() => carnet()); });
    D.on('[data-poser]', (x) => {
      const id = x.dataset.poser, d = fam.reduce((a, f) => a.concat(f.items), []).find((y) => y.id === id); if (!d) return;
      if (liste.length >= CH.DECOS_MAX) { D.son.non(); D.toast(`${CH.DECOS_MAX} décos au plus par boutique : range-en une d’abord.`); return; }
      const libres = CH.PLACES.filter((p) => p.type === d.place && !places.has(p.id) && CH.peutPoser(liste, id, p.id, qualite()).ok);
      if (!libres.length) { D.son.non(); D.toast(`Plus de place ${TYPES[d.place] || ''} : range une déco de ce côté-là.`); return; }
      if (libres.length === 1) { poserListe(cible, [...liste, [id, libres[0].id]]); D.son.achat(); D.toast(`${d.nom} : posée, ${PLACES_NOM[libres[0].id]}.`); garderPlace(() => carnet()); return; }
      D.son.tap(); carnetEtat.choix = id; garderPlace(() => carnet());
    });
    D.on('[data-place]', (x) => {
      const id = x.dataset.deco, p = x.dataset.place; carnetEtat.choix = '';
      if (!id || !p) { garderPlace(() => carnet()); return; }
      if (places.has(p) || !CH.peutPoser(liste, id, p, qualite()).ok) { D.son.non(); D.toast('Cette place est déjà prise.'); garderPlace(() => carnet()); return; }
      poserListe(cible, [...liste, [id, p]]); D.son.achat(); garderPlace(() => carnet());
    });
  }
  // une icône par famille (src/icons.js, ICONS.CARNET) ; pour quelques objets, celle qui existe déjà (un compagnon, une coupe)
  function iconeFamille(id) { const C = typeof ICONS !== 'undefined' && ICONS.CARNET; return (C && (C[id] || C.avenir)) || ''; }
  function iconeCarnet(fam, id) {
    try {
      if (fam === 'compagnons' && id !== 'pigeon' && ICONS.compagnon) return ICONS.compagnon(id);
      if (fam === 'podium' && id === 'vitrine-coupes' && ICONS.coupe) return ICONS.coupe('or');
    } catch (e) { /* rien */ }
    return iconeFamille(fam);
  }

  // ─── dans une boutique de la chaîne : ses cartes de recettes, ses bonus et ses meubles, son bandeau ───
  // v : la vue (CHAINE.ouvrir) ; v.b : la boutique compacte ; toutes les écritures passent par CHAINE (la vue et v.b, jamais st)
  let cartes = [], boxCartes = null, vueCartes = null;
  function cartesBatir(box, v) {
    boxCartes = box; vueCartes = v; box.innerHTML = ''; cartes = [];
    G.PRODUITS.forEach((p, i) => { const a = document.createElement('article'); a.className = 'carte'; a.dataset.i = i; box.appendChild(a); cartes.push({ el: a, html: '' }); });
    cartesRendre(true);
  }
  function cartesRendre(force) {
    const v = vueCartes; if (!v || !boxCartes) return; const s = st(), b = v.b;
    G.PRODUITS.forEach((p, i) => {
      const c = cartes[i], x = v.stations[i], gagnee = G.recetteGagnee(s, i); if (!c) return;
      if (c.el.hidden !== !gagnee) c.el.hidden = !gagnee; if (!gagnee) return;
      let html, cls;
      if (x.niv === 0) {
        const prix = CH.prixNiveaux(v, i, 1), ok = v.coins >= prix, un = Object.assign({}, b, { s: G.PRODUITS.map((_, k) => (k === i ? 1 : CH.niv(b, k))) });
        cls = 'carte verrou';
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${esc(p.desc)} Rapporte ${G.fmtEur(CH.revenuBase(s, un, i) * CH.affluence(b))} la fournée ici.</p>
          <button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>Débloquer</small><b>${G.fmtEur(prix)}</b></button></div>`;
      } else {
        const n = CH.quantite(v, i), prix = CH.prixNiveaux(v, i, n), ok = v.coins >= prix, pal = G.prochainPalier(x.niv);
        const prec = G.PALIERS.filter((y) => y <= x.niv).pop() || 0, jet = CH.paliersDe(x.niv + n) - CH.paliersDe(x.niv);
        const rev = CH.revenuBase(s, b, i) * (x.staff ? 1 : CH.affluence(b)), T = CH.temps(b, i), rapide = T <= 1.5 && x.staff;
        cls = 'carte' + (x.staff ? ' auto' : ' manuel') + (x.actif ? ' actif' : '');
        html = `<div class="icone">${ICONS.PRODUITS[p.id]}<span class="niv">${x.niv}</span></div>
          <div class="corps"><h3><span class="nom">${esc(p.nom)}</span></h3>
            <div class="palier ${jet ? 'bientot' : ''}">${pal ? `<span>Palier <b>${pal}</b> · ×${G.fmtMult(G.palierMult(pal))}</span><span>${pal - x.niv === 1 ? '1 niveau' : `${pal - x.niv} niveaux`}</span><i style="width:${((x.niv - prec) / (pal - prec) * 100).toFixed(0)}%"></i>` : '<span>Dernier palier atteint</span><i style="width:100%"></i>'}</div>
            <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${G.fmtEur(rev)}</span>${x.staff || x.actif ? `<span class="tps">${G.fmtDuree(T)}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
          <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'}" data-a="ameliorer"><small>Améliorer ×${n}</small><b>${G.fmtEur(prix)}</b>${jet ? `<i class="pal-badge">+${jet} jeton${jet > 1 ? 's' : ''}</i>` : ''}</button>
            ${x.staff ? `<div class="staff-ok"><span>${esc(p.staffNom.split(' ').pop())}</span></div>` : `<button type="button" class="btn beurre ${v.coins >= p.staff ? '' : 'non'}" data-a="embaucher"><small>Embaucher</small><b>${G.fmtEur(p.staff)}</b></button>`}</div>`;
      }
      if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); } else if (c.el.className !== cls) c.el.className = cls;
      if (c.bar && !c.bar.classList.contains('rapide')) c.bar.style.width = (x.niv > 0 && x.actif ? Math.min(100, x.prog / CH.temps(b, i) * 100) : 0).toFixed(1) + '%';
    });
  }
  // une touche sur une carte : acheter, embaucher, ou lancer une fournée à la main ; rend { i, achat | lance } pour l'interface (la scène)
  function cartesClic(e) {
    const v = vueCartes, art = e.target.closest('.carte'); if (!v || !art) return null;
    const i = +art.dataset.i, btn = e.target.closest('button[data-a]'), s = st(); D.audio();
    if (btn) {
      const a = btn.dataset.a;
      if (a === 'debloquer' || a === 'ameliorer') {
        const r = CH.acheter(s, v, i);
        if (!r.ok) { D.son.non(); D.toast(r.verrou ? `Ouvre la boutique n°${r.boutique} pour cette recette.` : `Il manque ${G.fmtEur(r.prix - v.coins)} dans la caisse de cette boutique.`); return null; }
        if (a === 'debloquer') { D.son.deblocage(); D.buzz([10, 30, 10]); D.fete(); D.toast(`${G.PRODUITS[i].nom} : au menu de cette boutique !`); } else { D.son.achat(); D.buzz(8); }
        if (r.or) { D.son.deblocage(); D.confettis(1.6); D.fete(); D.toast(`Boutique d’or ! Son paquet de ${jetonsTxt(CH.paquetOr(v.b.n))} t’attend, et l’enseigne dorée.`); }
        else if (r.jetons) D.toast(`Palier franchi : +${jetonsTxt(r.jetons)} à prendre`);
        cartesRendre(true); D.save(); D.rafraichir(); return { i, achat: true };
      }
      if (a === 'embaucher') {
        const r = CH.embaucher(s, v, i);
        if (!r.ok) { D.son.non(); D.toast(`Il manque ${G.fmtEur(r.prix - v.coins)} dans la caisse de cette boutique.`); return null; }
        D.son.embauche(); D.buzz([10, 30, 10]); D.toast(`${G.PRODUITS[i].staffNom} cuit pour cette boutique !`); cartesRendre(true); D.save(); D.rafraichir(); return { i, achat: true };
      }
      return null;
    }
    if (v.stations[i].niv > 0 && !v.stations[i].staff && CH.lancer(v, i)) { D.son.tap(); D.buzz(6); cartesRendre(); return { i, lance: true }; }
    return null;
  }
  // les bonus et le mobilier de la boutique de la chaîne : payés par sa caisse, prix de base (pas de talent, pas de remise)
  let ongletBonus = 'bonus';
  function bonus(v, tab) {
    if (tab) ongletBonus = tab; if (!v) return; const s = st(), b = v.b;
    const liste = ongletBonus === 'bonus' ? G.AMELIORATIONS.filter((a) => G.ameliorationOuverte(s, a)).map((a) => {
      const fait = v.ameliorations[a.id], ok = v.coins >= a.cout;
      return `<div class="am ${fait ? 'fait' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p></div>${fait ? okChip('Acheté') : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${G.fmtEur(a.cout)}</b></button>`}</div>`;
    }).join('') : G.MOBILIER.map((m) => {
      const k = CH.cran(b, m.id), max = k >= m.max, prix = CH.prixMeuble(b, m.id), ok = !max && v.coins >= prix;
      return `<div class="am meuble ${max ? 'fait' : ''}">${ICONS.MEUBLES[m.id]}<div><h3>${esc(m.nom)} ${crans(k, m.max)}</h3><p>${k ? esc(m.desc(k)) : 'Pas encore installé'}</p></div>${max ? okChip('Au max') : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-m="${m.id}"><small>Améliorer</small><b>${G.fmtEur(prix)}</b></button>`}</div>`;
    }).join('');
    const seg = (id, t) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${ongletBonus === id}" class="${ongletBonus === id ? 'actif' : ''}">${t}</button>`;
    D.openSheet(`<div class="segments" role="tablist">${seg('bonus', 'Bonus')}${seg('mobilier', 'Mobilier')}</div>
      <h2>${ongletBonus === 'bonus' ? 'Bonus' : 'Mobilier'} · n°${b.n}</h2><p class="sous">Pour cette boutique seulement, payés par sa caisse (${G.fmtEur(v.coins)}). ${ongletBonus === 'bonus' ? 'Ils multiplient ses gains.' : 'Les tables font gagner plus, le four cuit plus vite, la vitrine et le bar font vendre plus à la main.'}</p>
      <div class="liste-am">${liste}</div>
      <div class="ch-amenager"><button type="button" class="btn large lavande" data-a="amenager"><small>Déplacer ses tables, son bar, sa terrasse</small><b>Aménager cette boutique</b></button>
      <button type="button" class="btn large" data-a="decos"><small>Ses décos, ${CH.DECOS_MAX} au plus</small><b>Mes décos ici</b></button></div>
      <button type="button" class="btn large sombre" data-a="close" style="margin-top:14px"><b>Retour</b></button>`);
    D.on('[data-a="close"]', D.closeSheet);
    D.on('[data-tab]', (x) => { D.son.tap(); bonus(v, x.dataset.tab); });
    D.on('[data-a="amenager"]', () => { D.closeSheet(); D.amenager(); });
    D.on('[data-a="decos"]', () => { D.son.tap(); carnet({ cible: b.n }); });
    D.on('[data-id]', (x) => { const r = CH.amelioration(s, v, x.dataset.id); if (!r.ok) { D.son.non(); D.toast(`Il manque ${G.fmtEur(r.prix - v.coins)}`); return; } D.son.deblocage(); D.buzz([10, 30, 10]); D.toast(`${r.a.nom} : ${r.a.desc}`); cartesRendre(true); D.save(); D.rafraichir(); bonus(v); });
    D.on('[data-m]', (x) => { meubleAcheter(v, x.dataset.m, () => bonus(v)); });
  }
  function meubleAcheter(v, id, apres) {
    const r = CH.ameliorerMeuble(st(), v, id), m = G.MOBILIER.find((x) => x.id === id);
    if (!r.ok) { D.son.non(); D.toast(m && r.cran >= m.max ? 'Ce meuble est déjà au maximum.' : `Il manque ${G.fmtEur(r.prix - v.coins)}`); return; }
    D.son.deblocage(); D.buzz([10, 30, 10]); D.fete(); D.toast(`${r.m.nom} : ${r.m.desc(r.cran)}`); cartesRendre(true); D.save(); D.rafraichir(); if (apres) apres();
  }
  function meuble(v, id) { // la fiche d'un meuble touché dans la boutique de la chaîne
    const m = G.MOBILIER.find((x) => x.id === id); if (!m || !v) return;
    const k = CH.cran(v.b, id), max = k >= m.max, prix = CH.prixMeuble(v.b, id), ok = !max && v.coins >= prix;
    D.openSheet(`<div class="meuble-fiche">${ICONS.MEUBLES[id]}<div><h2>${esc(m.nom)}</h2><p class="sous">${crans(k, m.max)} cran ${k} sur ${m.max} · boutique n°${v.b.n}</p></div></div>
      <div class="encadre espace">${k ? `<b>Maintenant :</b> ${esc(m.desc(k))}` : 'Pas encore installé.'}${max ? '' : `<br><b>Cran suivant :</b> ${esc(m.desc(k + 1))}`}</div>
      ${max ? '<p class="sous">Ce meuble est au maximum.</p>' : `<button type="button" class="btn large ${ok ? 'lavande' : 'non'}" data-m="${id}"><small>Améliorer, avec sa caisse</small><b>${G.fmtEur(prix)}</b></button>`}
      <button type="button" class="lien" data-a="tous">Tous ses bonus et son mobilier</button><button type="button" class="btn large sombre" data-a="close" style="margin-top:14px"><b>Retour</b></button>`);
    D.on('[data-a="close"]', D.closeSheet); D.on('[data-a="tous"]', () => bonus(v, 'mobilier'));
    D.on('[data-m]', () => meubleAcheter(v, id, () => meuble(v, id)));
  }
  // le nom d'une boutique de la chaîne (l'enseigne touchée dans la boutique)
  function renommer(n, apres) {
    const b = CH.boutique(st(), n); if (!b) return;
    D.openSheet(`<h2>Le nom de la boutique n°${n}</h2><p class="sous">Vide : son enseigne de quartier, « ${esc(`${G.QUARTIERS[b.q].enseigne} n°${n}`)} ».</p><input class="champ" type="text" maxlength="24" value="${esc(b.nm || '')}" aria-label="Nom de la boutique" autocomplete="off" autocorrect="off">
      <button type="button" class="btn large beurre" data-a="ok" style="margin-top:12px"><b>Garder ce nom</b></button><button type="button" class="btn large non" data-a="non" style="margin-top:8px"><b>Annuler</b></button>`);
    const champ = document.querySelector('#feuille-contenu .champ'), ok = () => { const nom = CH.renommer(st(), n, champ.value); D.save(); D.closeSheet(); D.toast(`« ${nom} »`); if (apres) apres(); };
    D.on('[data-a="ok"]', ok); D.on('[data-a="non"]', D.closeSheet); champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }
  // le bandeau au-dessus de la scène : « Boutique n°7 · Ma chaîne », le retour, la jauge d'or et ses jetons à prendre
  let cleBandeau = '';
  function bandeau(box, v, force) {
    if (!box || !v) return; const s = st(), b = v.b, j = CH.jauge(s, b);
    const cle = `${b.n}|${CH.nomDe(b)}|${j.fait}/${j.max}|${b.or}|${b.jp}`; if (!force && cle === cleBandeau) return; cleBandeau = cle;
    const acc = b.or ? '#FFC84A' : accent(b.q, G.standingDe(b.n)); box.style.setProperty('--acc', acc); box.style.setProperty('--enc', clair(acc) ? L : '#FFFFFF');
    box.innerHTML = `<button type="button" class="cb-retour" data-cb="retour" aria-label="Revenir à ma boulangerie"><i class="ico">${ico('chevron')}</i><span>Ma<br>boulangerie</span></button>
      <button type="button" class="cb-titre" data-cb="nom" aria-label="Renommer la boutique n°${b.n}"><small>Boutique n°${b.n} · Ma chaîne</small><b class="cb-nom">${esc(CH.nomDe(b))}</b>${b.or ? `<span class="cb-or"><i class="ico">${OR_ICO()}</i>Boutique d’or</span>` : `<span class="cb-jauge" role="img" aria-label="Vers la Boutique d’or : ${j.fait} paliers sur ${j.max}"><i style="width:${pct(j.fait, j.max)}"></i></span>`}</button>
      ${b.jp ? `<button type="button" class="cb-prendre" data-cb="prendre" aria-label="Prendre ${jetonsTxt(b.jp)} de chaîne"><i class="ico">${CLE()}</i><span><small>Prendre</small><b>${G.fmt(b.jp)}</b></span></button>` : `<button type="button" class="cb-planete" data-cb="chaine" aria-label="Ma chaîne : la petite planète"><i class="ico">${PLANETE_ICO()}</i></button>`}`;
  }
  function bandeauClic(e, v) { // rend 'retour', 'chaine', ou '' (déjà fait ici)
    const x = e.target.closest('[data-cb]'); if (!x || !v) return '';
    D.audio(); const a = x.dataset.cb;
    if (a === 'prendre') { const k = CH.prendreJetons(st(), v.b.n); if (k) { D.son.pieces(); D.buzz([8, 30, 8]); D.toast(`+${jetonsTxt(k)} de chaîne`); D.save(); D.rafraichir(); } return ''; }
    D.son.tap(); return a;
  }

  function init(deps) { D = deps; }
  Object.assign(API, { init, ouvrir, fermer, maj, jetons: boutiqueJetons, carnet, gerant: sheetGerant, embaucherGerant, CARNET_IMAGES,
    cartes: { batir: cartesBatir, rendre: cartesRendre, clic: cartesClic, el: (i) => (cartes[i] ? cartes[i].el : null), lacher() { boxCartes = null; vueCartes = null; cartes = []; } },
    bonus, meuble, renommer, bandeau, bandeauClic, posesDe });
  Object.defineProperty(API, 'planete', { get: () => planete }); Object.defineProperty(API, 'choisie', { get: () => choisie }); // (des getters : Object.assign n'en copierait que la valeur)
  return API;
})();
