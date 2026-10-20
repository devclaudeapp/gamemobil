/* LE FOURNIL — les événements à l'écran : un MOTEUR paramétré par une fiche, qui sert deux boutiques à part en plein écran par-dessus la
   boulangerie (comme l'Atelier) :
   · « Le Quartier » (13 → 27 oct. 2026, midi) : la Planque, derrière une porte « 18 ans et + », règles dans src/quartier.js (QUARTIER) ;
   · « La Maison hantée » (27 oct. midi → 2 nov. 2026, 20 h) : le Manoir, tous âges, mignon-effrayant, règles dans src/hantee.js (HANTEE).
   Les règles sont pures (testées dans Node) ; ici : l'écran, les cartes des produits (six, puis huit après le boss), les coups de pouce, le décor 3D (Three.js, bâti
   à l'ouverture et libéré à la fermeture : rien ne reste en mémoire quand on est dans la boulangerie), les paliers et leurs récompenses
   distribuées dans la boulangerie (étoiles, boosts en réserve, décos, vêtements de la garde-robe), l'annonce du premier jour, le bilan de
   fin. Le temps : HORLOGE.maintenant(), par deps.maintenant.
   EVENEMENTS.quartier (alias EVENEMENT, l'API d'avant, inchangée) et EVENEMENTS.hantee ont la même API ; EVENEMENTS.annoncer() les passe
   dans l'ordre (le bilan du Quartier d'abord, puis l'annonce de la Maison hantée : jamais deux annonces à la fois).

   La fiche d'un événement (F, bâtie ici) : cle (st[cle] : l'état), p (préfixe des ids de l'écran : pq, ht), racine (#planque, #hantee),
   R (le module de règles), nom, lieu, porte (18+), fmt (texte) / prix (HTML), ico, t (les textes), coups (par genre : taper, livrer,
   mult, attraper), genres (type → genre), actions (genre → fonction des règles), decos, scene, lot (HD). Pour la Maison hantée, ce que
   donne HANTEE.FICHE (src/hantee.js, groupe H1 : id, nom, lieu, devise { nom, un }, couleurs, textes, coups) passe par-dessus les
   valeurs par défaut écrites ici (repli tolérant : tout marche avec une fiche vide). Les coups de pouce de HANTEE : ceux de QUARTIER
   (descente, grosclient, soiree, scooter et planquer, livrer, attraper) ou d'autres noms, dont le genre se lit alors sur la forme du coup
   (n et taps : taper ; i et fait : livrer ; prime : attraper ; sinon mult) et l'action sur HANTEE.taper / livrer / attraper.
   Les activités (src/activites.js, communes à tous les événements : mini-jeux, contrats de la nuit, opérations) : une barre de trois
   boutons sous la scène et les mini-jeux en plein écran, bâtis ici pour toute fiche dont les règles exportent l'API des activités ;
   l'habillage (noms, textes, couleurs des toiles, motif) vient de R.MINI, R.TEXTES_ACTIVITES (la fiche de l'événement). Un coup de
   pouce en cours se met en pause pendant une partie, et pendant une courte sortie (R.pauseCoup, R.PAUSE_EV). */
const EVENEMENTS = (() => {
  'use strict';
  const G = GAME, $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const glob = typeof self !== 'undefined' ? self : this;
  // window.__sansQuartier (ou __sansEvenements) : un interrupteur des tests Playwright qui ne parlent pas des événements (posé par
  // addInitScript) : pendant leurs fenêtres, ni icône ni annonce ni bilan ne viennent couvrir ce qu'ils regardent. Personne ne le pose dans le jeu.
  const coupe = () => typeof window !== 'undefined' && !!(window.__sansQuartier || window.__sansEvenements);
  let calmeJusqua = 0; // un écran d'événement vient de se fermer : la prochaine annonce attend un peu (jamais deux annonces coup sur coup)

  // ─── le moteur : un écran d'événement pour une fiche ───
  function fabriquer(F) {
    const Q = F.R;
    let d = null, el, cartesEl, evEl, cartes = [], lastHud = '', lastEv = '', ecran = '', scene3 = null, dernierSave = 0, fileSheets = [], sheetOuverte = false;
    let act = null; // les activités propres à l'événement (la Maison hantée : src/hanteeactivites.js, F.activites), reliées aux règles et à la scène
    const id = (s) => el.querySelector(`#${F.p}-${s}`);
    const st = () => d.st();
    const now = () => d.maintenant();
    const q = () => Q.etat(st(), now());
    const fen = () => (Q.fenetreSure ? Q.fenetreSure(now(), d.sure ? d.sure() : null) : Q.fenetre(now())); // l'ouverture sur l'heure sûre (une horloge avancée hors ligne n'ouvre rien avant l'heure)
    const fmt = (n) => F.fmt(n), prix = (n) => F.prix(n);
    const boss = () => Q.PALIERS_BOSS || Q.PALIERS.length; // le 12e : le dernier palier « normal » ; au-delà, les paliers bonus (après le boss)
    const nbPaliers = (qq) => (qq && Q.paliersAtteints(qq).length >= boss() ? Q.PALIERS.length : boss()); // « 4/12 » jusqu'au boss, puis « 14/20 »
    const ouverte = (qq, a) => (Q.combineOuverte ? Q.combineOuverte(qq, a) : !a.apres); // une combine « après le boss » se montre une fois le palier franchi

    function init(deps) {
      d = deps; el = $(F.racine); if (!el || !Q) return false;
      cartesEl = id('cartes'); evEl = id('ev'); construireActivites();
      const ico = el.querySelector('.pq-ico'); if (ico) ico.innerHTML = F.ico.devise;
      if (F.habiller) F.habiller(el); // le gabarit propre à l'événement (la Maison hantée : ses touches d'Halloween et les places de ses activités)
      if (F.activites) act = F.activites.creer({ el, Q, F, d, q, now, scene: () => scene3, carte: (i) => (i === -1 ? carteRj : cartes[i]), fmt, prix, ico: (i) => F.ico.produit(Q.PRODUITS[i], i),
        hud: () => { lastHud = ''; hud(); }, save: () => d.save(), mini: () => miniOuvert() });
      if (F.couleurs) for (const [k, v] of Object.entries(F.couleurs)) if (/^#[0-9a-f]{3,8}$/i.test(String(v))) el.style.setProperty('--evt-' + k, v);
      el.querySelector('[data-pq="fermer"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
      el.querySelector('[data-pq="classement"]').addEventListener('click', () => { d.audio(); d.son.tap(); if (d.classement) d.classement(); });
      el.querySelector('[data-pq="paliers"]').addEventListener('click', () => { d.audio(); d.son.tap(); sheetPaliers(); });
      el.querySelector('[data-pq="ameliorations"]').addEventListener('click', () => { d.audio(); d.son.tap(); sheetAmeliorations(); });
      el.querySelectorAll('.pq-modes button').forEach((b) => b.addEventListener('click', () => { d.audio(); const qq = q(); qq.mode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode; el.querySelectorAll('.pq-modes button').forEach((x) => x.classList.toggle('actif', x === b)); renderCartes(true); }));
      cartesEl.addEventListener('click', onCarte);
      evEl.addEventListener('click', (e) => { if (e.target.closest('button')) return; evEl.classList.toggle('etendu'); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvert() && $('#feuille').hidden) { if (miniOuvert()) fermerMini(); else fermer(); } });
      window.addEventListener('resize', () => { if (scene3) scene3.redim(); });
      if (F.cle === 'hantee' || F.p === 'ht') st0 = () => d.st();
      synchroniserRecompenses();
      return true;
    }
    const ouvert = () => !!el && !el.hidden;
    // ce que l'icône du coin et l'annonce décident : l'événement est-il visible ? (fenêtre ouverte, pas masqué dans les Réglages)
    function visible() { if (!Q || !d || !st() || coupe()) return false; const qq = st()[F.cle]; return fen().ouvert && !(qq && qq.masque); }
    function masquer(on) { const qq = q(); qq.masque = !!on; d.save(); if (qq.masque && ouvert()) fermer(); }
    function majeur() { if (!d) return false; return !F.porte || !!(st() && st()[F.cle] && st()[F.cle].majeur); }
    function bilanEnAttente() { // fini, joué, bilan pas encore vu (et pas masqué) : il passe avant toute autre annonce
      if (!Q || !d || !st() || coupe()) return false; const qq = st()[F.cle];
      return Q.fenetre(now()).fini && !!qq && qq.total > 0 && !qq.bilan && !qq.masque;
    }

    // ─── les récompenses des paliers, distribuées dans la boulangerie (chacune une fois : q.paliers fait foi) ───
    function synchroniserRecompenses() { // au lancement : les vêtements gagnés sont (re)donnés à la garde-robe si elle existe, les décos posées
      const s = st(); if (!s || !s[F.cle]) return;
      const qq = q();
      if (typeof G.donnerVetement === 'function') for (const v of qq.vetements) { try { G.donnerVetement(s, v); } catch (e) { /* un id que la garde-robe ne connaît pas encore */ } }
      if (Q.verserRecette) { const n = Q.verserRecette(qq); if (n > 0) { s.etoiles += n; d.save(); } } // la recette du jour : des étoiles d'étape pas encore versées (une étape franchie dans l'absence de la fin)
      if (Q.verserBestiaire) { const n = Q.verserBestiaire(qq); if (n > 0) { s.etoiles += n; d.save(); } } // le bestiaire du Manoir : des étoiles d'une sorte complétée pas encore versées (l'appli fermée juste après)
      F.decos(qq.decos); if (F.synchro) F.synchro(s, qq);
      // la revue des récompenses (version 2) : une sauvegarde qui avait déjà franchi des paliers ou acheté des combines « après le boss »
      // reçoit la différence UNE FOIS (q.recompensesV2, posé par les règles), versée tout de suite ; la feuille qui le dit attend annoncer()
      if (Q.revueRecompenses) { const lot = Q.revueRecompenses(qq); if (lot) { if (lot.etoiles || lot.heures || lot.boosts.length) revueEnAttente = { lot, v: verser(s, lot) }; d.save(); } }
    }
    // un lot pour la boulangerie : { etoiles, heures (la prime : heures de son rythme), boosts: [{ mult, secs }] } → ce qui a été versé
    function verser(s, lot) {
      const v = { etoiles: 0, euros: 0, boosts: 0 };
      if (lot.etoiles > 0) { s.etoiles += lot.etoiles; v.etoiles = lot.etoiles; }
      if (lot.heures > 0 && typeof G.donnerPrimeHeures === 'function') v.euros = G.donnerPrimeHeures(s, lot.heures);
      for (const b of lot.boosts || []) if (G.donnerBoostReserve(s, b.mult, b.secs)) v.boosts++;
      return v;
    }
    const phraseVerse = (v, h) => [v.etoiles ? `+${v.etoiles} ★` : '', v.euros ? `+${G.fmtEur(v.euros)} (${h} h de gains)` : '', v.boosts ? `${v.boosts} boost${v.boosts > 1 ? 's' : ''} en réserve` : ''].filter(Boolean).join(', ');
    let revueEnAttente = null;
    function montrerRevue() { // « Les récompenses ont été revues » : une fois, quand la feuille est libre
      const { lot, v } = revueEnAttente; revueEnAttente = null; sheetOuverte = true;
      d.son.deblocage(); d.buzz([10, 30, 10]); if (d.fete) d.fete(); if (d.apres) d.apres();
      const l = [];
      if (v.etoiles) l.push(`${v.etoiles} étoile${v.etoiles > 1 ? 's' : ''} de plus (+${Math.round(v.etoiles * G.ETOILE_BONUS * 100)} % de gains, pour toujours)`);
      if (v.euros) l.push(`${G.fmtEur(v.euros)} pour la boulangerie : ${lot.heures} h de ses gains, d’un coup`);
      if (v.boosts) l.push(`${lot.boosts.map((b) => `un boost ×${b.mult} de ${G.fmtDuree(b.secs)}`).join(', ')} en réserve dans la boutique`);
      const quoi = [lot.paliers ? `${lot.paliers} palier${lot.paliers > 1 ? 's' : ''}` : '', lot.combines ? `${lot.combines} ${F.t.combineMot}${lot.combines > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ');
      d.openSheet(`<div class="pq-sheet ${F.classe}" data-revue="${esc(F.cle)}"><div class="pq-palier-tete"><span class="pq-pic">${F.ico.palier}</span><div><h2>Les récompenses ont été revues</h2><p class="sous">${esc(`${F.nom} : ${phraseVerse(v, lot.heures)}.`)}</p></div></div>
        <ul class="pq-dons">${l.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="encadre">${esc(F.t.revue(quoi))}</p>
        <button type="button" class="btn large beurre" data-a="pq-ok" style="margin-top:14px"><b>${esc(F.t.palierOk)}</b></button></div>`);
      d.on('[data-a="pq-ok"]', () => { d.son.tap(); d.closeSheet(); });
      const surFermeture = setInterval(() => { if ($('#feuille').hidden) { sheetOuverte = false; clearInterval(surFermeture); montrerSheetsEnAttente(); } }, 300);
    }
    function donnerPalier(p) {
      const s = st(), qq = q(), fait = Q.marquerPalier(qq, p.n); if (!fait) return null;
      const dons = [];
      if (p.etoiles) { s.etoiles += p.etoiles; dons.push(`${p.etoiles} étoile${p.etoiles > 1 ? 's' : ''} (+${Math.round(p.etoiles * G.ETOILE_BONUS * 100)} % de gains, pour toujours)`); }
      if (p.boost) { G.donnerBoostReserve(s, p.boost.mult, p.boost.secs); dons.push(`un boost ×${p.boost.mult} de ${G.fmtDuree(p.boost.secs)}, en réserve dans la boutique`); }
      if (p.prime && typeof G.donnerPrimeHeures === 'function') { const x = G.donnerPrimeHeures(s, p.prime); dons.push(`${G.fmtEur(x)} pour la boulangerie : ${p.prime} h de ses gains, d’un coup`); }
      if (p.deco) { F.decos(qq.decos); dons.push(F.t.decoDon[p.deco] || F.t.decoDefaut(p.deco)); }
      if (p.vetement) { let r = null; if (typeof G.donnerVetement === 'function') { try { r = G.donnerVetement(s, p.vetement); } catch (e) { r = null; } } const v = typeof G.vetement === 'function' ? G.vetement(p.vetement) : null; dons.push(`${v ? v.nom : F.t.vetementNom(p.vetement)} pour la garde-robe du boulanger${Q.ensembleComplet(qq) ? F.t.tenueComplete : ''}${r && r.nouveau === false ? ' (déjà là)' : ''}`); }
      if (F.apresPalier) F.apresPalier(s, p, dons);
      G.gagnerXp(s, 20);
      fileSheets.push({ p, dons }); d.save(); d.apres();
      return dons;
    }
    function rattraper() { const qq = q(); let n = 0; for (const p of Q.paliersDus(qq)) if (donnerPalier(p)) n++; return n; } // chaque palier dû, une fois (q.paliers fait foi)
    function montrerSheetsEnAttente() {
      if (sheetOuverte || !fileSheets.length || !$('#feuille').hidden) return;
      const { p, dons } = fileSheets.shift(); sheetOuverte = true;
      d.son.deblocage(); d.buzz([10, 30, 10, 30, 10]); if (d.fete) d.fete();
      d.openSheet(`<div class="pq-sheet ${F.classe}"><div class="pq-palier-tete"><span class="pq-pic">${F.ico.palier}</span><div><h2>Palier ${p.n} · ${esc(p.titre)}</h2><p class="sous">${esc(F.t.palierSous(fmt(p.total)))}</p></div></div>
        <ul class="pq-dons">${dons.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        ${p.n === boss() ? `<p class="encadre">${esc(F.t.palierFinal)}</p>` : p.n === Q.PALIERS.length && p.n > boss() ? `<p class="encadre">${esc(F.t.palierBonusFinal)}</p>` : p.n === boss() + 1 ? `<p class="encadre">${esc(F.t.palierBonus)}</p>` : ''}
        <button type="button" class="btn large beurre" data-a="pq-ok" style="margin-top:14px"><b>${esc(F.t.palierOk)}</b></button></div>`);
      d.on('[data-a="pq-ok"]', () => { d.son.tap(); d.closeSheet(); });
      const surFermeture = setInterval(() => { if ($('#feuille').hidden) { sheetOuverte = false; clearInterval(surFermeture); montrerSheetsEnAttente(); } }, 300);
    }

    // ─── ouvrir : l'annonce, la porte 18+ (le Quartier), l'écran, le bilan ───
    function annoncer() { // le premier jour (ou au premier lancement pendant l'événement) : une fois ; après la fin : le bilan, une fois
      if (!Q || !d) return false; const s = st(); if (!s || coupe()) return false;
      if (revueEnAttente && !ouvert() && !sheetOuverte && $('#feuille').hidden) { montrerRevue(); return true; } // les récompenses revues (une vieille sauvegarde) : avant tout le reste, même après la fin
      const f = fen(), qq = s[F.cle];
      if (f.fini) { if (qq && qq.total > 0 && !qq.bilan && !qq.masque && !ouvert()) { ouvrir(); return true; } return false; } // masqué : pas de bilan qui surgit
      // des paliers dus hors de la Planque (une mise à jour qui en ajoute : les paliers bonus d'une sauvegarde déjà au-delà du 12e) : donnés une fois, annoncés dans la boutique
      if (f.ouvert && qq && Array.isArray(qq.postes) && qq.annonce && (qq.majeur || !F.porte) && !qq.masque && !ouvert() && !sheetOuverte && $('#feuille').hidden && Q.paliersDus(Q.etat(s, now())).length) { rattraper(); montrerSheetsEnAttente(); return true; }
      if (!f.ouvert || (qq && (qq.masque || qq.annonce)) || !$('#feuille').hidden || ouvert()) return false;
      const neuf = q(); neuf.annonce = true; d.save();
      d.openSheet(F.t.annonce(f));
      if (F.prechargerAnnonce && typeof SCENE !== 'undefined' && SCENE.precharger) { try { SCENE.precharger(F.lot); } catch (e) { /* rien : elle se chargera à l'ouverture */ } } // la Maison hantée : sa HD se charge pendant qu'on lit l'annonce
      d.on('[data-a="pq-entrer"]', () => { d.son.tap(); d.closeSheet(); ouvrir(); });
      d.on('[data-a="pq-tard"]', () => { d.son.tap(); d.closeSheet(); });
      return true;
    }
    function ouvrir() {
      if (!Q || !el) return false;
      const f = fen(), qq = q();
      if (!f.ouvert && !f.fini) return false;
      if (qq.masque && !f.fini) return false;
      el.hidden = false; d.ouvert(); if (typeof SCENE !== 'undefined' && SCENE.alleger) SCENE.alleger(); // la boutique, cachée, rend sa passe d'effets
      if (f.fini) { montrerBilan(); return true; }
      if (F.porte && !qq.majeur) { montrerPorte(); return true; }
      entrer();
      return true;
    }
    function montrerPorte() {
      ecran = 'porte'; entete(F.lieu, 'Réservée aux adultes');
      el.dataset.ecran = ecran;
      id('corps').innerHTML = `<div class="at-carte pq-porte"><span class="pq-pic grand">${ICONS.QUARTIER.porte}</span>
        <h2>18 ans et plus</h2>
        <p>Derrière cette porte, une parodie de petit trafic de quartier, façon dessin animé : des noms, des gags, des billets qui n’existent pas. Rien de réel, mais pas pour les enfants.</p>
        <p class="sous">Tu as 18 ans ou plus ?</p>
        <button type="button" class="btn large sombre" data-pq="oui"><b>Oui, j’entre</b></button>
        <button type="button" class="btn large clair" data-pq="non" style="margin-top:8px"><b>Non, masquer l’événement</b></button></div>`;
      id('corps').querySelector('[data-pq="oui"]').addEventListener('click', () => { d.audio(); d.son.deblocage(); const qq = q(); qq.majeur = true; d.save(); entrer(); });
      id('corps').querySelector('[data-pq="non"]').addEventListener('click', () => { d.audio(); d.son.tap(); masquer(true); d.toast('L’événement est masqué. Tu peux le remettre dans les Réglages.'); });
    }
    // ─── la 3D : son contexte WebGL est rendu en sortant (forceContextLoss) ; un canvas perdu ne revit pas, alors chaque nouvelle scène part
    //     d'un canvas neuf. Si le téléphone refuse le contexte, on réessaie (5 fois, une par seconde) ; s'il le reprend en route, on recrée.
    let essais3 = 0, tEssai3 = 0;
    function canvasNeuf() { const v = id('canvas'); if (!v) return null; const n = v.cloneNode(false); v.replaceWith(n); return n; }
    function creer3(neuf) { const cv = neuf ? canvasNeuf() : id('canvas'); scene3 = cv ? F.scene(cv, { q }) : null; if (scene3) essais3 = 0; else { essais3++; tEssai3 = performance.now(); } }
    function liberer3() { if (scene3) { scene3.detruire(); scene3 = null; canvasNeuf(); } }
    function entete(t, s) { id('titre').textContent = t; id('sous').textContent = s || ''; }
    function entrer() {
      const qq = q(), t = now();
      if (!qq.ouvertLe) qq.ouvertLe = t;
      const abs = Q.absence(qq, t);
      ecran = F.ecran; el.dataset.ecran = ecran;
      id('corps').innerHTML = ''; // la porte ou le bilan s'effacent ; la scène, les cartes et la bannière sont des éléments fixes de l'écran
      entete(F.lieu, `Jour ${fen().jour} sur ${fen().jours}`);
      el.querySelectorAll('.pq-modes button').forEach((b) => b.classList.toggle('actif', String(qq.mode) === b.dataset.mode));
      construireCartes(); lastHud = ''; lastEv = ''; hud(); renderEv();
      if (!scene3) { essais3 = 0; creer3(false); }
      if (F.sons && typeof SONS !== 'undefined') SONS.jeu(F.sons); // le jeu de sons de l'événement : son jingle, sa musique, ses bruitages (src/sons.js)
      if (abs.total > 0 && abs.secs > 90) d.toast(F.t.absence(G.fmtDuree(abs.secs), fmt(abs.total)));
      else if (qq.stats.taps === 0) d.toast(F.t.premier);
      lastAct = ''; ramasser(true); majActivites(true); // une opération finie pendant l'absence : ramassée à l'ouverture, avec sa feuille
      if (act) act.ouvrir(); // la Maison hantée : la jauge du ×6, la file des clients-monstres, les apparitions, la commande de la nuit
      dernierSave = performance.now();
    }
    function fermer() {
      if (!ouvert()) return;
      if (miniOuvert()) fermerMini();
      if (ecran === F.ecran) { const qq = q(); qq.lastSeen = now(); d.save(); }
      if (ecran === 'bilan') { const qq = q(); qq.bilan = true; d.save(); }
      if (F.sons && typeof SONS !== 'undefined') SONS.jeu(null); // la musique s'arrête avec l'écran
      if (act) act.fermer();
      liberer3();
      el.hidden = true; ecran = ''; el.dataset.ecran = ''; cartes = []; cartesEl.innerHTML = ''; evEl.hidden = true; evEl.innerHTML = '';
      calmeJusqua = performance.now() + 20e3;
      if (d.ferme) d.ferme();
    }

    // au retour dans le jeu (téléphone verrouillé, autre appli) l'écran encore ouvert : les apprentis ont travaillé, au ralenti, comme à l'entrée
    function retour() {
      if (ecran !== F.ecran) return null;
      const qq = q(), t = now(); if (Q.fenetre(t).fini) { cloturer(); return null; } // fini pendant le sommeil : payé jusqu'à la fermeture, puis le bilan
      const abs = Q.absence(qq, t); renderEv();
      if (abs.total > 0 && abs.secs > 90) d.toast(F.t.absence(G.fmtDuree(abs.secs), fmt(abs.total)));
      if (!miniOuvert()) ramasser(true);
      return abs;
    }
    // la fermeture de l'événement, l'écran ouvert (en jouant, ou au retour d'un sommeil) : la boucle a payé jusqu'à son dernier pas (qq.now) ;
    // l'absence se paie de là jusqu'à la fermeture, une fois (montrerBilan, qq.absenceFin), jamais au-delà ; puis les activités s'arrêtent et le bilan
    function cloturer() {
      if (ecran !== F.ecran) return;
      const qq = q(); if (qq.now > (qq.lastSeen || 0)) qq.lastSeen = Math.min(qq.now, Q.FIN); // ce qui suit qq.lastSeen n'a pas encore été payé
      d.toast(F.t.ferme); montrerBilan();
    }
    // ─── la boucle : appelée chaque image par ui.js tant que l'écran est ouvert ───
    function frame(dt, t) {
      if (ecran !== F.ecran) return;
      const qq = q(), f = Q.fenetre(t);
      if (f.fini) { cloturer(); return; }
      if (miniOuvert()) { qq.evTimer = Math.max(qq.evTimer, 5); if (qq.ev && genre(qq.ev) !== 'mult' && Q.pauseCoup) Q.pauseCoup(qq, dt * 1000); } // une partie de mini-jeu : le coup de pouce à toucher attend, aucun ne surgit
      const out = Q.tick(qq, dt, t);
      if (act) act.pas(out.manoir || null); // les clients-monstres, les apparitions, la commande de la nuit : ce que les règles ont changé
      if (avecAct() && performance.now() - tAct > 400) { tAct = performance.now(); if (qq.operation && qq.operation.fin <= t) ramasser(!miniOuvert()); majActivites(); }
      if (out.ventes.length) { const gros = out.ventes.reduce((a, v) => a + v.montant, 0); if (Math.random() < 0.2 || out.ventes.some((v) => Q.PRODUITS[v.i].temps >= 12)) { d.son.vente(gros); if (scene3) scene3.vente(gros); } }
      if (out.nouvelEv) { const c = coup(out.nouvelEv); if (c.son === 'sirene' && d.son.sirene) d.son.sirene(); else d.son.evenement(); d.buzz([15, 40, 15]); d.toast(c.debut); if (scene3 && scene3.coup) scene3.coup(genre(out.nouvelEv)); }
      if (out.finEv) { const c = coup(out.finEv); d.toast(genre(out.finEv) === 'taper' ? c.perte(fmt((out.fin && out.fin.saisi) || 0)) : c.fin); if (genre(out.finEv) === 'taper') d.son.non(); }
      for (const p of out.paliers) if (donnerPalier(p) && d.confettis) d.confettis(1); // un palier atteint : confettis
      if (!miniOuvert()) { montrerSheetsEnAttente(); hud(); renderCartes(); renderEv(); } // sous un mini-jeu : un palier franchi attend la fin de la partie pour sa feuille, et l'écran caché n'est pas redessiné
      if (!scene3 && essais3 > 0 && essais3 < 6 && performance.now() - tEssai3 > 1000) creer3(true); // le contexte avait été refusé : on réessaie
      if (scene3 && scene3.perdu && performance.now() - scene3.perdu > 1000) { liberer3(); creer3(false); } // perdu en route et pas revenu : une scène neuve
      if (scene3 && !scene3.perdu && !miniOuvert()) scene3.frame(dt, qq); // sous un mini-jeu, la 3D attend (la boutique, elle, continue de vendre)
      if (act && !miniOuvert()) act.image(); // les bulles suivent les têtes des monstres
      if (performance.now() - dernierSave > 5000) { dernierSave = performance.now(); qq.lastSeen = t; d.save(); }
    }
    function hud() {
      const qq = q(), taux = Q.tauxParSeconde(qq), f = fen(), nb = Q.paliersAtteints(qq).length;
      const cl = d.rang ? d.rang() : null; // le classement de l'événement : null s'il n'existe pas (pas de serveur), sinon son rang (0 : pas encore classé)
      const pres = Q.presence ? presTxt(Q.presence(qq, now()).mult) : Q.PRESENCE; // la Maison hantée : le ×6 qui s'endort sans toucher (×1 endormi)
      const cle = `${fmt(qq.billets)}|${fmt(taux)}|${Q.fmtReste(f.reste)}|${nb}|${f.jour}|${cl}|${pres}`;
      if (cle === lastHud) return; lastHud = cle;
      id('billets').innerHTML = F.solde(qq.billets);
      id('taux').innerHTML = taux > 0 ? F.t.taux(prix(taux), pres) : F.t.tauxVide(pres);
      id('reste').textContent = `${F.t.reste} ${Q.fmtReste(f.reste)}`;
      id('sous').textContent = `Jour ${f.jour} sur ${f.jours}`;
      const bc = el.querySelector('[data-pq="classement"]'); bc.hidden = cl == null; bc.querySelector('b').textContent = cl ? (cl === 1 ? '1er' : cl + 'e') : 'Top';
      bc.setAttribute('aria-label', cl ? `Le classement de l’événement : tu es ${cl === 1 ? '1er' : cl + 'e'}` : 'Le classement de l’événement');
      const bp = el.querySelector('[data-pq="paliers"]'); bp.querySelector('b').textContent = `${nb}/${nbPaliers(qq)}`; bp.classList.toggle('pret', Q.paliersDus(qq).length > 0);
    }

    // ─── les cartes des produits (même grammaire que la boulangerie) : les six du début, puis les deux recettes « après le boss »,
    //     montrées verrouillées (« Après le palier 13 ») tant que leur palier n'est pas franchi ───
    const presTxt = (m) => { const r = Math.round(m * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ','); }; // ×6, ×3,5, ×1
    const multTxt = (m) => (Math.abs(m - Math.round(m)) < 0.005 ? String(Math.round(m)) : m.toFixed(2).replace('.', ',')); // ×2, ×1,41, ×1,19
    const paliersDe = (i) => (Q.paliersPoste ? Q.paliersPoste(i) : Q.PALIERS_POSTE);
    const gainPal = (pal, i) => (Q.gainPalier ? Q.gainPalier(pal, i) : 2); // ce que ce palier ajoute (le vrai rapport : ×2 aux anciens paliers, ×1,41 ou ×1,19 aux intercalés)
    // la première vente d'un produit pas encore débloqué : le vrai gain au niveau 1, à la main (présence, réputation, améliorations comprises)
    const premiereVente = (qq, i) => Q.revenuFournee(Object.assign({}, qq, { postes: qq.postes.map((x, k) => (k === i ? Object.assign({}, x, { niv: 1, staff: false }) : x)) }), i);
    function construireCartes() {
      cartesEl.innerHTML = ''; cartes = []; construireRecette();
      Q.PRODUITS.forEach((p, i) => { const c = document.createElement('article'); c.className = 'carte pq'; c.dataset.i = i; cartesEl.appendChild(c); cartes.push({ el: c, html: '' }); });
      renderCartes(true);
    }
    function renderCartes(force) {
      const qq = q(); renderRecette(force);
      Q.PRODUITS.forEach((p, i) => {
        const s = qq.postes[i], c = cartes[i]; if (!c) return;
        let html, cls;
        if (s.niv === 0) {
          const ferme = Q.recetteOuverte && !Q.recetteOuverte(qq, i), prev = !ferme && (i === 0 || qq.postes[i - 1].niv > 0), ok = qq.billets >= p.debloquer;
          cls = 'carte pq verrou' + (prev ? '' : ' secret') + (ferme ? ' apres' : '');
          const txt = ferme ? `${esc(p.desc)}` : `${esc(p.desc)} ${prev ? `Rapporte ${F.fmtPhrase(premiereVente(qq, i))} la vente.` : 'Débloque d’abord le produit précédent.'}`;
          html = `<div class="icone">${F.ico.produit(p, i)}</div><div class="corps"><h3>${esc(p.nom)}</h3><p>${txt}</p>
            ${ferme ? `<span class="pq-apres">${esc(F.t.recetteApres(p.apres))}</span>` : prev ? `<button type="button" class="btn ${ok ? 'menthe' : 'non'}" data-a="debloquer"><small>Débloquer</small><b>${prix(p.debloquer)}</b></button>` : ''}</div>`;
        } else {
          const n = Q.quantite(qq, i), px = Q.prixNiveaux(qq, i, n), ok = qq.billets >= px, pal = Q.prochainPalier(s.niv, i), prec = paliersDe(i).filter((x) => x <= s.niv).pop() || 0, franchit = pal && s.niv + n >= pal;
          const rem = Q.remise ? Q.remise(qq) : 1; // le Grossiste (ou le Marché des sorcières) : les niveaux à moitié prix
          const rapide = p.temps <= 1.5 && s.staff, gc = qq.ev && genre(qq.ev) === 'livrer' && qq.ev.i === i;
          cls = 'carte pq' + (s.staff ? ' auto' : ' manuel') + (s.actif ? ' actif' : '') + (gc ? ' gouter' : '');
          html = `${gc ? `<span class="badge-critique">${esc(coup(qq.ev).badge)}</span>` : ''}<div class="icone">${F.ico.produit(p, i)}<span class="niv">${s.niv}</span></div>
            <div class="corps"><h3><span class="nom">${esc(p.nom)}</span></h3><small class="pq-poste">${esc(p.poste)}</small>
              <div class="palier ${franchit ? 'bientot' : ''}">${pal ? `<span>Palier <b>${pal}</b> ×${multTxt(gainPal(pal, i))}</span><span>${pal - s.niv} niv.</span><i style="width:${((s.niv - prec) / (pal - prec) * 100).toFixed(0)}%"></i>` : `<span>Dernier palier · ×${multTxt(Q.palierMult(s.niv, i))}</span><i style="width:100%"></i>`}</div>
              <div class="barre"><i class="${rapide ? 'rapide' : ''}"></i><span class="rev">+${prix(Q.revenuFournee(qq, i))}</span>${s.staff || s.actif ? `<span class="tps">${G.fmtDuree(Q.temps(qq, i))}</span>` : '<span class="cuire">Touche !</span>'}</div></div>
            <div class="boutons"><button type="button" class="btn ${ok ? '' : 'non'}${rem < 1 ? ' promo' : ''}" data-a="ameliorer"><small>${rem < 1 ? `−${Math.round((1 - rem) * 100)} % ×${n}` : `Améliorer ×${n}`}</small><b>${prix(px)}</b>${franchit ? `<i class="pal-badge">palier ×${multTxt(gainPal(pal, i))}</i>` : ''}</button>
              ${s.staff ? `<div class="staff-ok pq"><span>${esc(p.staffNom)}</span></div>` : `<button type="button" class="btn beurre ${qq.billets >= Q.prixStaff(qq, i) ? '' : 'non'}" data-a="embaucher"><small>Embaucher</small><b>${prix(Q.prixStaff(qq, i))}</b></button>`}</div>`;
        }
        if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); }
        else if (c.el.className !== cls) c.el.className = cls;
        if (c.bar && !c.bar.classList.contains('rapide')) c.bar.style.width = (s.niv > 0 && s.actif ? Math.min(100, s.prog / Q.temps(qq, i) * 100) : 0).toFixed(1) + '%';
        if (act) act.barre(c, i); // la fenêtre « parfait » sur la barre de cuisson, la carte voulue par le client choisi
      });
    }
    function onCarte(e) {
      const art = e.target.closest('.carte'); if (!art) return;
      if (art.dataset.rj) { clicRecette(e); return; }
      const i = +art.dataset.i, btn = e.target.closest('button[data-a]'), qq = q();
      d.audio();
      if (btn) {
        const a = btn.dataset.a;
        if (a === 'debloquer' || a === 'ameliorer') {
          const r = Q.acheter(qq, i);
          if (!r.ok) { d.son.non(); d.toast(r.verrou ? (r.apres ? `${F.t.recetteApres(r.apres)} : franchis-le pour l’ouvrir.` : 'Débloque d’abord le produit précédent.') : `Il manque ${fmt(r.prix - qq.billets)}`); return; }
          if (r.deblocage) { d.son.deblocage(); d.buzz([10, 30, 10]); d.toast(F.t.nouveau(Q.PRODUITS[i].nom)); } else { d.son.achat(); d.buzz(8); }
          renderCartes(true); lastHud = ''; hud(); d.save(); return;
        }
        if (a === 'embaucher') {
          const r = Q.embaucher(qq, i);
          if (!r.ok) { d.son.non(); d.toast(`Il manque ${fmt(r.prix - qq.billets)}`); return; }
          d.son.embauche(); d.buzz([10, 30, 10]); d.toast(F.t.embauche(Q.PRODUITS[i].staffNom)); if (scene3) scene3.equipe(qq);
          renderCartes(true); lastHud = ''; hud(); d.save(); return;
        }
      }
      if (act && act.carte(i, e)) return; // la Maison hantée : servir le client choisi, ou la fournée parfaite (un toucher dans sa fenêtre)
      if (qq.postes[i].niv > 0 && !qq.postes[i].staff) { if (Q.lancer(qq, i)) { d.son.tap(); d.buzz(6); renderCartes(); } }
    }

    // ─── la recette du jour (src/activites.js, RECETTE_JOUR) : une carte à part, en tête de la liste, au style de la carte de saison de la
    //     boulangerie : le nom du jour, le niveau (commun à toutes les recettes), préparer ou améliorer, « Touche ! » puis la jauge de cuisson,
    //     la maîtrise (0 à 500 fournées, repères à 100 et 250), « Demain : … ». Une fournée cuite sort ici (ou pendant l'absence : les règles) ;
    //     les étoiles des étapes (q.recettes.aVerser) sont versées dans la boulangerie dès que la carte se rend, le décor posé avec les autres ───
    let carteRj = null;
    const avecRecette = () => !!(Q && Q.etatRecette && Q.RECETTES_JOUR);
    const icoRj = (r) => (typeof ICONS !== 'undefined' && ICONS.RECETTES_JOUR && ((r && ICONS.RECETTES_JOUR[r.icone]) || ICONS.RECETTES_JOUR.cuisine)) || '';
    function construireRecette() {
      carteRj = null; if (!avecRecette()) return;
      const c = document.createElement('article'); c.className = 'carte pq rj-carte'; c.dataset.rj = '1'; cartesEl.appendChild(c); carteRj = { el: c, html: '' };
    }
    function renderRecette(force) {
      const c = carteRj; if (!c) return; const qq = q(), t = now();
      const sortie = Q.sortirRecette(qq, t); if (sortie) recetteSortie(sortie); // la fournée est cuite : elle sort (une fois)
      if (qq.recettes.aVerser > 0) verserMaitrise(sortie ? sortie.etapes : null); // une étape franchie (ici, ou pendant l'absence)
      const e = Q.etatRecette(qq, t), T = TA(), r = e.four ? e.fr : e.r, M = e.maitrise, ok = qq.billets >= e.prix && e.ouverte;
      const reperes = e.etapes.filter((x) => x.n < M).map((x) => `<b class="rj-repere${x.faite ? ' fait' : ''}" style="left:${(x.n / M * 100).toFixed(1)}%"></b>`).join('');
      const maitrise = `<div class="palier rj-maitrise"><span>${esc(T.maitriseCarte || T.maitrise || 'Maîtrise')} <b>${Math.min(e.fournees, M)}</b>/${M}</span><span>${e.prochaine ? `+${e.prochaine.etoiles} ★` : 'maîtrisée'}</span><i style="width:${(Math.min(e.fournees, M) / M * 100).toFixed(1)}%"></i>${reperes}</div>`;
      const cuisson = e.niv > 0 && e.ouverte ? `<div class="barre"><i></i><span class="rev">+${prix(e.four ? e.four.gain : e.gain)}</span>${e.four ? `<span class="tps">${G.fmtDuree(e.reste / 1000)}</span>` : '<span class="cuire">Touche !</span>'}</div>`
        : `<p class="rj-desc">${esc(!e.ouverte ? 'La cuisine ouvre demain, à minuit.' : r.desc)}</p>`;
      const bouton = e.max ? '<div class="staff-ok pq"><span>Niveau max</span></div>'
        : `<button type="button" class="btn ${e.niv ? '' : 'beurre'} ${ok ? '' : 'non'}" data-a="rj-niv"><small>${e.niv ? 'Améliorer ×1' : 'Préparer'}</small><b>${prix(e.prix)}</b></button>`;
      const html = `<div class="icone">${icoRj(r)}${e.niv ? `<span class="niv">${e.niv}</span>` : ''}</div>
        <div class="corps"><h3><span class="nom">${esc(r.nom)}</span></h3><small class="rj-tag">${esc(T.recette || 'La recette du jour')}${e.four && e.fr !== e.r ? ' · d’hier' : ''}</small>
          ${cuisson}${maitrise}<small class="rj-demain">Demain : ${esc(e.demain.nom)}</small></div>
        <div class="boutons">${bouton}</div>`;
      const cls = 'carte pq rj-carte' + (e.niv > 0 && e.ouverte ? ' manuel' : '') + (e.four ? ' actif' : '') + (e.ouverte ? '' : ' ferme');
      if (force || html !== c.html) { c.html = html; c.el.className = cls; c.el.innerHTML = html; c.bar = c.el.querySelector('.barre i'); }
      else if (c.el.className !== cls) c.el.className = cls;
      if (c.bar) c.bar.style.width = ((e.four ? e.part : 0) * 100).toFixed(1) + '%';
      if (act) act.barre(c, -1);
    }
    function recetteSortie(o) { // une fournée sortie, l'écran ouvert : le son et le petit « + » de la scène
      d.son.vente(o.gain); if (scene3) scene3.vente(o.gain); lastHud = ''; hud(); d.save();
    }
    function verserMaitrise(etapes) { // les étoiles des étapes de la maîtrise, dans la boulangerie (une fois : verserRecette remet à zéro), le décor posé
      const s = st(), qq = q(), n = Q.verserRecette(qq); if (!(n > 0)) return;
      s.etoiles += n; F.decos(qq.decos); G.gagnerXp(s, 10);
      const deco = (etapes || []).find((x) => x.deco) || (!etapes && qq.recettes.etapes.includes(Q.RECETTE_JOUR.etapes[Q.RECETTE_JOUR.etapes.length - 1].n) && Q.DECO_RECETTE ? { deco: Q.DECO_RECETTE } : null);
      const dons = [`${n} étoile${n > 1 ? 's' : ''} (+${Math.round(n * G.ETOILE_BONUS * 100)} % de gains, pour toujours)`];
      if (deco) dons.push(F.t.decoDon[deco.deco] || Q.DECO_RECETTE_TXT || F.t.decoDefaut(deco.deco));
      const quoi = etapes && etapes.length ? `${etapes[etapes.length - 1].n} ${TA().unite || 'fournées'}` : 'une étape de plus';
      d.son.deblocage(); d.buzz([10, 30, 10, 30, 10]); if (d.confettis) d.confettis(0.8); d.save(); d.apres();
      if (!$('#feuille').hidden || sheetOuverte || miniOuvert()) { d.toast(`${TA().recette || 'La recette du jour'} : ${quoi}, +${n} ★ pour la boulangerie`); return; }
      sheetOuverte = true;
      d.openSheet(`<div class="pq-sheet ${F.classe}" data-rj-maitrise="1"><div class="pq-palier-tete"><span class="pq-pic">${(typeof ICONS !== 'undefined' && ICONS.RECETTES_JOUR && ICONS.RECETTES_JOUR.maitrise) || F.ico.palier}</span><div><h2>${esc(TA().maitrise || 'Maîtrise')} : ${esc(quoi)}</h2><p class="sous">${esc(TA().recette || 'La recette du jour')}, ${esc(TA().toutes || 'toutes recettes confondues')}</p></div></div>
        <ul class="pq-dons">${dons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <button type="button" class="btn large beurre" data-a="pq-ok" style="margin-top:14px"><b>${esc(F.t.palierOk)}</b></button></div>`);
      d.on('[data-a="pq-ok"]', () => { d.son.tap(); d.closeSheet(); });
      const surFermeture = setInterval(() => { if ($('#feuille').hidden) { sheetOuverte = false; clearInterval(surFermeture); montrerSheetsEnAttente(); } }, 300);
    }
    function clicRecette(e) { // le bouton : préparer ou améliorer ; la carte : lancer une fournée
      const qq = q(), t = now(), btn = e.target.closest('button[data-a="rj-niv"]');
      d.audio();
      if (btn) {
        const r = Q.preparerRecette(qq, t);
        if (!r.ok) { d.son.non(); d.toast(r.ferme ? 'La cuisine ouvre demain.' : r.max ? 'Niveau maximum.' : `Il manque ${fmt(r.prix - qq.billets)}`); return; }
        if (r.niv === 1) { d.son.deblocage(); d.buzz([10, 30, 10]); d.toast(`${Q.recetteDuJour(t).nom} : la cuisine est prête ! Touche la carte pour en cuire.`); } else { d.son.achat(); d.buzz(8); }
        renderRecette(true); lastHud = ''; hud(); d.save(); return;
      }
      if (act && act.carte(-1, e)) return; // la fournée parfaite de la recette du jour
      const r = Q.lancerRecette(qq, t);
      if (r.ok) { d.son.tap(); d.buzz(6); renderRecette(true); d.save(); }
      else if (r.tard) { d.son.non(); d.toast('Trop tard : l’événement ferme avant qu’elle sorte du four.'); }
      else if (r.ferme) { d.son.non(); d.toast('La cuisine ouvre demain.'); }
    }

    // ─── les coups de pouce : une bannière sur la scène, comme les événements de la boulangerie ───
    function genre(ev) { return F.genres[ev.type] || (ev.n != null && ev.taps != null ? 'taper' : ev.i != null && ev.fait != null ? 'livrer' : ev.prime != null ? 'attraper' : 'mult'); }
    function coup(ev) { const g = genre(ev), base = F.coups[g], sur = F.coupsType && F.coupsType[ev.type]; return sur ? Object.assign({}, base, sur) : base; }
    const action = (g) => { for (const n of [F.actions[g], g, { taper: 'planquer' }[g]]) if (n && typeof Q[n] === 'function') return Q[n]; return () => ({ ok: false }); };
    const dureeEv = (ev) => (ev.fin > ev.debut ? (ev.fin - ev.debut) / 1000 : (Q.EVENEMENTS && Q.EVENEMENTS[ev.type] && Q.EVENEMENTS[ev.type].duree) || 1); // la vraie durée du coup (une combine peut l'allonger)
    const multEv = (ev) => (Q.EVENEMENTS && Q.EVENEMENTS[ev.type] && Q.EVENEMENTS[ev.type].mult) || 2;
    function renderEv() {
      const qq = q(), ev = qq.ev;
      if (!ev) { if (lastEv) { lastEv = ''; evEl.hidden = true; evEl.innerHTML = ''; } return; }
      const g = genre(ev), c = coup(ev), reste = Math.max(0, (ev.fin - qq.now) / 1000), pct = Math.min(100, reste / dureeEv(ev) * 100), prete = g === 'livrer' && ev.fait >= ev.n, key = ev.type + ev.debut + (prete ? 'p' : '');
      if (lastEv !== key) {
        lastEv = key; evEl.hidden = false; evEl.dataset.type = ev.type;
        const chrono = '<b class="ev-chrono"></b>', barre = '<i class="ev-barre"></i>', p = ev.i != null ? Q.PRODUITS[ev.i] : null, ico = `<span class="ev-ico">${F.ico.coup(ev.type, g)}</span>`;
        const html = {
          taper: () => `<div class="ev ${c.cls}">${ico}<div class="ev-txt"><b>${esc(c.titre)}</b><span>${c.detail(ev, fmt)}</span></div><button type="button" class="btn tapote" data-a="planquer"><small>${esc(c.bouton)}</small><b class="ev-compte">0/${ev.n}</b></button>${barre}</div>`,
          livrer: () => `<div class="ev ${c.cls} ${prete ? 'prete' : ''}">${ico}<div class="ev-txt"><b>${esc(c.titre)}</b><span>${ev.n} ${esc(p ? p.pl : '')} · prime <b>${fmt(ev.prime)}</b> · <span class="ev-prog"></span></span></div>${prete ? `<button type="button" class="btn menthe" data-a="livrer"><small>C’est prêt</small><b>${esc(c.bouton)}</b></button>` : chrono}${barre}</div>`,
          mult: () => `<div class="ev ${c.cls}">${ico}<div class="ev-txt"><b>${esc(c.titre)}</b><span>Toutes les ventes ×${multEv(ev)}</span></div>${chrono}${barre}</div>`,
          attraper: () => `<div class="ev ${c.cls}">${ico}<div class="ev-txt"><b>${esc(c.titre)}</b><span>${c.detail(ev, fmt)}</span></div><button type="button" class="btn tapote" data-a="attraper"><small>Vite !</small><b>${esc(c.bouton)}</b></button>${barre}</div>`,
        };
        evEl.innerHTML = html[g]();
        const taper = evEl.querySelector('[data-a="planquer"]');
        if (taper) taper.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); d.audio(); const r = action('taper')(q()); if (!r || !r.ok) return; d.son.tap(); d.buzz(8); if (r.fini) reussite(c.reussite(fmt(r.prime))); else taper.querySelector('.ev-compte').textContent = `${r.taps}/${ev.n}`; });
        const livrer = evEl.querySelector('[data-a="livrer"]');
        if (livrer) livrer.addEventListener('click', (e) => { e.stopPropagation(); d.audio(); const r = action('livrer')(q()); if (r && r.ok) reussite(c.reussite(fmt(r.prime))); });
        const attraper = evEl.querySelector('[data-a="attraper"]');
        if (attraper) attraper.addEventListener('click', (e) => { e.stopPropagation(); d.audio(); const r = action('attraper')(q()); if (r && r.ok) reussite(c.reussite(fmt(r.prime))); });
      }
      const prog = evEl.querySelector('.ev-prog'); if (prog && g === 'livrer') prog.textContent = prete ? c.attend : `${Q.fmt(ev.fait)} / ${Q.fmt(ev.n)}${qq.postes[ev.i].staff ? '' : ' · touche pour vendre !'}`;
      const ch = evEl.querySelector('.ev-chrono'); if (ch) ch.textContent = G.fmtChrono(reste);
      evEl.querySelector('.ev-barre').style.width = (prete ? 100 : pct) + '%';
    }
    function reussite(txt) { d.son.deblocage(); d.buzz([10, 30, 10]); d.toast(txt); if (scene3) scene3.fete(); lastHud = ''; hud(); renderCartes(true); d.save(); }

    // ─── les feuilles : les améliorations, les paliers ───
    function sheetAmeliorations() {
      const qq = q();
      const paie = (a) => (a.apres && Q.phraseCombine ? Q.phraseCombine(a) : ''); // après le boss : ce qu'elle paie à la boulangerie (« + 16 h de gains à la boulangerie, +2 ★ »)
      const ligne = (a) => { const fait = qq.ameliorations[a.id], ok = qq.billets >= a.cout, p = paie(a); return `<div class="am ${fait ? 'fait' : ''}${a.apres ? ' bonus' : ''}"><div><h3>${esc(a.nom)}</h3><p>${esc(a.desc)}</p>${p ? `<p class="am-paie">${esc(p)}${a.prime && G.primeHeures ? ` <small>(≈ ${G.fmtEur(G.primeHeures(st(), a.prime))})</small>` : ''}</p>` : ''}</div>${fait ? '<span class="ok">Acheté ✓</span>' : `<button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-id="${a.id}"><small>Acheter</small><b>${prix(a.cout)}</b></button>`}</div>`; };
      const bonus = Q.AMELIORATIONS.filter((a) => a.apres), ouvertes = bonus.filter((a) => ouverte(qq, a));
      const liste = Q.AMELIORATIONS.filter((a) => !a.apres).map(ligne).join('')
        + (ouvertes.length ? `<h3 class="pq-inter">${esc(F.t.apresBoss)}</h3><p class="pq-inter-sous">${esc(F.t.amBonus)}</p>${ouvertes.map(ligne).join('')}` : '')
        + (bonus.length > ouvertes.length ? `<p class="note pq-am-bientot">${esc(F.t.amBientot(bonus.length - ouvertes.length, Math.min(...bonus.filter((a) => !ouverte(qq, a)).map((a) => a.apres || boss()))))}</p>` : '');
      d.openSheet(`<div class="pq-sheet ${F.classe}"><h2>${esc(F.t.amTitre)}</h2><p class="sous">${esc(F.t.amSous)}</p><div class="liste-am">${liste}</div><button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
      d.on('[data-id]', (b) => { const r = Q.amelioration(q(), b.dataset.id); if (!r.ok) { d.son.non(); d.toast(`Il manque ${fmt(r.prix - q().billets)}`); return; } d.son.deblocage(); d.buzz([10, 30, 10]);
        let plus = ''; if (r.a.apres && (r.a.prime || r.a.etoiles)) { const lot = Q.lotCombine ? Q.lotCombine(r.a) : { etoiles: r.a.etoiles || 0, heures: r.a.prime || 0 }, v = verser(st(), lot); plus = ` · la boulangerie reçoit ${phraseVerse(v, lot.heures)}`; if (d.confettis) d.confettis(0.6); d.apres(); } // après le boss : elle paie aussi la boulangerie
        d.toast(`${r.a.nom} : ${r.a.desc}${plus}`); renderCartes(true); lastHud = ''; hud(); d.save(); sheetAmeliorations(); });
      d.on('[data-a="pq-retour"]', () => d.closeSheet());
    }
    function sheetPaliers() {
      const qq = q(), nb = Q.paliersAtteints(qq).length;
      const ligne = (p) => { const atteint = qq.total >= p.total, recu = qq.paliers.includes(p.n); return `<div class="pq-palier ${atteint ? 'atteint' : ''}${p.bonus ? ' bonus' : ''}"><span class="pq-num">${p.n}</span><div><b>${esc(p.titre)} <small>${prix(p.total)}</small></b><span>${esc(Q.phrasePalier(p))}</span></div><span class="pq-etat">${recu ? '✓' : atteint ? '…' : ''}</span></div>`; };
      const bonus = Q.PALIERS.filter((p) => p.bonus); // après le boss : sous leur intertitre
      const lignes = Q.PALIERS.filter((p) => !p.bonus).map(ligne).join('') + (bonus.length ? `<h3 class="pq-inter">${esc(F.t.apresBoss)}</h3><p class="pq-inter-sous">${esc(F.t.apresBossSous)}</p>${bonus.map(ligne).join('')}` : '');
      d.openSheet(`<div class="pq-sheet ${F.classe}"><div class="pq-palier-tete"><span class="pq-pic">${F.ico.palier}</span><div><h2>Les paliers</h2><p class="sous">${esc(F.t.paliersSous(fmt(qq.total), nb, nbPaliers(qq)))}</p></div></div>
        <div class="pq-paliers">${lignes}</div>
        <p class="note">${esc(F.t.paliersNote)}</p>
        <button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
      d.on('[data-a="pq-retour"]', () => d.closeSheet());
    }

    // ─── le bilan de fin : la boutique de l'événement a fermé, tout le reste reste ───
    function montrerBilan() {
      const qq = q(); ecran = 'bilan'; el.dataset.ecran = ecran;
      if (F.sons && typeof SONS !== 'undefined') SONS.jeu(null);
      if (act) act.fermer();
      liberer3();
      cartes = []; cartesEl.innerHTML = ''; evEl.hidden = true; evEl.innerHTML = '';
      // parti avant la fermeture, revenu après : les apprentis ont travaillé jusqu'à la fermeture (une fois, au ralenti, plafonné comme toute absence)
      if (qq.lastSeen && qq.lastSeen < Q.FIN && !qq.absenceFin) { qq.absenceFin = true; Q.absence(qq, Q.FIN); d.save(); }
      if (avecAct() && qq.operation) Q.ramasserOperation(qq, Math.min(now(), Q.FIN)); // une opération en cours à la fermeture : finie avant elle (on ne lance rien qui la dépasse), comptée
      if (miniOuvert()) fermerMini(); // une partie de mini-jeu en cours à la fermeture : arrêtée, elle ne paie rien après la fin
      rattraper(); fileSheets = []; // un palier dû pas encore donné (les paliers bonus d'une vieille sauvegarde) : compté dans le bilan, sans feuille
      entete(F.t.bilanTitre, 'L’événement est terminé'); const bp = el.querySelector('[data-pq="paliers"] b'); if (bp) bp.textContent = `${Q.paliersAtteints(qq).length}/${nbPaliers(qq)}`;
      const rec = d.recompenses ? d.recompenses() : null, rang = rec ? F.rangFinal(rec) : null, nb = Q.paliersAtteints(qq).length;
      const dons = [];
      if (qq.etoiles) dons.push(`${qq.etoiles} étoile${qq.etoiles > 1 ? 's' : ''}`);
      if (qq.boosts) dons.push(`${qq.boosts} boost${qq.boosts > 1 ? 's' : ''} en réserve`);
      if (qq.heures) dons.push(`${qq.heures} h de gains versées à la boulangerie`);
      if (qq.decos.length) dons.push(F.t.bilanDecos(qq.decos.length));
      const tenue = qq.vetements.filter((v) => !Q.VETEMENTS || Q.VETEMENTS.includes(v)), trophees = qq.vetements.filter((v) => Q.VETEMENTS && !Q.VETEMENTS.includes(v));
      if (tenue.length) dons.push(`${tenue.length} pièce${tenue.length > 1 ? 's' : ''} ${F.t.bilanTenue}${Q.ensembleComplet(qq) ? ' (complète)' : ''}`);
      for (const v of trophees) { const o = typeof G.vetement === 'function' ? G.vetement(v) : null; dons.push(`${o ? o.nom : v} (le trophée du palier ${Q.PALIERS.length})`); }
      if (F.bilanPlus) for (const t of F.bilanPlus(qq)) dons.push(t);
      if (rang) dons.push(`${rang === 1 ? '1er' : rang + 'e'} du podium final : ${F.t.bilanOr}`);
      const stats = F.stats.map(([nom, cles]) => { const k = [].concat(cles).find((x) => qq.stats[x] != null); const v = k ? qq.stats[k] : 0; return `<span><small>${esc(nom)}</small><b>${k === 'ventes' ? Q.fmt(v) : v}</b></span>`; }).join('');
      id('corps').innerHTML = `<div class="at-carte pq-bilan ${F.classe}"><span class="pq-pic grand">${F.ico.bilan}</span>
        <h2>${esc(F.t.bilanH2)}</h2>
        <p class="pq-grand">${prix(qq.total)}</p><p class="sous">${esc(F.t.bilanSous)} · ${nb}/${nbPaliers(qq)} paliers${rang ? ` · ${rang === 1 ? '1er' : rang + 'e'} du classement de l’événement` : ''}</p>
        <div class="pq-stats">${stats}</div>
        ${dons.length ? `<p class="encadre"><b>Ce qui reste à vie :</b> ${dons.map(esc).join(' · ')}.</p>` : `<p class="encadre">${esc(F.t.bilanVide)}</p>`}
        <button type="button" class="btn large beurre" data-pq="fin"><b>Retour à la boulangerie</b></button></div>`;
      id('corps').querySelector('[data-pq="fin"]').addEventListener('click', () => { d.audio(); d.son.tap(); fermer(); });
    }


    // ═══ les activités (src/activites.js : le moteur commun à tous les événements ; l'habillage vient de la fiche de l'événement) ═══
    // Une barre de trois boutons sous la scène : Mini-jeux, Contrats (la pastille : combien sont à réclamer), Opération (son chrono quand
    // elle tourne). Les mini-jeux s'ouvrent en plein écran par-dessus la boutique, avec la mécanique de l'Atelier (src/atelier.js) : le
    // temps de la partie est celui de performance.now(), avancé par pas de 1/60 s ; un trou de plus d'une seconde (l'arrière-plan) est une
    // pause ; une touche fait d'abord avancer la partie jusqu'à son instant ; aucune heure du téléphone : seule la fin de partie lit
    // HORLOGE (d.maintenant). Pendant la partie, la boutique continue de tourner (frame ne s'arrête pas) ; un coup de pouce à toucher
    // attend la fin de la partie (en pause, Q.pauseCoup), et aucun nouveau ne surgit.
    const MPAS = 1 / 60, MTROU = 1;
    const avecAct = () => !!(Q && Q.finirMini && Q.MINI);
    const TA = () => Object.assign({ mini: 'Mini-jeux', contrats: 'Contrats', operation: 'Opération', saisie: 'Une saisie', saisieTxt: (m) => `Une partie du gain s’est perdue en route : ${m}.`, enCours: 'En cours' }, Q.TEXTES_ACTIVITES || {});
    const icoAct = (k) => (typeof ICONS !== 'undefined' && ICONS.ACTIVITES && ICONS.ACTIVITES[k]) || '';
    let barreAct = null, mv = null, mz = null, lastAct = '', tAct = 0, miniEcran = '', miniJeu = null, partie = null, rafMini = 0, horlogeMini = 0, resultatMini = null;
    const mid = (k) => mv.querySelector(`[data-mini="${k}"]`);
    const miniOuvert = () => !!mv && !mv.hidden;
    const DECOR = () => (Q.MINI && Q.MINI.decor) || {};

    function construireActivites() {
      if (!avecAct() || barreAct) return;
      const t = TA();
      barreAct = document.createElement('div'); barreAct.className = 'pq-act'; barreAct.setAttribute('role', 'group'); barreAct.setAttribute('aria-label', 'Les activités');
      barreAct.innerHTML = [['mini', t.mini], ['contrats', t.contrats], ['operation', t.operation]].map(([k, nom]) => `<button type="button" class="pq-act-btn" data-act="${k}"><span class="pq-act-ico">${icoAct(k)}</span><span class="pq-act-txt"><b>${esc(nom)}</b><small></small></span>${k === 'contrats' ? '<i class="pq-pastille" hidden></i>' : ''}</button>`).join('');
      el.querySelector('.pq-scene').after(barreAct);
      barreAct.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; d.audio(); d.son.tap(); ({ mini: sheetMini, contrats: sheetContrats, operation: sheetOperation })[b.dataset.act](); });
      mv = document.createElement('div'); mv.className = 'pq-mini'; mv.hidden = true; mv.setAttribute('role', 'dialog'); mv.setAttribute('aria-modal', 'true');
      mv.innerHTML = `<div class="at-haut"><button type="button" class="at-fermer" data-mini="fermer" aria-label="Quitter le mini-jeu"><i class="ico">${(ICONS.UI && ICONS.UI.fermer) || '×'}</i></button><div class="at-titre"><b data-mini="titre"></b><small data-mini="sous"></small></div><b class="at-chrono" data-mini="chrono" hidden></b></div>
        <div class="at-bandeau" data-mini="bandeau" hidden></div><p class="pq-mini-consigne" data-mini="consigne"></p><div class="pq-mini-zone" data-mini="zone"></div>`;
      el.appendChild(mv); mz = mid('zone');
      mid('fermer').addEventListener('click', () => { d.audio(); d.son.tap(); fermerMini(); });
      window.addEventListener('resize', () => { if (partie && partie.T) partie.T.redim(); });
    }
    // les trois petites lignes de la barre : les parties payées qui attendent, les contrats faits, le chrono de l'opération
    function majActivites(force) {
      if (!barreAct || ecran !== F.ecran) return;
      const qq = q(), t = now(), ouv = Q.activitesOuvertes(t), j = Q.jetonsMini(qq, t), n = Q.aReclamer(qq, t), op = Q.etatOperation(qq, t), l = Q.etatContrats(qq, t);
      const mini = !ouv || j.plafond ? 'pour le record' : j.jetons >= 1 ? `${j.jetons} payée${j.jetons > 1 ? 's' : ''}` : `dans ${G.fmtDuree(Math.max(60, j.prochain / 1000))}`;
      const ctr = !ouv ? 'dès demain' : n ? `${n} à réclamer` : `${l.filter((c) => c.reclame).length}/${l.length} faits`;
      const opt = op ? (op.finie ? 'terminée !' : G.fmtChrono(op.reste / 1000)) : !ouv ? 'dès demain' : 'à lancer';
      const ch = document.querySelector('#feuille [data-op-chrono]'); if (ch && op) { ch.textContent = op.finie ? 'Terminée !' : G.fmtChrono(op.reste / 1000); const b = document.querySelector('#feuille [data-op-barre]'); if (b) b.style.width = (op.part * 100).toFixed(1) + '%'; }
      const cle = `${mini}|${ctr}|${n}|${opt}`; if (!force && cle === lastAct) return; lastAct = cle;
      const b = (k) => barreAct.querySelector(`[data-act="${k}"]`);
      b('mini').querySelector('small').textContent = mini; b('mini').classList.toggle('pret', ouv && j.payable);
      b('contrats').querySelector('small').textContent = ctr; b('contrats').classList.toggle('pret', n > 0);
      const pa = b('contrats').querySelector('.pq-pastille'); pa.hidden = !n; pa.textContent = String(n);
      b('contrats').setAttribute('aria-label', `${TA().contrats} : ${ctr}`);
      b('operation').querySelector('small').textContent = opt; b('operation').classList.toggle('actif', !!op && !op.finie); b('operation').classList.toggle('pret', !!op && op.finie);
    }

    // ─── l'opération : lancée depuis sa feuille ; ramassée dès qu'elle est finie (écran ouvert), ou à l'ouverture suivante ───
    function ramasser(feuille) {
      if (!avecAct()) return null; const qq = q(), r = Q.ramasserOperation(qq, now()); if (!r) return null;
      const t = TA(), txt = r.saisi > 0 ? `${r.o.nom} : ${t.saisieTxt(fmt(r.saisi))} Il reste +${fmt(r.net)}.` : `${r.o.nom} : réussie, +${fmt(r.net)} !`;
      if (r.saisi > 0) d.son.non(); else { d.son.deblocage(); d.buzz([10, 30, 10]); if (scene3) scene3.fete(); }
      if (feuille && $('#feuille').hidden && !sheetOuverte) {
        d.openSheet(`<div class="pq-sheet ${F.classe}"><div class="pq-palier-tete"><span class="pq-pic">${icoAct('operation')}</span><div><h2>${esc(r.o.nom)}</h2><p class="sous">${r.saisi > 0 ? esc(t.saisie) : 'Mission accomplie'} · ${r.o.min} min</p></div></div>
          <p class="pq-grand pq-op-gain">+${prix(r.net)}</p>${r.saisi > 0 ? `<p class="encadre">${esc(t.saisieTxt(fmt(r.saisi)))}</p>` : '<p class="encadre">Tout est rentré, rien n’a été perdu en route.</p>'}
          <button type="button" class="btn large beurre" data-a="pq-op-ok" style="margin-top:14px"><b>Ramasser</b></button></div>`);
        d.on('[data-a="pq-op-ok"]', () => { d.son.tap(); d.closeSheet(); });
      } else d.toast(txt);
      lastHud = ''; hud(); renderCartes(true); d.save(); majActivites(true); return r;
    }
    function sheetOperation() {
      const qq = q(), t = now(), e = Q.etatOperation(qq, t), T = TA();
      if (e && e.finie) { ramasser(true); return; }
      let corps;
      if (e) corps = `<div class="pq-op-cours"><b>${esc(e.o.nom)}</b><p>${esc(e.o.desc)}</p><span class="pq-op-barre"><i data-op-barre style="width:${(e.part * 100).toFixed(1)}%"></i></span>
          <div class="at-infos"><span><small>Fin dans</small><b data-op-chrono>${G.fmtChrono(e.reste / 1000)}</b></span><span><small>Gain promis</small><b>${prix(e.op.gain)}</b></span><span><small>Risque</small><b>${Math.round(e.o.risque * 100)} %</b></span></div>
          <p class="note">${esc(T.enCours)} : l’opération continue même si tu quittes l’écran ou le jeu. Le gain t’attend ici à ton retour.</p></div>`;
      else {
        const ouv = Q.activitesOuvertes(t), f = fen();
        corps = (ouv ? '' : '<p class="encadre">Les opérations ouvrent demain, à minuit : aujourd’hui, tout le monde part de zéro.</p>') + `<div class="liste-am">${Q.OPERATIONS.map((o) => { const tard = f.reste < o.min * 60e3, ok = ouv && !tard;
          return `<div class="am pq-op"><div><h3>${esc(o.nom)} <small>${o.min} min</small></h3><p>${esc(o.desc)}</p><p class="pq-op-chiffres">Gain ${prix(Q.gainOperation(qq, o))} · risque ${Math.round(o.risque * 100)} %${tard ? ' · trop tard aujourd’hui' : ''}</p></div><button type="button" class="btn ${ok ? 'lavande' : 'non'}" data-op="${o.id}"><small>Lancer</small><b>${o.min} min</b></button></div>`; }).join('')}</div>
          <p class="note">Une seule à la fois. Elle tourne même hors de l’écran et pendant ton absence ; le gain est fixé au départ, et un risque (${esc(T.saisie.toLowerCase())}) peut en emporter ${Math.round(Q.SAISIE * 100)} %.</p>`;
      }
      d.openSheet(`<div class="pq-sheet ${F.classe}"><div class="pq-palier-tete"><span class="pq-pic">${icoAct('operation')}</span><div><h2>${esc(T.operation)}</h2><p class="sous">${e ? esc(T.enCours) : 'Un coup de 5, 15 ou 60 minutes'}</p></div></div>${corps}
        <button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
      d.on('[data-op]', (b) => { const r = Q.lancerOperation(q(), b.dataset.op, now()); if (!r.ok) { d.son.non(); d.toast(r.ferme ? 'Les opérations ouvrent demain.' : r.tard ? 'Trop tard : l’événement ferme avant la fin.' : 'Une opération tourne déjà.'); return; }
        d.son.achat(); d.buzz([10, 30, 10]); d.toast(`${r.o.nom} : c’est parti pour ${r.o.min} min !`); d.save(); majActivites(true); sheetOperation(); });
      d.on('[data-a="pq-retour"]', () => d.closeSheet());
    }

    // ─── les contrats de la nuit ───
    function sheetContrats() {
      const qq = q(), t = now(), l = Q.etatContrats(qq, t);
      const lignes = l.length ? l.map((c) => `<div class="pq-ctr${c.reclame ? ' fait' : c.pret ? ' pret' : ''}"><div class="pq-ctr-txt"><b>${esc(c.texte)}</b><span class="pq-ctr-barre"><i style="width:${(c.fait / c.n * 100).toFixed(0)}%"></i></span>
          <small>${Q.fmt ? Q.fmt(c.fait) : c.fait}/${Q.fmt ? Q.fmt(c.n) : c.n}${c.boost ? ` · + un boost ×${c.boost.mult} de ${G.fmtDuree(c.boost.secs)} pour la boulangerie` : ''}</small></div>
          ${c.reclame ? '<span class="ok">Réclamé ✓</span>' : `<button type="button" class="btn ${c.pret ? 'menthe' : 'non'}" data-k="${c.k}"><small>${c.pret ? 'Réclamer' : 'En cours'}</small><b>${prix(c.prime)}</b></button>`}</div>`).join('')
        : '<p class="encadre">Les premiers contrats arrivent demain, à minuit : aujourd’hui, tout le monde part de zéro.</p>';
      d.openSheet(`<div class="pq-sheet ${F.classe}"><div class="pq-palier-tete"><span class="pq-pic">${icoAct('contrats')}</span><div><h2>Les contrats de la nuit</h2><p class="sous">Trois objectifs du jour, les mêmes pour tout le monde. De nouveaux à minuit.</p></div></div>
        <div class="pq-ctrs">${lignes}</div><p class="note">Ils se comptent depuis ton premier passage du jour. Chacun se réclame une fois ; la prime suit ton rythme du moment.</p>
        <button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
      d.on('[data-k]', (b) => { const r = Q.reclamerContrat(q(), +b.dataset.k, now()); if (!r.ok) { d.son.non(); d.toast(r.deja ? 'Déjà réclamé.' : 'Pas encore rempli.'); return; }
        if (r.boost && typeof G.donnerBoostReserve === 'function') G.donnerBoostReserve(st(), r.boost.mult, r.boost.secs);
        reussite(`Contrat rempli : +${fmt(r.prime)}${r.boost ? ` et un boost ×${r.boost.mult} en réserve dans la boutique` : ''}`); d.apres(); majActivites(true); sheetContrats(); });
      d.on('[data-a="pq-retour"]', () => d.closeSheet());
    }

    // ─── les mini-jeux : la feuille du choix, l'accueil (règles, record, gain), la partie, le résultat ───
    function ligneGainMini() {
      const qq = q(), j = Q.jetonsMini(qq, now()), pp = Q.primePleineMini(qq);
      if (!j.ouvertes) return 'Les parties paient à partir de demain : aujourd’hui, on joue pour le record.';
      if (j.plafond) return `<b>Plafond du jour atteint</b> (${j.parJour} parties payées, ${prix(j.gains)}) : pour le record jusqu’à minuit.`;
      if (j.jetons < 1) return `Prochaine partie payée dans <b>${G.fmtDuree(Math.max(60, j.prochain / 1000))}</b> ; d’ici là, pour le record.`;
      return `<b>${j.jetons} partie${j.jetons > 1 ? 's' : ''} payée${j.jetons > 1 ? 's' : ''}</b> en attente (une de plus toutes les ${Q.MINI.periode} min, ${j.parJour} par jour). Une belle partie rapporte jusqu’à <b>${prix(pp)}</b>.`;
    }
    function sheetMini() {
      const qq = q(), rec = qq.mini.records;
      d.openSheet(`<div class="pq-sheet ${F.classe}"><div class="pq-palier-tete"><span class="pq-pic">${icoAct('mini')}</span><div><h2>Les mini-jeux</h2><p class="sous">De 30 à 45 secondes ; la boutique continue de tourner.</p></div></div>
        <p class="pq-act-info">${ligneGainMini()}</p>
        <div class="pq-jeux">${Q.MINI.jeux.map((g) => `<button type="button" class="pq-jeu" data-jeu="${g.id}"><span class="pq-jeu-ico">${icoAct(g.id)}</span><span class="pq-jeu-txt"><b>${esc(g.nom)}</b><small>${esc(g.desc)}</small><small class="pq-jeu-rec">Record ${rec[g.id] ? Q.fmt(rec[g.id]) : '—'} · ${Math.round(g.duree)} s</small></span></button>`).join('')}</div>
        <button type="button" class="btn large sombre" data-a="pq-retour" style="margin-top:14px"><b>Retour</b></button></div>`);
      d.on('[data-jeu]', (b) => { d.son.tap(); d.closeSheet(); ouvrirMini(b.dataset.jeu); });
      d.on('[data-a="pq-retour"]', () => d.closeSheet());
    }
    function enteteMini(t, s, chrono) { mid('titre').textContent = t; mid('sous').textContent = s || ''; mid('chrono').hidden = !chrono; const b = mid('bandeau'); b.hidden = true; b.innerHTML = ''; mid('consigne').textContent = ''; }
    function pilules(html) { const b = mid('bandeau'); b.hidden = false; if (b.innerHTML !== html) b.innerHTML = html; }
    function ouvrirMini(jid) {
      const g = Q.jeuMini(jid); if (!g || !mv) return;
      arreterMini(); miniJeu = g; miniEcran = 'accueil'; resultatMini = null; mv.hidden = false; mv.dataset.jeu = jid; el.classList.add('en-mini');
      enteteMini(g.nom, `${TA().mini} · ${F.lieu}`);
      const rec = q().mini.records[jid];
      mz.innerHTML = `<div class="at-carte pq-mini-carte"><span class="at-icone">${icoAct(jid)}</span><ol class="at-regles">${(g.regles || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
        <div class="at-infos"><span><small>Record</small><b>${rec ? Q.fmt(rec) : '—'}</b></span><span><small>Durée</small><b>${Math.round(g.duree)} s</b></span></div>
        <p class="at-gain">${ligneGainMini()}</p><button type="button" class="btn large beurre" data-mini="jouer"><b>C’est parti !</b></button></div>`;
      mz.querySelector('[data-mini="jouer"]').addEventListener('click', () => { d.audio(); d.son.tap(); demarrerMini(jid); });
    }
    function fermerMini() { arreterMini(); if (mv) { mv.hidden = true; mz.innerHTML = ''; } miniEcran = ''; miniJeu = null; resultatMini = null; if (el) el.classList.remove('en-mini'); majActivites(true); }
    function arreterMini() { cancelAnimationFrame(rafMini); rafMini = 0; if (partie && partie.fin) partie.fin(); partie = null; }
    function demarrerMini(jid) {
      arreterMini(); miniEcran = 'jeu'; mz.innerHTML = ''; horlogeMini = performance.now(); enteteMini(miniJeu.nom, `${TA().mini} · ${F.lieu}`, true);
      const graine = Math.floor(Math.random() * 4294967296) >>> 0, M = Q.MOTEURS[jid];
      partie = ({ guet: vueGuet, compte: vueCompte, tournee: vueTournee })[jid](M, M.nouveau(graine));
      const boucle = () => { if (!partie) return; rattraperMini(performance.now()); if (partie && partie.e.fini) { terminerMini(); return; } partie.vue(); rafMini = requestAnimationFrame(boucle); };
      rafMini = requestAnimationFrame(boucle);
    }
    function rattraperMini(t) { // amène la partie jusqu'à l'instant t (ms de performance.now()) par pas de 1/60 s au plus ; un long trou est une pause
      if (!partie) return; let dt = (t - horlogeMini) / 1000; if (!(dt > 0)) return; horlogeMini = t;
      if (dt > MTROU) return;
      while (dt > 1e-6 && partie && !partie.e.fini) { const h = Math.min(MPAS, dt); partie.pas(h); dt -= h; }
    }
    const instantMini = (ev) => { const n = performance.now(), t = ev && ev.timeStamp; return Number.isFinite(t) && t > 0 ? Math.min(n, Math.max(horlogeMini, t)) : n; };
    function terminerMini() {
      const g = miniJeu, e = partie.e, bilan = partie.bilan(); arreterMini();
      const qq = q(), r = Q.finirMini(qq, g.id, e.score, d.maintenant()); resultatMini = r; miniEcran = 'resultat'; d.save(); lastHud = ''; hud();
      if (r.prime > 0 || r.record) { d.son.deblocage(); d.buzz([10, 30, 10]); if (scene3) scene3.fete(); } else d.son.tap();
      enteteMini(g.nom, 'Partie terminée');
      const gain = r.prime > 0 ? `<p class="at-prime">+${prix(r.prime)}</p><p class="at-gain">${r.jetons >= 1 && !r.plafond ? `Encore ${r.jetons} partie${r.jetons > 1 ? 's' : ''} payée${r.jetons > 1 ? 's' : ''} en attente.` : 'Les prochaines parties paient quand un jeton revient (toutes les ' + Q.MINI.periode + ' min).'}</p>`
        : r.ferme ? '<p class="at-gain">Aujourd’hui, pour le record : les parties paient à partir de demain.</p>'
          : r.pourLeRecord ? `<p class="at-gain"><b>${r.plafond ? 'Plafond du jour atteint' : 'Pas de partie payée en attente'} :</b> le record compte, le gain reviendra ${r.plafond ? 'demain' : 'avec le prochain jeton'}.</p>`
            : '<p class="at-gain">Pas de gain cette fois : vise un meilleur score.</p>';
      mz.innerHTML = `<div class="at-carte pq-mini-carte at-resultat${r.record ? ' record' : ''}">${r.record ? '<span class="at-ruban">Nouveau record !</span>' : ''}<span class="at-icone">${icoAct(g.id)}</span>
        <p class="at-score" data-score="${r.score}">${Q.fmt(r.score)}<small>point${r.score > 1 ? 's' : ''}</small></p><p class="at-bilan">${esc(bilan)}</p>
        <div class="at-infos"><span><small>Record</small><b>${Q.fmt(qq.mini.records[g.id])}</b></span><span><small>Gagné aujourd’hui</small><b>${prix(qq.mini.gains)}</b></span></div>${gain}
        <button type="button" class="btn large beurre" data-mini="rejouer"><b>Rejouer</b></button><button type="button" class="btn large clair" data-mini="retour" style="margin-top:8px"><b>Retour</b></button></div>`;
      const carte = mz.querySelector('.at-resultat'); carte.classList.add('repos'); setTimeout(() => carte.classList.remove('repos'), 600); // les touches en rafale de la fin ne tombent pas sur un bouton
      mz.querySelector('[data-mini="rejouer"]').addEventListener('click', () => { d.audio(); d.son.tap(); ouvrirMini(g.id); });
      mz.querySelector('[data-mini="retour"]').addEventListener('click', () => { d.son.tap(); fermerMini(); });
      majActivites(true);
    }

    // ─── une toile nette qui remplit son cadre (comme l'Atelier) ; un doigt se lit d'après le rectangle affiché ───
    function toileMini(parent) {
      const cv = document.createElement('canvas'); cv.className = 'at-toile'; parent.appendChild(cv);
      const o = { cv, ctx: cv.getContext('2d'), W: 1, H: 1, k: 1 };
      o.redim = () => { const k = Math.min(3, window.devicePixelRatio || 1), r = cv.getBoundingClientRect(); o.k = k; o.W = Math.max(1, r.width || parent.clientWidth); o.H = Math.max(1, r.height || parent.clientHeight); cv.width = Math.round(o.W * k); cv.height = Math.round(o.H * k); o.ctx.setTransform(k, 0, 0, k, 0, 0); };
      o.ajuster = () => { const r = cv.getBoundingClientRect(); if (Math.abs(r.width - o.W) > 0.5 || Math.abs(r.height - o.H) > 0.5) o.redim(); };
      o.point = (ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) * o.W / (r.width || 1), (ev.clientY - r.top) * o.H / (r.height || 1)]; };
      o.ecran = (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + x * r.width / o.W, r.top + y * r.height / o.H]; };
      o.redim(); return o;
    }
    const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    function mot(c, f, t) { const age = t - f.t0, al = Math.max(0, 1 - Math.max(0, age - 0.5) / 0.5); c.save(); c.globalAlpha = al; c.font = `700 ${f.taille || 22}px Fredoka, Nunito, sans-serif`; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(f.txt, f.x, f.y - age * 40); c.fillStyle = f.couleur; c.fillText(f.txt, f.x, f.y - age * 40); c.restore(); }
    const motsVivants = (c, fl, t) => { for (let i = fl.length - 1; i >= 0; i--) { if (t - fl[i].t0 > 1) fl.splice(i, 1); else mot(c, fl[i], t); } };
    const pill = (nom, v, chaud) => `<span class="at-pill${chaud ? ' chaud' : ''}"><small>${nom}</small><b>${v}</b></span>`;

    // ═══ 1. Le guet : la rue de nuit et la patrouille (le Quartier), le couloir et le petit fantôme (la Maison hantée), des formes neutres sinon ═══
    function vueGuet(M, e) {
      const D = DECOR(), T = toileMini(mz), fl = [], R = M.regles; let temps = 0, flash = 0;
      const geo = () => { const x0 = 26, x1 = T.W - 26, y = Math.round(T.H * 0.68); return { x0, x1, w: x1 - x0, y, X: (u) => x0 + u * (x1 - x0) }; };
      mid('consigne').textContent = miniJeu.consigne || '';
      T.cv.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); d.audio(); rattraperMini(instantMini(ev)); if (e.fini) return;
        const g = geo(), x = g.X(e.x), r = M.toucher(e); if (!r) return;
        if (r.type === 'parfait') { d.son.vente(Math.pow(10, Math.min(6, 1 + r.combo))); d.buzz(r.combo >= 3 ? [10, 30, 10] : 12); flash = temps; fl.push({ txt: r.combo > 1 ? `Parfait ! ×${r.combo}` : 'Parfait !', x, y: g.y - 70, t0: temps, couleur: D.accent2, taille: 26 }); }
        else if (r.type === 'bon') { d.son.tap(); d.buzz(8); fl.push({ txt: 'Bien !', x, y: g.y - 70, t0: temps, couleur: D.accent }); }
        else { d.son.non(); d.buzz(30); fl.push({ txt: r.type === 'tot' ? 'Trop tôt !' : 'Trop tard !', x, y: g.y - 70, t0: temps, couleur: '#FF6B8B' }); }
      });
      function decor(c, g) {
        const W = T.W, H = T.H; c.fillStyle = D.fond; c.fillRect(0, 0, W, H);
        if (D.motif === 'quartier') { // des immeubles, leurs fenêtres allumées, le trottoir, la chaussée
          for (let k = 0; k < 6; k++) { const bx = k * W / 6 - 6, bh = H * (0.28 + 0.12 * ((k * 7) % 3)), by = g.y - 40 - bh; c.fillStyle = k % 2 ? '#3A3550' : '#433D5C'; c.fillRect(bx, by, W / 6 + 4, bh + 40);
            for (let r = 0; r < 4; r++) for (let s = 0; s < 2; s++) { const on = ((k * 5 + r * 3 + s) % 4) !== 0; c.fillStyle = on ? 'rgba(255,214,120,.85)' : 'rgba(30,27,38,.8)'; c.fillRect(bx + 10 + s * (W / 12), by + 14 + r * 22, 10, 12); } }
          c.fillStyle = '#4A4458'; c.fillRect(0, g.y - 40, W, 30); c.fillStyle = D.sol; c.fillRect(0, g.y - 10, W, H - g.y + 10);
          c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.setLineDash([18, 14]); c.beginPath(); c.moveTo(0, g.y + 26); c.lineTo(W, g.y + 26); c.stroke(); c.setLineDash([]);
        } else if (D.motif === 'hantee') { // un couloir violet, des portraits, un tapis
          c.fillStyle = '#2A2140'; c.fillRect(0, 0, W, g.y - 10); for (let k = 0; k < 4; k++) { const px = 30 + k * (W - 60) / 3.2; c.fillStyle = '#C8A24A'; rr(c, px - 18, H * 0.16, 36, 46, 6); c.fill(); c.fillStyle = '#3E3456'; rr(c, px - 13, H * 0.16 + 5, 26, 36, 4); c.fill(); c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(px, H * 0.16 + 22, 7, 0, Math.PI * 2); c.fill(); }
          c.fillStyle = D.sol; c.fillRect(0, g.y - 10, W, H - g.y + 10); c.fillStyle = '#6B2E4F'; c.fillRect(0, g.y + 8, W, 26);
        } else { c.fillStyle = D.sol; c.fillRect(0, g.y - 10, W, H - g.y + 10); }
      }
      function passant(c, x, y) {
        if (D.motif === 'quartier') { const bleu = Math.sin(temps * 14) > 0; // la voiture de patrouille, ses gyrophares
          c.save(); c.translate(x, y); c.scale(1.25, 1.25); c.fillStyle = '#F6F7FB'; c.strokeStyle = '#1E1B26'; c.lineWidth = 2; rr(c, -34, -26, 68, 22, 8); c.fill(); c.stroke(); rr(c, -20, -40, 40, 16, 6); c.fill(); c.stroke();
          c.fillStyle = '#2B5BD7'; c.fillRect(-34, -18, 68, 6); c.fillStyle = bleu ? '#4FA3FF' : '#FF4D6A'; rr(c, -9, -47, 8, 7, 2); c.fill(); c.fillStyle = bleu ? '#FF4D6A' : '#4FA3FF'; rr(c, 1, -47, 8, 7, 2); c.fill();
          c.fillStyle = '#1E1B26'; for (const sx of [-20, 20]) { c.beginPath(); c.arc(sx, -4, 7, 0, Math.PI * 2); c.fill(); } c.restore(); return; }
        if (D.motif === 'hantee') { const fy = y - 34 + Math.sin(temps * 5) * 4; // le petit fantôme, un drap qui flotte
          c.save(); c.translate(x, fy); c.scale(1.25, 1.25); c.fillStyle = 'rgba(246,238,221,.95)'; c.strokeStyle = '#1E1824'; c.lineWidth = 2; c.beginPath(); c.arc(0, -8, 18, Math.PI, 0); c.lineTo(18, 16);
          for (let k = 0; k < 4; k++) c.quadraticCurveTo(18 - k * 9 - 4.5, 22 + (k % 2 ? -4 : 4), 18 - (k + 1) * 9, 16); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = '#1E1824'; c.beginPath(); c.arc(-6, -8, 2.6, 0, Math.PI * 2); c.arc(6, -8, 2.6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#FF9FB2'; c.beginPath(); c.arc(-10, -2, 2.4, 0, Math.PI * 2); c.arc(10, -2, 2.4, 0, Math.PI * 2); c.fill(); c.restore(); return; }
        c.fillStyle = D.accent2; c.beginPath(); c.arc(x, y - 18, 16, 0, Math.PI * 2); c.fill();
      }
      function dessiner() {
        const c = T.ctx, g = geo(); c.clearRect(0, 0, T.W, T.H); decor(c, g);
        const cx = g.X(e.cible), large = e.tol * g.w, coeur = e.tol * 0.4 * g.w, actif = e.phase === 'passe';
        // la lumière (le lampadaire, la lanterne) : un halo ; au sol, la zone et son cœur (le parfait)
        const hx = cx, hy = g.y - 120;
        c.fillStyle = D.accent + (actif ? '40' : '22'); c.beginPath(); c.moveTo(hx - 8, hy + 10); c.lineTo(hx + 8, hy + 10); c.lineTo(cx + large, g.y); c.lineTo(cx - large, g.y); c.closePath(); c.fill(); // le cône de lumière
        const hl = c.createRadialGradient(hx, g.y - 20, 4, hx, g.y - 20, Math.max(40, large * 1.6)); hl.addColorStop(0, D.accent + (actif ? 'AA' : '66')); hl.addColorStop(1, D.accent + '00'); c.fillStyle = hl; c.fillRect(hx - large * 2 - 40, hy - 40, large * 4 + 80, 200);
        c.strokeStyle = D.motif === 'hantee' ? '#8E5CF7' : '#6E6A80'; c.lineWidth = 4; c.beginPath(); c.moveTo(hx, g.y - 10); c.lineTo(hx, hy); c.lineTo(hx + (D.motif === 'hantee' ? 0 : 14), hy); c.stroke();
        c.fillStyle = D.accent; c.beginPath(); if (D.motif === 'hantee') { c.arc(hx, hy + 12, 9, 0, Math.PI * 2); } else { c.arc(hx + 14, hy + 6, 7, 0, Math.PI * 2); } c.fill();
        c.globalAlpha = actif ? 0.55 : 0.25; c.fillStyle = D.accent; rr(c, cx - large, g.y - 6, large * 2, 12, 6); c.fill(); c.globalAlpha = actif ? 0.95 : 0.4; c.fillStyle = D.accent2; rr(c, cx - coeur, g.y - 6, coeur * 2, 12, 6); c.fill(); c.globalAlpha = 1;
        if (actif || e.phase === 'pause') passant(c, g.X(e.phase === 'passe' ? e.x : e.cible + e.tol), g.y);
        if (flash && temps - flash < 0.25) { c.fillStyle = `rgba(255,236,170,${0.3 * (1 - (temps - flash) / 0.25)})`; c.fillRect(0, 0, T.W, T.H); }
        motsVivants(c, fl, temps);
      }
      return { T, e, fin: () => {}, bilan: () => { const b = M.bilan(e); return `${b.parfaits} parfait${b.parfaits > 1 ? 's' : ''}, ${b.bons} bien${b.bons > 1 ? 's' : ''}, ${b.rates} raté${b.rates > 1 ? 's' : ''} · meilleur combo ×${b.comboMax}`; },
        pas(dt) { temps += dt; const r = M.avancer(e, dt); if (r && r.type === 'passe') { d.son.non(); d.buzz(20); const g = geo(); fl.push({ txt: 'Raté !', x: Math.min(T.W - 40, g.X(e.cible + e.tol)), y: g.y - 70, t0: temps, couleur: '#FF6B8B' }); } },
        vue() { T.ajuster(); mid('chrono').textContent = G.fmtChrono(Math.ceil(Math.max(0, R.duree - e.t))); pilules(pill('Score', Q.fmt(e.score)) + pill('Combo', '×' + e.combo, e.combo > 1) + pill('Record', Q.fmt(q().mini.records.guet || 0))); dessiner(); },
        etat: () => { const g = geo(), [tx, ty] = T.ecran(g.X(e.cible), g.y - 60); return { jeu: 'guet', phase: e.phase, x: e.x, cible: e.cible, tol: e.tol, vitesse: e.vitesse, t: e.t, score: e.score, combo: e.combo, parfaits: e.parfaits, touche: { x: tx, y: ty } }; } };
    }

    // ═══ 2. Le compte : les objets sur la table (billets, bonbons…), cachés sous un torchon, puis quatre réponses ═══
    function vueCompte(M, e) {
      const D = DECOR(), R = M.regles; let temps = 0, vu = -1;
      mz.innerHTML = `<div class="pq-compte"><div class="pq-compte-vue"></div><div class="pq-compte-choix" role="group" aria-label="Combien ?"></div></div>`;
      const vueEl = mz.querySelector('.pq-compte-vue'), choixEl = mz.querySelector('.pq-compte-choix'), T = toileMini(vueEl), fl = [];
      const majChoix = () => { const cle = `${e.k}|${e.phase}`; if (cle === vu) return; vu = cle; const m = e.manche;
        choixEl.innerHTML = m.choix.map((v) => `<button type="button" class="pq-compte-btn${e.phase === 'verdict' && v === m.n ? ' juste' : ''}${e.phase === 'verdict' && e.dernier && e.dernier.v === v && !e.dernier.ok ? ' faux' : ''}" data-v="${v}" ${e.phase === 'choix' ? '' : 'disabled'}>${v}</button>`).join('');
        mid('consigne').textContent = e.phase === 'montre' ? `Regarde bien… (${miniJeu.objets || 'objets'})` : e.phase === 'choix' ? (miniJeu.consigne || 'Combien ?') : e.dernier && e.dernier.ok ? 'Juste !' : `C’était ${m.n}.`; };
      choixEl.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; ev.preventDefault(); d.audio(); rattraperMini(instantMini(ev)); const r = M.repondre(e, b.dataset.v); if (!r) return;
        if (r.ok) { d.son.vente(Math.pow(10, Math.min(6, r.pts + 1))); d.buzz(12); fl.push({ txt: `+${r.pts}`, x: T.W / 2, y: T.H / 2, t0: temps, couleur: D.accent2, taille: 30 }); } else { d.son.non(); d.buzz(30); } majChoix(); });
      function objet(c, o, S, ox, oy) {
        const [x, y, v, a] = o, px = ox + x * S, py = oy + y * S, k = S / 300;
        c.save(); c.translate(px, py); c.rotate(a); c.scale(k, k);
        if (D.motif === 'quartier') { c.fillStyle = ['#5FD3A4', '#8FE3C2', '#4DBB8D'][v]; c.strokeStyle = '#1E3B2E'; c.lineWidth = 2; rr(c, -24, -13, 48, 26, 5); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#1E3B2E'; c.font = '700 11px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('€', 0, 1); }
        else if (D.motif === 'hantee') { const col = ['#FF8A1F', '#8E5CF7', '#7CD992'][v]; c.fillStyle = col; c.strokeStyle = '#1E1824'; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-24, -9); c.lineTo(-24, 9); c.closePath(); c.moveTo(14, 0); c.lineTo(24, -9); c.lineTo(24, 9); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.moveTo(-6, -6); c.quadraticCurveTo(0, 0, -6, 6); c.moveTo(4, -7); c.quadraticCurveTo(10, 0, 4, 7); c.stroke(); }
        else { c.fillStyle = [D.accent, D.accent2, D.clair][v]; c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill(); }
        c.restore();
      }
      function dessiner() {
        const c = T.ctx, W = T.W, H = T.H, S = Math.min(W - 20, H - 20), ox = (W - S) / 2, oy = (H - S) / 2; c.clearRect(0, 0, W, H);
        c.fillStyle = D.fond; c.fillRect(0, 0, W, H); c.fillStyle = D.motif === 'hantee' ? '#3B2A1E' : '#5A4535'; rr(c, ox, oy, S, S, 22); c.fill(); // la table (le Quartier), la marmite renversée (la Maison hantée)
        c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(ox + 10, oy + k * S / 6); c.lineTo(ox + S - 10, oy + k * S / 6); c.stroke(); }
        if (e.phase === 'choix') { c.fillStyle = D.motif === 'hantee' ? '#4B2F7A' : '#C9CED6'; rr(c, ox + 10, oy + 10, S - 20, S - 20, 18); c.fill(); c.fillStyle = D.motif === 'hantee' ? D.accent : '#4A4458'; c.font = `700 ${Math.round(S * 0.3)}px Fredoka, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', W / 2, H / 2 + 4); c.textBaseline = 'alphabetic'; }
        else for (const o of e.manche.objets) objet(c, o, S, ox, oy);
        if (e.phase === 'montre') { c.fillStyle = D.accent; c.fillRect(ox, oy + S - 6, S * Math.max(0, e.reste) / Math.max(0.01, Math.max(R.montreMin, R.montre - 0.07 * e.k)), 6); }
        if (e.phase === 'choix') { c.fillStyle = D.accent2; c.fillRect(ox, oy + S - 6, S * Math.max(0, e.reste) / R.choix, 6); }
        motsVivants(c, fl, temps);
      }
      majChoix();
      return { T, e, fin: () => {}, bilan: () => `${e.bons} bon${e.bons > 1 ? 's' : ''} compte${e.bons > 1 ? 's' : ''}, ${e.rates} raté${e.rates > 1 ? 's' : ''} · meilleure série ${e.serieMax}`,
        pas(dt) { temps += dt; const r = M.avancer(e, dt); if (r && r.type === 'temps') d.son.non(); },
        vue() { T.ajuster(); majChoix(); mid('chrono').textContent = G.fmtChrono(Math.ceil(Math.max(0, R.duree - e.t))); pilules(pill('Score', Q.fmt(e.score)) + pill('Série', e.serie, e.serie >= 3) + pill('Record', Q.fmt(q().mini.records.compte || 0))); dessiner(); },
        etat: () => ({ jeu: 'compte', phase: e.phase, k: e.k, n: e.manche.n, choix: e.manche.choix.slice(), score: e.score, bons: e.bons, rates: e.rates, t: e.t }) };
    }

    // ═══ 3. La tournée : le plan du quartier et ses portes, le chemin du village et ses citrouilles ; on relie au doigt ═══
    function vueTournee(M, e) {
      const D = DECOR(), R = M.regles, T = toileMini(mz), fl = []; let temps = 0, doigt = null, trace = [], k0 = 0;
      const geo = () => { const S = Math.max(160, Math.min(T.W - 24, T.H - 24)); return { S, ox: (T.W - S) / 2, oy: (T.H - S) / 2 }; };
      const unite = (x, y) => { const g = geo(); return [(x - g.ox) / g.S, (y - g.oy) / g.S]; };
      mid('consigne').textContent = miniJeu.consigne || '';
      const passer = (a, b) => { const avant = e.suivant, r = M.tracer(e, a, b); if (!r) return; const g = geo();
        for (let k = avant; k < e.suivant && k < e.arrets.length; k++) { const p = e.arrets[k]; fl.push({ txt: '+10', x: g.ox + p[0] * g.S, y: g.oy + p[1] * g.S - 20, t0: temps, couleur: D.accent2 }); }
        if (r.bouclee) { d.son.vente(1e5); d.buzz([10, 30, 10]); fl.push({ txt: `Bouclée ! +${r.note.bonus}`, x: T.W / 2, y: T.H / 2, t0: temps, couleur: D.accent, taille: 28 }); } else { d.son.tap(); d.buzz(6); } };
      T.cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); d.audio(); rattraperMini(instantMini(ev)); if (e.fini || e.phase !== 'trace') return; try { T.cv.setPointerCapture(ev.pointerId); } catch (x) { /* rien */ } T.ajuster(); const [x, y] = T.point(ev), u = unite(x, y); doigt = { id: ev.pointerId, der: u }; trace.push([u]); passer(u, u); });
      T.cv.addEventListener('pointermove', (ev) => { if (!doigt || ev.pointerId !== doigt.id) return; ev.preventDefault(); rattraperMini(instantMini(ev)); const [x, y] = T.point(ev), u = unite(x, y); if (trace.length) trace[trace.length - 1].push(u); passer(doigt.der, u); doigt.der = u; });
      const lever = (ev) => { if (doigt && ev.pointerId === doigt.id) doigt = null; };
      T.cv.addEventListener('pointerup', lever); T.cv.addEventListener('pointercancel', lever);
      function arret(c, p, n, etat, g) {
        const x = g.ox + p[0] * g.S, y = g.oy + p[1] * g.S, r = Math.max(14, R.rayon * g.S * 0.75);
        if (etat === 'suivant') { c.strokeStyle = D.accent; c.lineWidth = 3; c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(temps * 5)); c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
        if (D.motif === 'quartier') { c.fillStyle = etat === 'fait' ? D.accent2 : '#8A5A3C'; c.strokeStyle = '#1E1B26'; c.lineWidth = 2; rr(c, x - r * 0.75, y - r, r * 1.5, r * 2, 5); c.fill(); c.stroke(); c.fillStyle = '#FFC84A'; c.beginPath(); c.arc(x + r * 0.4, y + 2, 2.2, 0, Math.PI * 2); c.fill(); }
        else if (D.motif === 'hantee') { c.fillStyle = etat === 'fait' ? D.accent2 : D.accent; c.strokeStyle = '#1E1824'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(x, y - r * 0.85); c.lineTo(x, y + r * 0.85); c.stroke(); c.fillStyle = '#5B8C3A'; c.fillRect(x - 2, y - r * 0.85 - 6, 4, 7); }
        else { c.fillStyle = etat === 'fait' ? D.accent2 : D.accent; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = etat === 'fait' ? '#1E1B26' : '#FFF'; c.font = `700 ${Math.round(r * 0.95)}px Fredoka, Nunito, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(String(n), x, y + 1); c.fillText(String(n), x, y + 1); c.textBaseline = 'alphabetic';
      }
      function dessiner() {
        const c = T.ctx, g = geo(), { S, ox, oy } = g; c.clearRect(0, 0, T.W, T.H); c.fillStyle = D.fond; c.fillRect(0, 0, T.W, T.H);
        if (D.motif === 'quartier') { c.fillStyle = '#433D5C'; rr(c, ox, oy, S, S, 18); c.fill(); c.strokeStyle = D.sol; c.lineWidth = 14; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(ox + k * S / 4, oy + 6); c.lineTo(ox + k * S / 4, oy + S - 6); c.moveTo(ox + 6, oy + k * S / 4); c.lineTo(ox + S - 6, oy + k * S / 4); c.stroke(); } }
        else if (D.motif === 'hantee') { c.fillStyle = '#24302A'; rr(c, ox, oy, S, S, 18); c.fill(); c.fillStyle = 'rgba(124,217,146,.12)'; for (let k = 0; k < 30; k++) { c.beginPath(); c.arc(ox + ((k * 37) % 100) / 100 * S, oy + ((k * 61) % 100) / 100 * S, 3, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#FFE7A3'; c.beginPath(); c.arc(ox + S - 34, oy + 34, 16, 0, Math.PI * 2); c.fill(); }
        else { c.fillStyle = D.sol; rr(c, ox, oy, S, S, 18); c.fill(); }
        // le chemin prévu (pointillés entre les arrêts), puis le trait du doigt
        c.save(); c.setLineDash([2, 10]); c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.beginPath(); e.arrets.forEach((p, k) => { const x = ox + p[0] * S, y = oy + p[1] * S; if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); c.restore();
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = D.accent; c.lineWidth = 6; for (const t of trace) { if (t.length < 2) continue; c.beginPath(); t.forEach((p, k) => { const x = ox + p[0] * S, y = oy + p[1] * S; if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); } c.restore();
        e.arrets.forEach((p, k) => arret(c, p, k + 1, k < e.suivant ? 'fait' : k === e.suivant && e.phase === 'trace' ? 'suivant' : '', g));
        motsVivants(c, fl, temps);
      }
      return { T, e, fin: () => {}, bilan: () => `${e.notes.map((n, k) => `tournée ${k + 1} : ${n.arrets}/${R.arrets}${n.bonus ? ` (+${n.bonus})` : ''}`).join(' · ')}`,
        pas(dt) { temps += dt; const r = M.avancer(e, dt); if (r && r.type === 'tournee' && !r.bouclee) { d.son.non(); fl.push({ txt: 'Le temps !', x: T.W / 2, y: T.H / 2, t0: temps, couleur: '#FF6B8B' }); } if (e.k !== k0) { k0 = e.k; trace = []; doigt = null; } },
        vue() { T.ajuster(); mid('chrono').textContent = G.fmtChrono(Math.ceil(Math.max(0, e.phase === 'trace' ? e.reste : 0))); pilules(pill('Tournée', `${Math.min(e.k + 1, R.tournees)}/${R.tournees}`) + pill('Score', Q.fmt(e.score)) + pill('Record', Q.fmt(q().mini.records.tournee || 0))); dessiner(); },
        etat: () => { const g = geo(); return { jeu: 'tournee', phase: e.phase, k: e.k, suivant: e.suivant, score: e.score, arrets: e.arrets.map((p) => T.ecran(g.ox + p[0] * g.S, g.oy + p[1] * g.S)), rayon: R.rayon * g.S }; } };
    }
    const etatMini = () => ({ ouvert: miniOuvert(), ecran: miniEcran, jeu: miniJeu && miniJeu.id, partie: partie && partie.etat ? partie.etat() : null, resultat: resultatMini });

    return { init, ouvrir, fermer, annoncer, frame, retour, visible, masquer, majeur, bilanEnAttente, synchroniserRecompenses, donnerPalier, sheetPaliers, cle: F.cle, R: Q, F,
      mini: etatMini, ouvrirMini, fermerMini, sheetMini, sheetContrats, sheetOperation, majActivites,
      fenetre: () => (Q && d ? fen() : null), get ouvert() { return ouvert(); }, get ecran() { return ecran; }, get scene() { return scene3; }, get act() { return act; } };
  }

  // ─── les outils 3D partagés par les deux décors ───
  const PITCH = 52 * Math.PI / 180, SY = Math.sin(PITCH), CY = Math.cos(PITCH), TAU = Math.PI * 2;
  function halo(couleur, taille, force = 1) { // un halo doux (sprite additif) : la lueur des néons, des bougies, des citrouilles, sans passe d'effets
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, couleur); g.addColorStop(0.35, couleur + '88'); g.addColorStop(1, couleur + '00'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: force })); sp.scale.set(taille, taille, 1); return sp;
  }
  function libererSprite(sp) { if (sp && sp.material) { if (sp.material.map) sp.material.map.dispose(); sp.material.dispose(); } }
  const _px = new Uint8Array(4);
  function ecranNoir(renderer) { // cinq points de l'image : tout noir alors que le fond est coloré = la HD ne s'affiche pas
    if (window.__hdNoir) return true; const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; let somme = 0;
    for (const [u, v] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.3], [0.3, 0.75], [0.7, 0.75]]) { gl.readPixels(Math.floor(u * w), Math.floor(v * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px); somme += _px[0] + _px[1] + _px[2]; }
    return somme < 15;
  }
  // la vie d'un Mini Character : à son poste (idle, interact-right, sit) ; toutes les 6 à 12 s, un « ouais ! » (emote-yes) ou quelques pas
  // de côté et retour (walk) ; à la fête (un palier, un coup de pouce réussi), tous ceux qui sont debout font emote-yes
  function vieMini(p, dt, W, fete) {
    const a = p.hd, v = p.vie, g = a.g;
    if (p.assis) { HDM.jouer(a, 'sit'); return; }
    if (fete > 0 && v.mode !== 'marche') { HDM.jouer(a, 'emote-yes'); return; }
    v.t -= dt;
    if (v.mode === 'marche') {
      const dx = v.cx - g.position.x, pas = 34 * p.K * dt;
      if (Math.abs(dx) <= pas) { g.position.x = v.cx; if (v.retour) { v.mode = ''; g.rotation.y = p.yaw; } else { v.retour = true; v.cx = p.x0; } }
      else { g.position.x += Math.sign(dx) * pas; g.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2; }
      HDM.jouer(a, v.mode === 'marche' ? 'walk' : p.base); return;
    }
    if (v.mode === 'ouais') { if (v.t <= 0) { v.mode = ''; v.t = 6 + Math.random() * 6; } else { HDM.jouer(a, 'emote-yes'); return; } }
    if (v.t <= 0) {
      if (Math.random() < 0.5) { v.mode = 'ouais'; v.t = 1.8; HDM.jouer(a, 'emote-yes'); return; }
      const sens = p.x0 > W / 2 ? -1 : 1; v.mode = 'marche'; v.retour = false; v.cx = p.x0 + sens * (p.pas || 30 + Math.random() * 25) * p.K; v.t = 6 + Math.random() * 6; return;
    }
    HDM.jouer(a, p.base);
  }
  const oAnim = { marche: false, phase: 0, assis: false, dir: 0, sac: false, or: false, pris: false, attend: true, plateau: false, produit: null, cle: false, t: 0, blink: 0, expression: 'neutre', joie: 0, attente: 0, geste: '', graine: 0, rush: false };
  function animerChibi(p, t, fete) { oAnim.phase = t * 2 + p.phase; oAnim.assis = p.assis; oAnim.dir = p.dir; oAnim.t = t; oAnim.blink = (t + p.phase) % 3.4; oAnim.expression = fete > 0 ? 'sourire' : 'neutre'; oAnim.attend = !p.assis; oAnim.graine = p.phase; oAnim.joie = fete > 0 && !p.assis ? (t * 1.4 + p.phase) % 1 : 0; try { PERSOS.animer(p.g, oAnim); } catch (e) { /* un personnage sans ce champ */ } }
  const YAW = { 0: 0, 1: Math.PI / 2, '-1': -Math.PI / 2, 2: Math.PI }, MINI_ECHELLE = 82, MINI_ASSIS_Y = 12; // un Mini Character fait 0,67 unité : × 100, la taille d'un chibi
  function rendu3(cv, fond) { // le renderer d'un décor ; null si le téléphone refuse le contexte
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'low-power' }); } catch (e) { return null; }
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = false; renderer.setClearColor(fond); return renderer;
  }

  // ─── le décor 3D de la Planque : un canapé, une table basse avec la balance et les sachets, des néons, une lampe, la télé, l'équipe ───
  // Bâti à l'ouverture, libéré à la fermeture (rendu et contexte compris) : la boutique garde son budget. ≈ 25 appels de dessin.
  function scenePlanque(cv, X) {
    if (!cv || typeof THREE === 'undefined' || !MODELES || !PERSOS) return null;
    const M = MODELES, P = M.part, bo = (w, h, dd, r) => M.boite(Math.round(w * 2) / 2, Math.round(h * 2) / 2, Math.round(dd * 2) / 2, r);
    const renderer = rendu3(cv, '#2E2B3A'); if (!renderer) return null;
    let perdu = 0; // perdu : l'instant où le téléphone a repris le contexte (mémoire)
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); perdu = performance.now(); }); cv.addEventListener('webglcontextrestored', () => { perdu = 0; });
    // les modèles HD (src/hd.js) : demandés à l'ouverture si le palier le permet ; en attendant (ou en éco), le décor habituel
    const hdOk = () => typeof HDM !== 'undefined' && HDM.pret('planque') && HDM.permis(renderer);
    if (typeof HDM !== 'undefined' && HDM.permis(renderer)) HDM.charger('planque');
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    scene.add(new THREE.HemisphereLight('#C7B8FF', '#2E2B3A', 1.1));
    const dir = new THREE.DirectionalLight('#FFD6E0', 1.2); scene.add(dir, dir.target);
    const rose = new THREE.PointLight('#FF6B8B', 90, 600, 1), vert = new THREE.PointLight('#5FD3A4', 60, 500, 1); scene.add(rose, vert);
    const G3 = new THREE.Group(); scene.add(G3);
    const animes = [], persos = [], lum = (hex, k) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: k == null ? 1 : k });
    let W = 1, H = 1, murH = 1, t = 0, fete = 0, hdVu = 0, rue = null, verifs = 0, tVerif = 0, noirs = 0;
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
        const h1 = halo('#FF6B8B', 64 * K, 0.4); h1.position.set(W * 0.5, Hm * 0.62, 6); G3.add(h1); const h2 = halo('#5FD3A4', 46 * K, 0.35); h2.position.set(W * 0.5, Hm * 0.62, 5); G3.add(h2);
        const h3 = halo('#FFE27A', 56 * K, 0.5); h3.position.set(lx, 52, lz + 4); G3.add(h3); verifs = 0; noirs = 0;
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
      const ecranTv = M.mesh(bo(36 * K, 20, 1, 0.6), lum('#6CB8FF', 0.6), { x: W * 0.82, y: 15, z: wz(murH + 6 * K) + 2 }, { ombre: false }); G3.add(ecranTv);
      animes.push((E) => { const gr = Math.sin(E.t * 23) > 0.9 ? 0.2 : 1; neonRose.material.emissiveIntensity = 0.9 * gr; neonVert.material.emissiveIntensity = 0.7 + 0.3 * Math.sin(E.t * 2); ecranTv.material.emissiveIntensity = 0.45 + 0.3 * Math.abs(Math.sin(E.t * 5.3)); ecranTv.material.color.setHSL(0.55 + 0.1 * Math.sin(E.t * 1.7), 0.6, 0.6); rose.position.set(nx, wy(ny) * 0.6, 40); vert.position.set(lx, 50, lz + 10); });
      // les apprentis du quartier : le guetteur (bonnet, debout près du mur), la nourrice (chignon, assise sur le canapé) ; les suivants au fur et à mesure des embauches
      equipeDe(X.q(), K);
    }
    // les tenues, dans l'ordre d'arrivée ; les trois dernières : le livreur, puis les apprentis d'après le boss (le pharmacien en blouse
    // blanche, le chimiste en combinaison jaune et lunettes)
    const tenues = [{ haut: '#2E2B3A', peau: '#C68B59', cheveux: '#2B2118', coiffure: 3, bonnet: '#2E2B3A' }, { haut: '#8A2B3A', peau: '#FFD7B5', cheveux: '#D9D9D9', coiffure: 2, lunettes: true }, { haut: '#B8A6FF', peau: '#F1B990', cheveux: '#B8762E', coiffure: 1 }, { haut: '#5FD3A4', peau: '#8D5A3C', cheveux: '#2B2118', coiffure: 0 }, { haut: '#FFC84A', peau: '#FFE3C9', cheveux: '#E0A61E', coiffure: 1, lunettes: true }, { haut: '#FF9A62', peau: '#5C3A21', cheveux: '#2B2118', coiffure: 3, bonnet: '#E1496C' },
      { haut: '#6CB8FF', peau: '#C68B59', cheveux: '#2B2118', coiffure: 0, bonnet: '#2B5BD7' }, { haut: '#F4F6FA', peau: '#FFD7B5', cheveux: '#BFC4CC', coiffure: 2, lunettes: true }, { haut: '#FFE04A', peau: '#F1B990', cheveux: '#3A2E26', coiffure: 0, lunettes: true }];
    // les places de l'équipe HD (x en part de la largeur, profondeur en part de 60 × K depuis le mur, orientation) : autour des meubles HD, pas dedans
    const SPOTS_HD = [[0.11, 1.15, 1], [0, 0, 0], [0.72, 0.5, 2], [0.45, 1.6, 0], [0.8, 1.05, -1], [0.22, 1.55, 1], [0.64, 1.7, -1], [0.34, 1.2, 1], [0.95, 1.6, -1]];
    function equipeDe(qq, K) {
      for (const p of persos) { G3.remove(p.g); if (p.hd) HDM.liberer(p.hd); else M.dispose(p.g); } persos.length = 0;
      const n = Math.min(tenues.length, 1 + qq.postes.filter((s) => s.staff).length), spots = [[0.1, 0.3, 0, false], [0.4, 0.52, 0, false], [0.72, 0.5, 2, false], [0.5, 0.95, 0, false], [0.66, 0.85, -1, false], [0.15, 0.95, 1, false], [0.84, 1.25, -1, false], [0.32, 1.25, 1, false], [0.62, 1.55, 0, false]];
      const hd = hdOk();
      for (let k = 0; k < n; k++) {
        if (hd) { // un Mini Character de Kenney (src/hd.js) : assis sur le canapé, ou debout à son poste
          const [ux, uy, dirk] = SPOTS_HD[k], assis = k === 1, a = HDM.mini(HDM.MINI[k % HDM.MINI.length]); if (!a) continue;
          a.g.scale.setScalar(MINI_ECHELLE * (K || 1)); const yaw = assis ? 0 : YAW[dirk];
          a.g.position.set(assis ? W * 0.22 + 14 : W * ux, assis ? MINI_ASSIS_Y * (K || 1) : 0, assis ? wz(murH + 22 * (K || 1)) : wz(murH + uy * 60 * (K || 1))); a.g.rotation.y = yaw;
          const base = assis ? 'sit' : k % 2 ? 'interact-right' : 'idle'; HDM.jouer(a, base, 0); G3.add(a.g);
          persos.push({ g: a.g, hd: a, assis, dir: dirk, phase: k * 1.3, base, yaw, K: K || 1, x0: a.g.position.x, vie: { t: 4 + k * 2.5, mode: '', cx: 0, retour: false } }); continue; }
        const g = PERSOS.creer(Object.assign({ sac: false, taille: 1 }, tenues[k])), [ux, uy, dirk, assis] = spots[k];
        g.position.set(W * ux, assis ? 14 : 0, wz(murH + uy * 60 * (K || 1))); g.rotation.y = YAW[dirk]; g.scale.setScalar(0.9 * (K || 1));
        G3.add(g); persos.push({ g, assis, dir: dirk, phase: k * 1.3 });
      }
    }
    function creerRue() { // la rue de nuit derrière la fenêtre : deux façades, un lampadaire allumé, une bouche d'incendie, une voiture qui passe
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 60), rt = new THREE.WebGLRenderTarget(320, 200);
      rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.userData.partagee = true; sc.background = new THREE.Color('#1A1630'); sc.fog = new THREE.Fog('#1A1630', 9, 22);
      sc.add(new THREE.HemisphereLight('#6E6AB8', '#1A1630', 0.9)); const lune = new THREE.DirectionalLight('#9FA8FF', 0.6); lune.position.set(-3, 6, 4); sc.add(lune);
      const lampe = new THREE.PointLight('#FFC873', 18, 9, 1.6); lampe.position.set(1.1, 2.6, 1.2); sc.add(lampe);
      const pose = (nom, x, z, haut, ry) => { const m = HDM.modele(nom, 1, { ombre: false }); if (!m) return null; m.scale.setScalar(haut / m.userData.taille.y); m.position.set(x, 0, z); m.rotation.y = ry || 0; sc.add(m); return m; };
      pose('building_D', -2.2, -2.5, 5.2); pose('building_F', 2.4, -2.6, 4.6);
      pose('streetlight', 1.4, 1.1, 3, -Math.PI / 2); pose('firehydrant', -0.9, 1.2, 0.5); pose('trash_A', 3.1, 0.9, 0.7); pose('dumpster', -3.4, 0.6, 1.1);
      const sol = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: '#2B2838', roughness: 0.9 })); sol.rotation.x = -Math.PI / 2; sc.add(sol);
      const trottoir = new THREE.Mesh(new THREE.BoxGeometry(40, 0.15, 2.6), new THREE.MeshStandardMaterial({ color: '#4A4658' })); trottoir.position.set(0, 0.07, 0.4); sc.add(trottoir);
      const ampoule = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#FFE0A0' })); ampoule.position.copy(lampe.position); sc.add(ampoule); const lueur = halo('#FFD28A', 2.2); lueur.position.copy(lampe.position); sc.add(lueur);
      const voiture = pose('car_sedan', -8, 2.6, 0.9, Math.PI / 2);
      cam.position.set(0, 1.5, 6.2); cam.lookAt(0, 1.4, 0);
      let tv = 0;
      return { texture: rt.texture, frame(dt) { tv += dt; if (voiture) { voiture.position.x = ((tv * 2.2) % 22) - 11; } ampoule.material.color.setScalar(0.9 + 0.1 * Math.sin(tv * 9)); renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null); },
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
    function frameScene(dt) {
      redim(); t += dt;
      const E = { t };
      for (const f of animes) f(E);
      if (hdOk() ? hdVu !== HDM.version : hdVu !== 0) batir(); // les modèles viennent d'arriver, ou le palier est passé en éco
      if (rue && hdVu) rue.frame(dt);
      for (const p of persos) { if (p.hd) { vieMini(p, dt, W, fete); p.hd.mixer.update(dt); continue; } animerChibi(p, t, fete); }
      if (fete > 0) fete -= dt;
      renderer.render(scene, camera);
      if (hdVu && verifs < 8) { tVerif += dt; if (tVerif > 0.4) { tVerif = 0; verifs++; noirs = ecranNoir(renderer) ? noirs + 1 : 0; // la HD s'affiche-t-elle vraiment ? (lu juste après le rendu)
        if (noirs >= 3) { console.warn('Planque : écran noir en HD, retour au décor classique sur ce téléphone'); HDM.couper('écran noir'); batir(); } } }
    }
    redim();
    return {
      get perdu() { return perdu; },
      get hd() { return { actif: hdVu > 0, persos: persos.filter((p) => p.hd).length, rue: !!rue, verifs, noirs }; }, // les modèles HD (pour les tests)
      redim, frame: frameScene, equipe: (qq) => equipeDe(qq, Math.max(0.6, Math.min(1.1, W / 390))), vente: () => { }, fete: () => { fete = 2; },
      detruire() { try { G3.traverse((o) => { if (o.isMesh) { if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose(); const ms = [].concat(o.material || []); for (const m of ms) if (m && m !== M.MAT.vertex && !M.MATS.has(m)) m.dispose(); } }); } catch (e) { /* rien */ }
        try { if (rue) rue.liberer(); for (const p of persos) if (p.hd) HDM.liberer(p.hd); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* rien */ } },
      get calls() { return renderer.info.render.calls; },
    };
  }

  // ─── le décor 3D de la Maison hantée : le grand salon du manoir, de nuit ───
  // Le papier peint violet à rayures et ses lambris, la grande fenêtre en ogive sur le jardin (la lune, un arbre mort, la grille, des
  // tombes, des citrouilles et des chauves-souris : une petite scène KayKit Halloween rendue dans une texture), la cheminée de pierre et
  // son chaudron qui bouillonne, la bibliothèque, le fauteuil de velours, le portrait de l'ancêtre (un fantôme), la table aux bougies,
  // des citrouilles-lanternes, des toiles d'araignée aux coins, un petit fantôme qui flotte, la brume au ras du sol, les halos des bougies.
  // L'équipe : la patronne (toi, en chapeau pointu) et les six employés costumés, au fil des embauches (fantôme, momie, squelette,
  // vampire, sorcière, citrouille-lanterne) : des Mini Characters de Kenney (HD) ou des chibis teintés (éco). ≈ 45 appels en HD, 25 en éco.
  function sceneManoir(cv, X) {
    if (!cv || typeof THREE === 'undefined' || !MODELES || !PERSOS) return null;
    const M = MODELES, P = M.part, bo = (w, h, dd, r) => M.boite(Math.round(w * 2) / 2, Math.round(h * 2) / 2, Math.round(dd * 2) / 2, r);
    const FOND = '#1F1A2E', renderer = rendu3(cv, FOND); if (!renderer) return null;
    let perdu = 0;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); perdu = performance.now(); }); cv.addEventListener('webglcontextrestored', () => { perdu = 0; });
    const hdOk = () => typeof HDM !== 'undefined' && HDM.pret('hantee') && HDM.permis(renderer);
    if (typeof HDM !== 'undefined' && HDM.permis(renderer)) HDM.charger('hantee');
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    const ciel = new THREE.HemisphereLight('#B7A6FF', '#2A2140', 1.05); scene.add(ciel);
    const dir = new THREE.DirectionalLight('#C9D6FF', 0.75); scene.add(dir, dir.target); // le clair de lune, par la fenêtre
    const feu = new THREE.PointLight('#FF9A3D', 70, 520, 1), chaud = new THREE.PointLight('#8FE36B', 40, 300, 1), bougie = new THREE.PointLight('#FFC873', 45, 380, 1); scene.add(feu, chaud, bougie);
    const G3 = new THREE.Group(); scene.add(G3);
    const animes = [], persos = [], sprites = [], lum = (hex, k) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: k == null ? 1 : k });
    let W = 1, H = 1, murH = 1, t = 0, fete = 0, frisson = 0, hdVu = 0, jardin = null, verifs = 0, tVerif = 0, noirs = 0, Kc = 1;
    const wz = (ys) => (ys - murH) / SY, wy = (px) => px / CY, wd = (px) => px / SY;
    const ajHalo = (c, taille, force, x, y, z) => { const h = halo(c, taille, force); h.position.set(x, y, z); G3.add(h); sprites.push(h); return h; };
    function batir() {
      while (G3.children.length) { const o = G3.children[0]; G3.remove(o); if (o.isSprite) libererSprite(o); else M.dispose(o); }
      animes.length = 0; persos.length = 0; sprites.length = 0;
      const Hm = wy(murH), D = wd(H - murH), K = Kc = Math.max(0.6, Math.min(1.1, W / 390)), hd = hdOk(); hdVu = hd ? HDM.version : 0;
      const pr = []; // le décor fixe, fusionné en un seul maillage
      // le sol : un parquet sombre en lames ; le mur : papier peint violet à rayures, lambris en bas, corniche en haut
      G3.add(M.mesh(M.plan(W, D), M.mat('#33263D'), { x: W / 2, z: D / 2, rx: -Math.PI / 2 }, { ombre: false }));
      for (let k = 0; k < 7; k++) pr.push(P(bo(W, 0.6, 1.4, 0.2), '#2A1F33', { x: W / 2, y: 0.1, z: (k + 0.5) * D / 7 }));
      G3.add(M.mesh(bo(W, Hm, 8, 1), M.mat('#3E2F5C'), { x: W / 2, z: -4 }, { ombre: false }));
      const nR = Math.round(W / 22); for (let k = 0; k < nR; k++) pr.push(P(bo(W / nR * 0.42, Hm * 0.7, 0.8, 0.3), '#4A3870', { x: (k + 0.5) * W / nR, y: Hm * 0.3, z: 0.4 }));
      for (let k = 0; k < nR; k++) pr.push(P(M.sphere(1.6, 6), '#5C4688', { x: (k + 0.5) * W / nR + W / nR / 2, y: Hm * 0.62, z: 0.6, sz: 0.4 }), P(M.sphere(1.6, 6), '#5C4688', { x: (k + 0.5) * W / nR + W / nR / 2, y: Hm * 0.42, z: 0.6, sz: 0.4 })); // les petits motifs du papier peint
      pr.push(P(bo(W, Hm * 0.3, 3, 0.6), '#2A1E33', { x: W / 2, z: 1.5 }), P(bo(W, 2.2, 4, 0.6), '#4A3528', { x: W / 2, y: Hm * 0.3 - 1, z: 2 })); // le lambris et sa cimaise
      const nP = Math.round(W / 46); for (let k = 0; k < nP; k++) pr.push(P(bo(W / nP - 10, Hm * 0.2, 1, 0.5), '#33253F', { x: (k + 0.5) * W / nP, y: Hm * 0.05, z: 3.2 }));
      pr.push(P(bo(W, 5, 6, 1), '#2A1E33', { x: W / 2, y: Hm - 5, z: 3 }));
      // la grande fenêtre en ogive, au milieu du mur : le jardin hanté (HD) ou un jardin peint (éco), un cadre de bois, l'appui
      const fw = Math.min(92 * K, W * 0.26), fh = Hm * 0.8, fx = W * 0.5, fy = Hm * 0.1 + fh * 0.38, bois = '#4A3528';
      if (!jardin) jardin = creerJardin(hd, fw / (fh * CY)); else if (jardin.hd !== hd) { jardin.liberer(); jardin = creerJardin(hd, fw / (fh * CY)); }
      G3.add(M.mesh(ogive(fw, fh), new THREE.MeshBasicMaterial({ map: jardin.texture }), { x: fx, y: fy, z: 2.6 }, { ombre: false }));
      const cadreF = ogive(fw + 12, fh + 10); cadreF.translate(0, -2, 0); G3.add(M.mesh(cadreF, M.mat(bois), { x: fx, y: fy, z: 1.4 }, { ombre: false })); // le cadre : la même ogive, plus grande, derrière la vitre
      pr.push(P(bo(fw + 18, 4, 9, 1.4), '#5C4232', { x: fx, y: fy - fh * 0.38 - 3, z: 4 }), P(bo(2.6, fh * 0.98, 2.6, 0.8), bois, { x: fx, y: fy - fh * 0.38, z: 3 }), P(bo(fw, 2.4, 2.6, 0.6), bois, { x: fx, y: fy + fh * 0.08, z: 3 })); // l'appui, le meneau, la traverse
      // la cheminée de pierre, à gauche : le manteau, les jambages, l'âtre sombre ; le feu orange ; le chaudron devant, sur ses pieds
      const cx = W * 0.15, cw = 74 * K, chh = Hm * 0.5;
      pr.push(P(bo(cw, chh, 14, 2), '#6E6480', { x: cx, z: 6 }), P(bo(cw + 12, 6, 20, 2), '#8A7F9C', { x: cx, y: chh, z: 7 }), P(bo(cw * 0.62, chh * 0.62, 4, 1), '#1A1424', { x: cx, z: 13 }));
      for (let k = 0; k < 4; k++) pr.push(P(bo(cw * 0.22, 2, 1, 0.5), '#5E5470', { x: cx - cw * 0.36 + (k % 2) * cw * 0.72, y: chh * (0.25 + 0.25 * Math.floor(k / 2)), z: 13.5 })); // les joints de pierre
      const flammes = M.maille([P(M.cone(9 * K, 18 * K, 8), '#FF9A3D', { x: cx - 6 * K, y: 2, z: 11 }), P(M.cone(7 * K, 24 * K, 8), '#FFC84A', { x: cx + 3 * K, y: 2, z: 10 }), P(M.cone(6 * K, 15 * K, 8), '#FF6B3D', { x: cx + 10 * K, y: 2, z: 11 })], { ombre: false });
      flammes.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#FF8A3D', emissiveIntensity: 0.9 }); G3.add(flammes);
      ajHalo('#FF9A3D', 70 * K, 0.45, cx, chh * 0.3, 16);
      const chz = wz(murH + 34 * K), chr = 15 * K;
      pr.push(P(M.sphere(chr, 14), '#2B2533', { x: cx, y: chr * 0.95, z: chz, sy: 0.78 }), P(M.tore(chr * 0.92, 2 * K, TAU, 6, 18), '#3E3648', { x: cx, y: chr * 1.6, z: chz, rx: Math.PI / 2 }));
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4; pr.push(P(M.cylindre(1.6 * K, 1.2 * K, 6 * K, 6), '#2B2533', { x: cx + Math.cos(a) * chr * 0.7, z: chz + Math.sin(a) * chr * 0.7 })); }
      const potion = M.mesh(M.cylindre(chr * 0.86, chr * 0.86, 1.2, 18), lum('#8FE36B', 0.8), { x: cx, y: chr * 1.58, z: chz }, { ombre: false }); G3.add(potion);
      const bulles = []; for (let k = 0; k < 4; k++) { const b = M.mesh(M.sphere(2.4 * K, 8), lum('#C6FF8F', 0.9), { x: cx, y: chr * 1.6, z: chz }, { ombre: false }); G3.add(b); bulles.push(b); }
      const hChaud = ajHalo('#8FE36B', 64 * K, 0.5, cx, chr * 2.1, chz + 6);
      animes.push((E) => { flammes.scale.y = 1 + 0.12 * Math.sin(E.t * 11) + 0.06 * Math.sin(E.t * 17); flammes.material.emissiveIntensity = 0.8 + 0.2 * Math.sin(E.t * 13); feu.intensity = 60 + 14 * Math.sin(E.t * 9);
        potion.material.emissiveIntensity = 0.6 + 0.25 * Math.sin(E.t * 3); hChaud.material.opacity = 0.42 + 0.12 * Math.sin(E.t * 3) + (frisson > 0 ? 0.3 : 0);
        bulles.forEach((b, k) => { const ph = (E.t * 0.7 + k * 0.25) % 1; b.position.set(cx + Math.sin(k * 2.1 + E.t) * chr * 0.45, chr * 1.6 + ph * 22 * K, chz + Math.cos(k * 1.7) * chr * 0.3); b.scale.setScalar(Math.sin(ph * Math.PI) * 1.1 + 0.05); }); });
      feu.position.set(cx, 20, 30); chaud.position.set(cx, chr * 2.4, chz + 20);
      // la bibliothèque (éco : des rayons de livres) et le portrait de l'ancêtre, à droite ; le fauteuil de velours et la lanterne
      const bx = W * 0.85;
      pr.push(P(bo(54 * K, Hm * 0.66, 3, 1), '#2E2030', { x: bx, z: 2.5 }), P(bo(4, Hm * 0.66, 13, 1), '#4A3528', { x: bx - 25 * K, z: 7 }), P(bo(4, Hm * 0.66, 13, 1), '#4A3528', { x: bx + 25 * K, z: 7 }), P(bo(58 * K, 4, 14, 1.2), '#5C4232', { x: bx, y: Hm * 0.66, z: 7 }));
      for (let r = 0; r < 3; r++) { pr.push(P(bo(48 * K, 2.2, 10, 0.6), '#5C4232', { x: bx, y: 3 + r * Hm * 0.2, z: 8 })); for (let k = 0; k < 6; k++) if ((k + r * 2) % 7 !== 5) pr.push(P(bo(5.4 * K, 13 + ((k * 7 + r * 3) % 5), 8, 0.6), ['#8E6BD8', '#FF8A3D', '#5FD3A4', '#E1496C', '#FFC84A', '#6CB8FF'][(k + r) % 6], { x: bx - 17 * K + k * 6.6 * K, y: 5.2 + r * Hm * 0.2, z: 8.5, rz: k === 4 && r === 1 ? 0.25 : 0 })); } // la bibliothèque et ses grimoires
      const px = W * 0.72, py = Hm * 0.5;
      G3.add(M.mesh(M.plan(30 * K, 38 * K), new THREE.MeshLambertMaterial({ map: toilePortrait(), emissive: '#ffffff', emissiveMap: toilePortrait(), emissiveIntensity: 0.25 }), { x: px, y: py, z: 2.4 }, { ombre: false }));
      pr.push(P(bo(36 * K, 44 * K, 2, 1), '#B07A2E', { x: px, y: py - 22 * K, z: 0.8 }), P(bo(32 * K, 40 * K, 2.2, 0.8), '#E0B65A', { x: px, y: py - 20 * K, z: 0.9 })); // le cadre doré du portrait
      const az = wz(murH + 52 * K), ax = W * 0.86;
      if (!hd) pr.push(P(bo(34 * K, 12, 34, 5), '#6B3FA0', { x: ax, y: 4, z: az }), P(bo(10, 30, 36, 4), '#5A3388', { x: ax + 15 * K, y: 4, z: az }), P(bo(30 * K, 18, 8, 3), '#5A3388', { x: ax, y: 4, z: az - 15 }), P(bo(30 * K, 18, 8, 3), '#5A3388', { x: ax, y: 4, z: az + 15 }), P(bo(22 * K, 6, 20, 3), '#8E6BD8', { x: ax - 2, y: 15, z: az })); // le fauteuil de velours (tourné vers la pièce)
      // la table ronde aux bougies, au premier plan à gauche ; les citrouilles-lanternes ; le tapis orange
      const tx = W * 0.36, tz = wz(murH + 74 * K);
      if (!hd) pr.push(P(M.cylindre(18 * K, 18 * K, 3, 16), '#4A3528', { x: tx, y: 20, z: tz }), P(M.cylindre(2.4, 3, 20, 8), '#3A2820', { x: tx, z: tz }), P(M.cylindre(9, 10, 2, 10), '#3A2820', { x: tx, z: tz }));
      if (!hd) pr.push(P(bo(W * 0.42, 0.8, 54 * K, 0.4), '#C9652B', { x: W * 0.55, z: wz(murH + 56 * K) }), P(bo(W * 0.38, 1, 46 * K, 0.4), '#E8823A', { x: W * 0.55, y: 0.2, z: wz(murH + 56 * K) }));
      const citrouilles = [[W * 0.29, wz(murH + 22 * K), 1], [W * 0.66, wz(murH + 18 * K), 0.8], [W * 0.06, wz(murH + 92 * K), 1.1], [W * 0.95, wz(murH + 96 * K), 0.9]];
      if (!hd) for (const [x, z, s] of citrouilles) pr.push(...citrouille(P, x, z, s * 9 * K));
      const bougies = [[tx - 6 * K, 23, tz], [tx + 5 * K, 23, tz + 3]], hb = [];
      if (!hd) for (const [x, y, z] of bougies) pr.push(P(M.cylindre(1.8, 2, 9, 8), '#F4EEE0', { x, y, z }));
      const flammesB = M.maille(bougies.map(([x, y, z]) => P(M.sphere(1.6, 6), '#FFD27A', { x, y: y + (hd ? 13 : 10.5), z, sy: 1.6 })), { ombre: false }); flammesB.material = new THREE.MeshBasicMaterial({ vertexColors: true }); G3.add(flammesB);
      for (const [x, y, z] of bougies) hb.push(ajHalo('#FFB347', 30 * K, 0.6, x, y + (hd ? 14 : 11), z + 2));
      for (const [x, z, s] of citrouilles) hb.push(ajHalo('#FF8A3D', 34 * K * s, 0.42, x, 8 * s, z + 6));
      bougie.position.set(tx, 50, tz + 10);
      animes.push((E) => { hb.forEach((h, k) => { h.material.opacity = (k < 2 ? 0.55 : 0.38) + 0.12 * Math.sin(E.t * (7 + k) + k * 1.7) + 0.05 * Math.sin(E.t * 23 + k); }); bougie.intensity = 40 + 8 * Math.sin(E.t * 8); });
      // les toiles d'araignée aux deux coins hauts du mur, et une petite araignée qui monte et descend au bout de son fil
      const toile = toileAraignee();
      for (const sx of [0, 1]) G3.add(M.mesh(M.plan(54 * K, 54 * K), new THREE.MeshBasicMaterial({ map: toile, transparent: true, depthWrite: false, opacity: 0.85 }), { x: sx ? W - 26 * K : 26 * K, y: Hm - 26 * K, z: 4, ry: 0, rz: sx ? -Math.PI / 2 : 0 }, { ombre: false }));
      const fil = M.mesh(M.cylindre(0.3, 0.3, 1, 4), new THREE.MeshBasicMaterial({ color: '#D9D2EE' }), { x: W - 20 * K, y: Hm - 10, z: 5 }, { ombre: false }), araignee = M.maille([P(M.sphere(3 * K, 8), '#1E1824'), P(M.sphere(2 * K, 8), '#1E1824', { y: -3 * K }), P(M.sphere(0.7 * K, 6), '#FFFFFF', { x: -0.9 * K, y: -3.2 * K, z: 1.8 * K }), P(M.sphere(0.7 * K, 6), '#FFFFFF', { x: 0.9 * K, y: -3.2 * K, z: 1.8 * K })], { ombre: false });
      G3.add(fil, araignee);
      animes.push((E) => { const l = 16 + 12 * (0.5 + 0.5 * Math.sin(E.t * 0.9)); fil.scale.y = l; fil.position.y = Hm - 10 - l / 2; araignee.position.set(W - 20 * K, Hm - 10 - l - 3, 5); });
      // le petit fantôme qui flotte devant la fenêtre : un drap rond qui ondule, deux yeux, des joues roses
      const fan = fantome(M, P, 13 * K); G3.add(fan);
      animes.push((E) => { const a = E.t * 0.45; fan.position.set(fx + Math.sin(a) * fw * 0.8, Hm * 0.36 + 10 * Math.sin(E.t * 1.6), wz(murH + 22 * K) + Math.sin(a * 2) * 6); fan.rotation.y = Math.cos(a) * 0.5; fan.rotation.z = Math.sin(E.t * 1.6) * 0.08; fan.children[0].material.opacity = 0.82 + 0.1 * Math.sin(E.t * 2.3) + (frisson > 0 ? 0.08 : 0); });
      ajHalo('#BFD4FF', fw * 1.6, 0.28, fx, fy + fh * 0.3, 5); // la lueur de la lune par la fenêtre
      // la brume au ras du sol : de grands voiles doux qui glissent lentement
      const brumes = []; for (let k = 0; k < 5; k++) { const b = halo('#B9A8FF', 150 * K, 0.16); b.material.blending = THREE.NormalBlending; b.scale.set(170 * K, 52 * K, 1); b.userData = { v: 6 + k * 3, x0: (k / 5) * W, z: wz(murH + (20 + k * 22) * K) }; G3.add(b); sprites.push(b); brumes.push(b); }
      animes.push((E) => { for (const b of brumes) { const u = b.userData; b.position.set(((u.x0 + E.t * u.v) % (W + 200)) - 100, 6, u.z); } });
      if (hd) { // les meubles et les objets KayKit (Furniture Bits, Halloween Bits) à la place des blocs, aux mêmes places
        const pose = (nom, x, z, larg, o = {}) => { const m = HDM.modele(nom, 1, o); if (!m) return null; const k = larg / Math.max(m.userData.taille.x, m.userData.taille.z); m.scale.setScalar(k); m.position.set(x, o.y || 0, z); if (o.teinte) teinter(m, o.teinte); G3.add(m); return m; };
        const haut = (nom, x, z, h, o = {}) => { const m = HDM.modele(nom, 1, o); if (!m) return null; m.scale.setScalar(h / m.userData.taille.y); m.position.set(x, o.y || 0, z); if (o.teinte) teinter(m, o.teinte); G3.add(m); return m; };
        haut('book_set', bx - 6 * K, 9, 11 * K, { y: Hm * 0.66 + 4, ry: 0.2 }); haut('candle_triple', bx + 16 * K, 9, 12 * K, { y: Hm * 0.66 + 4 });
        pose('armchair', ax, az, 44 * K, { ry: -Math.PI / 2, teinte: '#FF9EF0' });
        pose('rug_rectangle_stripes_A', W * 0.55, wz(murH + 56 * K), W * 0.44, { ombre: false });
        const tb = pose('table_medium', tx, tz, 38 * K); if (tb) tb.scale.y = 20 / tb.userData.taille.y;
        haut('candle_triple', tx - 4 * K, tz, 13, { y: 20 }); haut('book_set', tx + 9 * K, tz - 2, 6, { y: 20, ry: 0.4 });
        haut('lantern_standing', W * 0.62, wz(murH + 12 * K), 26 * K); haut('candle_melted', W * 0.06, wz(murH + 40 * K), 12 * K); haut('candle_thin', W * 0.09, wz(murH + 46 * K), 15 * K);
        const noms = ['pumpkin_orange_jackolantern', 'pumpkin_yellow_jackolantern', 'pumpkin_orange', 'pumpkin_orange_small'];
        citrouilles.forEach(([x, z, s], k) => { const m = haut(noms[k % noms.length], x, z, 17 * K * s); if (m) m.rotation.y = (k % 2 ? -0.4 : 0.35); });
        haut('lantern_hanging', W * 0.3, wz(murH) + 4, 24 * K, { y: Hm * 0.62, ombre: false });
        verifs = 0; noirs = 0;
      }
      G3.add(M.maille(pr, { ombre: false }));
      equipeDe(X.q(), K);
    }
    // ─── l'équipe : la patronne (index 0) puis un employé costumé par produit dont l'apprenti est embauché ───
    // costumes : fantôme (un drap blanc), momie (bandelettes), squelette (pyjama noir à os blancs), vampire (cape et col), sorcière (chapeau
    // pointu et cape), citrouille-lanterne (une tête de citrouille) ; après le maître, le loup-garou (pelage gris-brun, oreilles pointues)
    // et la petite dragonne (verte, deux cornes dorées). Places : autour des meubles, jamais dedans.
    const SPOTS = [[0.5, 1.4, 0], [0.44, 0.85, 0], [0.64, 0.72, -1], [0.6, 1.9, 0], [0.77, 1.5, -1], [0.27, 0.95, -1], [0.12, 1.75, 1], [0.9, 1.78, -1], [0.3, 1.8, 1]];
    const COSTUMES = ['patronne', 'fantome', 'momie', 'squelette', 'vampire', 'sorciere', 'citrouille', 'loupgarou', 'dragonne'];
    // les oreilles du loup-garou, les cornes de la dragonne : dans le repère d'une tête de chibi (rayon 10, centre à l'origine)
    const partsTete = (costume) => (costume === 'loupgarou' ? [-1, 1].flatMap((sx) => [P(M.cone(3.4, 7.5, 6), '#6E5E52', { x: sx * 6.6, y: 10, rz: -sx * 0.4 }), P(M.cone(1.8, 4.4, 6), '#FF9FB2', { x: sx * 6.5, y: 9.6, z: 1.4, rz: -sx * 0.4 })])
      : costume === 'dragonne' ? [-1, 1].map((sx) => P(M.cone(1.9, 6.5, 6), '#FFE27A', { x: sx * 4.6, y: 10.6, z: -1.2, rz: -sx * 0.3, rx: -0.25 })) : []);
    function equipeDe(qq, K) {
      for (const p of persos) { G3.remove(p.g); if (p.hd) { HDM.liberer(p.hd); for (const m of p.mats || []) m.dispose(); for (const o of p.ajouts || []) M.dispose(o); } else M.dispose(p.g); } persos.length = 0;
      const hd = hdOk(), qui = [0]; qq.postes.forEach((s, i) => { if (s.staff && qui.length < SPOTS.length) qui.push(i + 1); });
      qui.forEach((c, k) => {
        const [ux, uy, dirk] = SPOTS[c], costume = COSTUMES[c], x = W * ux, z = wz(murH + uy * 60 * K);
        if (hd) {
          const a = HDM.mini(HDM.MINI[c % HDM.MINI.length]); if (!a) return;
          a.g.scale.setScalar(MINI_ECHELLE * 0.9 * K); a.g.position.set(x, 0, z); a.g.rotation.y = YAW[dirk];
          const habit = costumer(a.g, costume); const base = c === 0 ? 'idle' : k % 2 ? 'interact-right' : 'idle'; HDM.jouer(a, base, 0); G3.add(a.g);
          persos.push({ g: a.g, hd: a, assis: false, dir: dirk, phase: k * 1.3, base, yaw: YAW[dirk], K, x0: x, pas: 24, vie: { t: 3 + k * 2.2, mode: '', cx: 0, retour: false }, mats: habit.mats, ajouts: habit.ajouts, costume });
          return;
        }
        const g = PERSOS.creer(Object.assign({ sac: false, taille: 1 }, CHIBIS[costume])); g.position.set(x, 0, z); g.rotation.y = YAW[dirk]; g.scale.setScalar(0.88 * K);
        const pt = partsTete(costume), cou = g.userData.parts && g.userData.parts.cou; if (pt.length && cou) { const m = M.maille(pt, { ombre: false }); m.position.y = 11; cou.add(m); } // à la tête : elles suivent ses mouvements
        G3.add(g); persos.push({ g, assis: false, dir: dirk, phase: k * 1.3, costume });
      });
    }
    // les chibis en éco : la garde-robe d'Halloween de persos.js (chapeau pointu, capuche de fantôme, cape, bottes) et des teintes
    const H_ = { tete: null, haut: null, pieds: null, accessoire: null };
    const tenue = (o) => Object.assign({}, H_, o);
    const CHIBIS = {
      patronne: { haut: '#8E6BD8', peau: '#FFD7B5', cheveux: '#E0A61E', coiffure: 1, garde: tenue({ tete: { forme: 'chapeau', metal: 'hantee' }, haut: { forme: 'cape', metal: 'hantee' }, pieds: { forme: 'bottes', metal: 'hantee' } }) },
      fantome: { haut: '#F4F1FF', peau: '#F4F1FF', cheveux: '#F4F1FF', coiffure: 0, garde: tenue({ tete: { forme: 'capuche', metal: 'fantome' } }) },
      momie: { haut: '#E8DCC0', peau: '#E8DCC0', cheveux: '#D9CBA8', coiffure: 0, bandes: '#CDBE9A' },
      squelette: { haut: '#2E2A38', peau: '#F2EEE6', cheveux: '#2E2A38', coiffure: 0, os: true },
      vampire: { haut: '#3A2440', peau: '#EDE6FF', cheveux: '#1E1824', coiffure: 2, garde: tenue({ haut: { forme: 'cape', metal: 'vampire' } }) },
      sorciere: { haut: '#5FD3A4', peau: '#B9F0A6', cheveux: '#8E6BD8', coiffure: 1, garde: tenue({ tete: { forme: 'chapeau', metal: 'sorciere' }, pieds: { forme: 'bottes', metal: 'sorciere' } }) },
      citrouille: { haut: '#6FBF5A', peau: '#FFD7B5', cheveux: '#5A7A2E', coiffure: 0, garde: tenue({ tete: { forme: 'citrouille', metal: null } }) },
      loupgarou: { haut: '#5A4A3E', peau: '#9C8A78', cheveux: '#6E5E52', coiffure: 3 },
      dragonne: { haut: '#4FAF6A', peau: '#9FE3A6', cheveux: '#3E8A55', coiffure: 0 },
    };
    // un Mini Character costumé : ses matériaux teintés (clonés, rendus à la fin) et des pièces accrochées à ses os (la tête, le torse, la
    // racine). La tête et le corps du Mini sont MESURÉS dans le repère de leur os (une boîte : centre c, taille t) et chaque pièce s'y
    // proportionne : le chapeau pointu de persos.js (dessiné pour une tête de chibi de 10 de rayon) à 0,8 de la largeur de la tête, etc.
    function costumer(g, costume) {
      const mats = [], ajouts = [], os = {}; let teteM = null, corpsM = null;
      g.traverse((o) => { if (o.isBone) os[o.name] = o; if (o.isMesh) { if (/head/.test(o.name)) teteM = o; else corpsM = o; } });
      g.updateMatrixWorld(true);
      const mesure = (mesh, os1) => { if (!mesh || !os1) return null; const b = new THREE.Box3().setFromObject(mesh); b.applyMatrix4(new THREE.Matrix4().copy(os1.matrixWorld).invert()); return { c: b.getCenter(new THREE.Vector3()), t: b.getSize(new THREE.Vector3()), b }; };
      const teinte = (m, c) => { if (!m) return; const n = m.material.clone(); n.color = new THREE.Color(c); m.material = n; mats.push(n); };
      const T = mesure(teteM, os.head), B = mesure(corpsM, os.torso), R = os.root ? mesure(teteM, os.root) : null, Rc = os.root ? mesure(corpsM, os.root) : null;
      const accroche = (obj, os1) => { if (!os1) return; os1.add(obj); ajouts.push(obj); };
      const TH = PERSOS.TENUES || {};
      if (T && (costume === 'patronne' || costume === 'sorciere')) { // le chapeau pointu (celui de la garde-robe, persos.js), le bord à 40 % au-dessus du centre de la tête
        const c = costume === 'sorciere' ? TH.sorciere : TH.hantee, u = T.t.x * 0.8 / 20;
        if (PERSOS.partsChapeau && c) { const m = M.maille(PERSOS.partsChapeau(c), { ombre: false }); m.scale.setScalar(u); m.position.set(T.c.x, T.c.y + T.t.y * 0.4 - 7.2 * u, T.c.z); accroche(m, os.head); }
        teinte(corpsM, costume === 'sorciere' ? '#7FE0B8' : '#B39CFF');
      }
      if (costume === 'fantome' && R && Rc) { // le drap blanc : une cloche qui couvre tout (la largeur de la tête, la hauteur du corps), deux yeux, des joues roses
        const haut = R.b.max.y - Rc.b.min.y, drap = fantome(M, P, 14, true); drap.scale.set(T.t.x * 0.54 / 16.4, haut * 1.04 / 45, T.t.z * 0.62 / 16.4); drap.position.set(R.c.x, Rc.b.min.y - haut * 0.04, R.c.z); accroche(drap, os.root);
        if (teteM) teteM.visible = false; if (corpsM) corpsM.visible = false;
      }
      if (costume === 'momie' && T) { // beige, trois bandelettes qui serrent la tête, deux autour du ventre
        teinte(corpsM, '#EADFC4'); teinte(teteM, '#F2E8D0');
        const u = T.t.x / 20, parts = [[-0.22, 0.18], [0.06, -0.14], [0.3, 0.1]].map(([dy, rz]) => P(M.tore(9.3, 1.5, TAU, 6, 20), '#CDBE9A', { y: dy * T.t.y / u, rx: Math.PI / 2 + rz, sy: T.t.z / T.t.x }));
        const m = M.maille(parts, { ombre: false }); m.scale.setScalar(u); m.position.copy(T.c); accroche(m, os.head);
        if (B) { const v = B.t.z / 22, m2 = M.maille([P(M.tore(10.6, 1.6, TAU, 6, 20), '#CDBE9A', { y: 0, rx: Math.PI / 2 + 0.15 }), P(M.tore(10.4, 1.6, TAU, 6, 20), '#CDBE9A', { y: 6, rx: Math.PI / 2 - 0.15 })], { ombre: false }); m2.scale.setScalar(v); m2.position.set(B.c.x, B.c.y + B.t.y * 0.12, B.c.z); accroche(m2, os.torso); }
      }
      if ((costume === 'loupgarou' || costume === 'dragonne') && T) { // le pelage (ou les écailles) et, sur la tête, les oreilles pointues ou les deux cornes
        teinte(corpsM, costume === 'loupgarou' ? '#6E5E52' : '#4FAF6A'); teinte(teteM, costume === 'loupgarou' ? '#9C8A78' : '#9FE3A6');
        const u = T.t.x / 20, m = M.maille(partsTete(costume), { ombre: false }); m.scale.setScalar(u); m.position.copy(T.c); accroche(m, os.head);
      }
      if (costume === 'squelette' && B) { // le pyjama noir à os blancs : la colonne et trois côtes sur la poitrine, la tête blanche
        teinte(corpsM, '#3A3448'); teinte(teteM, '#F4F0E6');
        const v = B.t.z / 22, avant = (B.b.max.z - B.c.z) / v - 1.2, m = M.maille([P(M.capsule(1.1, 10, 6), '#F4F0E6', { y: 3, z: avant + 0.6 }), ...[7, 3.5, 0].map((y, k) => P(M.capsule(1, 9 - k * 1.5, 6), '#F4F0E6', { y, z: avant + 0.4, rz: Math.PI / 2 }))], { ombre: false });
        m.scale.setScalar(v); m.position.set(B.c.x, B.c.y + B.t.y * 0.06, B.c.z); accroche(m, os.torso);
      }
      if (costume === 'vampire' && B) { // la cape noire doublée de rouge (dans le dos, du cou aux chevilles) et son col dressé ; le teint pâle
        teinte(corpsM, '#3A2440'); teinte(teteM, '#EFE6FF');
        const d = B.t.z, h = B.t.y * 1.05, ext = new THREE.CylinderGeometry(d * 0.62, d * 0.95, h, 16, 1, true, Math.PI / 2 + 0.3, Math.PI - 0.6), int = ext.clone();
        const ix = int.index.array; for (let k = 0; k < ix.length; k += 3) { const t0 = ix[k]; ix[k] = ix[k + 2]; ix[k + 2] = t0; } int.computeVertexNormals(); int.scale(0.95, 1, 0.95);
        const col = new THREE.CylinderGeometry(d * 0.66, d * 0.62, d * 0.55, 14, 1, true, Math.PI / 2 + 0.2, Math.PI - 0.4);
        const cape = M.maille([P(ext, '#2A1E33'), P(int, '#C2243F'), P(col, '#C2243F', { y: h / 2 + d * 0.2 })], { ombre: false }); ext.dispose(); int.dispose(); col.dispose();
        cape.position.set(B.c.x, B.b.max.y - h / 2 + d * 0.05, B.c.z - d * 0.05); accroche(cape, os.torso);
      }
      if (costume === 'citrouille' && T) { // une tête de citrouille-lanterne (le modèle HD, sinon une citrouille bâtie), le corps vert tige, une lueur
        teinte(corpsM, '#6FBF5A'); if (teteM) teteM.visible = false;
        const c = HDM.modele('pumpkin_orange_jackolantern', 1, { ombre: false }), tete = c || M.maille(citrouille(P, 0, 0, 12), { ombre: false }), larg = c ? Math.max(c.userData.taille.x, c.userData.taille.z) : 24;
        tete.scale.setScalar(T.t.x * 1.08 / larg); tete.position.set(T.c.x, T.b.min.y + T.t.y * 0.02, T.c.z); accroche(tete, os.head);
        const h = halo('#FF8A3D', T.t.x * 2.4, 0.4); h.position.set(T.c.x, T.c.y, T.b.max.z); accroche(h, os.head); sprites.push(h);
      }
      return { mats, ajouts };
    }
    function redim() {
      const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight); if (w === W && h === H && G3.children.length) return;
      W = w; H = h; murH = Math.round(h * 0.44);
      renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(W, H, false);
      camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
      const Zc = (H / 2 - murH) / SY; camera.position.set(W / 2, 1500 * SY, Zc + 1500 * CY); camera.up.set(0, 1, 0); camera.lookAt(W / 2, 0, Zc); camera.updateMatrixWorld();
      dir.position.set(W * 0.5, 600, Zc - 200); dir.target.position.set(W / 2, 0, Zc); dir.target.updateMatrixWorld();
      batir();
    }
    // le jardin hanté derrière la fenêtre. HD : une petite scène KayKit Halloween (un arbre mort, la grille et son portail, deux tombes,
    // un lampadaire-lanterne, des citrouilles, un sapin orange) sous une grande lune, des chauves-souris qui passent, rendue dans une
    // texture. Éco : le même jardin peint sur une toile 2D (lune, collines, arbre, grille, chauves-souris), repeint quatre fois par seconde.
    function creerJardin(hd, aspect) {
      if (hd) {
        const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, aspect, 0.1, 60), rt = new THREE.WebGLRenderTarget(256, Math.round(256 / aspect));
        rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.userData.partagee = true; sc.background = new THREE.Color('#251C46'); sc.fog = new THREE.Fog('#251C46', 8, 20);
        sc.add(new THREE.HemisphereLight('#8C7FE0', '#251C46', 1.1)); const lune = new THREE.DirectionalLight('#C9D6FF', 0.9); lune.position.set(-2, 5, -4); sc.add(lune);
        const lampe = new THREE.PointLight('#FFB45A', 10, 6, 1.6); lampe.position.set(1.4, 1.8, 0.8); sc.add(lampe);
        const pose = (nom, x, z, haut, ry) => { const m = HDM.modele(nom, 1, { ombre: false }); if (!m) return null; m.scale.setScalar(haut / m.userData.taille.y); m.position.set(x, 0, z); m.rotation.y = ry || 0; sc.add(m); return m; };
        const disque = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ color: '#FFF4C9', fog: false })); disque.position.set(-1.1, 4.4, -9); sc.add(disque);
        const lueur = halo('#FFF1B0', 5, 0.5); lueur.position.copy(disque.position); sc.add(lueur);
        pose('tree_dead_medium', -1.6, -2.2, 3.4, 0.3); pose('tree_pine_orange_medium', 2.6, -3.6, 2.4); pose('crypt', 0.6, -5.2, 1.9, -0.3);
        pose('gravestone', -0.4, -1.2, 0.8, 0.2); pose('gravestone', 1.1, -1.8, 0.7, -0.3);
        for (let k = -3; k <= 3; k++) if (k !== 0) pose('fence', k * 1.25, 0.6, 0.75); pose('fence_gate', 0, 0.6, 0.85);
        pose('post_lantern', 1.6, 0.9, 1.6, -Math.PI / 2); pose('pumpkin_orange_jackolantern', -0.9, 1.4, 0.42, 0.3); pose('pumpkin_yellow_jackolantern', -0.35, 1.7, 0.32, -0.3); pose('pumpkin_orange_small', 0.5, 1.6, 0.24);
        const sol = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: '#2E3A3A', roughness: 1 })); sol.rotation.x = -Math.PI / 2; sc.add(sol);
        const chauves = []; for (let k = 0; k < 3; k++) { const b = chauveSouris(); sc.add(b); chauves.push(b); }
        cam.position.set(0, 1.6, 4.6); cam.lookAt(0, 1.7, -2);
        let tv = 0;
        return { hd: true, texture: rt.texture, frame(dt) { tv += dt; chauves.forEach((b, k) => { const a = tv * (0.35 + k * 0.08) + k * 2.1; b.position.set(Math.sin(a) * (2.2 + k * 0.5), 3.1 + k * 0.35 + Math.sin(a * 2.3) * 0.3, -3 - k); b.rotation.y = Math.cos(a) > 0 ? Math.PI / 2 : -Math.PI / 2; const f = Math.sin(tv * 16 + k) * 0.8; b.children[0].rotation.z = f; b.children[1].rotation.z = -f; });
          lampe.intensity = 9 + Math.sin(tv * 7) * 1.5; renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null); },
          liberer() { rt.dispose(); libererSprite(lueur); sc.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); } };
      }
      const c = document.createElement('canvas'); c.width = 192; c.height = Math.round(192 / aspect); const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      let tv = 0, der = -1;
      const peindre = () => {
        const w = c.width, h = c.height, g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1B1438'); g.addColorStop(0.7, '#3B2A66'); g.addColorStop(1, '#2A2140'); x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let k = 0; k < 18; k++) { x.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(tv * 2 + k)})`; x.fillRect((k * 53) % w, (k * 37) % (h * 0.5), 2, 2); }
        const rl = x.createRadialGradient(w * 0.32, h * 0.26, 0, w * 0.32, h * 0.26, w * 0.4); rl.addColorStop(0, 'rgba(255,241,176,.55)'); rl.addColorStop(1, 'rgba(255,241,176,0)'); x.fillStyle = rl; x.fillRect(0, 0, w, h);
        x.fillStyle = '#FFF4C9'; x.beginPath(); x.arc(w * 0.32, h * 0.26, w * 0.16, 0, TAU); x.fill();
        x.fillStyle = '#2A1F45'; x.beginPath(); x.moveTo(0, h * 0.78); x.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.6, h * 0.74); x.quadraticCurveTo(w * 0.85, h * 0.66, w, h * 0.72); x.lineTo(w, h); x.lineTo(0, h); x.fill();
        x.strokeStyle = '#1A1428'; x.lineCap = 'round'; x.lineWidth = 7; x.beginPath(); x.moveTo(w * 0.74, h * 0.9); x.lineTo(w * 0.72, h * 0.48); x.stroke(); x.lineWidth = 4;
        for (const [a, b, cc, dd] of [[0.72, 0.6, 0.86, 0.46], [0.72, 0.55, 0.6, 0.42], [0.82, 0.5, 0.9, 0.38], [0.64, 0.46, 0.6, 0.36]]) { x.beginPath(); x.moveTo(w * a, h * b); x.lineTo(w * cc, h * dd); x.stroke(); }
        x.fillStyle = '#4A4060'; for (const [gx, gh] of [[0.2, 0.1], [0.44, 0.08]]) { x.beginPath(); x.moveTo(w * gx - 9, h * 0.86); x.lineTo(w * gx - 9, h * (0.86 - gh)); x.arc(w * gx, h * (0.86 - gh), 9, Math.PI, 0); x.lineTo(w * gx + 9, h * 0.86); x.fill(); }
        x.strokeStyle = '#120E1C'; x.lineWidth = 2.5; for (let k = 0; k < 13; k++) { x.beginPath(); x.moveTo(k * w / 12, h * 0.98); x.lineTo(k * w / 12, h * 0.82); x.stroke(); } x.beginPath(); x.moveTo(0, h * 0.86); x.lineTo(w, h * 0.86); x.stroke();
        x.fillStyle = '#FF8A3D'; x.beginPath(); x.ellipse(w * 0.3, h * 0.94, 11, 8, 0, 0, TAU); x.fill(); x.fillStyle = '#FFE27A'; x.fillRect(w * 0.3 - 5, h * 0.93, 3, 3); x.fillRect(w * 0.3 + 2, h * 0.93, 3, 3);
        x.fillStyle = '#120E1C'; for (let k = 0; k < 3; k++) { const a = tv * (0.5 + k * 0.1) + k * 2, bx2 = w * (0.5 + 0.38 * Math.sin(a)), by2 = h * (0.2 + 0.08 * k + 0.03 * Math.sin(a * 3)), f = Math.sin(tv * 14 + k) * 5; x.beginPath(); x.moveTo(bx2, by2); x.quadraticCurveTo(bx2 - 6, by2 - 4 - f, bx2 - 11, by2 + 1); x.quadraticCurveTo(bx2 - 6, by2 + 1, bx2, by2 + 3); x.quadraticCurveTo(bx2 + 6, by2 + 1, bx2 + 11, by2 + 1); x.quadraticCurveTo(bx2 + 6, by2 - 4 - f, bx2, by2); x.fill(); }
        tex.needsUpdate = true;
      };
      peindre();
      return { hd: false, texture: tex, frame(dt) { tv += dt; const k = Math.floor(tv * 4); if (k !== der) { der = k; peindre(); } }, liberer() { tex.dispose(); } };
    }
    function frameScene(dt) {
      redim(); t += dt;
      const E = { t };
      for (const f of animes) f(E);
      if (hdOk() ? hdVu !== HDM.version : hdVu !== 0) batir(); // les modèles viennent d'arriver, ou le palier est passé en éco
      if (jardin) jardin.frame(dt);
      for (const p of persos) { if (p.hd) { vieMini(p, dt, W, fete); p.hd.mixer.update(dt); continue; } animerChibi(p, t, fete); }
      if (fete > 0) fete -= dt; if (frisson > 0) frisson -= dt;
      renderer.render(scene, camera);
      if (hdVu && verifs < 8) { tVerif += dt; if (tVerif > 0.4) { tVerif = 0; verifs++; noirs = ecranNoir(renderer) ? noirs + 1 : 0;
        if (noirs >= 3) { console.warn('Manoir : écran noir en HD, retour au décor classique sur ce téléphone'); HDM.couper('écran noir'); batir(); } } }
    }
    redim();
    return {
      get perdu() { return perdu; },
      get hd() { return { actif: hdVu > 0, persos: persos.filter((p) => p.hd).length, jardin: !!(jardin && jardin.hd), verifs, noirs, costumes: persos.map((p) => p.costume) }; },
      redim, frame: frameScene, equipe: (qq) => equipeDe(qq, Kc), vente: () => { }, fete: () => { fete = 2; }, coup: () => { frisson = 1.5; },
      detruire() { try { G3.traverse((o) => { if (o.isMesh) { if (o.geometry && !o.geometry.userData.cache) o.geometry.dispose(); const ms = [].concat(o.material || []); for (const m of ms) if (m && m !== M.MAT.vertex && !M.MATS.has(m)) m.dispose(); } }); for (const s of sprites) libererSprite(s); } catch (e) { /* rien */ }
        try { if (jardin) jardin.liberer(); for (const p of persos) if (p.hd) { HDM.liberer(p.hd); for (const m of p.mats || []) m.dispose(); } renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* rien */ } },
      get calls() { return renderer.info.render.calls; },
    };
  }
  // les briques du manoir
  function ogive(w, h) { // une fenêtre en ogive : le rectangle et son arc, en une forme plate (UV de 0 à 1 sur la boîte)
    const s = new THREE.Shape(), r = h * 0.38, y0 = -h * 0.38; s.moveTo(-w / 2, y0); s.lineTo(w / 2, y0); s.lineTo(w / 2, h * 0.24); s.quadraticCurveTo(w / 2, h * 0.24 + r * 0.9, 0, h * 0.62); s.quadraticCurveTo(-w / 2, h * 0.24 + r * 0.9, -w / 2, h * 0.24); s.closePath();
    const g = new THREE.ShapeGeometry(s, 12), pos = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + w / 2) / w, (pos.getY(k) - y0) / (h * 0.62 - y0));
    return g;
  }
  function citrouille(P, x, z, r) { // une citrouille-lanterne bâtie : cinq côtes, la tige, les yeux et la bouche lumineux
    const M = MODELES, p = [];
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; p.push(P(M.sphere(r * 0.62, 10), k % 2 ? '#F28C28' : '#FF9A3D', { x: x + Math.cos(a) * r * 0.42, y: r * 0.72, z: z + Math.sin(a) * r * 0.3, sy: 1.05 })); }
    p.push(P(M.cylindre(r * 0.12, r * 0.16, r * 0.4, 6), '#5A7A2E', { x, y: r * 1.35, z }), P(M.sphere(r * 0.16, 6), '#FFE27A', { x: x - r * 0.3, y: r * 0.95, z: z + r * 0.62, sz: 0.4 }), P(M.sphere(r * 0.16, 6), '#FFE27A', { x: x + r * 0.3, y: r * 0.95, z: z + r * 0.62, sz: 0.4 }), P(M.boite(r * 0.6, r * 0.14, r * 0.1, r * 0.05), '#FFE27A', { x, y: r * 0.55, z: z + r * 0.66 }));
    return p;
  }
  function fantome(M, P, r, opaque) { // le petit fantôme : un drap en cloche (translucide, ou opaque pour le costume), deux yeux noirs, deux joues roses, un sourire
    const g = new THREE.Group(), corps = new THREE.Mesh(drapGeo(), new THREE.MeshLambertMaterial(Object.assign({ side: THREE.DoubleSide }, opaque ? { color: '#F6F3FF', emissive: '#CFC6FF', emissiveIntensity: 0.3 } : { color: '#FFFFFF', emissive: '#D9D2FF', emissiveIntensity: 0.55, transparent: true, opacity: 0.88 })));
    corps.scale.setScalar(r / 14); g.add(corps);
    const visage = M.maille([P(M.sphere(2.2, 8), '#1E1824', { x: -4.2, y: 36, z: 12.6, sy: 1.35, sz: 0.4 }), P(M.sphere(2.2, 8), '#1E1824', { x: 4.2, y: 36, z: 12.6, sy: 1.35, sz: 0.4 }), P(M.sphere(2.1, 8), '#FF9FB2', { x: -8, y: 31.5, z: 11.6, sz: 0.3 }), P(M.sphere(2.1, 8), '#FF9FB2', { x: 8, y: 31.5, z: 11.6, sz: 0.3 }), P(M.tore(2, 0.6, Math.PI, 4, 8), '#1E1824', { y: 31.5, z: 13, rz: Math.PI })], { ombre: false });
    visage.scale.setScalar(r / 14); g.add(visage); return g;
  }
  let _drap = null;
  function drapGeo() { // une cloche de drap (tour) : la tête ronde, les épaules, le bas qui ondule en festons ; 46 de haut, 15 de rayon
    if (_drap) return _drap;
    const pts = [new THREE.Vector2(16.4, 0), new THREE.Vector2(15.6, 6), new THREE.Vector2(14.2, 18)]; for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * 13.5 + 0.01, 30 + Math.sin(a) * 15)); }
    const g = new THREE.LatheGeometry(pts, 24), pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); if (y < 4) { const a = Math.atan2(pos.getZ(k), pos.getX(k)); pos.setY(k, y + Math.sin(a * 6) * 2.2); } }
    g.computeVertexNormals(); g.userData.cache = true; _drap = g; return g;
  }
  function chauveSouris() { // deux ailes plates qui battent, un petit corps rond
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: '#120E1C', side: THREE.DoubleSide, fog: false }), aile = new THREE.Shape();
    aile.moveTo(0, 0); aile.quadraticCurveTo(0.15, 0.18, 0.34, 0.08); aile.quadraticCurveTo(0.26, 0.02, 0.3, -0.06); aile.quadraticCurveTo(0.18, -0.02, 0, -0.04); aile.closePath();
    const ga = new THREE.ShapeGeometry(aile, 6), d = new THREE.Mesh(ga, mat), gch = new THREE.Mesh(ga, mat); gch.scale.x = -1; g.add(d, gch);
    const corps = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat); g.add(corps); g.scale.setScalar(1.3); return g;
  }
  function teinter(m, c) { m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(c); } }); }
  let _toile = null, _portrait = null;
  function toileAraignee() { // une toile d'araignée dans un coin (quart de cercle), traits clairs sur fond transparent
    if (_toile) return _toile;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = 'rgba(232,226,255,.85)'; x.lineWidth = 2; x.lineCap = 'round';
    for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 126, Math.sin(a) * 126); x.stroke(); }
    x.lineWidth = 1.5; for (let r = 22; r < 126; r += 21) { x.beginPath(); for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2, px = Math.cos(a) * r, py = Math.sin(a) * r; if (k === 0) x.moveTo(px, py); else { const am = (k - 0.5) / 5 * Math.PI / 2, rm = r * 0.86; x.quadraticCurveTo(Math.cos(am) * rm, Math.sin(am) * rm, px, py); } } x.stroke(); }
    _toile = new THREE.CanvasTexture(c); _toile.colorSpace = THREE.SRGBColorSpace; _toile.flipY = false; _toile.userData.partagee = true; return _toile;
  }
  function toilePortrait() { // le portrait de l'ancêtre : un fantôme distingué en nœud papillon, dans un cadre doré ovale
    if (_portrait) return _portrait;
    const c = document.createElement('canvas'); c.width = 96; c.height = 120; const x = c.getContext('2d');
    x.fillStyle = '#B07A2E'; x.fillRect(0, 0, 96, 120); x.fillStyle = '#E0B65A'; x.fillRect(5, 5, 86, 110);
    x.fillStyle = '#2A2050'; x.beginPath(); x.ellipse(48, 60, 36, 48, 0, 0, TAU); x.fill();
    x.fillStyle = '#F4F1FF'; x.beginPath(); x.moveTo(24, 104); x.lineTo(24, 54); x.arc(48, 54, 24, Math.PI, 0); x.lineTo(72, 104); for (let k = 0; k < 4; k++) x.quadraticCurveTo(66 - k * 12, 96, 60 - k * 12, 104); x.fill();
    x.fillStyle = '#1E1824'; x.beginPath(); x.ellipse(40, 54, 3.5, 5, 0, 0, TAU); x.ellipse(56, 54, 3.5, 5, 0, 0, TAU); x.fill();
    x.fillStyle = '#FF9FB2'; x.beginPath(); x.arc(34, 63, 3, 0, TAU); x.arc(62, 63, 3, 0, TAU); x.fill();
    x.fillStyle = '#E1496C'; x.beginPath(); x.moveTo(48, 76); x.lineTo(38, 70); x.lineTo(38, 82); x.closePath(); x.moveTo(48, 76); x.lineTo(58, 70); x.lineTo(58, 82); x.closePath(); x.fill();
    x.strokeStyle = '#1E1824'; x.lineWidth = 2; x.beginPath(); x.arc(48, 62, 5, 0.2, Math.PI - 0.2); x.stroke();
    _portrait = new THREE.CanvasTexture(c); _portrait.colorSpace = THREE.SRGBColorSpace; _portrait.userData.partagee = true; return _portrait;
  }

  // ─── les deux fiches ───
  const QR = typeof QUARTIER !== 'undefined' ? QUARTIER : null;
  const ficheQuartier = () => ({
    cle: 'quartier', p: 'pq', racine: '#planque', ecran: 'planque', classe: '', R: QR, nom: 'Le Quartier', lieu: 'La Planque', porte: true, lot: 'planque',
    fmt: (n) => QR.fmtEur(n), prix: (n) => QR.fmtEur(n), fmtPhrase: (n) => QR.fmtEur(n), solde: (n) => QR.fmtEur(n),
    ico: { devise: ICONS.QUARTIER.billets, palier: ICONS.QUARTIER.palier, bilan: ICONS.QUARTIER.billets, produit: (p) => ICONS.QUARTIER[p.id], coup: (type) => ICONS.QUARTIER[type] || '' },
    decos: (l) => { if (typeof SCENE !== 'undefined' && SCENE.decosQuartier) SCENE.decosQuartier(l); },
    rangFinal: (rec) => rec.quartier || null,
    genres: { descente: 'taper', grosclient: 'livrer', soiree: 'mult', scooter: 'attraper' }, actions: { taper: 'planquer', livrer: 'livrer', attraper: 'attraper' },
    coups: {
      taper: { cls: 'descente', titre: 'Descente de police !', bouton: 'Planque !', son: 'sirene', detail: (ev, f) => `${ev.n} touches pour tout planquer · prime <b>${f(ev.prime)}</b> · sinon ils embarquent ${f(ev.enjeu)}`, reussite: (m) => `Tout est planqué, la police repart bredouille : +${m}`, debut: 'Descente de police ! Planque tout, vite !', perte: (m) => `La police embarque ${m} de billets…` },
      livrer: { cls: 'grosclient', titre: 'Un gros client', bouton: 'Livrer !', badge: 'Le gros client attend', attend: 'le client attend', reussite: (m) => `Gros client livré : +${m}`, debut: 'Un gros client passe commande !', fin: 'Le gros client est reparti sans sa commande.' },
      mult: { cls: 'soiree', titre: 'Soirée dans le quartier', debut: 'Soirée dans le quartier : tout se vend ×2 !', fin: 'La soirée est finie.' },
      attraper: { cls: 'scooter', titre: 'Le livreur passe', bouton: 'Attraper', detail: (ev, f) => `Attrape le bonus avant qu’il reparte : <b>${f(ev.prime)}</b>`, reussite: (m) => `Le livreur te laisse ${m}`, debut: 'Le livreur en scooter passe : attrape le bonus !', fin: 'Le scooter est reparti.' },
    },
    stats: [['Ventes', 'ventes'], ['Descentes déjouées', 'descentes'], ['Gros clients', 'grosClients'], ['Scooters', 'scooters']],
    scene: scenePlanque,
    // le palier 11 : le chien du quartier, couché dans la boutique, est aussi un compagnon (GAME.COMPAGNONS, « chien-quartier »)
    apresPalier: (s, p, dons) => { if (p.deco === 'chien' && typeof G.compagnon === 'function' && G.compagnon('chien-quartier')) dons.push('le chien du quartier comme compagnon : choisis-le dans « Les compagnons » (Réglages › Le compagnon)'); },
    t: {
      lieu: 'La Planque', premier: 'Touche l’herbe pour vendre ton premier sachet !', ferme: 'La Planque ferme ses portes !', reste: 'Ferme dans',
      absence: (duree, m) => `Pendant ton absence (${duree}) : +${m} de billets, au ralenti sans le boss.`,
      taux: (m, pres) => `<b>+${m}</b>/s · le boss est là ×${pres}`, tauxVide: (pres) => `Touche un produit pour vendre · le boss est là ×${pres}`,
      nouveau: (nom) => `${nom} : nouveau produit à la Planque !`, embauche: (nom) => `${nom} rejoint l’équipe du quartier !`,
      decoDon: { graffiti: 'un graffiti sur la porte de la boutique', neon: 'une enseigne néon au mur de la boutique', scooter: 'un scooter garé devant la boutique', chien: 'le chien du quartier, couché dans la boutique' }, decoDefaut: (k) => k,
      vetementNom: (v) => v, tenueComplete: ' : la tenue du quartier est complète !',
      palierSous: (m) => `${m} de billets gagnés dans la Planque. Pour la boulangerie :`, palierFinal: 'Le boss du quartier, c’est toi. Tout ça reste à vie, même après la fermeture de la Planque.', palierOk: 'Trop bien',
      amTitre: 'Les combines', amSous: 'Des améliorations qui multiplient les ventes de la Planque, jusqu’à la fin de l’événement.',
      apresBoss: 'Après le boss', apresBossSous: 'Huit paliers bonus pour ceux qui ont déjà tout : des étoiles par poignées, des boosts ×5 et ×10, des heures de gains pour la boulangerie, et au 20e la casquette néon.',
      amBonus: 'Pour souffler une fois boss : le Grossiste (les niveaux à moitié prix), un ×3 pour chaque nouvelle recette, et des combines qui rendent la vie plus douce. Chacune paie la boulangerie (des heures de gains, des étoiles).', amBientot: (n, k) => `${n} combine${n > 1 ? 's' : ''} de plus à partir du palier ${k}.`,
      palierBonus: 'Après le boss, ça continue : huit paliers bonus (jusqu’à 8 étoiles d’un coup, des boosts ×10, des heures de gains), deux nouvelles recettes (aux paliers 13 et 16) et sept combines qui paient la boulangerie t’attendent.', combineMot: 'combine',
      recetteApres: (n) => `Après le palier ${n}`,
      revue: (quoi) => `Tu avais déjà ${quoi || 'avancé'} au Quartier : voici, une fois, la différence avec les nouvelles récompenses. Les prochains paliers et les combines d’après le boss donnent déjà les nouvelles.`, palierBonusFinal: 'Une légende en néon. Le quartier n’a plus rien à t’apprendre : la casquette néon est dans ta garde-robe, à vie.',
      paliersSous: (m, nb, n) => `${m} de billets gagnés · ${nb}/${n}. Les mêmes seuils pour tout le monde ; chaque palier donne quelque chose pour la boulangerie, à vie.`,
      paliersNote: 'Les boosts se lancent quand tu veux dans la boutique (la pastille sous les objectifs). Les heures de gains tombent tout de suite dans la caisse de la boulangerie. La tenue du quartier se porte depuis la garde-robe du boulanger, et le chien du quartier se choisit comme compagnon.',
      bilanTitre: 'La Planque a fermé', bilanH2: 'Bilan du quartier', bilanSous: 'de billets gagnés en deux semaines', bilanDecos: (n) => `${n} déco${n > 1 ? 's' : ''} du quartier dans la boutique`, bilanTenue: 'de la tenue du quartier', bilanOr: 'la tenue du quartier en or',
      bilanVide: 'La Planque a fermé sans rien laisser derrière elle. À la prochaine !',
      annonce: () => `<div class="pq-sheet pq-annonce"><div class="pq-annonce-scene"><span class="pq-pic grand">${ICONS.QUARTIER.porte}</span></div>
        <h2>Le Quartier ouvre ses portes</h2>
        <p class="sous">Deux semaines, jusqu’au mardi 27 octobre à midi : une boutique à part, « la Planque », où tout le monde part de zéro. Ses billets rapportent des récompenses pour ta boulangerie : étoiles, boosts, heures de gains, décos du quartier, un chien et une tenue à vie.</p>
        <p class="encadre">C’est une parodie pour adultes, façon dessin animé. Réservée aux 18 ans et plus ; on peut la masquer dans les Réglages.</p>
        <button type="button" class="btn large sombre" data-a="pq-entrer" style="margin-top:12px"><small>18 ans et +</small><b>Voir le Quartier</b></button>
        <button type="button" class="btn large clair" data-a="pq-tard" style="margin-top:8px"><b>Plus tard</b></button></div>`,
    },
  });
  // la Maison hantée : HANTEE (src/hantee.js, groupe H1) et sa fiche ; ici, les valeurs par défaut de l'écran (textes, icônes, couleurs)
  const HR = typeof HANTEE !== 'undefined' ? HANTEE : typeof MAISON_HANTEE !== 'undefined' ? MAISON_HANTEE : null; // eslint-disable-line no-undef
  let st0 = () => null; // l'état du jeu, pour les textes de la fiche (posé par init)
  // les gabarits des activités de la Maison hantée (HTML seul, sans logique ; les classes dans src/style.css, .mh-* ; remplis par src/hanteeactivites.js) :
  // · eveil(part, texte) : l'intérieur de #ht-eveil, la jauge sous le ×6 (part : 1 réveillé → 0 endormi ; data-niveau sur #ht-eveil : 'bas' sous 0,35) ;
  // · serie(n, record) : l'intérieur de #ht-serie, le compteur de la série d'apparitions attrapées (classe .chaude sur #ht-serie à partir de 5) ;
  // · commande(o) : la carte « Commande de la nuit », à poser dans #ht-commande : o = { client, sorte, lignes: [{ ico, nom, n, fait }], prime (HTML),
  //   reste (texte : « 2 min 10 »), part (0..1 du temps écoulé), prete, bouton (le mot du bouton prêt : « Livrer ! ») } ; son bouton porte data-a="mh-commande".
  const gabarits = {
    eveil: (part, texte) => `<i class="mh-eveil-jauge"><b style="width:${Math.round(Math.max(0, Math.min(1, part)) * 100)}%"></b></i><span class="mh-eveil-txt">${esc(texte || 'Le boss s’endort…')}</span>`,
    serie: (n, record) => `<span class="mh-serie-ico">${(typeof ICONS !== 'undefined' && ICONS.HANTEE && ICONS.HANTEE.attraper) || ''}</span><b>×${Math.max(0, n | 0)}</b><small>${record ? `record ×${record}` : 'série'}</small>`,
    commande: (o) => `<article class="mh-commande${o.prete ? ' prete' : ''}"><span class="mh-commande-pic">${(typeof ICONS !== 'undefined' && ICONS.HANTEE && ICONS.HANTEE.taper) || ''}</span>
      <div class="mh-commande-corps"><small class="mh-commande-tag">Commande de la nuit</small><b>${esc(o.client || 'Un client du Manoir')}</b>
        <ul class="mh-commande-lignes">${(o.lignes || []).map((l) => `<li class="${l.fait >= l.n ? 'fait' : ''}"><i>${l.ico || ''}</i><span>${l.fait || 0}/${l.n}</span></li>`).join('')}</ul>
        <i class="mh-commande-temps"><b style="width:${Math.round(Math.max(0, Math.min(1, 1 - (o.part || 0))) * 100)}%"></b></i></div>
      <button type="button" class="btn ${o.prete ? 'menthe' : 'non'}" data-a="mh-commande"><small>${o.prete ? esc(o.bouton || 'Servir') : esc(o.reste || 'En cours')}</small><b>${o.prime || ''}</b></button></article>`,
    // le bestiaire (src/hanteeactivites.js le remplit ; o : { faits, total, par, etoiles, gagnees, deco, chauvesouris, rangDeco, rangCompagnon, rangs,
    // sortes: [{ sorte, nom, court, n, par, fait, etat ('vide' | 'encours' | 'fait'), ico }], ico, icoDeco, icoCompagnon, textes }) : la carte du
    // tiroir (les neuf en miniature, sombres tant qu'aucun n'est servi), sa feuille, le petit mot sur la scène, la feuille de fête
    bestiaire: (o) => `<button type="button" class="mh-bestiaire" data-a="mh-bestiaire" aria-label="${esc(`${(o.textes && o.textes.bestiaire) || 'Le bestiaire'} : ${o.faits} sorte${o.faits > 1 ? 's' : ''} sur ${o.total}`)}">
      <span class="mh-best-pic" aria-hidden="true">${o.ico}</span>
      <span class="mh-best-corps"><span class="mh-best-tete"><b>${esc((o.textes && o.textes.bestiaire) || 'Le bestiaire')}</b><small>${o.faits}/${o.total} monstres</small></span>
        <span class="mh-best-mini" aria-hidden="true">${o.sortes.map((s) => `<i class="${s.etat}" data-sorte="${esc(s.sorte)}" style="--p:${(s.n / s.par).toFixed(2)}">${s.ico}</i>`).join('')}</span></span>
      <span class="mh-best-fleche" aria-hidden="true">›</span></button>`,
    bestiaireFeuille: (o) => {
      const prochaine = o.faits < o.total ? o.rangs[o.faits] : 0, li = (fait, ico, titre, sous, fin) => `<li class="${fait ? 'fait' : ''}"><span class="mh-best-r-ico">${ico}</span><div><b>${esc(titre)}</b><small>${esc(sous)}</small></div><em>${esc(fin)}</em></li>`;
      return `<div class="pq-sheet ht mh-best-feuille" data-bestiaire="1"><div class="pq-palier-tete"><span class="pq-pic">${o.ico}</span><div><h2>${esc((o.textes && o.textes.bestiaire) || 'Le bestiaire')} du Manoir</h2><p class="sous">${esc((o.textes && o.textes.bestiaireSous) || 'Sers dix clients de chaque sorte de monstre pour les ajouter au bestiaire.')} ${o.faits}/${o.total}.</p></div></div>
        <div class="mh-best-grille">${o.sortes.map((s) => `<div class="mh-best-case ${s.etat}" data-sorte="${esc(s.sorte)}"><span class="mh-best-por">${s.ico}${s.fait ? '<b class="mh-best-et" aria-hidden="true">★</b>' : ''}</span><b>${esc(s.n > 0 || s.fait ? s.court : '???')}</b><small>${s.fait ? 'au complet' : `${s.n}/${s.par}`}</small><i class="mh-best-barre"><b style="width:${Math.round(s.n / s.par * 100)}%"></b></i></div>`).join('')}</div>
        <h3 class="titre-section">Les récompenses</h3>
        <ul class="mh-best-recomp">
          ${li(o.faits >= o.total, '<b class="mh-best-r-et">★</b>', 'Chaque sorte complétée : des étoiles', `+1 ★ pour ta boulangerie, +2 à la ${o.rangDeco}e et à la ${o.rangCompagnon}e (${o.etoiles} ★ en tout)${prochaine ? ` · la prochaine : +${prochaine} ★` : ''}`, `${o.gagnees}/${o.etoiles} ★`)}
          ${li(o.deco, o.icoDeco, `${o.rangDeco} sortes : l’étagère aux bocaux de monstres`, 'Un décor pour ta boutique, à vie', o.deco ? 'gagnée ✓' : `${Math.min(o.faits, o.rangDeco)}/${o.rangDeco}`)}
          ${li(o.chauvesouris, o.icoCompagnon, `Les ${o.total} : Myrtille la chauve-souris`, 'Un compagnon pour ta boutique, à vie : elle tourne sous le plafond (+1 h d’absence)', o.chauvesouris ? 'gagnée ✓' : `${o.faits}/${o.total}`)}
        </ul>
        <p class="note centre">Pas de bonbons ici : tout va à ta boulangerie, et le bestiaire reste après Halloween.</p>
        <button type="button" class="btn large ht-btn" data-a="mh-best-ok" style="margin-top:12px"><b>Retour au Manoir</b></button></div>`;
    },
    bestiaireMot: (o) => `<span class="mh-bt-ico" aria-hidden="true">${o.ico}</span><span class="mh-bt-corps"><b>${esc(o.texte)}</b><i class="mh-bt-barre"><b style="width:${Math.round(Math.max(0, Math.min(1, o.part)) * 100)}%"></b></i></span>${o.fait ? '<span class="mh-bt-et" aria-hidden="true">★</span>' : ''}`,
    bestiaireFete: (o) => `<div class="pq-sheet ht mh-best-fete" data-bestiaire-fete="${esc(o.sorte)}"><div class="mh-best-fete-pic" aria-hidden="true">${o.ico}<b>★</b></div>
      <h2>${esc(o.titre)}</h2><p class="sous">${o.rang}/${o.total} monstres au bestiaire · dix servis</p>
      <ul class="pq-dons">${o.dons.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${o.compagnon ? `<div class="mh-best-cs"><span>${o.icoCompagnon}</span><p>Le bestiaire est complet ! Myrtille t’attend dans « Les compagnons » (la garde-robe ou les Réglages).</p></div><button type="button" class="btn large menthe" data-a="mh-best-choisir" style="margin-top:10px"><b>Choisir Myrtille tout de suite</b></button>`
        : `<p class="encadre">${o.deco ? 'L’étagère aux bocaux de monstres est accrochée dans ta boutique. ' : ''}${o.reste > 0 ? `Encore ${o.reste} sorte${o.reste > 1 ? 's' : ''} de monstre${o.reste > 1 ? 's' : ''} : ${o.rang < o.rangDeco ? `à ${o.rangDeco}, un décor pour ta boutique ; ` : ''}aux ${o.total}, une chauve-souris de compagnie.` : ''}</p>`}
      <div class="mh-best-fete-boutons"><button type="button" class="btn large clair" data-a="mh-best-voir"><b>Le bestiaire</b></button><button type="button" class="btn large beurre" data-a="mh-best-ok"><b>Trop chouette</b></button></div></div>`,
  };
  function ficheHantee() {
    const HF = (HR && HR.FICHE) || {}, T = HF.textes || {}, dv = HF.devise || {}, nomDevise = dv.nom || 'bonbons', un = dv.un || 'bonbon';
    const nombre = (n) => (HR ? HR.fmt(n) : String(Math.floor(n)));
    const bonbons = (n) => `${nombre(n)} ${n >= 2 || n === 0 || !Number.isFinite(n) ? nomDevise : un}`;
    const ico = (k, i) => (ICONS.HANTEE && (ICONS.HANTEE[k] || (ICONS.HANTEE.produits || [])[i])) || ICONS.HANTEE.citrouille;
    const txt = (k, defaut) => (typeof T[k] === 'string' || typeof T[k] === 'function' ? T[k] : defaut);
    const nom = HF.nom || 'La Maison hantée', lieu = HF.Lieu || (HF.lieu ? HF.lieu[0].toUpperCase() + HF.lieu.slice(1) : 'Le Manoir'), cle = HF.cle || HF.id || 'hantee';
    const C = HF.couleurs || {}, couleurs = { fond: C.fond || C.nuit, carte: C.carte || C.nuit2, accent: C.accent || C.citrouille, clair: C.clair || C.doux, vert: C.vert || C.slime }; // les couleurs de H1 (nuit, citrouille…) → les variables de l'écran
    // l'habillage des coups de pouce donné par H1 (FICHE.evenements : nom, annonce, bouton, detail, fin) → les champs de la bannière
    const HE = HF.evenements || null, coupsType = {};
    if (HE) for (const [type, e] of Object.entries(HE)) { if (!e) continue; const x = {}; if (e.nom) x.titre = e.nom; if (e.annonce) x.debut = e.annonce; if (e.bouton) x.bouton = e.bouton; if (e.fin) { x.fin = e.fin; x.perte = (m) => `${e.fin} (−${m})`; } if (typeof e.detail === 'function') x.detail = (ev) => esc(e.detail(ev)); coupsType[type] = x; }
    const fmtDon = (v) => v;
    const F = {
      cle, p: 'ht', racine: '#hantee', ecran: 'manoir', classe: 'ht', R: HR, nom, lieu, porte: false, lot: 'hantee', couleurs,
      fmt: bonbons, fmtPhrase: bonbons, prix: (n) => `${nombre(n)}<i class="bb" aria-hidden="true"></i>`, solde: (n) => `${nombre(n)}<small class="bb-mot">${nomDevise}</small>`,
      ico: { devise: ICONS.HANTEE.bonbon, palier: ICONS.HANTEE.palier, bilan: ICONS.HANTEE.citrouille, produit: (p, i) => ico(p.id, i), coup: (type, g) => ((HE ? ICONS.HANTEE.H1[type] : ICONS.HANTEE[type]) || ICONS.HANTEE[g] || ICONS.HANTEE.citrouille) },
      decos: (l) => { if (typeof SCENE !== 'undefined' && SCENE.decosHantee) SCENE.decosHantee(l); },
      rangFinal: (rec) => { const x = rec[cle] || (rec.evenements && rec.evenements[cle]); return typeof x === 'number' ? x : x && x.rang ? x.rang : null; }, // classement v5 : recompenses().evenements.hantee = { rang, podium }
      genres: Object.assign({ descente: 'taper', grosclient: 'livrer', soiree: 'mult', scooter: 'attraper' }, HF.genres || {}), actions: Object.assign({ taper: 'taper', livrer: 'livrer', attraper: 'attraper' }, HF.actions || {}),
      coupsType: HE ? coupsType : HF.coups || null, // { [type]: { titre, debut, fin, bouton, detail… } } : l'habillage de H1
      coups: {
        taper: { cls: 'descente', titre: 'Toc, toc, toc !', bouton: 'Sers !', detail: (ev, f) => `Des bonbons ou un sort ! ${ev.n} touches pour servir les petits monstres · prime <b>${f(ev.prime)}</b> · sinon ils filent avec ${f(ev.enjeu || 0)}`, reussite: (m) => `Tous les petits monstres sont servis, ils repartent ravis : +${m}`, debut: 'Toc toc ! Des bonbons ou un sort ? Sers vite les petits monstres !', perte: (m) => `Les petits monstres filent avec ${m}…` },
        livrer: { cls: 'grosclient', titre: 'Le bal commande', bouton: 'Livrer !', badge: 'La commande du bal attend', attend: 'le bal attend', reussite: (m) => `Commande livrée au bal des vampires : +${m}`, debut: 'Le bal des vampires passe une grosse commande !', fin: 'Le bal est reparti dans la nuit sans sa commande.' },
        mult: { cls: 'soiree', titre: 'Pleine lune', debut: 'Pleine lune : tout se vend ×2 !', fin: 'La lune se cache derrière les nuages.' },
        attraper: { cls: 'scooter', titre: 'Chauve-souris !', bouton: 'Attraper', detail: (ev, f) => `Attrape-la avant qu’elle s’envole : <b>${f(ev.prime)}</b>`, reussite: (m) => `La chauve-souris lâche ${m}`, debut: 'Une chauve-souris passe avec un sac de bonbons : attrape-la !', fin: 'La chauve-souris s’est envolée.' },
      },
      stats: HE ? [['Ventes', 'ventes'], ['Chauves-souris chassées', 'descentes'], ['Cortèges servis', 'grosClients'], ['Sacs attrapés', 'scooters']] : [['Ventes', 'ventes'], ['Petits monstres servis', ['servis', 'monstres', 'sorts', 'descentes']], ['Commandes du bal', ['bals', 'commandes', 'grosClients']], ['Chauves-souris', ['chauvesSouris', 'chauves', 'scooters']]],
      scene: (cv, X) => (typeof BOUTIQUE_HANTEE !== 'undefined' && BOUTIQUE_HANTEE.actif(cv) ? BOUTIQUE_HANTEE.scene(cv, Object.assign({ st: st0 }, X)) : sceneManoir(cv, X)), // la vraie boutique, hantée (src/boutiquehantee.js) ; ?boutique=0 : le Manoir d'avant
      sons: 'hantee', // le jeu de sons de l'écran (src/sons.js, JEUX.hantee : fournil/sons/hantee/)
      activites: typeof HANTEE_ACTIVITES !== 'undefined' ? HANTEE_ACTIVITES : null, // les choses à FAIRE du Manoir (src/hanteeactivites.js) : le ×6 qui s'endort, les clients-monstres, les fournées parfaites, les apparitions, la commande de la nuit
      prechargerAnnonce: true,
      // l'habillage de l'écran : le style du Fournil (en-tête crème, scène pleine largeur, tiroir à poignée, cartes blanches) en orange citrouille
      // et violet (src/style.css, #hantee et classes .mh-*) ; ici, ses touches d'Halloween (une toile dans l'en-tête, deux chauves-souris près de
      // la poignée du tiroir) et les places, cachées, de ses activités : la jauge « Le boss s'endort… » sous le ×6 (#ht-eveil), la série
      // d'apparitions sur la scène (#ht-serie), la commande de la nuit en tête du tiroir (#ht-commande), la carte du bestiaire juste dessous
      // (#ht-bestiaire). F.gabarits donne leur HTML ;
      // src/hanteeactivites.js (F.activites) les remplit
      habiller: (el) => {
        if (el.querySelector('.mh-deco')) return;
        el.querySelector('.at-haut').insertAdjacentHTML('afterbegin', '<span class="mh-deco" aria-hidden="true"><i class="mh-toile"></i></span>');
        const tiroir = el.querySelector('.pq-scene + *'); if (tiroir) tiroir.insertAdjacentHTML('afterbegin', '<span class="mh-vol" aria-hidden="true"><i class="mh-cs a"></i><i class="mh-cs b"></i></span>'); // le haut du tiroir, à gauche de la poignée
        const solde = el.querySelector('.pq-solde'); if (solde) solde.insertAdjacentHTML('beforeend', `<div id="ht-eveil" class="mh-eveil" role="meter" aria-label="Le boss s’endort" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" hidden>${gabarits.eveil(1)}</div>`);
        const sc = el.querySelector('.pq-scene'); if (sc) sc.insertAdjacentHTML('beforeend', `<div id="ht-serie" class="mh-serie" aria-live="polite" hidden>${gabarits.serie(0)}</div>`);
        const ca = el.querySelector('#ht-cartes'); if (ca) ca.insertAdjacentHTML('beforebegin', '<div id="ht-commande" class="mh-commande-place" hidden></div><div id="ht-bestiaire" class="mh-bestiaire-place" hidden></div>');
      },
      gabarits,
      bilanPlus: (qq) => (st0() && (st0().chatNoir || (!G.donnerChatNoir && qq.total > 0)) ? ['le chat noir de la boutique, au choix dans la garde-robe'] : []).concat(qq.chauvesouris ? ['Myrtille la chauve-souris, gagnée au bestiaire : un compagnon de la boutique, à vie'] : []),
      // un palier qui donne le chat noir (p.chat === 'noir' : GAME.donnerChatNoir, src/game.js)
      apresPalier: (s, p, dons) => { if (p.chat === 'noir' && typeof G.donnerChatNoir === 'function') { G.donnerChatNoir(s); dons.push('le chat noir : le chat de la boutique peut porter une robe noire aux yeux jaunes, au choix, à vie'); } },
      synchro: (s, qq) => { if (typeof G.donnerChatNoir === 'function' && HR.PALIERS.some((p) => p.chat === 'noir' && qq.paliers.includes(p.n))) G.donnerChatNoir(s); },
      t: {
        lieu, premier: txt('premier', `Touche les ${HR && HR.PRODUITS[0] ? HR.PRODUITS[0].nom.toLowerCase() : 'bonbons acidulés'} pour vendre ta première friandise !`), ferme: txt('ferme', `${nom} ferme ses portes. Bouh !`), reste: 'Ferme dans',
        absence: typeof T.absence === 'function' ? T.absence : (duree, m) => `Pendant ton absence (${duree}) : +${m}, au ralenti sans toi.`,
        // (le ×6 de présence en court, sans « avec toi » : la ligne tient à côté de « Ferme dans » ; la jauge juste dessous le dit, « Réveillé :
        // ×6 avec toi », « Le boss s'endort… », et il retombe à ×1 sans toucher)
        taux: (m, pres) => `<b>+${m}</b>/s · <b class="mh-pres">×${pres}</b>`, tauxVide: (pres) => `Touche une friandise · <b class="mh-pres">×${pres}</b>`,
        nouveau: (n) => `${n} : nouvelle friandise au manoir !`, embauche: (n) => `${n} rejoint l’équipe du manoir !`,
        decoDon: Object.assign({}, HF.decos || {}, { citrouilles: 'des citrouilles-lanternes dans la boutique', toiles: 'des toiles d’araignée (gentilles) aux coins de la boutique', chaudron: 'un chaudron qui bouillonne près du four', fantome: 'un petit fantôme qui flotte dans la boutique', chauvesouris: 'des chauves-souris en papier au plafond', lanternes: 'des lanternes sur le comptoir' }, T.decoDon || {}), decoDefaut: (k) => `${k} pour la boutique`,
        vetementNom: (v) => v, tenueComplete: ' : la tenue d’Halloween est complète !',
        palierSous: (m) => `${m} gagnés au manoir. Pour la boulangerie :`, palierFinal: txt('palier12', txt('palierFinal', 'La reine de la nuit, c’est toi. Tout ça reste à vie, même après la fermeture du manoir.')), palierOk: 'Trop chouette',
        amTitre: typeof T.ameliorations === 'string' ? `Les ${T.ameliorations.toLowerCase()}` : txt('amTitre', 'Les sortilèges'), amSous: txt('amSous', 'Des sorts qui multiplient les ventes du manoir, jusqu’à la fin de l’événement.'),
        apresBoss: txt('apresBoss', 'Après le maître du Manoir'), apresBossSous: txt('apresBossSous', 'Huit paliers bonus pour ceux qui ont déjà tout : des étoiles par poignées, des boosts ×5 et ×10, des heures de gains pour la boulangerie, et au 20e le chapeau phosphorescent.'),
        amBonus: txt('amBonus', 'Le Marché des sorcières (les niveaux à moitié prix), un ×3 pour chaque nouvelle recette, et des sorts de confort qui rendent la nuit plus douce. Chacun paie la boulangerie (des heures de gains, des étoiles).'), amBientot: (n, k) => `${n} sortilège${n > 1 ? 's' : ''} de plus à partir du palier ${k}.`,
        palierBonus: txt('palierBonus', 'Et ce n’est pas fini : huit paliers bonus (jusqu’à 8 étoiles d’un coup, des boosts ×10, des heures de gains), deux nouvelles recettes (aux paliers 13 et 16) et sept sortilèges qui paient la boulangerie t’attendent au Manoir.'), combineMot: 'sortilège',
        recetteApres: (n) => `Après le palier ${n}`,
        revue: (quoi) => `Tu avais déjà ${quoi || 'avancé'} au Manoir : voici, une fois, la différence avec les nouvelles récompenses. Les prochains paliers et les sortilèges d’après le maître donnent déjà les nouvelles.`, palierBonusFinal: txt('palierBonusFinal', 'Une légende qui brille dans le noir : le chapeau phosphorescent est dans ta garde-robe, à vie.'),
        paliersSous: (m, nb, n) => `${m} gagnés · ${nb}/${n}. Les mêmes seuils pour tout le monde ; chaque palier donne quelque chose pour la boulangerie, à vie.`,
        paliersNote: txt('paliersNote', 'Les boosts se lancent quand tu veux dans la boutique (la pastille sous les objectifs). La tenue d’Halloween se porte depuis la garde-robe du boulanger.'),
        bilanTitre: `${lieu} a fermé`, bilanH2: txt('bilanTitre', 'Bilan de la nuit'), bilanSous: txt('bilanSous', `${nomDevise} gagnés en une semaine`), bilanDecos: (n) => `${n} déco${n > 1 ? 's' : ''} d’Halloween dans la boutique`, bilanTenue: 'de la tenue d’Halloween', bilanOr: 'la tenue d’Halloween en or',
        bilanVide: txt('bilan', 'Le manoir a fermé ses volets. À l’année prochaine !'),
        annonce: (f) => `<div class="pq-sheet ht ht-annonce"><div class="ht-annonce-scene" aria-hidden="true"><i class="ht-lune"></i><span class="ht-pic">${ICONS.HANTEE.manoir}</span><i class="ht-cs a"></i><i class="ht-cs b"></i></div>
          <h2>${esc(txt('annonceTitre', `${nom} ouvre ses portes`))}</h2>
          <p class="sous">${esc(txt('annonce', `Jusqu’au lundi 2 novembre à 20 h : une boutique à part, « ${lieu} », où tout le monde part de zéro. Ses ${nomDevise} rapportent des récompenses pour ta boulangerie : étoiles, boosts, décos d’Halloween, une tenue de sorcière à vie, et le chat noir.`))}</p>
          <p class="encadre">${esc(txt('annonceEncadre', 'Un peu effrayant, surtout mignon : pour tous les âges. Fantômes, momie et citrouilles t’attendent.'))}</p>
          <button type="button" class="btn large ht-btn" data-a="pq-entrer" style="margin-top:12px"><b>${esc(txt('ouvrir', 'Entrer dans le manoir'))}</b></button>
          <button type="button" class="btn large clair" data-a="pq-tard" style="margin-top:8px"><b>Plus tard</b></button></div>`,
      },
    };
    if (HE) { F.coups.taper = Object.assign({}, F.coups.taper, { reussite: (m) => `Bien joué, tout est sauf : +${m}` }); F.coups.livrer = Object.assign({}, F.coups.livrer, { badge: 'On attend ta commande', attend: 'prêt à servir', reussite: (m) => `Commande servie : +${m}` }); F.coups.attraper = Object.assign({}, F.coups.attraper, { reussite: (m) => `Attrapé : +${m}` }); }
    return F;
  }

  const quartier = fabriquer(QR ? ficheQuartier() : { R: null }), hantee = fabriquer(HR ? ficheHantee() : { R: null });
  const liste = [quartier, hantee].filter((e) => e.R); // sans ses règles (un fichier absent), un événement n'existe pas
  // les annonces, dans l'ordre : le bilan d'un événement fini passe d'abord ; une seule à la fois ; et un temps de calme après un écran fermé
  function annoncer(force) {
    if (!force && performance.now() < calmeJusqua) return false;
    if (liste.some((e) => e.ouvert)) return false;
    for (const e of liste) { if (e.annoncer()) return true; if (e.bilanEnAttente()) return false; }
    return false;
  }
  return { quartier, hantee, liste, annoncer, get ouvert() { return liste.find((e) => e.ouvert) || null; } };
})();
const EVENEMENT = EVENEMENTS.quartier; // l'API d'avant (Le Quartier), inchangée
