/* LE FOURNIL — les activités de la Maison hantée à l'écran (lot 6, le Manoir « qui choque » : on ne laisse plus le téléphone tourner seul).
   Ce module relie trois choses, sans rien décider lui-même (les règles décident, la scène montre) :
   · les règles, pures (src/hantee.js) : toucher / presence (le ×6 qui s'endort), q.manoir.file et servir (les clients-monstres),
     fenetreParfait / parfait (les fournées parfaites), q.manoir.apps et attraper(q, id) (les apparitions), commandeManoir / livrerCommande
     (la commande de la nuit) ; FICHE.manoir.textes, leurs mots ;
   · la scène de la boutique hantée (src/boutiquehantee.js, BOUTIQUE_HANTEE) : entrer (un client des règles entre et attend), servir, fache,
     apparition / retirer / attraper, acteurs / apparitions (les pixels de l'écran), surToucher, ambiance, fete ;
   · l'écran de l'événement (src/evenement.js, la fiche de la Maison hantée : F.activites) : il crée le contrôleur à son init et l'appelle
     à l'entrée (ouvrir), à la sortie et au bilan (fermer), à chaque pas des règles (pas : out.manoir), à chaque image (image), au toucher
     d'une carte (carte : servir le client choisi, tenter la fournée parfaite) et en dessinant les barres de cuisson (barre).
   Le bestiaire (src/hantee.js, BESTIAIRE) : sa carte en tête du tiroir (#ht-bestiaire : les neuf monstres, sombres tant qu'aucun n'est
   servi, colorés à dix) ouvre sa feuille (les neuf, « 3/10 », les récompenses à venir) ; chaque client servi qui le fait avancer, un petit
   mot sur la scène (« Zombie 4/10 ») ; chaque sorte complétée, une feuille de fête (et au 5e le décor, au 9e la chauve-souris) ; les étoiles
   gagnées sont versées dans la boulangerie tout de suite (verserBestiaire : une fois). Les gabarits : F.gabarits (src/evenement.js).
   Depuis le 27 octobre, l'argent et l'or de chaque sorte (BESTIAIRE.argent, .or) : chaque miniature porte sa médaille, le petit mot dit la
   marche suivante (« Zombie 23/30 »), chaque médaille a sa fête (plusieurs d'un coup, une vieille sauvegarde : une seule fête), et les neuf
   d'un métal, leur étagère. Une sauvegarde déjà au-delà d'un seuil est payée à l'entrée (bestiaireDus).
   Les liens : un id des règles ↔ un id de la scène (clients : 'c12' ; apparitions : un nombre), tenus ici et remis d'aplomb à chaque pas
   (réconciliés sur l'état des règles : une file vidée par une absence, une apparition perdue, une sauvegarde rechargée). Sans la scène de la
   boutique hantée (?boutique=0, le Manoir d'avant ; ou pas de WebGL), le repli est en DOM : la file en bas de la scène (un monstre, sa
   bulle) et les apparitions qui traversent en images. Rien n'est sauvé ici, sauf le record de série (q.manoir.record). */
const HANTEE_ACTIVITES = (() => {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = () => (typeof BOUTIQUE_HANTEE !== 'undefined' && BOUTIQUE_HANTEE.ouverte ? BOUTIQUE_HANTEE : null); // la scène de la boutique hantée, si c'est elle qui est à l'écran
  const S = () => (typeof SONS !== 'undefined' && SONS.jeuSon ? SONS : null);
  const icoHt = (k) => (typeof ICONS !== 'undefined' && ICONS.HANTEE && ICONS.HANTEE[k]) || '';
  // le repli en DOM : l'image d'un monstre (les icônes du Manoir) et celle d'une apparition
  const ICO_SORTE = { fantome: 'cookies', citrouille: 'citrouille', vampire: 'livrer', sorciere: 'taper', momie: 'cookies', squelette: 'livrer', 'squelette-sorcier': 'taper', zombie: 'livrer', loup: 'attraper' };
  const ICO_APP = { fantome: 'cookies', citrouille: 'citrouille', 'chauve-souris': 'attraper' };
  const presTxt = (m) => { const r = Math.round(m * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ','); }; // ×6, ×3,5, ×1

  function creer(X) { // X : { el, Q, F, d, q(), now(), scene(), carte(i) → { el } (la carte du produit i ; -1 : la recette du jour), fmt, prix, hud(), save() }
    const { el, Q, F, d } = X, M0 = (Q.FICHE && Q.FICHE.manoir) || {}, T = M0.textes || {}, NOMS = M0.sortes || {};
    const G = typeof GAME !== 'undefined' ? GAME : null, chrono = (s) => (G && G.fmtChrono ? G.fmtChrono(s) : `${Math.ceil(s)} s`);
    const PATIENCE = ((Q.CLIENTS && Q.CLIENTS.patience) || 40) * 1000;
    let ouvert = false, recus = {}, mode = '', scene3 = null, astuce = false, voulu = new Set(), flash = { i: null, jusqua: 0 }, couche = null, fileDom = null, choisi = null, tMaj = 0, lastEveil = '', lastAmb = -1, lastCmd = '', lastSerie = '', dernierEveil = 1;
    const clients = new Map(); // id des règles → { id, sid (l'id de la scène, 'c12' ; null : pas encore entré), sorte, bulle, monstre (repli), cle }
    const apps = new Map(); // id des règles → { id, sid (scène) ou img (repli), type, debut, fin, sens, y0 }
    const eveilEl = () => el.querySelector('#ht-eveil'), serieEl = () => el.querySelector('#ht-serie'), cmdEl = () => el.querySelector('#ht-commande'), bestEl = () => el.querySelector('#ht-bestiaire'), sceneEl = () => el.querySelector('.pq-scene');
    let lastBest = '', fetes = [], btEl = null, btT = 0; // le bestiaire : la carte du tiroir (sa clé), les feuilles de fête en attente, le petit mot sur la scène
    const qq = () => X.q(), maint = () => X.now();
    const manoir = () => { const q = qq(); return q.manoir || (Q.reparerManoir ? Q.reparerManoir(q, maint()) : null); };

    // ─── chaque toucher utile sur l'écran (la scène, les cartes, la commande, les coups de pouce, les activités, les achats) réveille le Manoir ───
    el.addEventListener('pointerdown', (e) => {
      if (!ouvert || el.dataset.ecran !== F.ecran || e.target.closest('[data-pq="fermer"], .pq-mini')) return;
      const avant = Q.eveil(qq(), maint()); Q.toucher(qq(), maint()); if (avant < 1) { majEveil(true); X.hud(); } // (réveillé : la jauge, la lumière et le ×6 tout de suite)
    }, true);
    // la commande de la nuit : son bouton (Livrer quand tout est prêt) ; la carte du bestiaire : sa feuille
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a="mh-commande"]'); if (!b || !ouvert) return; e.stopPropagation(); livrer(b); });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a="mh-bestiaire"]'); if (!b || !ouvert) return; e.stopPropagation(); d.audio(); d.son.tap(); feuilleBestiaire(); });

    // ─── ouvrir, fermer ───
    function ouvrir() {
      ouvert = true; choisi = null; lastEveil = ''; lastCmd = ''; lastSerie = ''; lastAmb = -1; tMaj = 0; lastBest = '';
      const sc = sceneEl(); if (sc && !couche) {
        couche = document.createElement('div'); couche.className = 'mh-couche'; sc.appendChild(couche);
        const z = document.createElement('div'); z.className = 'mh-dodo'; z.hidden = true; z.setAttribute('aria-hidden', 'true'); z.textContent = T.reveil || 'Zzz… touche le Manoir pour le réveiller'; couche.appendChild(z); // (le boss dort : le mot sur la scène, et le voile)
      }
      if (Q.reparerManoir) Q.reparerManoir(qq(), maint());
      if (Q.bestiaireDus) { const dus = Q.bestiaireDus(qq()); if (dus.length) { verserBestiaire(); feter(dus); } } // (une sauvegarde déjà au-delà d'un seuil : l'argent ou l'or, payés ici, une fois)
      majTout();
    }
    function fermer() {
      ouvert = false; vider(); choisi = null; majChoix();
      if (couche) { couche.remove(); couche = null; fileDom = null; }
      for (const e of [eveilEl(), serieEl(), cmdEl(), bestEl()]) if (e) { e.hidden = true; if (e === cmdEl() || e === bestEl()) e.innerHTML = ''; }
      if (btEl) { btEl.remove(); btEl = null; }
      lastCmd = ''; lastBest = ''; mode = ''; scene3 = null;
      const ca = sceneEl() && sceneEl().querySelector('.pq-act'); if (ca) for (const b of ca.children) b.classList.remove('pq-traverse');
    }
    function vider() { // les liens tombent (la scène est détruite, ou on change de mode) : rien ne reste à l'écran
      for (const o of clients.values()) { if (o.bulle) o.bulle.remove(); if (o.monstre) o.monstre.remove(); }
      for (const a of apps.values()) { if (a.img) a.img.remove(); if (a.halo) a.halo.remove(); }
      clients.clear(); apps.clear();
    }

    // ─── le pas : ce que les règles ont changé (out.manoir), puis la réconciliation des liens ───
    function pas(out) {
      if (!ouvert || el.dataset.ecran !== F.ecran) return;
      const M = manoir(); if (!M) return;
      const s3 = B() ? X.scene() : null, m = s3 ? 'scene' : 'dom'; // une scène neuve (un contexte perdu puis rendu) : les liens repartent de zéro
      if (m !== mode || s3 !== scene3) { vider(); mode = m; scene3 = s3; if (s3) B().surToucher(surScene); if (m === 'dom' && couche && !fileDom) { fileDom = document.createElement('div'); fileDom.className = 'mh-file'; couche.appendChild(fileDom); } }
      if (out) { // (les clients partis et les apparitions perdues : la réconciliation plus bas s'en charge)
        for (const a of out.apparitions || []) if (a.type === 'fantome' && S()) S().jeuSon('fantome', { vol: 0.22 });
        if (out.commande) { d.toast(`${T.commandeTitre || 'La commande de la nuit'} : ${T.commande ? T.commande(out.commande) : ''}`); if (S()) S().jeuSon('cloche', { vol: 0.4 }); d.buzz([10, 30, 10]); lastCmd = ''; }
        if (out.ratee) { d.toast(T.commandeRatee || 'La commande est partie.'); d.son.non(); lastCmd = ''; }
      }
      // les clients : chacun de la file a son monstre à l'écran ; un lien sans client (servi, parti, oublié) s'en va
      const q = qq();
      for (const c of M.file) if (!clients.has(c.id)) clients.set(c.id, { id: c.id, sid: null, sorte: c.sorte, bulle: null, monstre: null, cle: '' });
      for (const o of clients.values()) {
        const c = M.file.find((x) => x.id === o.id);
        if (!c) { partir(o, false); continue; }
        if (mode === 'scene' && !o.sid) o.sid = B().entrer(c.sorte); // (pas encore de plan : on réessaie au pas suivant)
        if (!o.bulle) creerBulle(o, c);
        majBulle(o, c, q);
      }
      if (choisi != null && !clients.has(choisi)) { choisi = null; majChoix(); }
      // les apparitions : chacune vivante des règles a son image ; une perdue (ou attrapée ailleurs) s'efface
      for (const a of M.apps) if (a.fin > q.now && !apps.has(a.id)) creerApp(a, q);
      for (const o of apps.values()) if (!M.apps.some((x) => x.id === o.id && x.fin > q.now)) retirerApp(o);
      if (performance.now() - tMaj > 200) { tMaj = performance.now(); majTout(); }
      if (q.bestiaireAVerser > 0) verserBestiaire(); // (une étoile du bestiaire pas encore versée : une sauvegarde rechargée)
      if (fetes.length) montrerFete();
    }
    function majTout() { majEveil(); majSerie(); majCommande(); majBestiaire(); }

    // ─── 1. le ×6 qui s'endort : la jauge sous le ×6 (#ht-eveil), la lumière de la scène ───
    function majEveil(force) {
      const e = eveilEl(); if (!e || !Q.presence) return;
      const p = Q.presence(qq(), maint()), part = p.eveil;
      const txt = part >= 1 ? (T.jauge || 'Réveillé : ×6 avec toi') : part <= 0 ? (T.jaugeDort || 'Le boss dort : touche !') : (T.jaugeBasse || 'Le boss s’endort…'); // (courts : la ligne tient sous le solde, 11 px)
      const cle = `${Math.round(part * 100)}|${txt}`;
      if (force || cle !== lastEveil) {
        lastEveil = cle; e.hidden = false; e.innerHTML = F.gabarits.eveil(part, txt); e.dataset.niveau = part < 0.35 ? 'bas' : part < 1 ? 'moyen' : 'plein';
        e.setAttribute('aria-valuenow', String(Math.round(part * 100))); e.setAttribute('aria-valuetext', `${txt} Tout se vend ×${presTxt(p.mult)}.`);
      }
      if (couche) { const v = (1 - part).toFixed(2); if (couche.style.getPropertyValue('--mh-sommeil') !== v) couche.style.setProperty('--mh-sommeil', v); const z = couche.querySelector('.mh-dodo'); if (z && z.hidden !== part > 0) z.hidden = part > 0; } // le voile de la scène (en haute comme en éco)
      if (B() && (Math.abs(part - lastAmb) > 0.01 || (part !== lastAmb && (part === 0 || part === 1)))) { lastAmb = part; B().ambiance({ actif: part }); } // (jusqu'au bout : 0 et 1 exactement)
      if (part >= 1 && dernierEveil <= 0 && S()) S().jeuSon('chat', { vol: 0.3 }); // réveillé d'un coup : le chat noir miaule
      dernierEveil = part;
    }

    // ─── 2. les clients-monstres : une bulle au-dessus de la tête (ce qu'il commande, sa patience) ───
    function nomSorte(s) { return NOMS[s] || 'Un monstre'; }
    function creerBulle(o, c) {
      if (!couche) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mh-bulle'; b.dataset.client = String(o.id);
      b.setAttribute('aria-label', `${nomSorte(c.sorte)} attend sa commande`);
      b.addEventListener('pointerdown', (e) => e.stopPropagation()); // (pas un toucher « dans le vide » de la scène)
      b.addEventListener('click', (e) => { e.stopPropagation(); d.audio(); const a = appSous(e.clientX, e.clientY); if (a != null) { attraper(a); return; } const ic = e.target.closest('[data-p]'); toucherBulle(o.id, ic ? +ic.dataset.p : null); }); // (une apparition qui passe devant la bulle : elle d'abord)
      o.bulle = b;
      if (mode === 'scene') b.hidden = true; // (posée sur la tête du monstre à la prochaine image, s'il est dans la fenêtre)
      if (mode === 'dom') { // le repli : le monstre sous sa bulle, dans la file en bas de la scène
        const w = document.createElement('div'); w.className = 'mh-file-place';
        const m = document.createElement('button'); m.type = 'button'; m.className = 'mh-monstre'; m.dataset.sorte = c.sorte; m.innerHTML = icoHt(ICO_SORTE[c.sorte] || 'livrer'); m.setAttribute('aria-label', nomSorte(c.sorte));
        m.addEventListener('pointerdown', (e) => e.stopPropagation()); m.addEventListener('click', (e) => { e.stopPropagation(); d.audio(); choisir(o.id); });
        w.appendChild(b); w.appendChild(m); o.monstre = w; (fileDom || couche).appendChild(w);
      } else couche.appendChild(b);
    }
    function majBulle(o, c, q) {
      if (!o.bulle) return;
      const cle = c.commande.map((l) => `${l.i}:${l.n}:${l.servi ? 1 : 0}`).join(',') + (choisi === o.id ? '|c' : '');
      if (cle !== o.cle) {
        o.cle = cle;
        o.bulle.innerHTML = `<span class="mh-bulle-lignes">${c.commande.map((l) => `<i class="${l.servi ? 'servi' : ''}" data-p="${l.i}">${X.ico(l.i)}${l.n > 1 ? `<b>×${l.n}</b>` : ''}</i>`).join('')}</span><span class="mh-bulle-temps"><b></b></span>`;
        o.bulle.classList.toggle('choisi', choisi === o.id);
      }
      const reste = Math.max(0, 1 - (q.now - c.arrive) / PATIENCE), jauge = o.bulle.lastElementChild.firstElementChild;
      jauge.style.width = (reste * 100).toFixed(1) + '%'; o.bulle.classList.toggle('presse', reste < 0.3);
      o.bulle.dataset.reste = String(Math.ceil(reste * PATIENCE / 1000));
    }
    function choisir(id) { // toucher le client : il est choisi (sa bulle s'allume, les cartes de sa commande aussi) ; le retoucher : plus personne
      choisi = choisi === id ? null : id; majChoix(); d.son.tap(); d.buzz(6);
      for (const o of clients.values()) if (o.bulle) { o.cle = ''; }
      if (choisi != null && !astuce) { astuce = true; d.toast('Touche la carte de ce qu’il veut, ou sa bulle, pour le servir.'); }
    }
    function majChoix() { // les cartes voulues par le client choisi (marquées par barre, à la prochaine image)
      const M = manoir(), c = choisi != null && M ? M.file.find((x) => x.id === choisi) : null; voulu = new Set(c ? c.commande.filter((l) => !l.servi).map((l) => l.i) : []);
      for (const o of clients.values()) if (o.bulle) o.bulle.classList.toggle('choisi', o.id === choisi);
    }
    function toucherBulle(id, i) { // toucher la bulle sert : la friandise touchée, sinon (le vide, ou une déjà servie) la première pas encore servie
      const M = manoir(), c = M && M.file.find((x) => x.id === id); if (!c) return;
      const l = (i != null && c.commande.find((x) => x.i === i && !x.servi)) || c.commande.find((x) => !x.servi);
      if (l) servirLigne(id, l.i);
    }
    function servirLigne(id, i) {
      const q = qq(), o = clients.get(id), r = Q.servir(q, id, i);
      if (!r.ok) { if (r.faux) { d.son.non(); d.buzz(30); flotterSur(o, T.faux || 'Ce n’est pas sa commande !', 'non'); } return r; }
      if (!r.fini) { d.son.tap(); d.buzz(8); flotterSur(o, '✓', 'oui'); if (o) o.cle = ''; majChoix(); return r; }
      const pos = posBulle(o);
      if (o) { if (mode === 'scene' && o.sid && B()) B().servir(o.sid); finirBulle(o, true); clients.delete(id); }
      if (choisi === id) choisi = null; majChoix();
      d.son.pourboire(); d.buzz([10, 20, 10]);
      if (r.prime > 0) voler(pos, `+${X.prix(r.prime)}`); flotter(pos, r.plafond && !(r.prime > 0) ? (T.plafond || 'Merci !') : T.servi ? T.servi(X.fmt(r.prime)) : 'Merci !', 'oui');
      if (r.bestiaire) avancerBestiaire(r.bestiaire);
      X.hud(); X.save(); return r;
    }
    function partir(o, servi) { // il s'en va sans être servi (sa patience est finie, ou la file a été vidée) : il repart fâché
      if (!servi && mode === 'scene' && o.sid && B()) B().fache(o.sid);
      if (!servi && o.bulle && o.bulle.isConnected) flotter(posBulle(o), T.parti || 'Il en a eu assez d’attendre.', 'non');
      finirBulle(o, false); clients.delete(o.id); if (choisi === o.id) { choisi = null; majChoix(); }
    }
    function finirBulle(o, content) {
      const b = o.bulle, w = o.monstre; o.bulle = null; o.monstre = null;
      for (const x of [b, w]) if (x) { x.classList.add(content ? 'mh-sort-content' : 'mh-sort-fache'); x.style.pointerEvents = 'none'; setTimeout(() => x.remove(), 450); }
    }
    function posBulle(o) { // le centre de la bulle (pixels de la page) ; à défaut, le milieu de la scène
      const b = o && o.bulle; if (b && b.isConnected && !b.hidden) { const r = b.getBoundingClientRect(); if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      const s = sceneEl(); if (!s) return { x: innerWidth / 2, y: innerHeight / 3 }; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // ─── 3. les fournées parfaites : la fenêtre dessinée sur la barre de cuisson ; un toucher dedans : ×2 ───
    function partFournee(q, i) {
      if (i === -1) { const f = q.recettes && q.recettes.four; return f ? (maint() - f.debut) / Math.max(1, f.fin - f.debut) : 0; }
      const s = q.postes[i]; return s && s.actif ? s.prog / Math.max(1e-6, Q.temps(q, i)) : 0;
    }
    // chaque image, pour chaque carte (src/evenement.js, renderCartes et renderRecette) : la fenêtre « parfait » sur sa barre, et ses marques
    // (data-mh, que le className des cartes ne touche pas) : « voulu » (le client choisi la veut), « brille » (la fournée est dans sa fenêtre), « ok » (réussie)
    function barre(c, i) {
      if (!c || !c.el) return;
      const bar = c.el.querySelector('.barre'); let f = bar && bar.querySelector('.mh-fenetre');
      const q = ouvert ? qq() : null, w = q && bar && Q.fenetreParfait ? Q.fenetreParfait(q, i) : null, marques = [];
      if (voulu.has(i)) marques.push('voulu');
      if (!w) { if (f) f.hidden = true; }
      else {
        if (!f) { f = document.createElement('b'); f.className = 'mh-fenetre'; f.setAttribute('aria-hidden', 'true'); bar.insertBefore(f, bar.children[1] || null); }
        f.hidden = false; f.style.left = (w.debut * 100).toFixed(1) + '%'; f.style.width = ((w.fin - w.debut) * 100).toFixed(1) + '%';
        f.classList.toggle('fait', w.parfait); f.classList.toggle('rate', w.essai && !w.parfait);
        const p = partFournee(q, i); if (!w.essai && p >= w.debut && p <= w.fin) marques.push('brille');
      }
      if (flash.i === i && performance.now() < flash.jusqua) marques.push('ok');
      const m = marques.join(' '); if ((c.el.dataset.mh || '') !== m) { if (m) c.el.dataset.mh = m; else delete c.el.dataset.mh; }
    }
    function tenterParfait(i) {
      const q = qq(), w = Q.fenetreParfait ? Q.fenetreParfait(q, i) : null; if (!w || w.essai) return false;
      const r = Q.parfait(q, i, maint()); if (!r.ok) return false;
      const k = X.carte(i), pos = k && k.el ? (() => { const b = (k.el.querySelector('.barre') || k.el).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top }; })() : posBulle(null);
      if (r.parfait) {
        d.son.vente(r.prime || 1); d.son.achat(); d.buzz([10, 30, 10]); flotter(pos, 'Parfait ! ×2', 'parfait');
        if (r.prime > 0) { voler({ x: pos.x, y: pos.y + 10 }, `+${X.prix(r.prime)}`); const s3 = X.scene(); if (s3 && s3.vente) s3.vente(r.prime); }
        flash = { i, jusqua: performance.now() + 900 };
        X.hud(); X.save();
      } else { d.son.non(); flotter(pos, r.tot ? 'Trop tôt !' : 'Trop tard !', 'non'); }
      return true;
    }
    // le toucher d'une carte (src/evenement.js, avant ses propres gestes) : servir le client choisi, ou tenter la fournée parfaite ; true : c'est fait
    function carte(i, e) {
      if (!ouvert || (e && e.target.closest('button[data-a]'))) return false;
      if (i >= 0 && choisi != null) {
        const M = manoir(), c = M && M.file.find((x) => x.id === choisi);
        if (c) { if (c.commande.some((l) => l.i === i && !l.servi)) servirLigne(c.id, i); else { d.son.non(); d.buzz(30); flotterSur(clients.get(c.id), T.faux || 'Ce n’est pas sa commande !', 'non'); choisi = null; majChoix(); } return true; }
      }
      return tenterParfait(i);
    }

    // ─── 4. les apparitions : la scène les fait traverser (ou le repli en images) ; un toucher dessus les attrape ───
    function creerApp(a, q) {
      const o = { id: a.id, type: a.type, debut: a.debut, fin: a.fin, sid: null, img: null, sens: a.id % 2 ? 1 : -1, y0: 0.25 + ((a.id * 37) % 40) / 100 };
      if (mode === 'scene') o.sid = B().apparition(a.type, Math.max(1, (a.fin - q.now) / 1000));
      if (o.sid == null && couche) { // le repli : une image qui traverse la scène
        const im = document.createElement('button'); im.type = 'button'; im.className = 'mh-app'; im.dataset.type = a.type; im.innerHTML = icoHt(ICO_APP[a.type] || 'cookies'); im.setAttribute('aria-label', (M0.apparitions && M0.apparitions[a.type]) || 'Une apparition');
        im.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); d.audio(); attraper(o.id); });
        couche.appendChild(im); o.img = im; placerApp(o, q.now);
      }
      apps.set(a.id, o);
    }
    function placerApp(o, now) {
      const s = couche, im = o.img; if (!s || !im) return; const W = s.clientWidth, H = s.clientHeight, u = Math.min(1, Math.max(0, (now - o.debut) / Math.max(1, o.fin - o.debut)));
      const x = o.sens > 0 ? -30 + u * (W + 60) : W + 30 - u * (W + 60), y = H * o.y0 + Math.sin(u * 14 + o.id) * 10;
      im.style.transform = `translate(${(x - 28).toFixed(1)}px, ${(y - 28).toFixed(1)}px) rotate(${(Math.sin(u * 9 + o.id) * 10).toFixed(1)}deg)`;
    }
    function retirerApp(o) { if (o.sid != null && B()) B().retirer(o.sid); for (const im of [o.img, o.halo]) if (im) { im.classList.add('mh-sort-fache'); setTimeout(() => im.remove(), 300); } apps.delete(o.id); }
    function attraper(id) {
      const o = apps.get(id); if (!o) return null;
      let pos = null;
      if (o.sid != null && B()) { const p = B().apparitions().find((x) => x.id === o.sid); if (p) pos = { x: p.x, y: p.y }; }
      if (!pos && o.img) { const r = o.img.getBoundingClientRect(); pos = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      const r = Q.attraper(qq(), id);
      if (!r.ok) { retirerApp(o); return r; }
      if (o.sid != null && B()) B().attraper(o.sid); // la petite explosion d'étincelles
      if (o.halo) { const h = o.halo; h.classList.add('mh-attrape'); setTimeout(() => h.remove(), 500); }
      if (o.img) { o.img.classList.add('mh-attrape'); o.img.style.pointerEvents = 'none'; const im = o.img; setTimeout(() => im.remove(), 500); }
      apps.delete(id);
      const M = manoir(); if (M) M.record = Math.max(M.record || 0, r.serie || 0);
      d.son.vente(r.prime || 1); d.buzz(r.mult > 1 ? [10, 30, 10] : 12);
      pos = pos || posBulle(null);
      flotter(pos, r.mult > 1 && T.serie ? T.serie(r.serie) : T.attrape ? T.attrape(X.fmt(r.prime)) : 'Attrapée !', r.mult > 1 ? 'parfait' : 'oui');
      if (r.prime > 0) voler(pos, `+${X.prix(r.prime)}`);
      majSerie(true); X.hud(); X.save(); return r;
    }
    function appSous(x, y) { // l'apparition sous le doigt (les mêmes rayons que la scène : 22 px au moins), ou null
      if (!(x > 0 || y > 0)) return null; let best = null, bd = 1e9;
      const l = mode === 'scene' && B() ? B().apparitions() : [];
      for (const o of apps.values()) {
        let p = null; if (o.sid != null) p = l.find((a) => a.id === o.sid); else if (o.img) { const r = o.img.getBoundingClientRect(); p = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }
        if (!p) continue; const dd = Math.hypot(p.x - x, p.y - y); if (dd <= Math.max(22, p.r || 0) && dd < bd) { bd = dd; best = o.id; }
      }
      return best;
    }
    function surScene(t) { // un toucher sur la scène de la boutique hantée (BOUTIQUE_HANTEE.surToucher) : une apparition, un client, le vide
      if (!ouvert) return; recus[t.genre] = (recus[t.genre] || 0) + 1;
      if (t.genre === 'apparition') { for (const o of apps.values()) if (o.sid === t.id) { attraper(o.id); return; } return; }
      if (t.genre === 'client') { for (const o of clients.values()) if (o.sid === t.id) { choisir(o.id); return; } return; } // (un passant de la boutique, sans commande : rien)
      if (choisi != null) { choisi = null; majChoix(); }
    }
    function majSerie(force) {
      const e = serieEl(), M = manoir(); if (!e || !M) return;
      const n = M.serie || 0, cle = `${n}|${M.record || 0}`; if (!force && cle === lastSerie) return; lastSerie = cle;
      e.hidden = n < 1; e.innerHTML = F.gabarits.serie(n, Math.max(M.record || 0, n)); e.classList.toggle('chaude', n >= 5);
    }

    // ─── 5. la commande de la nuit : sa carte en tête du tiroir (#ht-commande), la jauge, le bouton Livrer ───
    function nomCommande(c) { const s = Q.SORTES || []; return nomSorte(s[(c.id * 7 + c.i) % (s.length || 1)]); }
    function majCommande() {
      const e = cmdEl(); if (!e) return; const q = qq(), c = Q.commandeManoir ? Q.commandeManoir(q) : null;
      if (!c) { if (!e.hidden) { e.hidden = true; e.innerHTML = ''; lastCmd = ''; } return; }
      const p = Q.PRODUITS[c.i], prete = c.fait >= c.n, reste = Math.max(0, c.fin - q.now), prime = Q.primeCommande(q);
      const o = { client: nomCommande(c), lignes: [{ ico: X.ico(c.i), nom: p.nom, n: c.n, fait: c.fait }], prime: X.prix(prime), reste: chrono(reste / 1000), part: 1 - reste / Math.max(1, c.fin - c.debut), prete, bouton: T.livrer || 'Livrer !' };
      const cle = `${c.id}|${c.n}|${prete}`; e.hidden = false;
      if (cle !== lastCmd || !e.firstElementChild) { lastCmd = cle; e.innerHTML = F.gabarits.commande(o); return; }
      // la même commande : seulement ce qui bouge (le bouton reste le même élément : un doigt posé dessus ne le perd pas)
      const li = e.querySelector('.mh-commande-lignes li span'), j = e.querySelector('.mh-commande-temps b'), bt = e.querySelector('[data-a="mh-commande"]');
      if (li) li.textContent = `${c.fait}/${c.n}`; if (j) j.style.width = Math.round(Math.max(0, Math.min(1, 1 - o.part)) * 100) + '%';
      if (bt && !prete) { const sm = bt.querySelector('small'), pb = bt.querySelector('b'); if (sm && sm.textContent !== o.reste) sm.textContent = o.reste; if (pb && pb.innerHTML !== o.prime) pb.innerHTML = o.prime; }
    }
    function livrer(b) {
      const q = qq(), c = Q.commandeManoir(q); if (!c) return;
      const r = Q.livrerCommande(q);
      if (!r.ok) { // pas prête : un mot sur le bouton, tout de suite (le toast, lui, peut attendre son tour derrière un autre)
        const r1 = b.getBoundingClientRect(); d.son.non(); d.buzz(30); flotter({ x: r1.left + r1.width / 2, y: r1.top }, `Encore ${Q.fmt(c.n - c.fait)} à vendre`, 'non');
        d.toast(`${T.commandeTitre || 'La commande de la nuit'} : encore ${Q.fmt(c.n - c.fait)} ${Q.PRODUITS[c.i].pl} à vendre${q.postes[c.i].staff ? '' : ' (touche la carte !)'}`); return;
      }
      const r0 = b.getBoundingClientRect(), pos = { x: r0.left + r0.width / 2, y: r0.top };
      d.son.deblocage(); d.buzz([10, 30, 10]); if (S()) S().jeuSon('cloche', { vol: 0.45 });
      d.toast(T.commandeLivree ? T.commandeLivree(X.fmt(r.prime)) : `Commande livrée : +${X.fmt(r.prime)}`);
      if (r.prime > 0) voler(pos, `+${X.prix(r.prime)}`);
      const s3 = X.scene(); if (s3 && s3.fete) s3.fete();
      lastCmd = ''; majCommande(); X.hud(); X.save();
    }

    // ─── 6. le bestiaire : sa carte en tête du tiroir, sa feuille, le petit mot à chaque servi, la fête d'une sorte complétée ───
    const icoMonstre = (k) => (typeof ICONS !== 'undefined' && ICONS.HANTEE && ICONS.HANTEE.monstres && ICONS.HANTEE.monstres[k]) || icoHt(ICO_SORTE[k] || 'livrer');
    const court = (k) => (M0.courts && M0.courts[k]) || nomSorte(k);
    const etatSorte = (s) => (s.fait ? 'fait' : s.n > 0 ? 'encours' : 'vide'); // sombre (aucun servi), en cours, coloré (complété)
    const partSorte = (x) => (x.prochain == null ? 1 : Math.max(0, Math.min(1, ((x.servis != null ? x.servis : x.n) - (x.depuis || 0)) / (x.prochain - (x.depuis || 0))))); // vers le palier suivant
    const seuilDe = (m) => (m === 'argent' || m === 'or' ? Q.BESTIAIRE[m].par : Q.BESTIAIRE.par);
    function donneesBestiaire() { // l'état des règles, prêt pour les gabarits (src/evenement.js, F.gabarits.bestiaire*)
      const b = Q.bestiaire(qq()), B0 = Q.BESTIAIRE, et = B0.etoiles.reduce((a, x) => a + x, 0), gagnees = B0.etoiles.slice(0, b.faits).reduce((a, x) => a + x, 0);
      return { faits: b.faits, argent: b.argent || 0, or: b.or || 0, total: b.total, deco: b.deco, decoArgent: !!b.decoArgent, decoOr: !!b.decoOr, chauvesouris: b.chauvesouris, par: B0.par, etoiles: et, gagnees, rangDeco: B0.deco, rangCompagnon: B0.compagnon, rangs: B0.etoiles,
        seuils: B0.argent ? { argent: B0.argent.par, or: B0.or.par } : null, etoilesArgent: B0.argent ? B0.argent.etoiles : 0, etoilesOr: B0.or ? B0.or.etoiles : 0,
        sortes: b.sortes.map((x) => ({ sorte: x.sorte, nom: x.nom, court: court(x.sorte), n: x.n, par: x.par, fait: x.fait, etat: etatSorte(x), servis: x.servis, medaille: x.medaille, depuis: x.depuis, prochain: x.prochain, part: partSorte(x), ico: icoMonstre(x.sorte) })),
        ico: icoHt('bestiaire'), icoDeco: icoHt('bestiaire'), icoCompagnon: (typeof ICONS !== 'undefined' && ICONS.compagnon ? ICONS.compagnon('chauve-souris') : ''), textes: T };
    }
    function majBestiaire(force) { // la carte du tiroir : redessinée quand un compte change
      const e = bestEl(); if (!e || !Q.bestiaire || !F.gabarits || !F.gabarits.bestiaire) return;
      const b = Q.bestiaire(qq()), cle = b.sortes.map((x) => `${x.servis != null ? x.servis : x.n}${x.medaille || ''}`).join(',');
      if (!force && cle === lastBest && !e.hidden) return; lastBest = cle;
      e.hidden = false; e.innerHTML = F.gabarits.bestiaire(donneesBestiaire());
    }
    function verserBestiaire() { // les étoiles des sortes complétées, dans la boulangerie (une fois : verserBestiaire remet à zéro) ; le décor posé
      const q = qq(); if (!Q.verserBestiaire || !(q.bestiaireAVerser > 0)) return 0;
      const n = Q.verserBestiaire(q), s = d.st(); if (s && n > 0) { s.etoiles += n; if (G && G.gagnerXp) G.gagnerXp(s, 10); }
      if (F.decos) F.decos(q.decos); X.save(); if (d.apres) d.apres(); return n;
    }
    function avancerBestiaire(be) { // un client servi en entier : le petit mot (« Zombie 4/10 », puis vers l'argent « 23/30 », vers l'or) ; un palier passé : les étoiles, la fête
      const sc = sceneEl(); lastBest = '';
      const faites = be.completes && be.completes.length ? be.completes : be.complete ? [be.complete] : [];
      if (sc && F.gabarits && F.gabarits.bestiaireMot) {
        if (!btEl || !btEl.isConnected) { btEl = document.createElement('div'); btEl.className = 'mh-bt'; btEl.setAttribute('role', 'status'); sc.appendChild(btEl); }
        const ici = faites.filter((x) => x.sorte === be.sorte).pop(); // (le palier que ce servi vient de passer)
        let n, par, med = ici ? ici.palier || 'bronze' : be.medaille || null;
        if (ici) { par = seuilDe(ici.palier); n = par; } else if (be.prochain === null) { par = 0; n = be.n; } else { par = be.prochain || be.par; n = Math.min(be.n, par); }
        const fait = !!ici || par === 0, txt = par === 0 ? `${court(be.sorte)} ${n} · or` : T.bestiaireAvance ? T.bestiaireAvance(court(be.sorte), n, par) : `${court(be.sorte)} ${n}/${par}`;
        const de = par === 0 ? 0 : !ici && be.depuis ? be.depuis : 0;
        btEl.innerHTML = F.gabarits.bestiaireMot({ ico: icoMonstre(be.sorte), texte: txt, part: par === 0 ? 1 : (n - de) / (par - de), fait });
        btEl.classList.toggle('fait', fait); for (const m of ['bronze', 'argent', 'or']) btEl.classList.toggle('m-' + m, fait && med === m);
        btEl.classList.remove('mh-bt-vu'); void btEl.offsetWidth; btEl.classList.add('mh-bt-vu'); btEl.hidden = false;
        clearTimeout(btT); btT = setTimeout(() => { if (btEl) btEl.hidden = true; }, 2200);
      }
      if (faites.length) { verserBestiaire(); feter(faites); }
      majBestiaire(true);
    }
    function feter(faites) { // les paliers passés : une fête chacun ; plusieurs d'argent ou d'or d'un coup (une vieille sauvegarde) : une seule pour eux
      for (const m of ['bronze', 'argent', 'or']) {
        const l = faites.filter((x) => (x.palier || 'bronze') === m); if (!l.length) continue;
        if (m === 'bronze' || l.length === 1) { for (const x of l) fetes.push(x); continue; }
        const der = l[l.length - 1];
        fetes.push({ sorte: der.sorte, palier: m, rang: der.rang, etoiles: l.reduce((a, x) => a + x.etoiles, 0), deco: l.map((x) => x.deco).find(Boolean) || null, compagnon: false, sortes: l.map((x) => x.sorte) });
      }
      montrerFete();
    }
    const libre = () => document.querySelector('#feuille').hidden && !(X.mini && X.mini());
    function montrerFete() { // une sorte complétée : sa feuille de fête, quand la feuille est libre (jamais par-dessus une autre)
      if (!fetes.length || !ouvert || !libre() || !F.gabarits || !F.gabarits.bestiaireFete) return;
      const x = fetes.shift(), b = Q.bestiaire(qq()), G0 = G || {};
      const dons = [`+${x.etoiles} étoile${x.etoiles > 1 ? 's' : ''} pour ta boulangerie${G0.ETOILE_BONUS ? ` (+${Math.round(x.etoiles * G0.ETOILE_BONUS * 100)} % de gains, pour toujours)` : ''}`];
      if (x.palier === 'argent' || x.palier === 'or') { // une médaille d'argent ou d'or (ou plusieurs d'un coup)
        const or = x.palier === 'or', decoNom = or ? T.bestiaireDecoOr || 'l’étagère dorée' : T.bestiaireDecoArgent || 'l’étagère aux bocaux d’argent';
        if (x.deco) dons.push(decoNom);
        const plusieurs = x.sortes && x.sortes.length > 1, titre = plusieurs ? (T.bestiaireMedailles ? T.bestiaireMedailles(x.sortes.length, x.palier) : `${x.sortes.length} monstres en ${x.palier} !`) : T.bestiaireMedaille ? T.bestiaireMedaille(nomSorte(x.sorte), x.palier) : `${nomSorte(x.sorte)} : médaille ${or ? 'd’or' : 'd’argent'} !`;
        d.son.deblocage(); d.buzz([10, 30, 10, 30, 10]); if (d.fete) d.fete(); if (d.confettis) d.confettis(or ? 1 : 0.8);
        const s3 = X.scene(); if (s3 && s3.fete) s3.fete();
        d.openSheet(F.gabarits.bestiaireFete({ palier: x.palier, sorte: x.sorte, sortes: x.sortes || [x.sorte], titre, rang: x.rang, total: b.total, seuil: seuilDe(x.palier), dons, deco: !!x.deco, decoNom: decoNom.charAt(0).toUpperCase() + decoNom.slice(1).split(',')[0], reste: b.total - (or ? b.or : b.argent), ico: icoMonstre(x.sorte) }));
        d.on('[data-a="mh-best-ok"]', () => { d.son.tap(); d.closeSheet(); });
        d.on('[data-a="mh-best-voir"]', () => { d.son.tap(); feuilleBestiaire(); });
        return;
      }
      if (x.deco) dons.push(T.bestiaireDeco || 'l’étagère aux bocaux de monstres, pour ta boutique');
      if (x.compagnon) dons.push(T.bestiaireCompagnon || 'la chauve-souris, un compagnon pour ta boutique');
      d.son.deblocage(); d.buzz([10, 30, 10, 30, 10]); if (d.fete) d.fete(); if (d.confettis) d.confettis(0.8);
      const s3 = X.scene(); if (s3 && s3.fete) s3.fete();
      d.openSheet(F.gabarits.bestiaireFete({ sorte: x.sorte, nom: nomSorte(x.sorte), court: court(x.sorte), titre: T.bestiaireFait ? T.bestiaireFait(nomSorte(x.sorte)) : `${nomSorte(x.sorte)} rejoint le bestiaire !`, rang: x.rang, total: b.total, dons, deco: !!x.deco, compagnon: !!x.compagnon, ico: icoMonstre(x.sorte), icoCompagnon: (typeof ICONS !== 'undefined' && ICONS.compagnon ? ICONS.compagnon('chauve-souris') : ''), reste: b.total - b.faits, rangDeco: Q.BESTIAIRE.deco }));
      d.on('[data-a="mh-best-ok"]', () => { d.son.tap(); d.closeSheet(); });
      d.on('[data-a="mh-best-voir"]', () => { d.son.tap(); feuilleBestiaire(); });
      d.on('[data-a="mh-best-choisir"]', (bt) => { const s = d.st(), r = G && G.choisirCompagnon ? G.choisirCompagnon(s, 'chauve-souris') : { ok: false }; if (r.ok) { X.save(); d.son.achat(); bt.disabled = true; bt.innerHTML = '<b>Elle t’attend dans la boutique ✓</b>'; } else d.son.non(); });
    }
    function feuilleBestiaire() { // la feuille : les neuf monstres (« 3/10 »), les récompenses à venir
      if (!F.gabarits || !F.gabarits.bestiaireFeuille) return;
      d.openSheet(F.gabarits.bestiaireFeuille(donneesBestiaire()));
      d.on('[data-a="mh-best-ok"]', () => { d.son.tap(); d.closeSheet(); });
    }

    // ─── chaque image : les bulles suivent les têtes, les apparitions du repli traversent ; la colonne des activités (en haut à droite de la
    //     scène, src/evenement.js) : les bulles passent à sa gauche ; une apparition qui passe sous un de ses boutons le rend transparent
    //     (.pq-traverse, jusqu'à 0,4 s après : le doigt arrive toujours un peu après) ; un toucher sur ce bouton-là, ou là où elle passe
    //     (sousDoigt), va à l'apparition ; ailleurs, il ouvre le bouton ───
    const tTraverse = new Map(); // bouton de la colonne → l'instant où une apparition était encore dessous
    function sousDoigt(x, y) { // une apparition sous ce point (le doigt arrive un peu après : 16 px de plus) ? le repli l'attrape ici ; la scène, elle, la reçoit du toucher
      if (!ouvert) return false;
      if (mode === 'scene' && B()) return B().vise ? B().vise(x, y) : B().apparitions().some((p) => Math.hypot(p.x - x, p.y - y) <= p.r + 16); // (la même visée que le toucher de la scène)
      for (const o of apps.values()) if (o.img) { const b = o.img.getBoundingClientRect(); if (b.width && x >= b.left - 16 && x <= b.right + 16 && y >= b.top - 16 && y <= b.bottom + 16) { d.audio(); attraper(o.id); return true; } }
      return false;
    }
    function image() {
      if (!ouvert || !couche) return;
      const q = qq(), M = manoir(); if (!M) return;
      const ca = sceneEl() && sceneEl().querySelector('.pq-act'), rc = ca ? ca.getBoundingClientRect() : null, tuiles = ca ? [...ca.children].map((b) => [b, b.getBoundingClientRect()]) : [];
      const dessous = (x, y, rr) => { if (!rc || !(rc.width > 0) || !(x + rr > rc.left && x - rr < rc.right && y + rr > rc.top && y - rr < rc.bottom)) return false;
        for (const [b, r] of tuiles) if (x + rr > r.left && x - rr < r.right && y + rr > r.top && y - rr < r.bottom) tTraverse.set(b, performance.now()); return true; };
      if (mode === 'scene' && B()) {
        const r = couche.getBoundingClientRect(), vus = new Map(), vis = []; for (const a of B().acteurs()) if (a.role === 'client') vus.set(a.id, a);
        for (const o of clients.values()) {
          const b = o.bulle; if (!b) continue; const a = o.sid ? vus.get(o.sid) : null;
          if (!a || a.etat === 'sort' || a.y < r.top - 10 || a.y > r.bottom + 10) { if (!b.hidden) b.hidden = true; continue; }
          if (b.hidden) b.hidden = false;
          vis.push({ b, o, x: a.x - r.left, hy: a.y - r.top, y: a.y - r.top - 6, w: b.offsetWidth, h: b.offsetHeight });
        }
        // la file au comptoir : des têtes proches, des bulles qui se chevaucheraient. De gauche à droite, deux bulles à la même hauteur (à une
        // demi-bulle près) s'écartent l'une de l'autre, puis chacune reste dans la scène ; leur pointe suit la tête (--mh-pointe). La colonne
        // des activités (en haut à droite de la scène, src/evenement.js) : une bulle à sa hauteur passe à sa gauche, jamais dessous
        const col = rc && rc.width ? { g: rc.left - r.left - 6, haut: rc.top - r.top - 6, bas: rc.bottom - r.top + 6 } : null;
        vis.sort((p, v) => p.x - v.x); for (const v of vis) v.cx = col && v.y > col.haut && v.y - v.h < col.bas ? Math.min(v.x, col.g - v.w / 2) : v.x;
        for (let tour = 0; tour < 4; tour++) for (let i = 1; i < vis.length; i++) { const p = vis[i - 1], v = vis[i]; if (Math.abs(p.y - v.y) >= (p.h + v.h) / 2) continue; const min = (p.w + v.w) / 2 + 6, d = v.cx - p.cx; if (d < min) { p.cx -= (min - d) / 2; v.cx += (min - d) / 2; } }
        // puis de droite à gauche : chacune sous sa borne droite (le bord, ou la colonne à sa hauteur), sa voisine de gauche poussée d'autant
        for (let i = vis.length - 1; i >= 0; i--) {
          const v = vis[i], n = vis[i + 1]; v.cx = Math.min(v.cx, (col && v.y > col.haut && v.y - v.h < col.bas ? col.g : r.width - 4) - v.w / 2);
          if (n && Math.abs(v.y - n.y) < (v.h + n.h) / 2) v.cx = Math.min(v.cx, n.cx - (v.w + n.w) / 2 - 6);
        }
        // La pointe part du bas de la bulle (sa base, bornée à ±(largeur/2 − 14) px) et montre la tête de SON monstre : une bulle écartée de
        // sa tête monte d'autant (la moitié de l'écart qui dépasse, 26 px au plus) et sa pointe s'allonge en biais jusqu'à la tête
        // (--mh-queue : sa longueur, --mh-biais : son angle). Borne haute : une bulle ne passe jamais sous l'en-tête du Manoir (le haut de
        // la fenêtre de la scène) : un client qui entre par la porte du fond garde la sienne entière ; tout près du bord, sa pointe se cache.
        for (const v of vis) {
          const y0 = v.y, sous = (y) => !!col && y > col.haut && y - v.h < col.bas; // (à la hauteur de la colonne)
          let base = 0, reste = 0;
          for (let k = 0; k < 2; k++) { // (une bulle écartée monte : à sa nouvelle hauteur, elle peut passer à côté de la colonne, une fois de plus)
            v.cx = Math.max(v.w / 2 + 4, Math.min((sous(v.y) ? col.g : r.width - 4) - v.w / 2, v.cx));
            base = Math.max(-v.w / 2 + 14, Math.min(v.w / 2 - 14, v.x - v.cx)); reste = v.x - v.cx - base;
            v.y = Math.max(v.h + 4, y0 - Math.min(26, Math.abs(reste) * 0.5));
            if (!sous(v.y) || v.cx + v.w / 2 <= col.g + 0.5) break;
          }
          const dy = v.hy - v.y, lg = dy > 3 ? Math.hypot(reste, dy) + 2 : 0, biais = lg ? -Math.atan2(reste, dy) * 180 / Math.PI : 0;
          v.b.style.transform = `translate(${v.cx.toFixed(1)}px, ${v.y.toFixed(1)}px) translate(-50%, -100%)`;
          const pointe = base.toFixed(0) + 'px', queue = lg.toFixed(0) + 'px', angle = biais.toFixed(1) + 'deg';
          if (v.b.style.getPropertyValue('--mh-pointe') !== pointe) v.b.style.setProperty('--mh-pointe', pointe);
          if (v.b.style.getPropertyValue('--mh-queue') !== queue) v.b.style.setProperty('--mh-queue', queue);
          if (v.b.style.getPropertyValue('--mh-biais') !== angle) v.b.style.setProperty('--mh-biais', angle);
          v.o.bout = lg ? { x: r.left + v.cx + base - Math.sin(biais * Math.PI / 180) * lg, y: r.top + v.y + Math.cos(biais * Math.PI / 180) * lg } : null; // (le bout de la pointe, en pixels de la page : pour les tests)
          v.o.haut = r.top + v.y - v.h;
        }
        // le halo de chaque apparition de la scène : une cible qu'on voit, même sombre sur le carrelage de nuit (le toucher, lui, va à la scène)
        const l = apps.size ? B().apparitions() : [];
        for (const o of apps.values()) {
          if (o.sid == null) continue; const p = l.find((x) => x.id === o.sid);
          if (!o.halo) { o.halo = document.createElement('i'); o.halo.className = 'mh-halo'; o.halo.dataset.type = o.type; o.halo.setAttribute('aria-hidden', 'true'); couche.appendChild(o.halo); }
          if (!p) { o.halo.hidden = true; continue; } o.halo.hidden = false;
          o.halo.style.transform = `translate(${(p.x - r.left).toFixed(1)}px, ${(p.y - r.top).toFixed(1)}px) translate(-50%, -50%)`;
          dessous(p.x, p.y, p.r);
        }
      } else for (const o of apps.values()) { placerApp(o, q.now); if (o.img) { const b = o.img.getBoundingClientRect(); if (b.width) dessous(b.left + b.width / 2, b.top + b.height / 2, b.width / 2); } }
      for (const [b] of tuiles) { const sous = performance.now() - (tTraverse.get(b) || -1e9) < 400; if (b.classList.contains('pq-traverse') !== sous) b.classList.toggle('pq-traverse', sous); }
    }

    // ─── ce qui vole et ce qui flotte : le pourboire jusqu'au solde, un mot au-dessus de la scène ───
    function voler(de, html) {
      const v = document.createElement('div'); v.className = 'mh-vole'; v.innerHTML = html; v.setAttribute('aria-hidden', 'true'); document.body.appendChild(v);
      const cible = el.querySelector('#ht-billets'), cr = cible ? cible.getBoundingClientRect() : { left: 60, top: 60, width: 80, height: 30 };
      const dx = cr.left + cr.width / 2 - de.x, dy = cr.top + cr.height / 2 - de.y;
      v.style.left = de.x + 'px'; v.style.top = de.y + 'px';
      const fin = () => { v.remove(); if (cible) { cible.classList.remove('mh-gonfle'); void cible.offsetWidth; cible.classList.add('mh-gonfle'); } };
      if (v.animate) { const an = v.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%, -150%) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0.2 }], { duration: 950, easing: 'cubic-bezier(.5,0,.6,1)' }); an.onfinish = fin; } else setTimeout(fin, 950);
    }
    function flotter(de, txt, cls) {
      const f = document.createElement('div'); f.className = 'mh-flotte ' + (cls || ''); f.textContent = txt; f.setAttribute('role', 'status'); document.body.appendChild(f);
      f.style.left = Math.max(70, Math.min(innerWidth - 70, de.x)) + 'px'; f.style.top = de.y + 'px'; setTimeout(() => f.remove(), 1300);
    }
    function flotterSur(o, txt, cls) { flotter(posBulle(o), txt, cls); }

    // pour les tests et les captures : où sont les choses à l'écran
    function etat() {
      const M = manoir(), q = qq();
      return { ouvert, mode, choisi, recus: Object.assign({}, recus),
        clients: [...clients.values()].map((o) => { const ac = o.sid && B() ? B().client(o.sid) : null, b = o.bulle, r = b && !b.hidden && b.isConnected ? b.getBoundingClientRect() : null; const c = M && M.file.find((x) => x.id === o.id); return { id: o.id, sid: o.sid, sorte: o.sorte, etat: ac ? ac.etat : null, bulle: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.width, h: r.height, haut: r.top } : null, bout: r && o.bout ? Object.assign({}, o.bout) : null, commande: c ? c.commande.map((l) => ({ i: l.i, n: l.n, servi: l.servi })) : [], reste: c ? Math.max(0, PATIENCE - (q.now - c.arrive)) : 0 }; }),
        apps: [...apps.values()].map((o) => { let p = null; if (o.sid != null && B()) p = B().apparitions().find((x) => x.id === o.sid) || null; else if (o.img) { const r = o.img.getBoundingClientRect(); p = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; } return { id: o.id, sid: o.sid, type: o.type, dom: !!o.img, x: p ? p.x : null, y: p ? p.y : null, r: p ? p.r : null }; }),
        serie: M ? M.serie : 0, record: M ? M.record || 0 : 0, eveil: Q.presence ? Q.presence(q, maint()) : null,
        bestiaire: Q.bestiaire ? Q.bestiaire(q) : null, fetes: fetes.length, mot: btEl && !btEl.hidden ? btEl.textContent.trim() : '' };
    }
    return { ouvrir, fermer, pas, image, carte, barre, choisir, attraper, servirLigne, etat, feuilleBestiaire, sousDoigt };
  }
  return { creer };
})();
