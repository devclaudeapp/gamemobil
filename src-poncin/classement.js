/* OPÉRATION PONCIN — le classement du butin entre amis (mode Extraction). Après chaque partie d'Extraction, le téléphone publie la
   LIGNE du joueur (PEXTRACTION.resultat().extraction.joueurs[i] : valeur, primes, extrait, zoneSemaine, score) ; le serveur
   (supabase/poncin-butin.sql) compte ses pièces exactement comme PBUTIN.deposer compte le gain, et range « Cette semaine » (pièces,
   parties, extractions réussies, du lundi 0 h au dimanche, heure de Paris) et « Records » (meilleur score d'une partie, total depuis
   l'arrivée), avec la pastille « en ligne » (vu il y a moins de 4 min) comme au Fournil.
   Une partie pure (pseudo, pièces d'une ligne, état local, réponses nettoyées), testée dans Node, et une partie réseau : les
   fonctions Supabase appelées par supabase-js (window.supabase, vendor/supabase.min.js) avec la clé PUBLIQUE de poncin/config.js.
   Sans configuration, sans supabase-js ou sans réseau, rien ne part et le jeu marche comme avant.
   Toutes les fonctions rendent une promesse qui ne rejette JAMAIS : { ok, erreur, … } ; erreur : null, ou
     'absent' (pas de configuration ou pas de supabase-js), 'hors-ligne', 'lent' (pas de réponse en 8 s), 'pas-installe' (les
     fonctions SQL ne sont pas collées sur le projet), 'erreur' (autre), 'ligne' (ligne illisible), 'periode' (période inconnue),
     ou la réponse du serveur : 'jeton', 'pseudo_invalide', 'pseudo_pris', 'valeur', 'trop_vite', 'quota', 'complet', 'inconnu'.
   L'identité (id tiré au hasard, jeton secret de 64 chiffres hexadécimaux dont le serveur ne garde que l'empreinte) vit dans
   localStorage sous sa propre clé, 'poncin.classement' — PAS dans la sauvegarde 'poncin.v2' : ui.js réécrit celle-ci en entier depuis
   sa copie en mémoire (un champ ajouté par ici serait effacé à sa sauvegarde suivante), et le jeton n'a pas à voyager avec elle.
   API : PCLASSEMENT.publier(ligne, { pseudo }) ; .lire('semaine' | 'records') ; .vu() ; .retirer() ; .etat() ; .disponible() ;
     creer(env) (un moteur à part, pour les tests : { config, supabase, stockage, maintenant, enLigne, delaiMax }) ; outils purs :
     gainDe(ligne), argsDe(ligne), pseudoPour(brut), verifierPseudo(p), normaliserPseudo(p), BORNES. Détail : src-poncin/ARCHITECTURE.md,
     « Classement du butin ». */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCLASSEMENT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CLE = 'poncin.classement', VERSION = 1;
  const PERIODES = ['semaine', 'records'];
  const REGLES = {
    delaiMax: 8e3, // un appel abandonné au bout de 8 s
    limite: 50, // les 50 premiers
    vu: 60e3, // un battement (poncin_vu) toutes les 60 s au plus : « en ligne » dure 4 min
  };
  // les bornes du serveur (supabase/poncin-butin.sql, poncin_bornes : leur calcul y est expliqué), pour information
  const BORNES = { valeur: 3040, primes: 5750, score: 12770, gain: 10988, ecart: 120, partiesJour: 60, bonus: 0.25 };

  const fin = (v) => typeof v === 'number' && v - v === 0;
  const entier = (v) => (fin(+v) && v !== null && v !== '' ? Math.max(0, Math.round(+v)) : 0);

  // ─── les pièces d'une ligne, exactement comme PBUTIN.deposer : sorti, (valeur + primes) × 1,25 dans la zone de la semaine ───
  function gainDe(l) {
    if (!l || typeof l !== 'object' || !l.extrait) return 0;
    const g = entier(l.valeur) + Math.min(10000, entier(l.primes));
    return l.zoneSemaine && g > 0 ? Math.round(g * (1 + BORNES.bonus)) : g;
  }
  // les paramètres de poncin_publier tirés d'une ligne (des entiers ; pas sorti : ni valeur ni primes, comme le jeu)
  function argsDe(l) {
    const extrait = !!l.extrait, valeur = extrait ? entier(l.valeur) : 0, primes = extrait ? entier(l.primes) : 0;
    return { p_valeur: valeur, p_primes: primes, p_extrait: extrait, p_bonus: !!l.zoneSemaine, p_score: Math.max(entier(l.score), valeur + primes) };
  }

  // ─── le pseudo : mêmes règles que le serveur (poncin_pseudo_propre, recopiée de fournil_pseudo_propre ; src/classement.js) ───
  // 2 à 16 caractères : lettres A-Z, lettres accentuées (latin et latin étendu A, de À à ž, sans × ni ÷ ni ı Ĳ ĳ ĸ Ŀ ŀ ŉ ſ), chiffres,
  // espace, - _ ' . ; au moins une lettre ou un chiffre
  const PSEUDO_MIN = 2, PSEUDO_MAX = 16;
  const LETTRES = '0-9A-Za-zÀ-ÖØ-öø-İĴ-ķĹ-ľŁ-ňŊ-ž';
  const PSEUDO_OK = new RegExp(`^[${LETTRES} _'.-]+$`), UNE_LETTRE = new RegExp(`[${LETTRES}]`), INTERDIT = new RegExp(`[^${LETTRES} _'.-]`, 'g');
  function normaliserPseudo(p) { // les blancs repliés, l'apostrophe typographique du clavier de l'iPhone remplacée par la droite
    let s = String(p == null ? '' : p);
    try { s = s.normalize('NFC'); } catch (e) { /* rien */ }
    return s.replace(/[‘’ʼ`´]/g, "'").replace(/[\s\u0085]+/g, ' ').trim();
  }
  function verifierPseudo(p) {
    const pseudo = normaliserPseudo(p), n = Array.from(pseudo).length;
    if (!n) return { ok: false, pseudo, raison: 'vide' };
    if (n < PSEUDO_MIN) return { ok: false, pseudo, raison: 'court', n };
    if (n > PSEUDO_MAX) return { ok: false, pseudo, raison: 'long', n };
    if (!PSEUDO_OK.test(pseudo)) return { ok: false, pseudo, raison: 'caracteres', interdits: Array.from(new Set(pseudo.match(INTERDIT) || [])) };
    if (!UNE_LETTRE.test(pseudo)) return { ok: false, pseudo, raison: 'lettre' };
    return { ok: true, pseudo, n };
  }
  // le pseudo du jeu en ligne (ui.js : le nom choisi, jusqu'à 20 caractères, ou « Bouquetin Express 42 ») rendu acceptable : les
  // caractères interdits enlevés ; trop long, on garde le premier et le dernier mot (« Bouquetin 42 »), sinon on coupe à 16 ; null s'il
  // ne reste rien de valable
  function pseudoPour(brut) {
    let s = normaliserPseudo(normaliserPseudo(brut).replace(INTERDIT, ' '));
    if (Array.from(s).length > PSEUDO_MAX) {
      const mots = s.split(' '), court = mots.length > 2 ? `${mots[0]} ${mots[mots.length - 1]}` : '';
      s = court && Array.from(court).length <= PSEUDO_MAX ? court : Array.from(s).slice(0, PSEUDO_MAX).join('').trim();
    }
    const v = verifierPseudo(s);
    return v.ok ? v.pseudo : null;
  }

  // ─── l'état local : localStorage 'poncin.classement', lu sans jamais casser (stockage indisponible, JSON abîmé, champs faux) ───
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, JETON = /^[0-9a-f]{64}$/;
  const etatNeuf = () => ({ v: VERSION, id: null, jeton: null, pseudo: '', rejoint: false });
  function nettoyerEtat(s) {
    const e = etatNeuf();
    if (!s || typeof s !== 'object' || Array.isArray(s)) return e;
    if (typeof s.id === 'string' && UUID.test(s.id) && typeof s.jeton === 'string' && JETON.test(s.jeton)) { e.id = s.id.toLowerCase(); e.jeton = s.jeton; }
    if (typeof s.pseudo === 'string') { const v = verifierPseudo(s.pseudo); if (v.ok) e.pseudo = v.pseudo; }
    e.rejoint = s.rejoint === true && !!e.id && !!e.pseudo;
    return e;
  }
  function lireEtat(stockage) {
    let s = null;
    try { const brut = stockage ? stockage.getItem(CLE) : null; s = brut ? JSON.parse(brut) : null; } catch (e) { s = null; }
    return nettoyerEtat(s);
  }
  function ecrireEtat(stockage, etat) { try { if (stockage) stockage.setItem(CLE, JSON.stringify(etat)); return true; } catch (e) { return false; } }

  // ─── le hasard de l'identité : crypto si possible ───
  function octets(n) {
    const b = new Uint8Array(n);
    try { const c = (typeof crypto !== 'undefined' && crypto) || null; if (c && c.getRandomValues) { c.getRandomValues(b); return b; } } catch (e) { /* repli */ }
    for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  function nouvelId() {
    try { if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (e) { /* repli */ }
    const b = octets(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; const h = hex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const nouveauJeton = () => hex(octets(32));

  // ─── les réponses du serveur, nettoyées (jamais une valeur folle à l'écran) ───
  const n0 = (v) => (fin(v) && v >= 0 ? v : 0);
  const rangDe = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  const texte = (v, max) => String(v == null ? '' : v).slice(0, max);
  function nettoyerLigne(x) {
    return { rang: rangDe(x.rang), pseudo: texte(x.pseudo, 40), pieces: n0(x.pieces), parties: n0(x.parties), extractions: n0(x.extractions),
      record: n0(x.record), total: n0(x.total), moi: x.moi === true, enLigne: x.en_ligne === true };
  }
  function nettoyerClassement(d, periode) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.lignes)) return null;
    const lignes = d.lignes.slice(0, 100).filter((x) => x && typeof x === 'object').map(nettoyerLigne);
    const m = d.moi && typeof d.moi === 'object' ? nettoyerLigne(d.moi) : null;
    if (m) { m.moi = true; delete m.pseudo; }
    return { ok: true, erreur: null, periode, semaine: /^\d{4}-\d{2}-\d{2}$/.test(String(d.semaine || '')) ? d.semaine : '',
      joueurs: Math.max(n0(d.joueurs), lignes.length), enLigneN: n0(d.en_ligne_n), lignes, moi: m };
  }
  function nettoyerPublication(d) {
    const c = d.compte && typeof d.compte === 'object' ? { pieces: n0(d.compte.pieces), score: n0(d.compte.score), record: d.compte.record === true } : null;
    return { ok: d.ok === true, erreur: d.ok === true ? null : texte(d.erreur || 'erreur', 40), compte: c,
      semaine: { lundi: /^\d{4}-\d{2}-\d{2}$/.test(String(d.semaine || '')) ? d.semaine : '', rang: rangDe(d.rang_semaine), joueurs: n0(d.joueurs_semaine),
        pieces: n0(d.pieces), parties: n0(d.parties), extractions: n0(d.extractions) },
      records: { rang: rangDe(d.rang_records), joueurs: n0(d.joueurs), record: n0(d.record), total: n0(d.total), parties: n0(d.parties_total) },
      partiesJour: n0(d.parties_jour) };
  }

  // ─── un moteur : env = { config: objet | () => objet ({ supabaseUrl, supabaseKey }), supabase: lib | () => lib (supabase-js :
  //     createClient), stockage (localStorage), maintenant() (ms), enLigne() (navigator.onLine), delaiMax (ms) } ───
  function creer(env) {
    const E = env || {};
    const val = (x) => { try { return typeof x === 'function' ? x() : x; } catch (e) { return null; } };
    const maintenant = () => { const t = typeof E.maintenant === 'function' ? +E.maintenant() : Date.now(); return fin(t) ? t : Date.now(); };
    let etat = lireEtat(E.stockage), client = null, clientDe = '', dernierVu = -Infinity;
    const sauver = () => ecrireEtat(E.stockage, etat);

    function config() {
      const c = val(E.config);
      if (!c || typeof c !== 'object') return null;
      const url = typeof c.supabaseUrl === 'string' ? c.supabaseUrl.trim().replace(/\/+$/, '') : '', key = typeof c.supabaseKey === 'string' ? c.supabaseKey.trim() : '';
      return /^https?:\/\/\S+$/.test(url) && key ? { url, key } : null;
    }
    function obtenirClient() {
      const c = config(), L = val(E.supabase);
      if (!c || !L || typeof L.createClient !== 'function') return null;
      if (client && clientDe === c.url + ' ' + c.key) return client;
      try {
        client = L.createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'poncin-classement' } });
        clientDe = c.url + ' ' + c.key;
      } catch (e) { client = null; }
      return client && typeof client.rpc === 'function' ? client : null;
    }
    const disponible = () => !!config() && !!val(E.supabase) && typeof val(E.supabase).createClient === 'function';

    // un appel : { ok: true, data } ou { ok: false, erreur } ; jamais d'exception, jamais plus de delaiMax
    async function appeler(nom, args) {
      const cl = obtenirClient();
      if (!cl) return { ok: false, erreur: 'absent' };
      if (typeof E.enLigne === 'function' && val(E.enLigne) === false) return { ok: false, erreur: 'hors-ligne' };
      let minuteur = null;
      const delai = new Promise((res) => { minuteur = setTimeout(() => res({ lent: true }), fin(E.delaiMax) ? E.delaiMax : REGLES.delaiMax); });
      try {
        const r = await Promise.race([Promise.resolve().then(() => cl.rpc(nom, args)), delai]);
        if (!r || r.lent) return { ok: false, erreur: 'lent' };
        if (r.error) {
          const e = r.error, m = String((e && (e.message || e.details)) || e || '');
          if ((e && e.code === 'PGRST202') || r.status === 404 || /could not find the function/i.test(m)) return { ok: false, erreur: 'pas-installe' };
          if (/fetch|network|load failed|offline/i.test(m)) return { ok: false, erreur: 'hors-ligne' };
          return { ok: false, erreur: 'erreur' };
        }
        return r.data && typeof r.data === 'object' ? { ok: true, data: r.data } : { ok: false, erreur: 'erreur' };
      } catch (e) {
        return { ok: false, erreur: /fetch|network|load failed/i.test(String(e && e.message)) ? 'hors-ligne' : 'erreur' };
      } finally { clearTimeout(minuteur); }
    }

    // publier une partie (ligne) ; ligne null : seulement rejoindre le classement, ou changer de pseudo
    async function publier(ligne, o) {
      try {
        if (ligne != null && (typeof ligne !== 'object' || Array.isArray(ligne))) return { ok: false, erreur: 'ligne' };
        const brut = o && o.pseudo != null ? o.pseudo : etat.pseudo, pseudo = pseudoPour(brut);
        if (!pseudo) return { ok: false, erreur: 'pseudo_invalide' };
        if (!obtenirClient()) return { ok: false, erreur: 'absent' };
        if (!etat.id || !etat.jeton) { etat.id = nouvelId().toLowerCase(); etat.jeton = nouveauJeton(); etat.rejoint = false; sauver(); } // gardés AVANT l'appel : un envoi coupé réutilise la même identité
        const args = Object.assign({ p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo }, ligne ? argsDe(ligne) : {});
        const r = await appeler('poncin_publier', args);
        if (!r.ok) return { ok: false, erreur: r.erreur };
        const p = nettoyerPublication(r.data);
        if (p.ok) { etat.pseudo = pseudo; etat.rejoint = true; sauver(); }
        p.pseudo = p.ok ? pseudo : etat.pseudo;
        if (ligne && p.ok && p.compte && p.compte.pieces !== gainDe(ligne)) p.ecart = true; // le serveur n'a pas compté comme le jeu (ne devrait jamais arriver)
        return p;
      } catch (e) { return { ok: false, erreur: 'erreur' }; }
    }

    // lire le classement : 'semaine' (aux pièces) ou 'records' (au meilleur score d'une partie)
    async function lire(periode) {
      try {
        const p = periode == null ? 'semaine' : periode;
        if (PERIODES.indexOf(p) < 0) return { ok: false, erreur: 'periode' };
        const r = await appeler('poncin_classement', { p_periode: p, p_id: etat.rejoint ? etat.id : null, p_limite: REGLES.limite });
        if (!r.ok) return { ok: false, erreur: r.erreur };
        return nettoyerClassement(r.data, p) || { ok: false, erreur: 'erreur' };
      } catch (e) { return { ok: false, erreur: 'erreur' }; }
    }

    // un signe de vie (« en ligne ») : seulement si l'on a rejoint, et pas plus d'un toutes les 60 s (les autres : { ok, saute: true })
    async function vu() {
      try {
        if (!etat.rejoint || !etat.id) return { ok: false, erreur: 'inconnu' };
        const t = maintenant();
        if (t - dernierVu < REGLES.vu && t >= dernierVu) return { ok: true, erreur: null, saute: true };
        dernierVu = t;
        const r = await appeler('poncin_vu', { p_id: etat.id, p_jeton: etat.jeton });
        if (!r.ok) { dernierVu = -Infinity; return { ok: false, erreur: r.erreur }; }
        if (r.data.ok !== true) {
          const err = texte(r.data.erreur || 'erreur', 40);
          if (err === 'inconnu') { etat.rejoint = false; sauver(); } // effacé par le ménage : la prochaine partie le réinscrit
          return { ok: false, erreur: err };
        }
        return { ok: true, erreur: null };
      } catch (e) { return { ok: false, erreur: 'erreur' }; }
    }

    // quitter le classement : la ligne est effacée sur le serveur, l'identité oubliée ici (le pseudo reste proposé)
    async function retirer() {
      try {
        if (!etat.id || !etat.jeton) { etat.rejoint = false; sauver(); return { ok: true, erreur: null }; }
        const r = await appeler('poncin_retirer', { p_id: etat.id, p_jeton: etat.jeton });
        if (!r.ok) return { ok: false, erreur: r.erreur };
        if (r.data.ok !== true) return { ok: false, erreur: texte(r.data.erreur || 'erreur', 40) };
        etat = Object.assign(etatNeuf(), { pseudo: etat.pseudo }); sauver();
        return { ok: true, erreur: null };
      } catch (e) { return { ok: false, erreur: 'erreur' }; }
    }

    // pour l'interface : a-t-on rejoint, sous quel pseudo, le classement est-il joignable (configuration et supabase-js présents)
    const etatPublic = () => ({ rejoint: etat.rejoint, pseudo: etat.pseudo, disponible: disponible() });
    return { publier, lire, vu, retirer, etat: etatPublic, disponible };
  }

  // ─── dans le navigateur : poncin/config.js (window.PONCIN_CONFIG), supabase-js (window.supabase), localStorage, navigator.onLine ───
  function navigateur() {
    const w = typeof window !== 'undefined' ? window : null;
    let stockage = null; try { stockage = w && w.localStorage ? w.localStorage : null; } catch (e) { stockage = null; }
    return { config: () => (w ? w.PONCIN_CONFIG : null), supabase: () => (w ? w.supabase : null), stockage,
      enLigne: () => !(w && w.navigator && w.navigator.onLine === false) };
  }
  let defaut = null;
  const moteur = () => (defaut || (defaut = creer(navigateur())));

  return {
    VERSION, CLE, PERIODES, REGLES, BORNES, creer, gainDe, argsDe, pseudoPour, verifierPseudo, normaliserPseudo, lireEtat, nettoyerEtat,
    publier: (ligne, o) => moteur().publier(ligne, o), lire: (p) => moteur().lire(p), vu: () => moteur().vu(), retirer: () => moteur().retirer(),
    etat: () => moteur().etat(), disponible: () => moteur().disponible(),
  };
});
