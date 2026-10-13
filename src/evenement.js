/* LE FOURNIL — l'événement « Le Quartier » à l'écran : la Planque, une boutique à part en plein écran par-dessis la boulangerie (comme
   l'Atelier), derrière une porte « 18 ans et + ». Les règles sont dans src/quartier.js (pures, testées dans Node) ; ici : l'écran, les
   cartes des six produits, les coups de pouce, le décor 3D de la Planque (Three.js, bâti à l'ouverture et libéré à la fermeture : rien
   ne reste en mémoire quand on est dans la boulangerie), les paliers et leurs récompenses distribuées dans la boulangerie (étoiles,
   boosts en réserve, décos du quartier, vêtements de la garde-robe), l'annonce du premier jour, le bilan de fin. Une parodie de dessin
   animé pour adultes : des noms et des gags, jamais rien de réel. Le temps : HORLOGE.maintenant(), par deps.maintenant. */
const EVENEMENT = (() => {
  'use strict';
  const G = GAME, Q = typeof QUARTIER !== 'undefined' ? QUARTIER : null, $ = (s) => document.querySelector(s);
  let d = null, el, cartesEl, evEl, cartes = [], lastHud = '', lastEv = '', ecran = '', scene3 = null, dernierSave = 0, fileSheets = [], sheetOuverte = false;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = () => d.st();
  const now = () => d.maintenant();
  const q = () => Q.etat(st(), now());
  const fen = () => Q.fenetreSure(now(), d.sure ? d.sure() : null); // l'ouverture sur l'heure sûre (une horloge avancée hors ligne n'ouvre rien avant midi)
  const fmt = Q ? Q.fmtEur : (n) => String(n);

  function init(deps) {
    d = deps; el = $('#planque'); cartesEl = $('#pq-cartes'); evEl = $('#pq-ev');
    if (!el || !Q) return false;
    const ico = el.querySelector('.pq-ico'); if (ico) ico.innerHTML = ICONS.QUARTIER.billets;
    el.querySelector('[data-pq="fermer"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
    el.querySelector('[data-pq="classement"]').addEventListener('click', () => { d.audio(); d.son.tap(); if (d.classement) d.classement(); });
    el.querySelector('[data-pq="paliers"]').addEventListener('click', () => { d.audio(); d.son.tap(); sheetPaliers(); });
    el.querySelector('[data-pq="ameliorations"]').addEventListener('click', () => { d.audio(); d.son.tap(); sheetAmeliorations(); });
    el.querySelectorAll('.pq-modes button').forEach((b) => b.addEventListener('click', () => { d.audio(); const qq = q(); qq.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; el.querySelectorAll('.pq-modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCartes(true); }));
    cartesEl.addEventListener('click', onCarte);
    evEl.addEventListener('click', (e) => { if (e.target.closest('button')) return; evEl.classList.toggle('etendu'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvert() && $('#feuille').hidden) fermer(); });
    window.addEventListener('resize', () => { if (scene3) scene3.redim(); });
    synchroniserRecompenses();
    return true;
  }
  const ouvert = () => !!el && !el.hidden;
  // ce que l'icône du coin et l'annonce décident : l'événement est-il visible ? (fenêtre ouverte, pas masqué dans les Réglages)
  // window.__sansQuartier : un interrupteur des tests Playwright qui ne parlent pas de l'événement (posé par addInitScript) : pendant la
  // fenêtre, ni icône ni annonce ni bilan ne viennent couvrir ce qu'ils regardent. Personne ne le pose dans le jeu.
  const coupe = () => typeof window !== 'undefined' && !!window.__sansQuartier;
  function visible() { if (!Q || !st() || coupe()) return false; const qq = st().quartier; return fen().ouvert && !(qq && qq.masque); }
  function masquer(on) { const qq = q(); qq.masque = !!on; d.save(); if (qq.masque && ouvert()) fermer(); }
  function majeur() { return !!(st() && st().quartier && st().quartier.majeur); }

  // ─── les récompenses des paliers, distribuées dans la boulangerie (chacune une fois : q.paliers fait foi) ───
  function synchroniserRecompenses() { // au lancement : les vêtements gagnés sont (re)donnés à la garde-robe si elle existe, les décos posées
    const s = st(); if (!s || !s.quartier) return;
    const qq = q();
    if (typeof G.donnerVetement === 'function') for (const id of qq.vetements) { try { G.donnerVetement(s, id); } catch (e) { /* un id que la garde-robe ne connaît pas encore */ } }
    if (SCENE.decosQuartier) SCENE.decosQuartier(qq.decos);
  }
  function donnerPalier(p) {
    const s = st(), qq = q(), fait = Q.marquerPalier(qq, p.n); if (!fait) return null;
    const dons = [];
    if (p.etoiles) { s.etoiles += p.etoiles; dons.push(`${p.etoiles} étoile${p.etoiles > 1 ? 's' : ''} (+${Math.round(p.etoiles * G.ETOILE_BONUS * 100)} % de gains, pour toujours)`); }
    if (p.boost) { G.donnerBoostReserve(s, p.boost.mult, p.boost.secs); dons.push(`un boost ×${p.boost.mult} de ${G.fmtDuree(p.boost.secs)}, en réserve dans la boutique`); }
    if (p.deco) { if (SCENE.decosQuartier) SCENE.decosQuartier(qq.decos); dons.push({ graffiti: 'un graffiti sur la porte de la boutique', neon: 'une enseigne néon au mur de la boutique', scooter: 'un scooter garé devant la boutique', chien: 'le chien du quartier, couché dans la boutique' }[p.deco]); }
    if (p.vetement) { let r = null; if (typeof G.donnerVetement === 'function') { try { r = G.donnerVetement(s, p.vetement); } catch (e) { r = null; } } const v = typeof G.vetement === 'function' ? G.vetement(p.vetement) : null; dons.push(`${v ? v.nom : p.vetement} pour la garde-robe du boulanger${Q.ensembleComplet(qq) ? ' : la tenue du quartier est complète !' : ''}${r && r.nouveau === false ? ' (déjà là)' : ''}`); }
    G.gagnerXp(s, 20);
    fileSheets.push({ p, dons }); d.save(); d.apres();
    return dons;
  }
  function montrerSheetsEnAttente() {
    if (sheetOuverte || !fileSheets.length || !$('#feuille').hidden) return;
    const { p, dons } = fileSheets.shift(); sheetOuverte = true;
    d.son.deblocage(); d.buzz([10, 30, 10, 30, 10]); if (d.fete) d.fete();
    d.openSheet(`<div class="pq-sheet"><div class="pq-palier-tete"><span class="pq-pic">${ICONS.QUARTIER.palier}</span><div><h2>Palier ${p.n} · ${esc(p.titre)}</h2><p class="sous">${fmt(p.total)} de billets gagnés dans la Planque. Pour la boulangerie :</p></div></div>
      <ul class="pq-dons">${dons.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${p.n === 12 ? '<p class="encadre">Le boss du quartier, c’est toi. Tout ça reste à vie, même après la fermeture de la Planque.</p>' : ''}
      <button type="button" class="btn large beurre" data-a="pq-ok" style="margin-top:14px"><b>Trop bien</b></button></div>`);
    d.on('[data-a="pq-ok"]', () => { d.son.tap(); d.closeSheet(); });
    const surFermeture = setInterval(() => { if ($('#feuille').hidden) { sheetOuverte = false; clearInterval(surFermeture); montrerSheetsEnAttente(); } }, 300);
  }

  // ─── ouvrir : l'annonce, la porte 18+, la Planque, le bilan ───
  function annoncer() { // le premier jour (ou au premier lancement pendant l'événement) : une fois ; après la fin : le bilan, une fois
    const s = st(); if (!s || !Q || coupe()) return false;
    const f = fen(), qq = s.quartier;
    if (f.fini) { if (qq && qq.total > 0 && !qq.bilan && !qq.masque && !ouvert()) { ouvrir(); return true; } return false; } // masqué : pas de bilan qui surgit
    if (!f.ouvert || (qq && (qq.masque || qq.annonce)) || !$('#feuille').hidden || ouvert()) return false;
    const neuf = q(); neuf.annonce = true; d.save();
    d.openSheet(`<div class="pq-sheet pq-annonce"><div class="pq-annonce-scene"><span class="pq-pic grand">${ICONS.QUARTIER.porte}</span></div>
      <h2>Le Quartier ouvre ses portes</h2>
      <p class="sous">Deux semaines, jusqu’au mardi 27 octobre à midi : une boutique à part, « la Planque », où tout le monde part de zéro. Ses billets rapportent des récompenses pour ta boulangerie : étoiles, boosts, décos du quartier, et une tenue à vie.</p>
      <p class="encadre">C’est une parodie pour adultes, façon dessin animé. Réservée aux 18 ans et plus ; on peut la masquer dans les Réglages.</p>
      <button type="button" class="btn large sombre" data-a="pq-entrer" style="margin-top:12px"><small>18 ans et +</small><b>Voir le Quartier</b></button>
      <button type="button" class="btn large clair" data-a="pq-tard" style="margin-top:8px"><b>Plus tard</b></button></div>`);
    d.on('[data-a="pq-entrer"]', () => { d.son.tap(); d.closeSheet(); ouvrir(); });
    d.on('[data-a="pq-tard"]', () => { d.son.tap(); d.closeSheet(); });
    return true;
  }
  function ouvrir() {
    if (!Q || !el) return false;
    const f = fen(), qq = q();
    if (!f.ouvert && !f.fini) return false;
    if (qq.masque && !f.fini) return false;
    el.hidden = false; d.ouvert();
    if (f.fini) { montrerBilan(); return true; }
    if (!qq.majeur) { montrerPorte(); return true; }
    entrer();
    return true;
  }
  function montrerPorte() {
    ecran = 'porte'; entete('La Planque', 'Réservée aux adultes');
    el.dataset.ecran = ecran;
    $('#pq-corps').innerHTML = `<div class="at-carte pq-porte"><span class="pq-pic grand">${ICONS.QUARTIER.porte}</span>
      <h2>18 ans et plus</h2>
      <p>Derrière cette porte, une parodie de petit trafic de quartier, façon dessin animé : des noms, des gags, des billets qui n’existent pas. Rien de réel, mais pas pour les enfants.</p>
      <p class="sous">Tu as 18 ans ou plus ?</p>
      <button type="button" class="btn large sombre" data-pq="oui"><b>Oui, j’entre</b></button>
      <button type="button" class="btn large clair" data-pq="non" style="margin-top:8px"><b>Non, masquer l’événement</b></button></div>`;
    $('#pq-corps').querySelector('[data-pq="oui"]').addEventListener('click', () => { d.audio(); d.son.deblocage(); const qq = q(); qq.majeur = true; d.save(); entrer(); });
    $('#pq-corps').querySelector('[data-pq="non"]').addEventListener('click', () => { d.audio(); d.son.tap(); masquer(true); d.toast('L’événement est masqué. Tu peux le remettre dans les Réglages.'); });
  }
  function entete(t, s) { $('#pq-titre').textContent = t; $('#pq-sous').textContent = s || ''; }
  function entrer() {
    const qq = q(), t = now();
    if (!qq.ouvertLe) qq.ouvertLe = t;
    const abs = Q.absence(qq, t);
    ecran = 'planque'; el.dataset.ecran = ecran;
    $('#pq-corps').innerHTML = ''; // la porte ou le bilan s'effacent ; la scène, les cartes et la bannière sont des éléments fixes de #planque
    entete('La Planque', `Jour ${fen().jour} sur ${fen().jours}`);
    el.querySelectorAll('.pq-modes button').forEach((b) => b.classList.toggle('actif', String(qq.mode) === b.dataset.mode));
    construireCartes(); lastHud = ''; lastEv = ''; hud(); renderEv();
    if (!scene3) scene3 = creerScene($('#pq-canvas'));
    if (abs.total > 0 && abs.secs > 90) d.toast(`Pendant ton absence (${G.fmtDuree(abs.secs)}) : +${fmt(abs.total)} de billets, au ralenti sans le boss.`);
    else if (qq.stats.taps === 0) d.toast('Touche l’herbe pour vendre ton premier sachet !');
    dernierSave = performance.now();
  }
  function fermer() {
    if (!ouvert()) return;
    if (ecran === 'planque') { const qq = q(); qq.lastSeen = now(); d.save(); }
    if (ecran === 'bilan') { const qq = q(); qq.bilan = true; d.save(); }
    if (scene3) { scene3.detruire(); scene3 = null; }
    el.hidden = true; ecran = ''; el.dataset.ecran = ''; cartes = []; cartesEl.innerHTML = ''; evEl.hidden = true; evEl.innerHTML = '';
    if (d.ferme) d.ferme();
  }

  // au retour dans le jeu (téléphone verrouillé, autre appli) la Planque encore ouverte : les apprentis ont bossé, au ralenti, comme à l'entrée
  function retour() {
    if (ecran !== 'planque') return null;
    const qq = q(), t = now(); if (Q.fenetre(t).fini) return null; // fini : la boucle ferme et montre le bilan
    const abs = Q.absence(qq, t); renderEv();
    if (abs.total > 0 && abs.secs > 90) d.toast(`Pendant ton absence (${G.fmtDuree(abs.secs)}) : +${fmt(abs.total)} de billets, au ralenti sans le boss.`);
    return abs;
  }
  // ─── la boucle : appelée chaque image par ui.js tant que la Planque est ouverte ───
  function frame(dt, t) {
    if (ecran !== 'planque') return;
    const qq = q(), f = Q.fenetre(t);
    if (f.fini) { const b = qq.billets; Q.tick(qq, dt, t); d.toast('La Planque ferme ses portes !'); qq.lastSeen = t; montrerBilan(); return; }
    const out = Q.tick(qq, dt, t);
    if (out.ventes.length) { const gros = out.ventes.reduce((a, v) => a + v.montant, 0); if (Math.random() < 0.2 || out.ventes.some((v) => Q.PRODUITS[v.i].temps >= 12)) { d.son.vente(gros); if (scene3) scene3.vente(gros); } }
    if (out.nouvelEv) { d.son.evenement(); d.buzz([15, 40, 15]); d.toast(TXT_EV[out.nouvelEv.type]); }
    if (out.finEv) { d.toast(out.finEv.type === 'descente' ? `La police embarque ${fmt(out.fin.saisi || 0)} de billets…` : FIN_EV[out.finEv.type]); if (out.finEv.type === 'descente') d.son.non(); }
    for (const p of out.paliers) donnerPalier(p);
    montrerSheetsEnAttente();
    hud(); renderCartes(); renderEv();
    if (scene3) scene3.frame(dt, qq);
    if (performance.now() - dernierSave > 5000) { dernierSave = performance.now(); qq.lastSeen = t; d.save(); }
  }
  const TXT_EV = { descente: 'Descente de police ! Planque tout, vite !', grosclient: 'Un gros client passe commande !', soiree: 'Soirée dans le quartier : tout se vend ×2 !', scooter: 'Le livreur en scooter passe : attrape le bonus !' };
  const FIN_EV = { grosclient: 'Le gros client est reparti sans sa commande.', soiree: 'La soirée est finie.', scooter: 'Le scooter est reparti.' };
  function hud() {
    const qq = q(), taux = Q.tauxParSeconde(qq), f = fen(), nb = Q.paliersAtteints(qq).length;
    const cl = d.rangQuartier ? d.rangQuartier() : null; // le classement de l'événement : null s'il n'existe pas (pas de serveur), sinon son rang (0 : pas encore classé)
    const cle = `${fmt(qq.billets)}|${fmt(taux)}|${Q.fmtReste(f.reste)}|${nb}|${f.jour}|${cl}`;
    if (cle === lastHud) return; lastHud = cle;
    $('#pq-billets').textContent = fmt(qq.billets);
    $('#pq-taux').innerHTML = taux > 0 ? `<b>+${fmt(taux)}</b>/s · le boss est là ×${Q.PRESENCE}` : `Touche un produit pour vendre · le boss est là ×${Q.PRESENCE}`;
    $('#pq-reste').textContent = `Ferme dans ${Q.fmtReste(f.reste)}`;
    $('#pq-sous').textContent = `Jour ${f.jour} sur ${f.jours}`;
    const bc = el.querySelector('[data-pq="classement"]'); bc.hidden = cl == null; bc.querySelector('b').textContent = cl ? (cl === 1 ? '1er' : cl + 'e') : 'Top';
    bc.setAttribute('aria-label', cl ? `Le classement de l’événement : tu es ${cl === 1 ? '1er' : cl + 'e'}` : 'Le classement de l’événement');
    const bp = el.querySelector('[data-pq="paliers"]'); bp.querySelector('b').textContent = `${nb}/12`; bp.classList.toggle('pret', Q.paliersDus(qq).length > 0);
  }

  // ─── les cartes des six produits (même grammaire que la boulangerie) ───
  function construireCartes() {
    cartesEl.innerHTML = ''; cartes = [];
    Q.PRODUITS.forEach((p, i) => { const c = document.createElement('article'); c.className = 'carte pq'; c.dataset.i = i; cartesEl.appendChild(c); cartes.push({ el: c, html: '' }); });
    renderCartes(true);
  }
  function renderCartes(force) {
    const qq = q();
    Q.PRODUITS.forEach((p, i) => {
      const s = qq.postes[i], c = cartes[i]; if (!c) return;
      let html, cls;
      if (s.niv === 0) {
        const prev = i === 0 || qq.postes[i - 1].niv > 0, ok = qq.billets >= p.debloquer;
        cls = 'carte pq verrou' + (prev ? '' : ' secret');
        html = `<div class="icone">${ICONS.QUARTIER[p.id]}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${esc(p.desc)} ${prev ? `Rapporte ${fmt(p.rev)} la vente.` : 'Débloque d’abord le produit précédent.'}</p>
          ${prev ? `<button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>Débloquer</small><b>${fmt(p.debloquer)}</b></button>` : ''}</div>`;
      } else {
        const n = Q.quantite(qq, i), prix = Q.prixNiveaux(qq, i, n), ok = qq.billets >= prix, pal = Q.prochainPalier(s.niv), prec = Q.PALIERS_POSTE.filter((x) => x <= s.niv).pop() || 0, franchit = pal && s.niv + n >= pal;
        const rapide = p.temps <= 1.5 && s.staff, gc = qq.ev && qq.ev.type === 'grosclient' && qq.ev.i === i;
        cls = 'carte pq' + (s.staff ? ' auto' : ' manuel') + (s.actif ? ' actif' : '') + (gc ? ' gouter' : '');
        html = `${gc ? '<span class="badge-critique">Le gros client attend</span>' : ''}<div class="icone">${ICONS.QUARTIER[p.id]}<span class="niv">${s.niv}</span></div>
          <div class="corps"><h3><span class="nom">${esc(p.nom)}</span></h3><small class="pq-poste">${esc(p.poste)}</small>
            <div class="palier ${franchit ? 'bientot' : ''}">${pal ? `<span>Palier <b>${pal}</b> · ×${Q.palierMult(pal)}</span><span>${pal - s.niv === 1 ? '1 niveau' : `${pal - s.niv} niveaux`}</span><i style="width:${((s.niv - prec) / (pal - prec) * 100).toFixed(0)}%"></i>` : `<span>Dernier palier · ×${Q.palierMult(s.niv)}</span><i style="width:100%"></i>`}</div>
            <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${fmt(Q.revenuFournee(qq, i))}</span>${s.staff || s.actif ? `<span class="tps">${G.fmtDuree(Q.temps(qq, i))}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
          <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'}" data-a="ameliorer"><small>Améliorer ×${n}</small><b>${fmt(prix)}</b>${franchit ? `<i class="pal-badge">palier ×${Q.palierMult(pal)}</i>` : ''}</button>
            ${s.staff ? `<div class="staff-ok pq"><span>${esc(p.staffNom)}</span></div>` : `<button type="button" class="btn beurre ${qq.billets >= Q.prixStaff(qq, i) ? '' : 'non'}" data-a="embaucher"><small>Embaucher</small><b>${fmt(Q.prixStaff(qq, i))}</b></button>`}</div>`;
      }
      if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); }
      else if (c.el.className !== cls) c.el.className = cls;
      if (c.bar && !c.bar.classList.contains('rapide')) c.bar.style.width = (s.niv > 0 && s.actif ? Math.min(100, s.prog / Q.temps(qq, i) * 100) : 0).toFixed(1) + '%';
    });
  }
  function onCarte(e) {
    const art = e.target.closest('.carte'); if (!art) return;
    const i = +art.dataset.i, btn = e.target.closest('button[data-a]'), qq = q();
    d.audio();
    if (btn) {
      const a = btn.dataset.a;
      if (a === 'debloquer' || a === 'ameliorer') {
        const r = Q.acheter(qq, i);
        if (!r.ok) { d.son.non(); d.toast(r.verrou ? 'Débloque d’abord le produit précédent.' : `Il manque ${fmt(r.prix - qq.billets)}`); return; }
        if (r.deblocage) { d.son.deblocage(); d.buzz([10, 30, 10]); d.toast(`${Q.PRODUITS[i].nom} : nouveau produit à la Planque !`); } else { d.son.achat(); d.buzz(8); }
        renderCartes(true); lastHud = ''; hud(); d.save(); return;
      }
      if (a === 'embaucher') {
        const r = Q.embaucher(qq, i);
        if (!r.ok) { d.son.non(); d.toast(`Il manque ${fmt(r.prix - qq.billets)}`); return; }
        d.son.embauche(); d.buzz([10, 30, 10]); d.toast(`${Q.PRODUITS[i].staffNom} rejoint l’équipe du quartier !`); if (scene3) scene3.equipe(qq);
        renderCartes(true); lastHud = ''; hud(); d.save(); return;
      }
    }
    if (qq.postes[i].niv > 0 && !qq.postes[i].staff) { if (Q.lancer(qq, i)) { d.son.tap(); d.buzz(6); renderCartes(); } }
  }

  // ─── les coups de pouce : une bannière sur la scène, comme les événements de la boulangerie ───
  function renderEv() {
    const qq = q(), ev = qq.ev;
    if (!ev) { if (lastEv) { lastEv = ''; evEl.hidden = true; evEl.innerHTML = ''; } return; }
    const reste = Math.max(0, (ev.fin - qq.now) / 1000), pct = Math.min(100, reste / Q.EVENEMENTS[ev.type].duree * 100), prete = ev.type === 'grosclient' && ev.fait >= ev.n, key = ev.type + ev.debut + (prete ? 'p' : '');
    if (lastEv !== key) {
      lastEv = key; evEl.hidden = false;
      const chrono = '<b class="ev-chrono"></b>', barre = '<i class="ev-barre"></i>', p = ev.i != null ? Q.PRODUITS[ev.i] : null;
      const html = {
        descente: () => `<div class="ev descente"><span class="ev-ico">${ICONS.QUARTIER.descente}</span><div class="ev-txt"><b>Descente de police !</b><span>${ev.n} touches pour tout planquer · prime <b>${fmt(ev.prime)}</b> · sinon ils embarquent ${fmt(ev.enjeu)}</span></div><button type="button" class="btn tapote" data-a="planquer"><small>Planque !</small><b class="ev-compte">0/${ev.n}</b></button>${barre}</div>`,
        grosclient: () => `<div class="ev grosclient ${prete ? 'prete' : ''}"><span class="ev-ico">${ICONS.QUARTIER.grosclient}</span><div class="ev-txt"><b>Un gros client</b><span>${ev.n} ${esc(p.pl)} · prime <b>${fmt(ev.prime)}</b> · <span class="ev-prog"></span></span></div>${prete ? '<button type="button" class="btn menthe" data-a="livrer"><small>C’est prêt</small><b>Livrer !</b></button>' : chrono}${barre}</div>`,
        soiree: () => `<div class="ev soiree"><span class="ev-ico">${ICONS.QUARTIER.soiree}</span><div class="ev-txt"><b>Soirée dans le quartier</b><span>Toutes les ventes ×${Q.EVENEMENTS.soiree.mult}</span></div>${chrono}${barre}</div>`,
        scooter: () => `<div class="ev scooter"><span class="ev-ico">${ICONS.QUARTIER.scooter}</span><div class="ev-txt"><b>Le livreur passe</b><span>Attrape le bonus avant qu’il reparte : <b>${fmt(ev.prime)}</b></span></div><button type="button" class="btn tapote" data-a="attraper"><small>Vite !</small><b>Attraper</b></button>${barre}</div>`,
      };
      evEl.innerHTML = html[ev.type]();
      const planquer = evEl.querySelector('[data-a="planquer"]');
      if (planquer) planquer.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); d.audio(); const r = Q.planquer(q()); if (!r.ok) return; d.son.tap(); d.buzz(8); if (r.fini) reussite(`Tout est planqué, la police repart bredouille : +${fmt(r.prime)}`); else planquer.querySelector('.ev-compte').textContent = `${r.taps}/${ev.n}`; });
      const livrer = evEl.querySelector('[data-a="livrer"]');
      if (livrer) livrer.addEventListener('click', (e) => { e.stopPropagation(); d.audio(); const r = Q.livrer(q()); if (r.ok) reussite(`Gros client livré : +${fmt(r.prime)}`); });
      const attraper = evEl.querySelector('[data-a="attraper"]');
      if (attraper) attraper.addEventListener('click', (e) => { e.stopPropagation(); d.audio(); const r = Q.attraper(q()); if (r.ok) reussite(`Le livreur te laisse ${fmt(r.prime)}`); });
    }
    const prog = evEl.querySelector('.ev-prog'); if (prog && ev.type === 'grosclient') prog.textContent = prete ? 'le client attend' : `${Q.fmt(ev.fait)} / ${Q.fmt(ev.n)}${qq.postes[ev.i].staff ? '' : ' · touche pour vendre !'}`;
    const ch = evEl.querySelector('.ev-chrono'); if (ch) ch.textContent = G.fmtChrono(reste);
    evEl.querySelector('.ev-barre').style.width = (prete ? 100 : pct) + '%';
  }
  function reussite(txt) { d.son.deblocage(); d.buzz([10, 30, 10]); d.toast(txt); if (scene3) scene3.fete(); lastHud = ''; hud(); renderCartes(true); d.save(); }

  // ─── les feuilles : les améliorations, les paliers ───
  function sheetAmeliorations() {
    const qq = q();
    const liste = Q.AMELIORATIONS.map((a) => { const fait = qq.ameliorations[a.id], ok = qq.billets >= a.cout; return `<div class="am ${fait ? 'fait' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p></div>${fait ? '<span class="ok">Acheté ✓</span>' : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${fmt(a.cout)}</b></button>`}</div>`; }).join('');
    d.openSheet(`<div class="pq-sheet"><h2>Les combines</h2><p class="sous">Des améliorations qui multiplient les ventes de la Planque, jusqu’à la fin de l’événement.</p><div class="liste-am">${liste}</div><button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
    d.on('[data-id]', (b) => { const r = Q.amelioration(q(), b.dataset.id); if (!r.ok) { d.son.non(); d.toast(`Il manque ${fmt(r.prix - q().billets)}`); return; } d.son.deblocage(); d.buzz([10, 30, 10]); d.toast(`${r.a.nom} : ${r.a.desc}`); renderCartes(true); lastHud = ''; hud(); d.save(); sheetAmeliorations(); });
    d.on('[data-a="pq-retour"]', () => d.closeSheet());
  }
  function sheetPaliers() {
    const qq = q(), nb = Q.paliersAtteints(qq).length;
    const lignes = Q.PALIERS.map((p) => { const atteint = qq.total >= p.total, recu = qq.paliers.includes(p.n); return `<div class="pq-palier ${atteint ? 'atteint' : ''}"><span class="pq-num">${p.n}</span><div><b>${esc(p.titre)} <small>${fmt(p.total)}</small></b><span>${esc(Q.phrasePalier(p))}</span></div><span class="pq-etat">${recu ? '✓' : atteint ? '…' : ''}</span></div>`; }).join('');
    d.openSheet(`<div class="pq-sheet"><div class="pq-palier-tete"><span class="pq-pic">${ICONS.QUARTIER.palier}</span><div><h2>Les paliers</h2><p class="sous">${fmt(qq.total)} de billets gagnés · ${nb}/12. Les mêmes seuils pour tout le monde ; chaque palier donne quelque chose pour la boulangerie, à vie.</p></div></div>
      <div class="pq-paliers">${lignes}</div>
      <p class="note">Les boosts se lancent quand tu veux dans la boutique (la pastille sous les objectifs). La tenue du quartier se porte depuis la garde-robe du boulanger.</p>
      <button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
    d.on('[data-a="pq-retour"]', () => d.closeSheet());
  }

  // ─── le bilan de fin : la Planque a fermé, tout le reste reste ───
  function montrerBilan() {
    const qq = q(); ecran = 'bilan'; el.dataset.ecran = ecran;
    if (scene3) { scene3.detruire(); scene3 = null; }
    cartes = []; cartesEl.innerHTML = ''; evEl.hidden = true; evEl.innerHTML = '';
    entete('La Planque a fermé', 'L’événement est terminé');
    const rec = d.recompenses ? d.recompenses() : null, rang = rec && rec.quartier ? rec.quartier : null, nb = Q.paliersAtteints(qq).length;
    const dons = [];
    if (qq.etoiles) dons.push(`${qq.etoiles} étoile${qq.etoiles > 1 ? 's' : ''}`);
    if (qq.boosts) dons.push(`${qq.boosts} boost${qq.boosts > 1 ? 's' : ''} en réserve`);
    if (qq.decos.length) dons.push(`${qq.decos.length} déco${qq.decos.length > 1 ? 's' : ''} du quartier dans la boutique`);
    if (qq.vetements.length) dons.push(`${qq.vetements.length} pièce${qq.vetements.length > 1 ? 's' : ''} de la tenue du quartier${Q.ensembleComplet(qq) ? ' (complète)' : ''}`);
    if (rang) dons.push(`${rang === 1 ? '1er' : rang + 'e'} du podium final : la tenue du quartier en or`);
    $('#pq-corps').innerHTML = `<div class="at-carte pq-bilan"><span class="pq-pic grand">${ICONS.QUARTIER.billets}</span>
      <h2>Bilan du quartier</h2>
      <p class="pq-grand">${fmt(qq.total)}</p><p class="sous">de billets gagnés en deux semaines · ${nb}/12 paliers${rang ? ` · ${rang === 1 ? '1er' : rang + 'e'} du classement de l’événement` : ''}</p>
      <div class="pq-stats"><span><small>Ventes</small><b>${Q.fmt(qq.stats.ventes)}</b></span><span><small>Descentes déjouées</small><b>${qq.stats.descentes}</b></span><span><small>Gros clients</small><b>${qq.stats.grosClients}</b></span><span><small>Scooters</small><b>${qq.stats.scooters}</b></span></div>
      ${dons.length ? `<p class="encadre"><b>Ce qui reste à vie :</b> ${dons.map(esc).join(' · ')}.</p>` : '<p class="encadre">La Planque a fermé sans rien laisser derrière elle. À la prochaine !</p>'}
      <button type="button" class="btn large beurre" data-pq="fin"><b>Retour à la boulangerie</b></button></div>`;
    $('#pq-corps').querySelector('[data-pq="fin"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
  }

  // ─── le décor 3D de la Planque : un canapé, une table basse avec la balance et les sachets, des néons, une lampe, la télé, deux apprentis ───
  // Bâti à l'ouverture, libéré à la fermeture (rendu et contexte compris) : la boutique garde son budget. ≈ 25 appels de dessin.
  function creerScene(cv) {
    if (!cv || typeof THREE === 'undefined' || !MODELES || !PERSOS) return null;
    const M = MODELES, TAU = Math.PI * 2, PITCH = 52 * Math.PI / 180, SY = Math.sin(PITCH), CY = Math.cos(PITCH), P = M.part, bo = (w, h, dd, r) => M.boite(Math.round(w * 2) / 2, Math.round(h * 2) / 2, Math.round(dd * 2) / 2, r);
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'low-power' }); } catch (e) { return null; }
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = false; renderer.setClearColor('#2E2B3A');
    // les modèles HD (src/hd.js) : demandés à l'ouverture si le palier le permet ; en attendant (ou en éco), le décor habituel
    const hdOk = () => typeof HDM !== 'undefined' && HDM.pret('planque') && HDM.permis(renderer);
    if (typeof HDM !== 'undefined' && HDM.permis(renderer)) HDM.charger('planque');
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    scene.add(new THREE.HemisphereLight('#C7B8FF', '#2E2B3A', 1.1));
    const dir = new THREE.DirectionalLight('#FFD6E0', 1.2); scene.add(dir, dir.target);
    const rose = new THREE.PointLight('#FF6B8B', 90, 600, 1), vert = new THREE.PointLight('#5FD3A4', 60, 500, 1); scene.add(rose, vert);
    const G3 = new THREE.Group(); scene.add(G3);
    const animes = [], persos = [], lum = (hex, k) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: k == null ? 1 : k });
    let W = 1, H = 1, murH = 1, t = 0, fete = 0, fetes = [], hdVu = 0, hdFx = null, rue = null;
    const wz = (ys) => (ys - murH) / SY, wy = (px) => px / CY, wd = (px) => px / SY;
    function batir() {
      while (G3.children.length) { const o = G3.children[0]; G3.remove(o); M.dispose(o); }
      animes.length = 0; persos.length = 0;
      const Hm = wy(murH), D = wd(H - murH), K = Math.max(0.6, Math.min(1.1, W / 390)), hd = hdOk(); hdVu = hd ? HDM.version : 0;
      // le sol (un parquet sombre), le mur du fond (brique sombre), la plinthe
      G3.add(M.mesh(M.plan(W, D), M.mat('#3A3642'), { x: W / 2, z: D / 2, rx: -Math.PI / 2 }, { ombre: false }));
      G3.add(M.mesh(bo(W, Hm, 8, 1), M.mat('#4A4458'), { x: W / 2, z: -4 }, { ombre: false }));
      const pr = [];
      for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) pr.push(P(bo(W / 9 - 3, Hm / 4 - 2, 1.2, 0.6), r % 2 === k % 2 ? '#514A62' : '#45405A', { x: (k + 0.5) * W / 9 + (r % 2 ? 5 : 0), y: (r + 0.5) * Hm / 4, z: 0.6 }));
      pr.push(P(bo(W, wy(4), 3, 0.8), '#2E2B3A', { x: W / 2, z: 1.5 }));
      // le canapé rouge, à gauche : l'assise, le dossier, deux accoudoirs, deux coussins
      const cx = W * 0.22, cz = wz(murH + 26 * K), cw = 92 * K;
      if (!hd) pr.push(P(bo(cw, 16, 34, 4), '#E1496C', { x: cx, y: 4, z: cz }), P(bo(cw, 30, 10, 4), '#C73C5C', { x: cx, y: 12, z: cz - 12 }), P(bo(12, 28, 34, 4), '#C73C5C', { x: cx - cw / 2 + 6, y: 4, z: cz }), P(bo(12, 28, 34, 4), '#C73C5C', { x: cx + cw / 2 - 6, y: 4, z: cz }));
      if (!hd) pr.push(P(bo(26, 9, 22, 3), '#FFC84A', { x: cx - 18, y: 20, z: cz + 2 }), P(bo(26, 9, 22, 3), '#5FD3A4', { x: cx + 18, y: 20, z: cz + 2 }));
      if (!hd) for (const sx of [-1, 1]) for (const sz of [-1, 1]) pr.push(P(M.cylindre(2, 2, 4, 6), '#2E2B3A', { x: cx + sx * (cw / 2 - 8), z: cz + sz * 12 }));
      // la table basse, au milieu : le plateau, les pieds, la balance (socle, colonne, fléau, deux plateaux), les sachets et les liasses
      const tx = W * 0.55, tz = wz(murH + 44 * K), tw = 80 * K, th = 22;
      if (!hd) pr.push(P(bo(tw, 3, 40, 1), '#6B4A3A', { x: tx, y: th, z: tz })); if (!hd) for (const sx of [-1, 1]) for (const sz of [-1, 1]) pr.push(P(bo(3, th, 3, 0.8), '#4A3328', { x: tx + sx * (tw / 2 - 5), z: tz + sz * 16 }));
      const bx = tx - 12, by = th + 3;
      pr.push(P(M.cylindre(7, 8, 2, 12), '#B9C6D2', { x: bx, y: by, z: tz }), P(M.cylindre(1.2, 1.2, 16, 6), '#8C939E', { x: bx, y: by + 2, z: tz }), P(bo(26, 1.4, 1.4, 0.4), '#8C939E', { x: bx, y: by + 18, z: tz }));
      for (const sx of [-1, 1]) { pr.push(P(M.cylindre(0.4, 0.4, 8, 4), '#8C939E', { x: bx + sx * 12, y: by + 10, z: tz }), P(M.cylindre(5, 4.2, 1.2, 10), '#DDE6EE', { x: bx + sx * 12, y: by + 9, z: tz })); }
      pr.push(P(M.sphere(2.2, 8), '#5FD3A4', { x: bx + 12, y: by + 12, z: tz }));
      for (let k = 0; k < 5; k++) pr.push(P(M.sphere(2.6, 8), k % 2 ? '#5FD3A4' : '#DDF3FF', { x: tx + 14 + (k % 3) * 7, y: by + 2.4, z: tz + 4 - Math.floor(k / 3) * 9, sy: 0.8 }));
      for (let k = 0; k < 3; k++) pr.push(P(bo(12, 2.2, 6, 0.6), '#8FE3C2', { x: tx + 26, y: by + k * 2.2, z: tz - 12 }));
      // la lampe sur pied, à droite ; la télé sur son meuble, à droite du mur ; le tapis
      const lx = W * 0.9, lz = wz(murH + 16 * K);
      if (!hd) pr.push(P(M.cylindre(8, 9, 2, 10), '#2E2B3A', { x: lx, z: lz }), P(M.cylindre(1.2, 1.2, 50, 6), '#2E2B3A', { x: lx, y: 2, z: lz }));
      pr.push(P(bo(46 * K, 12, 18, 1.5), '#4A3328', { x: W * 0.82, y: 0, z: wz(murH + 10 * K) }), P(bo(40 * K, 24, 3, 1.5), '#1E1B26', { x: W * 0.82, y: 13, z: wz(murH + 6 * K) }));
      if (!hd) pr.push(P(bo(W * 0.5, 0.8, 70, 0.4), '#56516B', { x: W * 0.5, z: wz(murH + 60 * K) }));
      if (hd) { // ESSAI HD : les meubles KayKit Furniture Bits à la place des blocs (même place, même taille)
        const pose = (nom, x, z, larg, o = {}) => { const m = HDM.modele(nom, 1, o); if (!m) return null; const k = larg / Math.max(m.userData.taille.x, m.userData.taille.z); m.scale.setScalar(k); m.position.set(x, o.y || 0, z); G3.add(m); return m; };
        pose('rug_oval_A', tx, tz + 4, tw * 1.7, { ombre: false });
        pose('couch_pillows', cx, cz - 2, cw * 1.05);
        const tb = pose('table_low', tx, tz, tw * 1.05); if (tb) tb.scale.y = th / tb.userData.taille.y;
        pose('lamp_standing', lx, lz, 26 * K); pose('cactus_medium_A', W * 0.05, wz(murH + 10 * K), 22 * K); pose('cactus_small_A', W * 0.66, wz(murH + 8 * K), 14 * K);
        pose('pictureframe_medium', W * 0.22, wz(murH) + 2, 40 * K, { y: Hm * 0.55, ombre: false }); pose('armchair_pillows', W * 0.88, wz(murH + 70 * K), 44 * K, { ry: -Math.PI / 2 });
        // la fenêtre sur la rue, de nuit : une petite scène City Builder rendue dans une texture, posée dans un cadre au mur
        if (!rue) rue = creerRue(); const fw = 84 * K, fh = Hm * 0.36, fx = W * 0.74, fy = Hm * 0.58;
        G3.add(M.mesh(M.plan(fw, fh), new THREE.MeshBasicMaterial({ map: rue.texture }), { x: fx, y: fy, z: 2.2 }, { ombre: false }));
        const cadre = []; for (const [cx2, cy2, w2, h2] of [[0, fh / 2, fw + 8, 5], [0, -fh / 2, fw + 12, 6], [-fw / 2, 0, 5, fh + 6], [fw / 2, 0, 5, fh + 6], [0, 0, 3, fh]]) cadre.push(P(bo(w2, h2, 4, 1), '#2A2433', { x: fx + cx2, y: fy + cy2 - h2 / 2, z: 3 }));
        G3.add(M.maille(cadre, { ombre: false }));
      }
      G3.add(M.maille(pr, { ombre: false }));
      // les néons au mur : un éclair rose et un rond menthe, un tube « OUVERT » qui grésille ; l'abat-jour et l'écran lumineux
      const nx = W * 0.5, ny = Hm * 0.62, zig = [[-0.25, 0.75], [0.1, 0.1], [-0.08, 0.1], [0.25, -0.75]].map(([u, v]) => [u * 22, v * 22]), tubes = [];
      for (let k = 0; k < zig.length - 1; k++) { const [x0, y0] = zig[k], [x1, y1] = zig[k + 1], l = Math.hypot(x1 - x0, y1 - y0); tubes.push(P(M.capsule(1.1, l, 6), '#FF6B8B', { x: nx + (x0 + x1) / 2, y: ny + (y0 + y1) / 2, z: 1.5, rz: Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2 })); }
      const neonRose = M.maille(tubes, { ombre: false }); neonRose.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#FF6B8B', emissiveIntensity: 1 }); G3.add(neonRose);
      const neonVert = M.mesh(M.tore(16, 1, TAU, 6, 24), lum('#5FD3A4', 1), { x: nx, y: ny, z: 1, sy: 1.15 }, { ombre: false }); G3.add(neonVert);
      const bande = M.mesh(bo(W * 0.3, 1.6, 1, 0.5), lum('#9BD0FF', 1), { x: W * 0.22, y: Hm * 0.8, z: 1.5 }, { ombre: false }); G3.add(bande);
      const abat = M.mesh(M.cylindre(9, 13, 14, 12), lum('#FFE27A', 0.5), { x: lx, y: 52, z: lz }, { ombre: false }); G3.add(abat);
      const ecran = M.mesh(bo(36 * K, 20, 1, 0.6), lum('#6CB8FF', 0.6), { x: W * 0.82, y: 15, z: wz(murH + 6 * K) + 2 }, { ombre: false }); G3.add(ecran);
      animes.push((E) => { const gr = Math.sin(E.t * 23) > 0.9 ? 0.2 : 1; neonRose.material.emissiveIntensity = 0.9 * gr; neonVert.material.emissiveIntensity = 0.7 + 0.3 * Math.sin(E.t * 2); ecran.material.emissiveIntensity = 0.45 + 0.3 * Math.abs(Math.sin(E.t * 5.3)); ecran.material.color.setHSL(0.55 + 0.1 * Math.sin(E.t * 1.7), 0.6, 0.6); rose.position.set(nx, wy(ny) * 0.6, 40); vert.position.set(lx, 50, lz + 10); });
      // les apprentis du quartier : le guetteur (bonnet, debout près du mur), la nourrice (chignon, assise sur le canapé) ; les suivants au fur et à mesure des embauches
      equipeDe(q(), K);
    }
    const tenues = [{ haut: '#2E2B3A', peau: '#C68B59', cheveux: '#2B2118', coiffure: 3, bonnet: '#2E2B3A' }, { haut: '#8A2B3A', peau: '#FFD7B5', cheveux: '#D9D9D9', coiffure: 2, lunettes: true }, { haut: '#B8A6FF', peau: '#F1B990', cheveux: '#B8762E', coiffure: 1 }, { haut: '#5FD3A4', peau: '#8D5A3C', cheveux: '#2B2118', coiffure: 0 }, { haut: '#FFC84A', peau: '#FFE3C9', cheveux: '#E0A61E', coiffure: 1, lunettes: true }, { haut: '#FF9A62', peau: '#5C3A21', cheveux: '#2B2118', coiffure: 3, bonnet: '#E1496C' }];
    function equipeDe(qq, K) {
      for (const p of persos) { G3.remove(p.g); if (p.hd) HDM.liberer(p.hd); else M.dispose(p.g); } persos.length = 0;
      const n = Math.min(6, 1 + qq.postes.filter((s) => s.staff).length), spots = [[0.1, 0.3, 0, false], [0.4, 0.52, 0, false], [0.72, 0.5, 2, false], [0.5, 0.95, 0, false], [0.66, 0.85, -1, false], [0.15, 0.95, 1, false]];
      const hd = hdOk();
      for (let k = 0; k < n; k++) {
        if (hd) { const [ux, uy, dir] = spots[k], assis = k === 1, a = HDM.perso(HDM.VARIANTES[(k + 1) % 4], tenues[k].haut); a.g.scale.setScalar(W * 0.08 * 0.72 * (K || 1));
          a.g.position.set(assis ? W * 0.22 + 14 : W * ux, assis ? 12 : 0, assis ? wz(murH + 22 * (K || 1)) : wz(murH + uy * 60 * (K || 1))); a.g.rotation.y = Math.PI + (assis ? 0 : { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI }[dir]);
          HDM.jouer(a, assis ? 'Sit_Chair_Idle' : k % 2 ? 'Interact' : 'Idle', 0); G3.add(a.g); persos.push({ g: a.g, hd: a, assis, dir, phase: k * 1.3 }); continue; }
        const g = PERSOS.creer(Object.assign({ sac: false, taille: 1 }, tenues[k])), [ux, uy, dir, assis] = spots[k];
        g.position.set(W * ux, assis ? 14 : 0, wz(murH + uy * 60 * (K || 1))); g.rotation.y = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI }[dir]; g.scale.setScalar(0.9 * (K || 1));
        G3.add(g); persos.push({ g, assis, dir, phase: k * 1.3 });
      }
    }
    const oAnim = { marche: false, phase: 0, assis: false, dir: 0, sac: false, or: false, pris: false, attend: true, plateau: false, produit: null, cle: false, t: 0, blink: 0, expression: 'neutre' };
    function creerRue() { // la rue de nuit derrière la fenêtre : deux façades, un lampadaire allumé, une bouche d'incendie, une voiture qui passe
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 60), rt = new THREE.WebGLRenderTarget(384, 240, { samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.userData.partagee = true; sc.background = new THREE.Color('#1A1630'); sc.fog = new THREE.Fog('#1A1630', 9, 22);
      sc.add(new THREE.HemisphereLight('#6E6AB8', '#1A1630', 0.9)); const lune = new THREE.DirectionalLight('#9FA8FF', 0.6); lune.position.set(-3, 6, 4); sc.add(lune);
      const lampe = new THREE.PointLight('#FFC873', 18, 9, 1.6); lampe.position.set(1.1, 2.6, 1.2); sc.add(lampe);
      const pose = (nom, x, z, haut, ry) => { const m = HDM.modele(nom, 1, { ombre: false }); if (!m) return null; m.scale.setScalar(haut / m.userData.taille.y); m.position.set(x, 0, z); m.rotation.y = ry || 0; sc.add(m); return m; };
      pose('building_D', -2.2, -2.5, 5.2); pose('building_F', 2.4, -2.6, 4.6);
      pose('streetlight', 1.4, 1.1, 3, -Math.PI / 2); pose('firehydrant', -0.9, 1.2, 0.5); pose('trash_A', 3.1, 0.9, 0.7); pose('dumpster', -3.4, 0.6, 1.1);
      const sol = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: '#2B2838', roughness: 0.9 })); sol.rotation.x = -Math.PI / 2; sc.add(sol);
      const trottoir = new THREE.Mesh(new THREE.BoxGeometry(40, 0.15, 2.6), new THREE.MeshStandardMaterial({ color: '#4A4658' })); trottoir.position.set(0, 0.07, 0.4); sc.add(trottoir);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#FFE0A0' })); halo.position.copy(lampe.position); sc.add(halo);
      const voiture = pose('car_sedan', -8, 2.6, 0.9, Math.PI / 2);
      cam.position.set(0, 1.5, 6.2); cam.lookAt(0, 1.4, 0);
      let tv = 0;
      return { texture: rt.texture, frame(dt) { tv += dt; if (voiture) { voiture.position.x = ((tv * 2.2) % 22) - 11; } halo.material.color.setScalar(0.9 + 0.1 * Math.sin(tv * 9)); renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null); },
        liberer() { rt.dispose(); sc.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); } };
    }
    function redim() {
      const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight); if (w === W && h === H && G3.children.length) return;
      W = w; H = h; murH = Math.round(h * 0.42);
      renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(W, H, false);
      camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
      const Zc = (H / 2 - murH) / SY; camera.position.set(W / 2, 1500 * SY, Zc + 1500 * CY); camera.up.set(0, 1, 0); camera.lookAt(W / 2, 0, Zc); camera.updateMatrixWorld();
      dir.position.set(W * 0.7, 700, Zc + 400); dir.target.position.set(W / 2, 0, Zc); dir.target.updateMatrixWorld();
      batir();
    }
    function frameScene(dt, qq) {
      redim(); t += dt;
      const E = { t };
      for (const f of animes) f(E);
      if (hdOk() ? hdVu !== HDM.version : hdVu !== 0) batir(); // les modèles viennent d'arriver, ou le palier est passé en éco
      if (rue && hdVu) rue.frame(dt);
      for (const p of persos) { if (p.hd) { HDM.jouer(p.hd, fete > 0 && !p.assis ? 'Cheer' : p.assis ? 'Sit_Chair_Idle' : (persos.indexOf(p) % 2 ? 'Interact' : 'Idle')); p.hd.mixer.update(dt); continue; } oAnim.phase = t * 2 + p.phase; oAnim.assis = p.assis; oAnim.dir = p.dir; oAnim.t = t; oAnim.blink = (t + p.phase) % 3.4; oAnim.expression = fete > 0 ? 'sourire' : 'neutre'; oAnim.attend = !p.assis; try { PERSOS.animer(p.g, oAnim); } catch (e) { /* un personnage sans ce champ */ } }
      if (fete > 0) fete -= dt;
      if (hdVu) { if (!hdFx || hdFx.W !== W || hdFx.H !== H) { if (hdFx) hdFx.liberer(); hdFx = HDM.effets(renderer, scene, camera, W, H, Math.min(1.5, window.devicePixelRatio || 1), { rayon: W * 0.1, ao: 2, halo: 1.5, seuil: 0.4, aoCouleur: '#120A18' }); hdFx.W = W; hdFx.H = H; } hdFx.rendre(dt); }
      else { if (hdFx) { hdFx.liberer(); hdFx = null; } renderer.render(scene, camera); }
    }
    redim();
    return {
      get hd() { return { actif: hdVu > 0, persos: persos.filter((p) => p.hd).length, rue: !!rue, effets: !!hdFx }; }, // les modèles HD (pour les tests)
      redim, frame: frameScene, equipe: (qq) => equipeDe(qq, Math.max(0.6, Math.min(1.1, W / 390))), vente: () => { }, fete: () => { fete = 2; },
      detruire() { try { G3.traverse((o) => { if (o.isMesh) { if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose(); const ms = [].concat(o.material || []); for (const m of ms) if (m && m !== M.MAT.vertex && !M.MATS.has(m)) m.dispose(); } }); } catch (e) { /* rien */ }
        try { if (rue) rue.liberer(); if (hdFx) hdFx.liberer(); for (const p of persos) if (p.hd) HDM.liberer(p.hd); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* rien */ } },
      get calls() { return renderer.info.render.calls; },
    };
  }

  return { init, ouvrir, fermer, annoncer, frame, retour, visible, masquer, majeur, synchroniserRecompenses, donnerPalier, sheetPaliers, get ouvert() { return ouvert(); }, get ecran() { return ecran; }, get scene() { return scene3; } };
})();
