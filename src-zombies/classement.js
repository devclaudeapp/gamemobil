/* DERNIER REMPART — le classement du DÉFI DU JOUR. Après chaque partie de défi, le téléphone publie { jour, score, vague, tues } ;
   le serveur (supabase/zombies-defi.sql) garde le meilleur score de chacun pour chaque jour et range « Aujourd'hui » (le meilleur
   score du défi du jour) et « Cette semaine » (la somme des meilleurs scores de chaque jour, du lundi au dimanche, heure de Paris).
   Une partie pure (le jour à Paris, les pseudos, les réponses nettoyées), testée dans Node, et une partie réseau : les fonctions
   Supabase appelées par supabase-js (window.supabase) avec la clé PUBLIQUE de zombies/config.js. Sans configuration, sans
   supabase-js, sans réseau ou sans le SQL collé sur le projet, rien ne part et le jeu marche comme avant (le meilleur score du jour
   reste gardé sur le téléphone, et part à la prochaine occasion).
   Toutes les fonctions rendent une promesse qui ne rejette JAMAIS : { ok, erreur, … } ; erreur : null, ou 'absent', 'hors-ligne',
   'lent' (8 s), 'pas-installe' (le SQL n'est pas collé), 'erreur', 'periode', ou la réponse du serveur : 'jeton', 'pseudo_invalide',
   'pseudo_pris', 'jour', 'valeur', 'trop_vite', 'quota', 'complet'.
   L'identité (id tiré au hasard, jeton secret de 64 chiffres hexadécimaux dont le serveur ne garde que l'empreinte) vit dans
   localStorage sous sa propre clé, 'zombies.classement' (pas dans la sauvegarde 'zombies.v1', que ui.js réécrit en entier).
   API : ZCLASSEMENT.creer(env) → { publier(partie | null, { pseudo }), lire('jour' | 'semaine', jour), etat(), disponible() } ;
         ZCLASSEMENT.jourParis(t), .lundiDe(jour), .verifierPseudo(p), .pseudoPour(p). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZCLASSEMENT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CLE = 'zombies.classement', VERSION = 1, PERIODES = ['jour', 'semaine'];
  const REGLES = { delaiMax: 8e3, limite: 50 };
  const fin = (v) => typeof v === 'number' && v - v === 0;
  const entier = (v) => (fin(+v) && v !== null && v !== '' ? Math.max(0, Math.round(+v)) : 0);
  const JOUR = /^\d{4}-\d{2}-\d{2}$/;

  // le jour à Paris (« 2026-11-03 »), heure d'été comme d'hiver ; sans Intl : UTC + 1 h
  function jourParis(t) {
    const d = new Date(fin(t) ? t : Date.now());
    try {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      const v = (k) => (p.find((x) => x.type === k) || {}).value;
      const s = `${v('year')}-${v('month')}-${v('day')}`;
      if (JOUR.test(s)) return s;
    } catch (e) { /* repli */ }
    return new Date(d.getTime() + 3600e3).toISOString().slice(0, 10);
  }
  function lundiDe(jour) { // le lundi de la semaine de ce jour (« AAAA-MM-JJ »)
    const d = new Date(jour + 'T12:00:00Z'); if (!fin(d.getTime())) return '';
    const k = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - k); return d.toISOString().slice(0, 10);
  }

  // les pseudos : les mêmes règles que le serveur (et que Poncin et le Fournil)
  const PSEUDO_MIN = 2, PSEUDO_MAX = 16;
  const LETTRES = '0-9A-Za-zÀ-ÖØ-öø-İĴ-ķĹ-ľŁ-ňŊ-ž';
  const PSEUDO_OK = new RegExp(`^[${LETTRES} _'.-]+$`), UNE_LETTRE = new RegExp(`[${LETTRES}]`), INTERDIT = new RegExp(`[^${LETTRES} _'.-]`, 'g');
  function normaliserPseudo(p) {
    let s = String(p == null ? '' : p);
    try { s = s.normalize('NFC'); } catch (e) { /* rien */ }
    return s.replace(/[‘’ʼ`´]/g, "'").replace(/[\s\u0085]+/g, ' ').trim();
  }
  function verifierPseudo(p) {
    const pseudo = normaliserPseudo(p), n = Array.from(pseudo).length;
    if (!n) return { ok: false, pseudo, raison: 'vide' };
    if (n < PSEUDO_MIN) return { ok: false, pseudo, raison: 'court' };
    if (n > PSEUDO_MAX) return { ok: false, pseudo, raison: 'long' };
    if (!PSEUDO_OK.test(pseudo)) return { ok: false, pseudo, raison: 'caracteres' };
    if (!UNE_LETTRE.test(pseudo)) return { ok: false, pseudo, raison: 'lettre' };
    return { ok: true, pseudo };
  }
  function pseudoPour(brut) {
    let s = normaliserPseudo(normaliserPseudo(brut).replace(INTERDIT, ' '));
    if (Array.from(s).length > PSEUDO_MAX) s = Array.from(s).slice(0, PSEUDO_MAX).join('').trim();
    const v = verifierPseudo(s);
    return v.ok ? v.pseudo : null;
  }

  // l'identité
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, JETON = /^[0-9a-f]{64}$/;
  function lireEtat(stockage) {
    const e = { v: VERSION, id: null, jeton: null, pseudo: '', rejoint: false };
    let s = null;
    try { const brut = stockage ? stockage.getItem(CLE) : null; s = brut ? JSON.parse(brut) : null; } catch (err) { s = null; }
    if (!s || typeof s !== 'object') return e;
    if (typeof s.id === 'string' && UUID.test(s.id) && typeof s.jeton === 'string' && JETON.test(s.jeton)) { e.id = s.id.toLowerCase(); e.jeton = s.jeton; }
    if (typeof s.pseudo === 'string' && verifierPseudo(s.pseudo).ok) e.pseudo = s.pseudo;
    e.rejoint = s.rejoint === true && !!e.id && !!e.pseudo;
    return e;
  }
  function octets(n) {
    const b = new Uint8Array(n);
    try { if (typeof crypto !== 'undefined' && crypto && crypto.getRandomValues) { crypto.getRandomValues(b); return b; } } catch (e) { /* repli */ }
    for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return b;
  }
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  function nouvelId() {
    try { if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch (e) { /* repli */ }
    const b = octets(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; const h = hex(b);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // les réponses nettoyées (rien d'inattendu n'arrive jusqu'à l'écran)
  const n0 = (v) => (fin(v) && v >= 0 ? v : 0);
  const rangDe = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  const texte = (v, max) => String(v == null ? '' : v).slice(0, max);
  const ligneDe = (x) => ({ rang: rangDe(x.rang), pseudo: texte(x.pseudo, 40), score: n0(x.score), vague: n0(x.vague), parties: n0(x.parties), moi: x.moi === true });
  function nettoyerClassement(d, periode) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.lignes)) return null;
    const lignes = d.lignes.slice(0, 100).filter((x) => x && typeof x === 'object').map(ligneDe);
    const moi = d.moi && typeof d.moi === 'object' ? Object.assign(ligneDe(d.moi), { moi: true, pseudo: '' }) : null;
    return { ok: true, erreur: null, periode, jour: JOUR.test(String(d.jour || '')) ? d.jour : '', lundi: JOUR.test(String(d.lundi || '')) ? d.lundi : '',
      joueurs: Math.max(n0(d.joueurs), lignes.length), lignes, moi };
  }
  function nettoyerPublication(d) {
    return { ok: d.ok === true, erreur: d.ok === true ? null : texte(d.erreur || 'erreur', 40), jour: JOUR.test(String(d.jour || '')) ? d.jour : '',
      record: d.record === true, meilleur: n0(d.meilleur), vague: n0(d.vague), parties: n0(d.parties), rang: rangDe(d.rang), joueurs: n0(d.joueurs) };
  }

  function creer(env) {
    const E = env || {};
    const val = (x) => { try { return typeof x === 'function' ? x() : x; } catch (e) { return null; } };
    let etat = lireEtat(E.stockage), client = null, clientDe = '';
    const sauver = () => { try { if (E.stockage) E.stockage.setItem(CLE, JSON.stringify(etat)); } catch (e) { /* rien */ } };
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
      try { client = L.createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'zombies-classement' } }); clientDe = c.url + ' ' + c.key; } catch (e) { client = null; }
      return client && typeof client.rpc === 'function' ? client : null;
    }
    const disponible = () => !!config() && !!val(E.supabase) && typeof val(E.supabase).createClient === 'function';

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

    // publier une partie de défi ({ jour, score, vague, tues }), ou seulement rejoindre / changer de pseudo (partie null)
    async function publier(partie, o) {
      try {
        const pseudo = pseudoPour(o && o.pseudo != null ? o.pseudo : etat.pseudo);
        if (!pseudo) return { ok: false, erreur: 'pseudo_invalide' };
        if (partie && (!JOUR.test(String(partie.jour || '')) || !(entier(partie.vague) >= 1))) return { ok: false, erreur: 'valeur' };
        if (!obtenirClient()) return { ok: false, erreur: 'absent' };
        if (!etat.id || !etat.jeton) { etat.id = nouvelId().toLowerCase(); etat.jeton = hex(octets(32)); etat.rejoint = false; sauver(); }
        const args = { p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo };
        if (partie) Object.assign(args, { p_jour: partie.jour, p_score: entier(partie.score), p_vague: entier(partie.vague), p_tues: entier(partie.tues) });
        const r = await appeler('zombies_publier', args);
        if (!r.ok) return { ok: false, erreur: r.erreur };
        const p = nettoyerPublication(r.data);
        if (p.ok) { etat.pseudo = pseudo; etat.rejoint = true; sauver(); }
        p.pseudo = p.ok ? pseudo : etat.pseudo;
        return p;
      } catch (e) { return { ok: false, erreur: 'erreur' }; }
    }
    async function lire(periode, jour) {
      try {
        const p = periode == null ? 'jour' : periode;
        if (PERIODES.indexOf(p) < 0) return { ok: false, erreur: 'periode' };
        const r = await appeler('zombies_classement', { p_periode: p, p_jour: JOUR.test(String(jour || '')) ? jour : null, p_id: etat.rejoint ? etat.id : null, p_limite: REGLES.limite });
        if (!r.ok) return { ok: false, erreur: r.erreur };
        return nettoyerClassement(r.data, p) || { ok: false, erreur: 'erreur' };
      } catch (e) { return { ok: false, erreur: 'erreur' }; }
    }
    return { publier, lire, disponible, etat: () => ({ pseudo: etat.pseudo, rejoint: etat.rejoint }) };
  }

  return { creer, jourParis, lundiDe, verifierPseudo, pseudoPour, nettoyerClassement, nettoyerPublication, REGLES, CLE };
});
