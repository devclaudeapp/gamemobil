/* LE FOURNIL — le chat général des boulangers : un onglet de la feuille du classement (« Chat », src/ui.js), avec la pastille des
   messages non lus (st.chatVu : le dernier n° lu), reportée sur le bouton du classement en haut, et une feuille plein écran (le rang
   d'onglets du classement en tête, #tc-onglets) : les bulles (les siennes à droite), le pseudo, l'heure,
   les photos en miniature (chargées seulement quand elles arrivent à l'écran, gardées dans un petit cache ; un toucher les agrandit),
   les GIF (GIPHY : on n'envoie que leur identifiant), la barre de saisie (texte de 300 caractères, 📷, GIF, Envoyer), et l'appui long sur
   une bulle : « Signaler » (ou « Effacer » si c'est la sienne). Tout le monde lit ; seuls les joueurs du classement écrivent.
   Le réseau passe par le moteur du classement (src/classement.js : chatLire, chatImage, chatEnvoyer, chatSignaler, chatEffacer) ;
   serveur : supabase/fournil-chat.sql (pas encore collé : « bientôt »). Les lectures : toutes les 4 s feuille ouverte, toutes les 60 s
   sinon (pour la pastille, et seulement si on a rejoint le classement : rien ne part avant), jamais page cachée ni hors ligne.
   Sécurité : tout texte passe par esc() ; une image n'est montrée que si c'est une data URL d'image, posée par la propriété src (jamais
   dans du HTML) ; un GIF n'est construit que depuis un identifiant de lettres et de chiffres. Le chat ne touche pas à la boucle 3D. */
const TCHAT = (() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R = {
    ouvert: 4e3, ferme: 60e3, // une lecture toutes les 4 s feuille ouverte, toutes les 60 s sinon
    complete: 8, // feuille ouverte, une lecture sur 8 (~30 s) relit les 50 derniers : les messages masqués ou effacés disparaissent
    garder: 150, // les messages gardés en mémoire
    texte: 300, // caractères par message
    image: 350e3, // une photo : 350 Ko au plus, en base64 (la data URL entière)
    cote: 1280, // son plus grand côté
    cache: 24, // les images gardées en mémoire (les plus anciennes sortent)
    appui: 500, // l'appui long (ms)
    bas: 80, // « en bas » : à moins de 80 px du dernier message
    ecart: 3e3, // le serveur ne prend qu'un message toutes les 3 s
  };
  const IMG_OK = /^data:image\/(webp|jpeg|png|gif);base64,/, GIF_OK = /^[A-Za-z0-9]{5,40}$/, CLE_GIPHY = /^[A-Za-z0-9]{16,64}$/;
  // l'adresse d'un GIF : la version de 200 px de large (fixed_width) dans les bulles et la grille, l'originale agrandie
  const gifUrl = (id, grand) => (GIF_OK.test(String(id)) ? `https://media.giphy.com/media/${id}/${grand ? 'giphy' : '200w'}.gif` : '');
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MSG = { // les refus, dits clairement (sous la barre de saisie)
    'pas-rejoint': 'Rejoins le classement pour écrire',
    'pas-ouvert': 'Le chat ouvre bientôt.',
    'trop-vite': 'Doucement ! Un message toutes les 3 secondes.', trop_vite: 'Doucement ! Un message toutes les 3 secondes.',
    quota: 'Tu as écrit 60 messages en une heure : fais une pause, reviens un peu plus tard.',
    banni: 'Tu ne peux plus écrire dans le chat.',
    jeton: 'Ton pseudo n’est plus reconnu : rejoins le classement à nouveau.', inconnu: 'Ton pseudo n’est plus reconnu : rejoins le classement à nouveau.',
    vide: 'Écris un message, ou ajoute une photo ou un GIF.',
    long: '300 caractères au plus.',
    image: 'Cette image n’est pas acceptée (format ou taille).',
    gif: 'Ce GIF n’est pas accepté.',
    'hors-ligne': 'Pas de réseau : ton message n’est pas parti.',
    lent: 'Le chat ne répond pas : réessaie dans un moment.',
  };
  const message = (r) => MSG[r.etat === 'refus' ? r.erreur : r.etat] || 'Le message n’est pas parti. Réessaie dans un moment.';

  let d = null, el, fil, champ, note, piecesEl, nouveaux, gifs, menu, zoom, fichier;
  let messages = [], dernier = 0, etat = '', minuteur = 0, lecture = null, tours = 0, signature = '';
  let piece = null, envoiEnCours = false, dernierEnvoi = 0, noteMinuteur = 0, cible = null, appui = null;
  const pas = { ouvert: R.ouvert, ferme: R.ferme };
  const images = new Map(), attente = [], enVol = new Set(); // le petit cache des images (n → data URL, ou null : effacée), la file des images à lire
  let observe = null;

  // ─── ses propres messages : ceux envoyés d'ici (gardés sur le téléphone), ou signés de son pseudo ───
  const CLE = typeof FOURNIL_CLE === 'function' ? FOURNIL_CLE('fournil.tchat') : 'fournil.tchat'; // (la version d'essai : « fournil.essai.tchat »)
  const mesN = new Set((() => { try { const o = JSON.parse(localStorage.getItem(CLE) || 'null'); return o && Array.isArray(o.mes) ? o.mes.filter((n) => Number.isSafeInteger(n) && n > 0) : []; } catch (e) { return []; } })());
  function noterMien(n) { mesN.add(n); try { localStorage.setItem(CLE, JSON.stringify({ mes: [...mesN].slice(-200) })); } catch (e) { /* rien */ } }
  const moteur = () => { try { return d && d.classement ? d.classement() : null; } catch (e) { return null; } };
  const resume = () => { const m = moteur(); try { return m ? m.resume() : null; } catch (e) { return null; } };
  function mien(x) {
    if (x.moi || mesN.has(x.n)) return true;
    const r = resume(); return !!(r && r.rejoint && r.pseudo && x.pseudo && x.pseudo.toLowerCase() === r.pseudo.toLowerCase());
  }
  const ouvert = () => !!el && !el.hidden;
  const st = () => (d && d.st ? d.st() : null);
  const vuJusqua = () => { const s = st(); return s && Number.isSafeInteger(s.chatVu) ? s.chatVu : 0; };
  const cleGiphy = () => { try { const c = window.FOURNIL_CONFIG, k = c && typeof c.giphy === 'string' ? c.giphy.trim() : ''; return CLE_GIPHY.test(k) ? k : ''; } catch (e) { return ''; } };
  const enLigne = () => !(navigator && navigator.onLine === false);
  const visible = () => document.visibilityState !== 'hidden';

  // ─── les lectures : complète (les 50 derniers, la liste remplacée) ou à la suite (après le dernier n° connu) ───
  function lire(complete) {
    const m = moteur(); if (!m) return Promise.resolve({ etat: 'absent' });
    if (lecture) return lecture;
    const apres = complete || !messages.length ? 0 : dernier;
    lecture = m.chatLire(apres).then((r) => {
      if (r.etat === 'ok') {
        etat = 'ok';
        if (apres === 0) messages = r.messages.slice();
        else { const par = new Map(messages.map((x) => [x.n, x])); for (const x of r.messages) par.set(x.n, x); messages = [...par.values()].sort((a, b) => a.n - b.n); }
        if (messages.length > R.garder) messages = messages.slice(-R.garder);
        dernier = Math.max(apres ? dernier : 0, r.dernier || 0);
        // le tout premier contact (pas encore de st.chatVu) : seuls les trois derniers messages comptent comme non lus, pas tout l'historique
        { const s = st(); if (s && !Number.isSafeInteger(s.chatVu) && messages.length) { const k = messages.length > 3 ? messages[messages.length - 4].n : 0; s.chatVu = k; if (d.save) d.save(); } }
      } else if (r.etat === 'pas-ouvert') { etat = 'pas-ouvert'; messages = []; }
      else if (r.etat !== 'absent') etat = r.etat; // 'hors-ligne', 'lent', 'erreur' : la liste connue reste affichée
      return r;
    }).catch(() => ({ etat: 'erreur' })).then((r) => { lecture = null; peindre(); majBouton(); return r; });
    return lecture;
  }
  // le minuteur : relancé après chaque lecture ; rien page cachée (le retour au premier plan relance) ; la feuille fermée, seulement si on a
  // rejoint le classement et que le chat existe (un serveur sans le chat : plus rien jusqu'à la prochaine ouverture de la feuille)
  function planifier(tout) {
    clearTimeout(minuteur); minuteur = 0;
    if (!moteur() || !visible()) return;
    minuteur = setTimeout(tour, tout ? 0 : ouvert() ? pas.ouvert : pas.ferme);
  }
  function tour() {
    minuteur = 0;
    if (!visible()) return;
    const r = resume(), doit = etat !== 'pas-ouvert' && (ouvert() || (r && r.rejoint)); // pas encore de chat au serveur : seule l'ouverture de la feuille relit
    if (!doit) { planifier(); return; }
    if (!enLigne()) { if (etat !== 'hors-ligne' && ouvert()) { etat = 'hors-ligne'; peindre(); } planifier(); return; }
    tours++;
    lire(ouvert() && tours % R.complete === 0).then(() => planifier());
  }

  // ─── la pastille des non-lus : sur l'onglet « Chat » de la feuille du classement et sur le bouton du classement (src/ui.js, d.pastille) ───
  function nonLus() { const vu = vuJusqua(); return messages.filter((x) => x.n > vu && !mien(x)).length; }
  function majBouton() {
    const m = moteur(), n = m && !ouvert() ? nonLus() : 0;
    if (d && d.pastille) d.pastille(n);
  }
  function marquerLu() {
    if (!ouvert() || !presDuBas()) return;
    const s = st(), haut = messages.length ? messages[messages.length - 1].n : 0;
    if (s && haut > vuJusqua()) { s.chatVu = haut; if (d.save) d.save(); }
    if (nouveaux) nouveaux.hidden = true;
  }

  // ─── la feuille ───
  function ouvrir() {
    if (!moteur() || !el) return false;
    if (d.ouvert) d.ouvert();
    el.hidden = false; signature = ''; ajuster();
    peindre(); peindreBas(); allerEnBas();
    lire(true).then(() => { allerEnBas(); marquerLu(); planifier(); });
    majBouton();
    return true;
  }
  function fermer() {
    if (!el || el.hidden) return;
    fermerGifs(); fermerMenu(); fermerZoom(); marquerLu();
    el.hidden = true; el.style.top = ''; el.style.height = '';
    try { if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); } catch (e) { /* rien */ }
    planifier(); majBouton();
    if (d.ferme) d.ferme();
  }
  // le clavier de l'iPhone : la feuille suit la partie visible de l'écran (visualViewport), la barre de saisie reste au-dessus du clavier
  function ajuster() {
    const vv = window.visualViewport; if (!ouvert() || !vv) return;
    el.style.top = vv.offsetTop + 'px'; el.style.height = vv.height + 'px';
    if (document.activeElement === champ) allerEnBas();
  }
  const presDuBas = () => !fil || fil.scrollHeight - fil.scrollTop - fil.clientHeight < R.bas;
  function allerEnBas() { if (fil) fil.scrollTop = fil.scrollHeight; if (nouveaux) nouveaux.hidden = true; }

  // ─── le fil des messages : reconstruit quand la liste change (les cases des images ont une taille fixe : le défilement ne saute pas) ───
  const deux = (n) => String(n).padStart(2, '0');
  const heure = (ms) => { const t = new Date(ms); return `${deux(t.getHours())}:${deux(t.getMinutes())}`; };
  function jour(ms) {
    const t = new Date(ms), a = new Date(), h = new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1);
    if (t.toDateString() === a.toDateString()) return 'Aujourd’hui';
    if (t.toDateString() === h.toDateString()) return 'Hier';
    return `${t.getDate() === 1 ? '1er' : t.getDate()} ${MOIS[t.getMonth()]}${t.getFullYear() !== a.getFullYear() ? ' ' + t.getFullYear() : ''}`;
  }
  function etatHtml() {
    if (etat === 'pas-ouvert') return '<div class="tc-vide bientot"><span class="tc-pic">' + ICONS.UI.bulle + '</span><b>Le chat ouvre bientôt</b><span>Bientôt, tous les boulangers pourront se parler ici. Reviens dans quelque temps !</span></div>';
    if (!messages.length && !etat) return '<div class="tc-vide"><span>Chargement…</span></div>';
    if (!messages.length && etat === 'ok') return '<div class="tc-vide"><span class="tc-pic">' + ICONS.UI.bulle + '</span><b>Personne n’a encore écrit</b><span>Lance la conversation : dis bonjour aux autres boulangers !</span></div>';
    if (!messages.length) return `<div class="tc-vide"><b>${etat === 'hors-ligne' ? 'Pas de réseau' : 'Le chat ne répond pas'}</b><span>Il reprendra tout seul.</span></div>`;
    return '';
  }
  function peindre() {
    if (!ouvert()) return;
    $('#tc-bas').hidden = etat === 'pas-ouvert'; // pas encore de chat au serveur : pas de barre de saisie
    const r = resume(), sig = `${etat}|${r ? r.pseudo + r.rejoint : ''}|${messages.map((x) => x.n).join(',')}`;
    if (sig === signature) return;
    const bas = presDuBas(), avant = signature ? +(signature.split('|').pop().split(',').pop() || 0) : 0;
    signature = sig;
    let h = etat !== 'ok' && etat !== 'pas-ouvert' && etat && messages.length ? `<p class="tc-reseau">${etat === 'hors-ligne' ? 'Pas de réseau : le chat reprendra tout seul.' : 'Le chat ne répond pas : il réessaie tout seul.'}</p>` : '';
    h += etatHtml();
    let jourAvant = '', auteurAvant = '';
    for (const x of etat === 'pas-ouvert' ? [] : messages) {
      const j = x.cree ? jour(x.cree) : '', moi = mien(x);
      if (j && j !== jourAvant) { h += `<div class="tc-jour"><span>${esc(j)}</span></div>`; jourAvant = j; auteurAvant = ''; }
      const suite = !moi && auteurAvant === x.pseudo.toLowerCase(); auteurAvant = moi ? '\u0000' : x.pseudo.toLowerCase();
      h += `<div class="tc-msg ${moi ? 'moi' : 'autre'}${suite ? ' suite' : ''}" data-n="${x.n}">${moi || suite ? '' : `<small class="tc-pseudo">${esc(x.pseudo || 'Boulanger')}</small>`}<div class="tc-bulle">`;
      if (x.image) h += `<button type="button" class="tc-photo" data-n="${x.n}" aria-label="Agrandir la photo"><img alt="Photo de ${esc(x.pseudo || 'un boulanger')}"></button>`;
      if (x.gif && GIF_OK.test(x.gif)) h += `<button type="button" class="tc-gifm" data-gif="${esc(x.gif)}" aria-label="Agrandir le GIF"><img src="${esc(gifUrl(x.gif))}" alt="GIF" loading="lazy" referrerpolicy="no-referrer"></button>`;
      if (x.texte) h += `<p class="tc-txt">${esc(x.texte)}</p>`;
      h += `<time>${x.cree ? heure(x.cree) : ''}</time></div></div>`;
    }
    fil.innerHTML = h;
    hydrater();
    const fin = messages.length ? messages[messages.length - 1] : null;
    if (bas) allerEnBas();
    else if (fin && fin.n > avant && avant && !mien(fin) && nouveaux) nouveaux.hidden = false; // remonté dans le fil : « Nouveaux messages »
    marquerLu();
  }

  // ─── les photos : lues une à une quand leur case arrive à l'écran (deux à la fois au plus), puis gardées dans le cache ───
  function poser(btn, data) {
    const img = btn.querySelector('img');
    if (data && IMG_OK.test(data)) { btn.classList.remove('effacee'); if (img.src !== data) img.src = data; btn.classList.add('chargee'); }
    else if (data === null) { btn.classList.add('effacee'); btn.setAttribute('aria-label', 'Photo effacée'); btn.disabled = true; } // effacée après 7 jours, ou masquée
  }
  function retenir(n, data) { images.delete(n); images.set(n, data); while (images.size > R.cache) images.delete(images.keys().next().value); }
  function hydrater() {
    if (observe) observe.disconnect();
    fil.querySelectorAll('.tc-photo').forEach((b) => {
      const n = +b.dataset.n;
      if (images.has(n)) { poser(b, images.get(n)); retenir(n, images.get(n)); return; }
      if (observe) observe.observe(b); else demander(n);
    });
  }
  function demander(n) { if (images.has(n) || enVol.has(n) || attente.includes(n)) return; attente.push(n); suivante(); }
  function suivante() {
    const m = moteur(); if (!m) return;
    while (enVol.size < 2 && attente.length) {
      const n = attente.shift(); enVol.add(n);
      m.chatImage(n).then((r) => {
        if (r.etat === 'ok') { retenir(n, r.data); if (fil) fil.querySelectorAll(`.tc-photo[data-n="${n}"]`).forEach((b) => poser(b, r.data)); }
      }).catch(() => { /* on réessaiera à la prochaine peinture */ }).then(() => { enVol.delete(n); suivante(); });
    }
  }

  // ─── la barre de saisie : le texte, la pièce jointe (une photo ou un GIF), « Rejoins le classement pour écrire », « bientôt » ───
  function peindreBas() {
    const r = resume(), bas = $('#tc-bas'), saisie = $('#tc-saisie'), rejoindre = $('#tc-rejoindre');
    bas.hidden = etat === 'pas-ouvert';
    const peut = !!(r && r.rejoint);
    saisie.hidden = !peut; rejoindre.hidden = peut;
    const g = $('[data-tc="gif"]'); g.classList.toggle('bientot', !cleGiphy()); g.setAttribute('aria-label', cleGiphy() ? 'Choisir un GIF' : 'Les GIF : bientôt');
    peindrePiece(); compter();
  }
  function peindrePiece() {
    if (!piece) { piecesEl.hidden = true; piecesEl.innerHTML = ''; return; }
    piecesEl.hidden = false;
    piecesEl.innerHTML = `<span class="tc-apercu"><img alt=""></span><span class="tc-piece-txt">${piece.gif ? 'GIF prêt à partir' : `Photo prête · ${Math.max(1, Math.round(piece.image.length / 1000))} Ko`}</span><button type="button" class="tc-retirer" data-tc="retirer" aria-label="Retirer la pièce jointe"><i class="ico">${ICONS.UI.fermer}</i></button>`;
    const img = piecesEl.querySelector('img'); // posée par la propriété src : la data URL ne passe jamais par le HTML
    if (piece.gif) img.src = gifUrl(piece.gif); else if (IMG_OK.test(piece.image)) img.src = piece.image;
  }
  function compter() { const n = Array.from(champ.value).length, c = $('#tc-compte'); c.hidden = n < R.texte - 50; c.textContent = `${n}/${R.texte}`; c.classList.toggle('trop', n > R.texte); }
  function dire(txt, garder) {
    clearTimeout(noteMinuteur); note.textContent = txt || ''; note.hidden = !txt;
    if (txt && !garder) noteMinuteur = setTimeout(() => { note.hidden = true; }, 6000);
  }
  async function envoyer() {
    const m = moteur(); if (!m || envoiEnCours) return;
    const texte = champ.value.trim();
    if (!texte && !piece) { dire(MSG.vide); return; }
    if (Array.from(texte).length > R.texte) { dire(MSG.long); if (d.son) d.son.non(); return; }
    if (dernierEnvoi && Date.now() - dernierEnvoi < R.ecart) { dire(MSG['trop-vite']); if (d.son) d.son.non(); return; }
    envoiEnCours = true; el.classList.add('envoi'); dire('');
    const p = piece, r = await m.chatEnvoyer({ texte, gif: p && p.gif, image: p && p.image }).catch(() => ({ etat: 'erreur' }));
    envoiEnCours = false; el.classList.remove('envoi');
    if (r.etat === 'ok') {
      dernierEnvoi = Date.now(); noterMien(r.n);
      if (p && p.image) retenir(r.n, p.image);
      const s = resume();
      if (!messages.some((x) => x.n === r.n)) { messages.push({ n: r.n, pseudo: (s && s.pseudo) || '', texte, gif: (p && p.gif) || null, image: !!(p && p.image), cree: Date.now(), moi: true }); messages.sort((a, b) => a.n - b.n); }
      if (champ.value.trim() === texte) champ.value = '';
      if (piece === p) piece = null;
      peindrePiece(); compter(); peindre(); allerEnBas(); marquerLu();
      if (d.son) d.son.tap(); if (d.buzz) d.buzz(8);
      lire(); // les messages des autres arrivés entre-temps (la lecture repart du dernier n° lu au serveur, le sien compris)
      return;
    }
    if (d.son) d.son.non();
    if (r.etat === 'pas-ouvert') { etat = 'pas-ouvert'; peindre(); peindreBas(); return; }
    if (r.etat === 'pas-rejoint') peindreBas();
    if (r.etat === 'refus' && (r.erreur === 'trop-vite' || r.erreur === 'trop_vite')) dernierEnvoi = Date.now();
    dire(message(r), r.etat === 'refus' && r.erreur === 'banni');
  }

  // ─── les photos : la compression par le téléphone (src/photo.js, partagée avec les idées et bugs : plus grand côté 1280 px, WebP sinon
  // JPEG, la qualité qui descend jusqu'à 350 Ko ; un GIF de la galerie part tel quel) ───
  const preparerImage = (f) => PHOTOS.preparer(f, { max: R.image, cote: R.cote, gif: true });
  async function choisirFichier(f) {
    if (!f) return null;
    dire('Préparation de la photo…', true);
    const r = await preparerImage(f).catch(() => ({ ok: false, raison: 'illisible' }));
    if (!r.ok) { if (d.son) d.son.non(); dire(r.raison === 'gif' ? 'Ce GIF est trop lourd : 350 Ko au plus.' : r.raison === 'lourd' ? 'Cette photo est trop lourde, même réduite.' : 'Cette image ne s’ouvre pas.'); return r; }
    dire(''); piece = { image: r.data }; peindrePiece();
    return r;
  }

  // ─── les GIF : la recherche GIPHY (rating g, en français), les tendances quand la recherche est vide ; on n'envoie que l'identifiant ───
  let gifVol = 0, gifMinuteur = 0;
  function ouvrirGifs() {
    if (!cleGiphy()) { if (d.son) d.son.non(); dire('Les GIF arrivent bientôt.'); return; }
    fermerMenu(); gifs.hidden = false; $('#tc-gif-q').value = ''; chercher('');
  }
  function fermerGifs() { if (gifs) gifs.hidden = true; clearTimeout(gifMinuteur); gifVol++; }
  async function chercher(q) {
    const cle = cleGiphy(), grille = $('#tc-gif-grille'), k = ++gifVol; if (!cle) return;
    q = String(q || '').trim().slice(0, 50);
    grille.innerHTML = '<p class="tc-gif-etat">Chargement…</p>';
    const url = q ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(cle)}&q=${encodeURIComponent(q)}&rating=g&limit=24&lang=fr`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(cle)}&rating=g&limit=24`;
    let ids = null;
    try {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => { if (ctrl) ctrl.abort(); }, 8000);
      const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', ...(ctrl ? { signal: ctrl.signal } : {}) }); clearTimeout(t);
      const j = res.ok ? await res.json() : null;
      ids = j && Array.isArray(j.data) ? j.data.map((g) => (g && typeof g.id === 'string' && GIF_OK.test(g.id) ? { id: g.id, titre: typeof g.title === 'string' ? g.title.slice(0, 80) : '' } : null)).filter(Boolean) : null;
    } catch (e) { ids = null; }
    if (k !== gifVol) return; // une recherche plus récente est partie
    if (!ids) { grille.innerHTML = `<p class="tc-gif-etat">${enLigne() ? 'Les GIF ne répondent pas. Réessaie dans un moment.' : 'Pas de réseau.'}</p>`; return; }
    if (!ids.length) { grille.innerHTML = '<p class="tc-gif-etat">Aucun GIF pour cette recherche.</p>'; return; }
    grille.innerHTML = ids.map((g) => `<button type="button" class="tc-gif-choix" data-gif="${esc(g.id)}" aria-label="${esc(g.titre || 'GIF')}"><img src="${esc(gifUrl(g.id))}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('');
  }
  function choisirGif(id) { if (!GIF_OK.test(String(id))) return; piece = { gif: id }; fermerGifs(); peindrePiece(); if (d.son) d.son.tap(); }

  // ─── l'appui long sur une bulle : « Signaler », ou « Effacer » si c'est la sienne ───
  function ouvrirMenu(n) {
    const x = messages.find((y) => y.n === n); if (!x || !menu.hidden) return;
    cible = x; const moi = mien(x);
    $('#tc-menu-qui').textContent = moi ? 'Ton message' : `Message de ${x.pseudo || 'un boulanger'}`;
    $('#tc-menu-txt').textContent = x.texte || (x.image ? 'Une photo' : x.gif ? 'Un GIF' : '');
    $('[data-tc="signaler"]').hidden = moi; $('[data-tc="effacer"]').hidden = !moi;
    menu.hidden = false; if (d.buzz) d.buzz(10);
  }
  function fermerMenu() { if (menu) menu.hidden = true; cible = null; }
  async function agir(quoi) {
    const x = cible, m = moteur(); fermerMenu(); if (!x || !m) return;
    const r = await (quoi === 'effacer' ? m.chatEffacer(x.n) : m.chatSignaler(x.n)).catch(() => ({ etat: 'erreur' }));
    const retirer = () => { messages = messages.filter((y) => y.n !== x.n); images.delete(x.n); peindre(); majBouton(); };
    if (r.etat === 'ok') {
      if (quoi === 'effacer') { retirer(); dire('Message effacé.'); }
      else { if (r.masque) retirer(); dire(r.masque ? 'Merci : le message est signalé, il est masqué.' : 'Merci : le message est signalé.'); }
      if (d.son) d.son.tap(); return;
    }
    if (d.son) d.son.non();
    if (r.etat === 'pas-rejoint') { dire(quoi === 'effacer' ? MSG['pas-rejoint'] : 'Rejoins le classement pour signaler un message.'); return; }
    if (r.etat === 'refus') {
      if (r.erreur === 'absent') retirer(); // déjà effacé ou masqué au serveur : la bulle s'en va
      dire({ deja: 'Tu as déjà signalé ce message.', soi: 'C’est ton message : tu peux l’effacer.', banni: 'Tu ne peux plus signaler de message.', absent: 'Ce message n’existe plus.', 'pas-a-toi': 'Ce message n’est pas le tien : tu peux le signaler.' }[r.erreur] || message(r)); return;
    }
    dire(r.etat === 'pas-ouvert' ? MSG['pas-ouvert'] : r.etat === 'hors-ligne' ? 'Pas de réseau : réessaie plus tard.' : 'Le chat ne répond pas : réessaie dans un moment.');
  }
  function zoomer(btn) {
    const img = zoom.querySelector('img');
    if (btn.classList.contains('tc-gifm')) img.src = gifUrl(btn.dataset.gif, true);
    else { const data = images.get(+btn.dataset.n); if (!data || !IMG_OK.test(data)) return; img.src = data; }
    zoom.hidden = false;
  }
  function fermerZoom() { if (zoom && !zoom.hidden) { zoom.hidden = true; zoom.querySelector('img').removeAttribute('src'); } }

  // ─── le branchement ───
  // deps : { classement() (le moteur, null sans configuration), st(), save(), son, buzz, audio, ouvert() (la feuille du jeu se ferme),
  //          ferme() (retour à la boutique), rejoindre() (la feuille du classement), pastille(n) (les non-lus, à montrer) }
  function init(deps) {
    d = deps; el = $('#tchat'); if (!el) return;
    fil = $('#tc-fil'); champ = $('#tc-texte'); note = $('#tc-note'); piecesEl = $('#tc-piece'); nouveaux = $('#tc-nouveaux'); gifs = $('#tc-gifs'); menu = $('#tc-menu'); zoom = $('#tc-zoom'); fichier = $('#tc-fichier');
    if (window.__tchatPas) Object.assign(pas, window.__tchatPas); // les tests : des lectures plus rapprochées
    try { observe = 'IntersectionObserver' in window ? new IntersectionObserver((l) => { for (const e of l) if (e.isIntersecting) { observe.unobserve(e.target); demander(+e.target.dataset.n); } }, { root: fil, rootMargin: '300px 0px' }) : null; } catch (e) { observe = null; }
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tc], .tc-photo, .tc-gifm, .tc-gif-choix'); if (!t || !el.contains(t)) return;
      if (appui && appui.fait) { appui = null; return; } // l'appui long a ouvert le menu : pas de zoom en plus
      const a = t.dataset.tc;
      if (t.classList.contains('tc-gif-choix')) return choisirGif(t.dataset.gif);
      if (t.classList.contains('tc-photo') || t.classList.contains('tc-gifm')) return zoomer(t);
      if (a === 'fermer') { if (d.son) d.son.tap(); fermer(); }
      else if (a === 'envoyer') envoyer();
      else if (a === 'photo') { fermerGifs(); fichier.value = ''; fichier.click(); }
      else if (a === 'gif') { if (gifs.hidden) ouvrirGifs(); else fermerGifs(); }
      else if (a === 'gifs-fermer') fermerGifs();
      else if (a === 'retirer') { piece = null; peindrePiece(); }
      else if (a === 'bas') { allerEnBas(); marquerLu(); }
      else if (a === 'signaler' || a === 'effacer') agir(a);
      else if (a === 'annuler') fermerMenu();
      else if (a === 'zoom') fermerZoom();
      else if (a === 'rejoindre') { fermer(); if (d.rejoindre) d.rejoindre(); }
    });
    menu.addEventListener('click', (e) => { if (appui && appui.fait) return; if (e.target === menu) fermerMenu(); }); // le doigt qui se lève après l'appui long ne referme pas le menu
    champ.addEventListener('input', compter);
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); envoyer(); } });
    champ.addEventListener('focus', () => setTimeout(ajuster, 300));
    fichier.addEventListener('change', () => { const f = fichier.files && fichier.files[0]; if (f) choisirFichier(f); });
    $('#tc-gif-q').addEventListener('input', (e) => { clearTimeout(gifMinuteur); const q = e.target.value; gifMinuteur = setTimeout(() => chercher(q), 400); });
    fil.addEventListener('scroll', () => { if (presDuBas()) marquerLu(); }, { passive: true });
    // l'appui long : 500 ms sans bouger ; le menu contextuel (clic droit, appui long d'Android) aussi
    fil.addEventListener('pointerdown', (e) => {
      const bu = e.target.closest('.tc-msg'); if (!bu) return;
      appui = { n: +bu.dataset.n, x: e.clientX, y: e.clientY, fait: false, t: setTimeout(() => { if (appui) { appui.fait = true; ouvrirMenu(appui.n); } }, R.appui) };
    });
    const lacher = () => { if (appui && !appui.fait) { clearTimeout(appui.t); appui = null; } };
    fil.addEventListener('pointermove', (e) => { if (appui && !appui.fait && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 10) lacher(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) fil.addEventListener(ev, () => { lacher(); if (appui && appui.fait) setTimeout(() => { appui = null; }, 400); });
    fil.addEventListener('contextmenu', (e) => { const bu = e.target.closest('.tc-msg'); if (!bu) return; e.preventDefault(); if (appui) clearTimeout(appui.t); ouvrirMenu(+bu.dataset.n); });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || !ouvert()) return; if (!zoom.hidden) fermerZoom(); else if (!menu.hidden) fermerMenu(); else if (!gifs.hidden) fermerGifs(); else fermer(); });
    document.addEventListener('visibilitychange', () => { if (visible()) planifier(ouvert()); else { clearTimeout(minuteur); minuteur = 0; } }); // page cachée : plus aucune lecture
    window.addEventListener('online', () => planifier(true));
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', ajuster); window.visualViewport.addEventListener('scroll', ajuster); }
    majBouton();
    if (moteur()) { clearTimeout(minuteur); minuteur = setTimeout(tour, 3000); } // la première lecture (pastille), 3 s après le lancement
  }

  return {
    init, ouvrir, fermer, lire, preparerImage, choisirFichier, choisirGif, gifUrl, majBouton, R, IMG_OK, GIF_OK,
    get ouvert() { return ouvert(); },
    etat: () => ({ etat, dernier, messages: messages.map((x) => Object.assign({ mien: mien(x) }, x)), nonLus: nonLus(), vu: vuJusqua(), piece: piece ? (piece.gif ? { gif: piece.gif } : { image: piece.image.length, type: (/^data:(image\/\w+)/.exec(piece.image) || [])[1] }) : null, images: images.size, minuteur: !!minuteur }),
  };
})();
