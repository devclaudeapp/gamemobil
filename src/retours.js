/* LE FOURNIL — les idées, les bugs et les votes : un bouton rond dans le coin (une ampoule, sous la bulle du chat), avec sa pastille (pour un
   joueur : les votes en cours pas encore votés ; pour l'admin : les retours « nouveau »), et une feuille plein écran à onglets :
   - « Écrire » : deux grandes cartes, « 💡 Proposer une idée » et « 🐞 Signaler un bug », puis le texte (1000 caractères) et une capture
     (allégée par le téléphone, src/photo.js, comme les photos du chat) ; un bug part avec ses infos, jointes toutes seules (la version du
     jeu, l'appareil en bref, l'écran, le quartier, les 3 dernières entrées du journal des retours), montrées avant l'envoi ; puis le merci ;
   - « Votes » : les votes en cours (2 à 4 gros boutons, puis les résultats en barres, « Changer mon vote », le compte à rebours) et, en
     dessous, les derniers votes finis. Dans la boutique, un bandeau sous l'enseigne annonce le vote pas encore voté (caché une fois voté
     et pendant une feuille) ; le toucher ouvre cet onglet ;
   - « Admin » (seulement si fournil_admin_moi répond true) : les retours (Nouveaux / Tous, l'image agrandissable, les infos dépliables,
     Vu / Fait / Refusé avec une note), « Créer un vote » (question, 2 à 4 options, durée) et les votes en cours, avec « Fermer ».
   Écrire, voter et l'admin : seulement les joueurs du classement (pseudo et jeton). Le réseau passe par le moteur du classement
   (src/classement.js : retourEnvoyer, votesOuverts, voter, adminMoi, adminRetours, adminRetourImage, adminRetourEtat, adminVoteCreer,
   adminVoteFermer) ; serveur : supabase/fournil-retours.sql (pas encore collé : « bientôt », et plus aucune lecture d'ici la prochaine
   ouverture de la feuille). Les lectures : les votes toutes les 5 min et au retour dans l'appli, une fois le classement rejoint (rien
   ne part avant : sans pseudo, seule l'ouverture de la feuille lit les votes) ; pour l'admin, les retours nouveaux toutes
   les 5 min ; jamais page cachée ni hors ligne. Sécurité : tout texte passe par esc() ; une image n'est montrée que si c'est une data URL
   d'image, posée par la propriété src (jamais dans du HTML). */
const RETOURS = (() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typo = (s) => String(s).replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); // l'espace insécable de la typographie française : « ? » ne part pas seul à la ligne
  const R = {
    votes: 5 * 60e3, // les votes relus toutes les 5 min
    admin: 5 * 60e3, // l'admin : les retours nouveaux relus toutes les 5 min
    retour: 30e3, // au retour dans l'appli : une relecture, pas plus d'une toutes les 30 s
    texte: 1000, // caractères par retour
    note: 300, // la note de l'admin
    image: 350e3, // une capture : 350 Ko au plus, en base64 (la data URL entière)
    cote: 1280, // son plus grand côté
    journal: 3, // les dernières entrées du journal des retours jointes à un bug
  };
  const IMG_OK = /^data:image\/(webp|jpeg|png);base64,/;
  const DUREES = [[1, '1 h'], [6, '6 h'], [24, '1 j'], [72, '3 j'], [168, '7 j']];
  const ETATS = { nouveau: 'Nouveau', vu: 'Vu', fait: 'Fait', refuse: 'Refusé' };
  const MSG = { // les refus, dits clairement
    'pas-rejoint': 'Rejoins le classement pour écrire',
    'pas-ouvert': 'Les idées et les bugs arrivent bientôt.',
    'trop-vite': 'Doucement ! Un envoi toutes les 30 secondes.', trop_vite: 'Doucement ! Un envoi toutes les 30 secondes.',
    quota: 'Tu as déjà envoyé 5 retours aujourd’hui : merci ! Reviens demain.',
    banni: 'Tu ne peux plus envoyer de retour.',
    jeton: 'Ton pseudo n’est plus reconnu : rejoins le classement à nouveau.', inconnu: 'Ton pseudo n’est plus reconnu : rejoins le classement à nouveau.',
    vide: 'Écris quelques mots avant d’envoyer.',
    long: '1000 caractères au plus.',
    image: 'Cette capture n’est pas acceptée (format ou taille).',
    type: 'Choisis : une idée ou un bug.',
    infos: 'Les infos du bug sont trop longues.',
    'hors-ligne': 'Pas de réseau : rien n’est parti.',
    lent: 'Le serveur ne répond pas : réessaie dans un moment.',
    'pas-admin': 'Réservé au boulanger en chef.',
    fini: 'Ce vote est terminé.', absent: 'Ce vote n’existe plus.', option: 'Ce choix n’existe pas.',
    question: 'Écris la question (200 caractères au plus).', options: 'De 2 à 4 options, de 60 caractères au plus.', duree: 'Choisis une durée.',
  };
  const message = (r) => MSG[r.etat === 'refus' ? r.erreur : r.etat] || 'Ça n’est pas passé. Réessaie dans un moment.';

  let d = null, el, corps, fichier, zoom, bandeau, bouton;
  let onglet = 'ecrire', vue = 'accueil', adminVue = 'retours', filtre = 'nouveau';
  let etat = '', votes = [], finis = [], lusA = 0, lecture = null; // etat : '' (rien lu), 'ok', 'pas-ouvert', ou un état du réseau
  let admin = false, adminVu = '', retours = [], adminEtat = '', plusAnciens = false, nouveaux = 0, adminLecture = null, adminLectureCle = '';
  let envoiEnCours = false, dernierType = 'idee', noteTxt = '', noteMinuteur = 0, confirmer = 0;
  let minuteur = 0, minuteurAdmin = 0, horloge = 0;
  const pas = { votes: R.votes, admin: R.admin };
  const brouillon = { idee: { texte: '', image: null }, bug: { texte: '', image: null }, notes: {}, vote: { question: '', options: ['', ''], heures: 24 } };
  const changer = new Set(), images = new Map(), voteEnVol = new Set();

  const moteur = () => { try { return d && d.classement ? d.classement() : null; } catch (e) { return null; } };
  const resume = () => { const m = moteur(); try { return m ? m.resume() : null; } catch (e) { return null; } };
  const rejoint = () => { const r = resume(); return !!(r && r.rejoint); };
  const ouvert = () => !!el && !el.hidden;
  const st = () => (d && d.st ? d.st() : null);
  const maintenant = () => Date.now(); // les fins des votes sont des heures du serveur (ms) : l'horloge du téléphone suffit pour un compte à rebours
  const enLigne = () => !(navigator && navigator.onLine === false);
  const visible = () => document.visibilityState !== 'hidden';
  const son = (k) => { try { if (d && d.son && d.son[k]) d.son[k](); } catch (e) { /* rien */ } };

  // ─── le compte à rebours : « encore 2 j 4 h », « encore 3 h 12 min », « encore 5 min » ───
  function reste(ms) {
    if (!(ms > 0)) return 'terminé';
    const min = Math.ceil(ms / 60e3); if (min < 60) return `encore ${min} min`;
    const h = Math.floor(min / 60), j = Math.floor(h / 24);
    if (j >= 1) return `encore ${j} j${h % 24 ? ` ${h % 24} h` : ''}`;
    return `encore ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  }
  const enCours = () => votes.filter((v) => v.fin > maintenant());
  const aVoter = () => enCours().filter((v) => v.moi == null);

  // ─── les infos jointes à un bug : la version, l'appareil en bref, l'écran, le quartier, les 3 dernières entrées du journal des retours ───
  function appareil() {
    const ua = String((navigator && navigator.userAgent) || ''), x = (re) => { const m = re.exec(ua); return m ? m[1].replace(/_/g, '.') : ''; };
    const sys = /iPhone/.test(ua) ? `iPhone · iOS ${x(/OS (\d+[_.]\d+)/)}` : /iPad/.test(ua) ? `iPad · iOS ${x(/OS (\d+[_.]\d+)/)}` : /Android/.test(ua) ? `Android ${x(/Android (\d+(?:\.\d+)?)/)}`
      : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Autre';
    const nav = /SamsungBrowser\/(\d+)/.test(ua) ? `Samsung ${x(/SamsungBrowser\/(\d+)/)}` : /(?:CriOS|Chrome)\/(\d+)/.test(ua) ? `Chrome ${x(/(?:CriOS|Chrome)\/(\d+)/)}`
      : /(?:FxiOS|Firefox)\/(\d+)/.test(ua) ? `Firefox ${x(/(?:FxiOS|Firefox)\/(\d+)/)}` : /Version\/(\d+(?:\.\d+)?).*Safari/.test(ua) ? `Safari ${x(/Version\/(\d+(?:\.\d+)?)/)}` : 'navigateur';
    let appli = false; try { appli = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { appli = false; }
    return `${sys} · ${nav}${appli ? ' · appli installée' : ''}`.slice(0, 80);
  }
  function infos() {
    const s = st(), j = s && Array.isArray(s.journalRetours) ? s.journalRetours : [];
    const n = (v) => (Number.isFinite(v) ? Math.round(v) : null);
    let quartier = ''; try { quartier = d && d.quartier ? String(d.quartier() || '') : ''; } catch (e) { quartier = ''; }
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    let ecran = ''; try { ecran = `${screen.width}×${screen.height} · ${innerWidth}×${innerHeight} · ×${dpr}`; } catch (e) { ecran = `${innerWidth}×${innerHeight}`; }
    return {
      version: (typeof window.FOURNIL_VERSION === 'string' && window.FOURNIL_VERSION.slice(0, 20)) || 'inconnue',
      appareil: appareil(), ecran, quartier: quartier.slice(0, 40),
      journal: j.slice(-R.journal).map((e) => ({ t: n(e && e.t), r: String((e && e.r) || '').slice(0, 12), o: n(e && e.o), s: n(e && e.s), n: String((e && e.n) || '').slice(0, 12) })),
    };
  }
  const quand = (t) => { try { return new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const duree = (s) => (!Number.isFinite(s) ? '?' : s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);
  function lignesInfos(o) { // les infos, lisibles : [libellé, valeur] (tout passera par esc)
    if (!o || typeof o !== 'object') return [];
    const NOMS = { version: 'Version', appareil: 'Appareil', ecran: 'Écran', quartier: 'Quartier', journal: 'Journal' }, l = [];
    for (const [k, v] of Object.entries(o).slice(0, 12)) {
      if (k === 'journal' && Array.isArray(v)) {
        if (!v.length) l.push(['Journal', 'vide']);
        v.slice(0, 5).forEach((e, i) => l.push([i ? '' : 'Journal', e && typeof e === 'object' ? `${e.t ? quand(e.t) : '?'} · ${e.r || '?'} · parti ${duree(e.o)}, payé ${duree(e.s)} · ${e.n || ''}` : String(e)]));
      } else l.push([NOMS[k] || k, typeof v === 'string' ? v : JSON.stringify(v)]);
    }
    return l.map(([a, b]) => [a, String(b).slice(0, 300)]);
  }
  const infosHtml = (o) => `<dl class="rt-dl">${lignesInfos(o).map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;

  // ─── les lectures : les votes (tout le monde), les retours nouveaux (l'admin) ───
  function lireVotes() {
    const m = moteur(); if (!m) return Promise.resolve({ etat: 'absent' });
    if (lecture) return lecture;
    const avant = etat;
    lecture = m.votesOuverts().then((r) => {
      if (r.etat === 'ok') { etat = 'ok'; votes = r.votes; finis = r.finis; lusA = maintenant(); for (const v of votes) if (v.moi == null) changer.delete(v.n); }
      else if (r.etat === 'pas-ouvert') { etat = 'pas-ouvert'; votes = []; finis = []; }
      else if (r.etat !== 'absent') etat = votes.length || finis.length ? 'ok' : r.etat; // le réseau qui flanche : la liste connue reste
      return r;
    }).catch(() => ({ etat: 'erreur' })).then((r) => { lecture = null;
      if (ouvert() && (onglet === 'votes' || etat !== avant || (onglet === 'ecrire' && vue === 'accueil'))) peindre(); // un formulaire en cours n'est pas repeint (le clavier resterait ouvert)
      majBouton(); majBandeau(); return r; });
    return lecture;
  }
  function verifierAdmin(force) {
    const m = moteur(), r = resume(), cle = r && r.rejoint ? `${r.pseudo}|${m && m.etat ? m.etat().id : ''}` : '';
    if (!m || !cle) { admin = false; adminVu = ''; nouveaux = 0; majOnglets(); majBouton(); return Promise.resolve(false); }
    if (cle === adminVu && !force) return Promise.resolve(admin);
    adminVu = cle;
    return m.adminMoi().then((x) => {
      if (x.etat === 'ok') admin = x.admin === true; else if (x.etat === 'pas-ouvert' || x.etat === 'refus') admin = false; else adminVu = ''; // le réseau : on redemandera
      majOnglets(); if (admin) { planifierAdmin(true); } else { nouveaux = 0; if (onglet === 'admin') { onglet = 'ecrire'; if (ouvert()) peindre(); } }
      majBouton(); return admin;
    }).catch(() => { adminVu = ''; return false; });
  }
  function lireRetours(plus) {
    const m = moteur(); if (!m || !admin) return Promise.resolve({ etat: 'absent' });
    // une lecture déjà en route : la même (le même filtre, la même page) est partagée ; une autre (le filtre vient de changer, « Tous » touché
    // pendant la relecture des nouveaux) part juste après elle : sinon « Tous » montrait les nouveaux, et rien d'autre ne partait
    const avant = plus && retours.length ? retours[retours.length - 1].n : null, f = filtre, cle = `${f}|${avant}`;
    if (adminLecture) return adminLectureCle === cle ? adminLecture : adminLecture.then(() => lireRetours(plus));
    adminLectureCle = cle;
    adminLecture = m.adminRetours(f, avant).then((r) => {
      if (f !== filtre) return r; // (le filtre a changé en route : cette réponse ne vaut plus pour la liste)
      if (r.etat === 'ok') {
        adminEtat = 'ok';
        retours = avant ? retours.concat(r.retours.filter((x) => !retours.some((y) => y.n === x.n))) : r.retours;
        plusAnciens = r.retours.length >= 30;
        nouveaux = Number.isInteger(r.nouveaux) ? r.nouveaux : f === 'nouveau' ? retours.filter((x) => x.etat === 'nouveau').length : nouveaux; // le serveur dit le total
      } else if (r.etat === 'refus' && r.erreur === 'pas-admin') { admin = false; majOnglets(); }
      else adminEtat = r.etat;
      return r;
    }).catch(() => ({ etat: 'erreur' })).then((r) => { adminLecture = null; if (ouvert() && onglet === 'admin') peindre(); majBouton(); return r; });
    return adminLecture;
  }
  // le compte des nouveaux pour la pastille de l'admin, sans toucher à la liste affichée (filtre « Tous » ouvert, par exemple)
  function compterNouveaux() {
    const m = moteur(); if (!m || !admin) return Promise.resolve();
    // (la liste ouverte n'est pas remplacée : une carte qu'on vient de traiter, ou dont on tape la note, ne disparaît pas sous le doigt)
    return m.adminRetours('nouveau', null).then((r) => { if (r.etat === 'ok') nouveaux = Number.isInteger(r.nouveaux) ? r.nouveaux : r.retours.filter((x) => x.etat === 'nouveau').length; majBouton(); }).catch(() => { /* rien */ });
  }
  // les minuteurs : rien page cachée (le retour au premier plan relance), rien hors ligne ; le script pas collé : plus rien avant l'ouverture de la feuille
  function planifier(tout) {
    clearTimeout(minuteur); minuteur = 0;
    if (!moteur() || !visible() || etat === 'pas-ouvert') return;
    minuteur = setTimeout(tour, tout ? 0 : pas.votes);
  }
  function tour() { // rien ne part avant d'avoir rejoint le classement (comme le chat) : sans pseudo, seule l'ouverture de la feuille lit les votes
    minuteur = 0; if (!visible()) return;
    if (!enLigne() || !(rejoint() || ouvert())) { planifier(); return; }
    lireVotes().then(() => planifier());
  }
  function planifierAdmin(tout) {
    clearTimeout(minuteurAdmin); minuteurAdmin = 0;
    if (!admin || !visible() || etat === 'pas-ouvert') return;
    minuteurAdmin = setTimeout(() => { minuteurAdmin = 0; if (!visible()) return; (enLigne() ? compterNouveaux() : Promise.resolve()).then(() => planifierAdmin()); }, tout ? 0 : pas.admin);
  }
  // le compte à rebours : toutes les 30 s, tant que le bandeau ou la feuille des votes le montrent ; un vote qui vient de finir : relu
  function battre() {
    clearInterval(horloge); horloge = 0;
    if (!enCours().length || !visible()) return;
    horloge = setInterval(() => {
      if (votes.some((v) => v.fin <= maintenant() && !v.finVu)) { for (const v of votes) if (v.fin <= maintenant()) v.finVu = true; lireVotes(); }
      majBandeau();
      if (ouvert() && onglet === 'votes') corps.querySelectorAll('[data-fin]').forEach((x) => { x.textContent = reste(+x.dataset.fin - maintenant()); });
    }, 30e3);
  }

  // ─── le bouton rond du coin, sa pastille, et le bandeau du vote dans la boutique ───
  function majBouton() {
    if (!bouton) return;
    const m = moteur(); bouton.hidden = !m; if (!m) { majBandeau(); return; }
    const n = admin ? nouveaux : rejoint() ? aVoter().length : 0, p = bouton.querySelector('.rt-pastille');
    p.hidden = !n; p.textContent = n > 9 ? '9+' : n ? String(n) : '';
    p.classList.toggle('admin', admin);
    bouton.setAttribute('aria-label', !n ? 'Idées et bugs' : admin ? `Idées et bugs : ${n > 9 ? 'plus de 9' : n} nouveau${n > 1 ? 'x' : ''} retour${n > 1 ? 's' : ''}` : `Idées et bugs : ${n > 1 ? `${n} votes t’attendent` : 'un vote t’attend'}`);
    const pv = el && el.querySelector('[data-rt-onglet="votes"] .rt-point'), pa = el && el.querySelector('[data-rt-onglet="admin"] .rt-point');
    if (pv) pv.hidden = !aVoter().length; if (pa) pa.hidden = !nouveaux;
    majBandeau(); battre();
  }
  function majBandeau() {
    if (!bandeau) return;
    const v = moteur() && etat === 'ok' && rejoint() ? aVoter()[0] : null; // sans pseudo, pas d'invitation à voter
    const feuille = $('#feuille'), cache = !v || ouvert() || (feuille && !feuille.hidden) || ($('#tchat') && !$('#tchat').hidden);
    bandeau.hidden = cache; if (cache) return;
    bandeau.dataset.n = v.n;
    const q = bandeau.querySelector('.vb-q'), r = bandeau.querySelector('.vb-reste'), t = `Vote : ${typo(v.question)}`, rr = `${reste(v.fin - maintenant())} · toucher pour voter`;
    if (q.textContent !== t) q.textContent = t; if (r.textContent !== rr) r.textContent = rr;
    bandeau.setAttribute('aria-label', `Vote : ${v.question}, ${reste(v.fin - maintenant())}. Toucher pour voter.`);
  }
  function majOnglets() {
    if (!el) return;
    const a = el.querySelector('[data-rt-onglet="admin"]'); if (a) a.hidden = !admin;
    if (!admin && onglet === 'admin') onglet = 'ecrire';
    el.querySelectorAll('[data-rt-onglet]').forEach((b) => { const on = b.dataset.rtOnglet === onglet; b.classList.toggle('actif', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }

  // ─── la feuille ───
  function ouvrir(o) {
    if (!moteur() || !el) return false;
    if (d.ouvert) d.ouvert();
    onglet = o === 'votes' || (o === 'admin' && admin) ? o : o === 'ecrire' ? 'ecrire' : onglet === 'admin' && !admin ? 'ecrire' : onglet;
    if (onglet === 'ecrire' && vue === 'merci') vue = 'accueil';
    noteTxt = ''; el.hidden = false; corps.scrollTop = 0;
    if (etat === 'pas-ouvert') etat = ''; // le script a pu être collé depuis : on redemande
    majOnglets(); peindre(); majBouton();
    lireVotes().then(() => planifier());
    verifierAdmin().then(() => { if (admin && onglet === 'admin') lireRetours(); });
    return true;
  }
  function fermer() {
    if (!el || el.hidden) return;
    fermerZoom(); el.hidden = true;
    try { if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); } catch (e) { /* rien */ }
    majBouton(); if (d.ferme) d.ferme();
  }
  function choisirOnglet(o) {
    if (o === 'admin' && !admin) return;
    onglet = o; confirmer = 0; noteTxt = ''; majOnglets(); corps.scrollTop = 0; peindre();
    if (o === 'votes') lireVotes();
    if (o === 'admin') lireRetours();
  }
  function dire(txt) {
    clearTimeout(noteMinuteur); noteTxt = txt || '';
    const n = corps && corps.querySelector('.rt-note'); if (n) { n.textContent = noteTxt; n.hidden = !noteTxt; }
    if (txt) noteMinuteur = setTimeout(() => { noteTxt = ''; const x = corps && corps.querySelector('.rt-note'); if (x) x.hidden = true; }, 7000);
  }
  const noteHtml = () => `<p class="tc-note rt-note" role="status"${noteTxt ? '' : ' hidden'}>${esc(noteTxt)}</p>`;
  const vide = (pic, titre, txt, cls) => `<div class="tc-vide rt-vide${cls ? ' ' + cls : ''}"><span class="tc-pic">${pic}</span><b>${esc(titre)}</b><span>${esc(txt)}</span></div>`;
  const bientot = () => vide(ICONS.UI.ampoule, 'Les idées et les bugs arrivent bientôt', 'Bientôt, tu pourras proposer tes idées, signaler un bug et voter pour la suite du Fournil. Reviens dans quelque temps !', 'bientot');
  const btnRejoindre = (txt) => `<button type="button" class="btn large beurre rt-rejoindre" data-rt="rejoindre"><b>${esc(txt || 'Rejoins le classement pour écrire')}</b><small>Choisis ton pseudo : c’est lui qui signe tes messages</small></button>`;
  function peindre() {
    if (!ouvert()) return;
    corps.dataset.onglet = onglet;
    corps.innerHTML = onglet === 'votes' ? pageVotes() : onglet === 'admin' && admin ? pageAdmin() : pageEcrire();
    hydrater();
  }
  function hydrater() { // les images : posées par la propriété src, jamais dans le HTML
    corps.querySelectorAll('img[data-src-brouillon]').forEach((img) => { const b = brouillon[img.dataset.srcBrouillon]; if (b && b.image && IMG_OK.test(b.image)) img.src = b.image; });
    corps.querySelectorAll('.rt-img[data-n]').forEach((btn) => { const data = images.get(+btn.dataset.n); if (data && IMG_OK.test(data)) { btn.querySelector('img').src = data; btn.classList.add('chargee'); } });
  }

  // ─── « Écrire » : les deux cartes, le formulaire (texte, capture, infos d'un bug), le merci ───
  function pageEcrire() {
    if (etat === 'pas-ouvert') return bientot();
    const peut = rejoint();
    if (vue === 'merci') {
      return `<div class="rt-merci"><span class="rt-merci-pic" aria-hidden="true">${dernierType === 'bug' ? '🐞' : '💡'}</span><b>Merci !</b><span>${dernierType === 'bug' ? 'Ton signalement est bien arrivé. On regarde ça de près.' : 'Ton idée est bien arrivée. Le boulanger en chef lit tout !'}</span></div>
        <div class="rt-actions"><button type="button" class="btn large menthe" data-rt="accueil"><b>Écrire autre chose</b></button><button type="button" class="btn large clair" data-rt="fermer"><b>Fermer</b></button></div>`;
    }
    if (vue === 'idee' || vue === 'bug') {
      const b = brouillon[vue], bug = vue === 'bug', n = Array.from(b.texte).length;
      return `<button type="button" class="rt-retour" data-rt="accueil"><i class="ico">${ICONS.UI.chevron}</i>Retour</button>
        <h3 class="rt-h3">${bug ? '🐞 Signaler un bug' : '💡 Proposer une idée'}</h3>
        <p class="sous">${bug ? 'Dis ce qui s’est passé, et ce que tu faisais juste avant. Une capture aide beaucoup.' : 'Une recette, un meuble, un mini-jeu, un événement… Raconte !'}</p>
        <label class="rt-champ"><textarea id="rt-texte" data-champ="texte" maxlength="${R.texte}" rows="6" placeholder="${bug ? 'Par exemple : la Planque ne s’ouvre plus depuis ce matin…' : 'Par exemple : une vitrine de macarons, avec leurs couleurs…'}" aria-label="${bug ? 'Ton bug' : 'Ton idée'}">${esc(b.texte)}</textarea><small class="rt-compte${n > R.texte - 100 ? '' : ' discret'}">${n}/${R.texte}</small></label>
        <div class="rt-capture">${b.image ? `<span class="tc-apercu"><img data-src-brouillon="${vue}" alt="Ta capture"></span><span class="tc-piece-txt">Capture prête · ${Math.max(1, Math.round(b.image.length / 1000))} Ko</span><button type="button" class="tc-retirer" data-rt="retirer" aria-label="Retirer la capture"><i class="ico">${ICONS.UI.fermer}</i></button>`
          : `<button type="button" class="btn large clair rt-photo" data-rt="photo"><b><i class="ico">${ICONS.UI.photo}</i>${bug ? 'Ajouter une capture' : 'Ajouter une image'}</b></button>`}</div>
        ${bug ? `<details class="nv rt-infos"><summary><span class="nv-tete"><b>Infos jointes au bug</b><small>Pour comprendre d’où vient le souci</small></span><i class="ico chev">${ICONS.UI.chevron}</i></summary>${infosHtml(infos())}</details>` : ''}
        ${noteHtml()}
        ${peut ? `<button type="button" class="btn large${bug ? '' : ' menthe'} rt-envoyer" data-rt="envoyer"${envoiEnCours ? ' disabled' : ''}><b>${envoiEnCours ? 'Envoi…' : 'Envoyer'}</b></button>` : btnRejoindre()}`;
    }
    const v = aVoter()[0];
    return `<p class="sous">Une idée pour le Fournil ? Quelque chose qui cloche ? Écris-le : chaque message est lu.</p>
      ${peut ? '' : `${btnRejoindre()}`}
      <button type="button" class="rt-carte idee${peut ? '' : ' non'}" data-rt="idee"><span class="rt-emoji" aria-hidden="true">💡</span><span class="rt-carte-t"><b>Proposer une idée</b><small>Une recette, un meuble, un mini-jeu…</small></span><i class="ico chev">${ICONS.UI.chevron}</i></button>
      <button type="button" class="rt-carte bug${peut ? '' : ' non'}" data-rt="bug"><span class="rt-emoji" aria-hidden="true">🐞</span><span class="rt-carte-t"><b>Signaler un bug</b><small>Quelque chose cloche ? Joins une capture.</small></span><i class="ico chev">${ICONS.UI.chevron}</i></button>
      ${v ? `<button type="button" class="rt-carte vote" data-rt="aller-votes"><span class="rt-emoji" aria-hidden="true">🗳</span><span class="rt-carte-t"><b>Un vote t’attend</b><small>${esc(v.question)}</small></span><i class="ico chev">${ICONS.UI.chevron}</i></button>` : ''}
      ${noteHtml()}`;
  }
  async function envoyer() {
    const m = moteur(); if (!m || envoiEnCours || (vue !== 'idee' && vue !== 'bug')) return;
    const type = vue, b = brouillon[type], texte = b.texte.trim();
    if (!texte) { son('non'); dire(MSG.vide); return; }
    if (Array.from(texte).length > R.texte) { son('non'); dire(MSG.long); return; }
    envoiEnCours = true; noteTxt = ''; peindre();
    const r = await m.retourEnvoyer({ type, texte, image: b.image || null, infos: type === 'bug' ? infos() : null }).catch(() => ({ etat: 'erreur' }));
    envoiEnCours = false;
    if (r.etat === 'ok') {
      brouillon[type] = { texte: '', image: null }; dernierType = type; vue = 'merci'; noteTxt = '';
      son('tap'); if (d.buzz) d.buzz([10, 30, 10]); peindre(); return;
    }
    son('non');
    if (r.etat === 'pas-ouvert') { etat = 'pas-ouvert'; vue = 'accueil'; peindre(); return; }
    noteTxt = message(r); peindre(); dire(noteTxt);
  }
  async function choisirFichier(f) {
    if (!f || (vue !== 'idee' && vue !== 'bug')) return null;
    const pour = vue; dire('Préparation de la capture…');
    const r = await PHOTOS.preparer(f, { max: R.image, cote: R.cote }).catch(() => ({ ok: false, raison: 'illisible' }));
    if (!r.ok) { son('non'); dire(r.raison === 'lourd' ? 'Cette image est trop lourde, même réduite.' : 'Cette image ne s’ouvre pas.'); return r; }
    brouillon[pour].image = r.data; noteTxt = ''; if (vue === pour) peindre();
    return r;
  }

  // ─── « Votes » : les gros boutons, puis les résultats en barres ; les votes finis dessous ───
  function barres(v, fini) {
    const t = v.total || v.voix.reduce((a, x) => a + x, 0);
    return `<div class="rt-barres">${v.options.map((o, i) => { const pc = t ? Math.round((v.voix[i] * 100) / t) : 0, moi = v.moi === i;
      return `<div class="rt-barre${moi ? ' moi' : ''}${fini && t && v.voix[i] === Math.max(...v.voix) ? ' gagne' : ''}"><i class="rt-barre-fond" style="width:${pc}%"></i><span class="rt-barre-txt"><b>${esc(o)}</b>${moi ? '<small class="rt-moi">ton choix</small>' : ''}</span><span class="rt-barre-pc"><b>${pc} %</b><small>${v.voix[i]} voix</small></span></div>`; }).join('')}</div>
      <small class="rt-total">${t} votant${t > 1 ? 's' : ''}</small>`;
  }
  function carteVote(v) {
    const peut = rejoint(), choisir = peut && (v.moi == null || changer.has(v.n)), envol = voteEnVol.has(v.n);
    return `<section class="rt-vote" data-n="${v.n}"><small class="rt-reste">⏳ <span data-fin="${v.fin}">${esc(reste(v.fin - maintenant()))}</span></small><b class="rt-q">${esc(typo(v.question))}</b>
      ${choisir ? `<div class="rt-options">${v.options.map((o, i) => `<button type="button" class="rt-option${v.moi === i ? ' choisi' : ''}" data-rt="voter" data-n="${v.n}" data-o="${i}"${envol ? ' disabled' : ''}>${esc(o)}</button>`).join('')}</div>${changer.has(v.n) ? `<button type="button" class="rt-lien" data-rt="garder" data-n="${v.n}">Garder mon vote</button>` : ''}`
        : `${barres(v, false)}${peut ? `<button type="button" class="btn clair rt-changer" data-rt="changer" data-n="${v.n}"><b>Changer mon vote</b></button>` : btnRejoindre('Rejoins le classement pour voter')}`}</section>`;
  }
  function pageVotes() {
    if (etat === 'pas-ouvert') return bientot();
    if (!etat) return '<div class="tc-vide rt-vide"><span>Chargement…</span></div>';
    const l = enCours(), f = finis.concat(votes.filter((v) => v.fin <= maintenant() && !finis.some((x) => x.n === v.n)));
    let h = etat !== 'ok' ? `<p class="tc-reseau rt-reseau">${etat === 'hors-ligne' ? 'Pas de réseau : les votes reprendront tout seuls.' : 'Le serveur ne répond pas : il réessaie tout seul.'}</p>` : '';
    h += l.length ? l.map(carteVote).join('') : vide('🗳', 'Pas de vote en ce moment', 'Quand le boulanger en chef pose une question, tu votes ici : la suite du Fournil se décide ensemble.');
    h += noteHtml();
    if (f.length) h += `<h3 class="sous-titre rt-finis-titre">Votes terminés</h3>${f.slice(0, 5).map((v) => `<section class="rt-vote fini"><small class="rt-reste">Terminé${v.fin ? ` le ${esc(quand(v.fin))}` : ''}</small><b class="rt-q">${esc(typo(v.question))}</b>${barres(v, true)}</section>`).join('')}`;
    return h;
  }
  async function voter(n, o) {
    const m = moteur(), v = votes.find((x) => x.n === n); if (!m || !v || voteEnVol.has(n)) return;
    if (!rejoint()) { dire('Rejoins le classement pour voter'); return; }
    voteEnVol.add(n); peindre();
    const r = await m.voter(n, o).catch(() => ({ etat: 'erreur' }));
    voteEnVol.delete(n);
    if (r.etat === 'ok') {
      v.moi = o; if (Array.isArray(r.voix) && r.voix.length === v.options.length) v.voix = r.voix; if (Number.isInteger(r.total)) v.total = r.total;
      changer.delete(n); son('tap'); if (d.buzz) d.buzz(8); peindre(); majBouton();
      return;
    }
    if (r.etat === 'refus' && Array.isArray(r.voix) && r.voix.length === v.options.length) { v.voix = r.voix; if (Number.isInteger(r.total)) v.total = r.total; } // le serveur rend les voix même en refusant
    son('non'); peindre(); dire(message(r));
    if (r.etat === 'refus' && (r.erreur === 'fini' || r.erreur === 'absent')) lireVotes();
    if (r.etat === 'pas-ouvert') { etat = 'pas-ouvert'; peindre(); majBouton(); }
  }

  // ─── « Admin » : les retours, créer un vote, les votes en cours ───
  function carteRetour(x) {
    const note = brouillon.notes[x.n] != null ? brouillon.notes[x.n] : x.note;
    return `<section class="rt-ret ${x.type}" data-n="${x.n}">
      <div class="rt-ret-tete"><span class="rt-type">${x.type === 'bug' ? '🐞 Bug' : '💡 Idée'}</span><b>${esc(x.pseudo || 'Boulanger')}</b><small>${x.cree ? esc(quand(x.cree)) : ''}</small><i class="rt-etat ${x.etat}">${esc(ETATS[x.etat])}</i></div>
      <p class="rt-txt">${esc(x.texte)}</p>
      ${x.aImage ? `<button type="button" class="rt-img" data-rt="image" data-n="${x.n}" aria-label="Voir la capture"><img alt="La capture de ${esc(x.pseudo || 'ce boulanger')}"><span>📷 Voir la capture</span></button>` : ''}
      ${x.infos ? `<details class="rt-infos-a"><summary>Infos</summary>${infosHtml(x.infos)}</details>` : ''}
      <label class="rt-champ petit"><input type="text" data-champ="note" data-n="${x.n}" maxlength="${R.note}" value="${esc(note)}" placeholder="Une note (facultative)" aria-label="La note"></label>
      <div class="rt-etats" role="group" aria-label="L’état">${['vu', 'fait', 'refuse'].map((k) => `<button type="button" class="rt-etat-b ${k}${x.etat === k ? ' actif' : ''}" data-rt="etat" data-n="${x.n}" data-etat="${k}">${ETATS[k]}</button>`).join('')}</div>
    </section>`;
  }
  function pageAdmin() {
    let h = `<div class="segments rt-admin-vues" role="group" aria-label="L’admin"><button type="button" data-rt="admin-vue" data-v="retours" class="${adminVue === 'retours' ? 'actif' : ''}">Retours${nouveaux ? ` (${nouveaux > 29 ? '30+' : nouveaux})` : ''}</button><button type="button" data-rt="admin-vue" data-v="votes" class="${adminVue === 'votes' ? 'actif' : ''}">Votes</button></div>`;
    if (adminVue === 'votes') {
      const b = brouillon.vote;
      h += `<h3 class="rt-h3">Créer un vote</h3>
        <label class="rt-champ petit"><input type="text" data-champ="question" maxlength="200" value="${esc(b.question)}" placeholder="La question : quelle recette ensuite ?" aria-label="La question"></label>
        <div class="rt-opts">${b.options.map((o, i) => `<label class="rt-champ petit rt-opt"><input type="text" data-champ="option" data-i="${i}" maxlength="60" value="${esc(o)}" placeholder="Option ${i + 1}" aria-label="Option ${i + 1}">${b.options.length > 2 ? `<button type="button" class="tc-retirer" data-rt="moins" data-i="${i}" aria-label="Retirer l’option ${i + 1}"><i class="ico">${ICONS.UI.fermer}</i></button>` : ''}</label>`).join('')}
        ${b.options.length < 4 ? '<button type="button" class="rt-lien" data-rt="plus">+ Une option</button>' : ''}</div>
        <small class="rt-etiquette">Durée</small>
        <div class="segments rt-durees" role="group" aria-label="La durée">${DUREES.map(([hh, t]) => `<button type="button" data-rt="duree" data-h="${hh}" class="${b.heures === hh ? 'actif' : ''}">${t}</button>`).join('')}</div>
        ${noteHtml()}
        <button type="button" class="btn large lavande" data-rt="creer"><b>Créer le vote</b></button>
        <h3 class="sous-titre">Votes en cours</h3>`;
      const l = enCours();
      h += l.length ? l.map((v) => `<section class="rt-vote admin" data-n="${v.n}"><small class="rt-reste">⏳ <span data-fin="${v.fin}">${esc(reste(v.fin - maintenant()))}</span></small><b class="rt-q">${esc(typo(v.question))}</b>${barres(v, false)}<button type="button" class="btn ${confirmer === v.n ? 'rouge' : 'clair'} rt-fermer-vote" data-rt="fermer-vote" data-n="${v.n}"><b>${confirmer === v.n ? 'Oui, fermer ce vote' : 'Fermer'}</b></button></section>`).join('')
        : '<p class="sous">Aucun vote en cours.</p>';
      return h;
    }
    h += `<div class="segments rt-filtre" role="group" aria-label="Le filtre"><button type="button" data-rt="filtre" data-f="nouveau" class="${filtre === 'nouveau' ? 'actif' : ''}">Nouveaux</button><button type="button" data-rt="filtre" data-f="tout" class="${filtre === 'tout' ? 'actif' : ''}">Tous</button></div>`;
    h += noteHtml();
    if (!adminEtat && !retours.length) return h + '<div class="tc-vide rt-vide"><span>Chargement…</span></div>';
    if (!retours.length) return h + (adminEtat === 'ok' ? vide('✨', filtre === 'nouveau' ? 'Rien de nouveau' : 'Aucun retour', filtre === 'nouveau' ? 'Tous les retours ont été lus.' : 'Personne n’a encore écrit.') : `<p class="tc-reseau rt-reseau">${adminEtat === 'hors-ligne' ? 'Pas de réseau.' : 'Le serveur ne répond pas.'}</p>`);
    h += retours.map(carteRetour).join('');
    if (plusAnciens) h += '<button type="button" class="btn large clair" data-rt="plus-anciens"><b>Plus anciens</b></button>';
    return h;
  }
  async function voirImage(btn) {
    const n = +btn.dataset.n, m = moteur(); if (!m) return;
    if (images.has(n)) { const data = images.get(n); if (data) zoomer(data); return; }
    btn.classList.add('charge');
    const r = await m.adminRetourImage(n).catch(() => ({ etat: 'erreur' }));
    btn.classList.remove('charge');
    if (r.etat === 'ok' && r.data && IMG_OK.test(r.data)) { images.set(n, r.data); while (images.size > 12) images.delete(images.keys().next().value); btn.querySelector('img').src = r.data; btn.classList.add('chargee'); return; }
    if (r.etat === 'ok') { btn.classList.add('effacee'); btn.disabled = true; btn.querySelector('span').textContent = 'Capture effacée'; return; } // effacée après 30 jours
    dire(message(r));
  }
  async function changerEtat(n, k) {
    const m = moteur(), x = retours.find((y) => y.n === n); if (!m || !x) return;
    const note = String(brouillon.notes[n] != null ? brouillon.notes[n] : x.note || '').trim();
    const r = await m.adminRetourEtat(n, k, note).catch(() => ({ etat: 'erreur' }));
    if (r.etat === 'ok') {
      const avant = x.etat; x.etat = k; x.note = note; delete brouillon.notes[n];
      if (avant === 'nouveau' && k !== 'nouveau') nouveaux = Math.max(0, nouveaux - 1);
      son('tap'); peindre(); majBouton(); return;
    }
    son('non'); dire(r.etat === 'refus' && r.erreur === 'long' ? 'La note : 300 caractères au plus.' : r.etat === 'refus' && r.erreur === 'absent' ? 'Ce retour n’existe plus.' : r.etat === 'refus' && r.erreur === 'etat' ? 'Cet état n’existe pas.' : message(r));
    if (r.etat === 'refus' && r.erreur === 'pas-admin') { admin = false; majOnglets(); peindre(); majBouton(); }
  }
  async function creerVote() {
    const m = moteur(), b = brouillon.vote; if (!m) return;
    const opts = b.options.map((o) => o.trim()).filter(Boolean);
    if (!b.question.trim()) { son('non'); dire(MSG.question); return; }
    if (opts.length < 2) { son('non'); dire(MSG.options); return; }
    const r = await m.adminVoteCreer(b.question, opts, b.heures).catch(() => ({ etat: 'erreur' }));
    if (r.etat === 'ok') { brouillon.vote = { question: '', options: ['', ''], heures: 24 }; son('tap'); noteTxt = ''; await lireVotes(); peindre(); dire('Le vote est ouvert : il s’affiche dans la boutique.'); return; }
    son('non'); dire(message(r));
  }
  async function fermerVote(n) {
    const m = moteur(); if (!m) return;
    if (confirmer !== n) { confirmer = n; peindre(); return; }
    confirmer = 0;
    const r = await m.adminVoteFermer(n).catch(() => ({ etat: 'erreur' }));
    if (r.etat === 'ok') { son('tap'); votes = votes.filter((v) => v.n !== n); await lireVotes(); peindre(); dire('Le vote est fermé.'); return; }
    son('non'); peindre(); dire(message(r));
  }

  function zoomer(data) { if (!IMG_OK.test(data)) return; zoom.querySelector('img').src = data; zoom.hidden = false; }
  function fermerZoom() { if (zoom && !zoom.hidden) { zoom.hidden = true; zoom.querySelector('img').removeAttribute('src'); } }

  // ─── le branchement ───
  // deps : { classement() (le moteur, null sans configuration), st(), save(), son, buzz, audio, ouvert() (la feuille du jeu se ferme),
  //          ferme() (retour à la boutique), rejoindre() (la feuille du classement), quartier() (le nom du quartier de la boutique) }
  function init(deps) {
    d = deps; el = $('#idees'); bouton = $('#b-idees'); bandeau = $('#vote-bandeau'); if (!el) return;
    corps = $('#rt-corps'); fichier = $('#rt-fichier'); zoom = $('#rt-zoom');
    if (window.__retoursPas) Object.assign(pas, window.__retoursPas); // les tests : des lectures plus rapprochées
    if (bouton) bouton.addEventListener('click', () => { if (d.audio) d.audio(); son('tap'); ouvrir(admin && nouveaux ? 'admin' : 'ecrire'); }); // l'ampoule : « Écrire » (l'admin : ses retours nouveaux)
    if (bandeau) bandeau.addEventListener('click', () => { if (d.audio) d.audio(); son('tap'); ouvrir('votes'); });
    el.addEventListener('click', (e) => {
      const o = e.target.closest('[data-rt-onglet]'); if (o && el.contains(o)) { son('tap'); choisirOnglet(o.dataset.rtOnglet); return; }
      const t = e.target.closest('[data-rt]'); if (!t || !el.contains(t)) return;
      const a = t.dataset.rt, n = +t.dataset.n;
      if (a === 'fermer') { son('tap'); fermer(); }
      else if (a === 'zoom') fermerZoom();
      else if (a === 'rejoindre') { fermer(); if (d.rejoindre) d.rejoindre(); }
      else if (a === 'idee' || a === 'bug') { if (!rejoint()) { son('non'); dire(MSG['pas-rejoint']); return; } son('tap'); vue = a; noteTxt = ''; peindre(); corps.scrollTop = 0; }
      else if (a === 'accueil') { son('tap'); vue = 'accueil'; noteTxt = ''; peindre(); }
      else if (a === 'aller-votes') { son('tap'); choisirOnglet('votes'); }
      else if (a === 'envoyer') envoyer();
      else if (a === 'photo') { fichier.value = ''; fichier.click(); }
      else if (a === 'retirer') { if (brouillon[vue]) brouillon[vue].image = null; peindre(); }
      else if (a === 'voter') voter(n, +t.dataset.o);
      else if (a === 'changer') { son('tap'); changer.add(n); peindre(); }
      else if (a === 'garder') { changer.delete(n); peindre(); }
      else if (a === 'admin-vue') { son('tap'); adminVue = t.dataset.v === 'votes' ? 'votes' : 'retours'; confirmer = 0; noteTxt = ''; peindre(); if (adminVue === 'retours') lireRetours(); else lireVotes(); }
      else if (a === 'filtre') { const f = t.dataset.f === 'tout' ? 'tout' : 'nouveau'; if (f !== filtre) { filtre = f; retours = []; adminEtat = ''; peindre(); lireRetours(); } }
      else if (a === 'plus-anciens') lireRetours(true);
      else if (a === 'image') { if (t.classList.contains('chargee')) zoomer(images.get(n) || ''); else voirImage(t); }
      else if (a === 'etat') changerEtat(n, t.dataset.etat);
      else if (a === 'duree') { brouillon.vote.heures = +t.dataset.h; peindre(); }
      else if (a === 'plus') { if (brouillon.vote.options.length < 4) brouillon.vote.options.push(''); peindre(); }
      else if (a === 'moins') { if (brouillon.vote.options.length > 2) brouillon.vote.options.splice(+t.dataset.i, 1); peindre(); }
      else if (a === 'creer') creerVote();
      else if (a === 'fermer-vote') fermerVote(n);
    });
    // les champs : chaque frappe va dans le brouillon (une feuille repeinte retrouve ce qu'on avait écrit)
    el.addEventListener('input', (e) => {
      const t = e.target, c = t && t.dataset ? t.dataset.champ : ''; if (!c) return;
      if (noteTxt) dire(''); // on corrige : l'ancien refus s'efface
      if (c === 'texte' && brouillon[vue]) {
        brouillon[vue].texte = t.value; const k = corps.querySelector('.rt-compte'), nb = Array.from(t.value).length;
        if (k) { k.textContent = `${nb}/${R.texte}`; k.classList.toggle('discret', nb <= R.texte - 100); }
      } else if (c === 'note') brouillon.notes[+t.dataset.n] = t.value;
      else if (c === 'question') brouillon.vote.question = t.value;
      else if (c === 'option') brouillon.vote.options[+t.dataset.i] = t.value;
    });
    fichier.addEventListener('change', () => { const f = fichier.files && fichier.files[0]; if (f) choisirFichier(f); });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || !ouvert()) return; if (!zoom.hidden) fermerZoom(); else fermer(); });
    document.addEventListener('visibilitychange', () => {
      if (!visible()) { clearTimeout(minuteur); clearTimeout(minuteurAdmin); clearInterval(horloge); minuteur = minuteurAdmin = horloge = 0; return; } // page cachée : plus aucune lecture
      planifier(maintenant() - lusA > R.retour); planifierAdmin(); battre();
    });
    window.addEventListener('online', () => planifier(true));
    // une feuille du jeu (ou le chat) qui s'ouvre ou se ferme : le bandeau se cache ou revient
    try { const mo = new MutationObserver(() => majBandeau()); for (const s of ['#feuille', '#tchat']) { const x = $(s); if (x) mo.observe(x, { attributes: true, attributeFilter: ['hidden'] }); } } catch (e) { /* rien */ }
    majOnglets(); majBouton();
    if (moteur()) { clearTimeout(minuteur); minuteur = setTimeout(() => { tour(); verifierAdmin(); }, 4000); } // la première lecture (la pastille, le bandeau), 4 s après le lancement, si l'on a rejoint
  }
  // le classement a bougé (rejoint, quitté, un autre pseudo) : les votes se relisent (moi change), l'admin se redemande
  let signature = '';
  function surClassement() {
    const r = resume(), s = r && r.rejoint ? `${r.pseudo}` : '';
    majBouton();
    if (s === signature) return; signature = s;
    if (!d || !moteur()) return;
    changer.clear(); if (etat !== 'pas-ouvert' && (s || ouvert())) { lusA = 0; lireVotes(); } verifierAdmin(true);
    if (!s && !ouvert()) { votes = []; finis = []; etat = etat === 'pas-ouvert' ? etat : ''; majBouton(); } // quitté le classement : plus de bandeau ni de pastille
    if (ouvert()) peindre();
  }

  return {
    init, ouvrir, fermer, lireVotes, choisirFichier, majBouton, majBandeau, surClassement, infos, reste, R,
    get ouvert() { return ouvert(); },
    etat: () => ({ etat, onglet, vue, admin, nouveaux, votes: JSON.parse(JSON.stringify(votes)), finis: finis.length, aVoter: aVoter().length, retours: retours.length, filtre,
      brouillon: { idee: { texte: brouillon.idee.texte, image: brouillon.idee.image ? brouillon.idee.image.length : 0 }, bug: { texte: brouillon.bug.texte, image: brouillon.bug.image ? brouillon.bug.image.length : 0, type: brouillon.bug.image ? (/^data:(image\/\w+)/.exec(brouillon.bug.image) || [])[1] : '' } },
      minuteur: !!minuteur, minuteurAdmin: !!minuteurAdmin }),
  };
})();
