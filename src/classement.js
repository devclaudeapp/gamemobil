/* LE FOURNIL — le classement en ligne des boulangers : fortune totale (st.lifetime) et fortune de la semaine (depuis lundi, heure de Paris).
   Une partie pure, testée dans Node (lundi de Paris, pseudo, rangs, décision d'envoi, état local), et une partie réseau : de simples POST
   vers les fonctions Supabase du classement (PostgREST, /rest/v1/rpc/…), avec la clé PUBLIQUE de fournil/config.js. Aucune erreur ne remonte
   jamais au jeu : chaque appel rend un état ('ok', 'hors-ligne', 'lent' (pas de réponse en 8 s), 'pas-ouvert', 'erreur', 'absent'). Sans configuration (l'artefact Claude), rien ne part. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CLASSEMENT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CLE = 'fournil.classement';
  const REGLES = {
    ecartMin: 15e3, // jamais plus d'un envoi toutes les 15 s
    periode: 5 * 60e3, // un envoi toutes les 5 min quand la page est visible
    rafraichir: 30 * 60e3, // la fortune n'a pas bougé : un envoi quand même toutes les 30 min (changement de semaine)
    serveur: 10.5e3, // le serveur ne prend qu'un envoi toutes les 10 s par joueur : un changement de pseudo attend son tour
    delaiMax: 8e3, // un appel abandonné au bout de 8 s
    limite: 50, // les 50 premiers
  };

  // ─── le lundi de la semaine, heure de Paris (règle européenne : l'heure d'été va du dernier dimanche de mars au dernier dimanche d'octobre, à 1 h UTC) ───
  function decalageParis(ms) {
    const a = new Date(ms).getUTCFullYear();
    const dernierDimanche = (mois) => { const d = new Date(Date.UTC(a, mois + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
    return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 * 3600e3 : 3600e3;
  }
  function lundiParis(ms) { // 'AAAA-MM-JJ', comme date_trunc('week', now() at time zone 'Europe/Paris')::date
    const t = Number.isFinite(ms) ? ms : Date.now(), l = new Date(t + decalageParis(t)), j = (l.getUTCDay() + 6) % 7; // 0 = lundi
    return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - j)).toISOString().slice(0, 10);
  }
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateCourte(iso) { // '2026-10-05' → '5 oct.'
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${+m[3] === 1 ? '1er' : +m[3]} ${MOIS[+m[2] - 1] || ''}`.trim() : '';
  }

  // ─── le pseudo : mêmes règles que le serveur (fournil_pseudo_propre dans supabase/fournil-classement.sql) ───
  // 2 à 16 caractères : lettres A-Z, lettres accentuées (latin et latin étendu A, de À à ž, sans × ni ÷ ni les lettres qui imitent l, i ou la ponctuation :
  // ı Ĳ ĳ ĸ Ŀ ŀ ŉ ſ), chiffres, espace, - _ ' . ; au moins une lettre ou un chiffre
  const PSEUDO_MIN = 2, PSEUDO_MAX = 16;
  const LETTRES = '0-9A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u0130\u0134-\u0137\u0139-\u013E\u0141-\u0148\u014A-\u017E';
  const PSEUDO_OK = new RegExp(`^[${LETTRES} _'.-]+$`), UNE_LETTRE = new RegExp(`[${LETTRES}]`), INTERDIT = new RegExp(`[^${LETTRES} _'.-]`, 'g');
  function normaliserPseudo(p) { // les espaces repliés, l'apostrophe typographique du clavier de l'iPhone remplacée par la droite
    let s = String(p == null ? '' : p);
    try { s = s.normalize('NFC'); } catch (e) { /* rien */ }
    return s.replace(/[‘’ʼ`´]/g, "'").replace(/[\s\u0085]+/g, ' ').trim(); // \u0085 : un blanc pour Postgres aussi
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
  function messagePseudo(v) { // la phrase sous le champ, en direct
    if (!v) return '';
    if (v.ok) return `Tu apparaîtras sous le nom «\u00A0${v.pseudo}\u00A0».`; // espaces insécables : les guillemets restent collés au pseudo
    return {
      vide: 'Choisis un pseudo : 2 à 16 caractères.',
      court: 'Encore un caractère : 2 au minimum.',
      long: `${v.n} caractères : 16 au plus.`,
      caracteres: `${(v.interdits || []).map((c) => `«\u00A0${c}\u00A0»`).join(' ')} : pas permis. Lettres (accents compris), chiffres, espaces, - _ ' . seulement.`,
      lettre: 'Il faut au moins une lettre ou un chiffre.',
    }[v.raison] || '';
  }

  // ─── les rangs : 1er, 2e, 3e… ───
  const rangOk = (n) => Number.isInteger(n) && n > 0;
  function rangTexte(n) { return rangOk(n) ? (n === 1 ? '1er' : `${n}e`) : '—'; }
  const boulangers = (n) => `${n} boulanger${n > 1 ? 's' : ''}`;
  function rangPhrase(rang, joueurs, periode) { // « 3e cette semaine sur 7 »
    if (!rangOk(rang)) return '';
    const sur = rangOk(joueurs) ? ` sur ${Math.max(joueurs, rang)}` : '';
    return `${rangTexte(rang)} ${periode === 'total' ? 'de tous les temps' : 'cette semaine'}${sur}`;
  }

  // ─── l'état local : localStorage 'fournil.classement', lu sans jamais casser (stockage indisponible, JSON abîmé, champs faux) ───
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, JETON = /^[0-9a-f]{64}$/;
  const fini = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const entier = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  const etatNeuf = () => ({ id: null, jeton: null, pseudo: '', rejoint: false, dernierEnvoi: 0, valeur: null, essai: 0, dernier: null });
  function nettoyerRang(r, avecLundi) {
    if (!r || typeof r !== 'object' || !entier(r.rang)) return null;
    const o = { rang: r.rang, joueurs: Math.max(r.rang, entier(r.joueurs) || r.rang) };
    if (avecLundi && typeof r.lundi === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lundi)) o.lundi = r.lundi;
    return o;
  }
  function nettoyerEtat(s) {
    const e = etatNeuf();
    if (!s || typeof s !== 'object' || Array.isArray(s)) return e;
    if (typeof s.id === 'string' && UUID.test(s.id) && typeof s.jeton === 'string' && JETON.test(s.jeton)) { e.id = s.id.toLowerCase(); e.jeton = s.jeton; }
    if (typeof s.pseudo === 'string') e.pseudo = normaliserPseudo(s.pseudo).slice(0, 40);
    e.rejoint = s.rejoint === true && !!e.id && verifierPseudo(e.pseudo).ok;
    e.dernierEnvoi = fini(s.dernierEnvoi); e.essai = fini(s.essai);
    e.valeur = typeof s.valeur === 'number' && Number.isFinite(s.valeur) ? s.valeur : null;
    if (s.dernier && typeof s.dernier === 'object') {
      const d = { semaine: nettoyerRang(s.dernier.semaine, true), total: nettoyerRang(s.dernier.total), quand: fini(s.dernier.quand) };
      if (d.semaine || d.total) e.dernier = d;
    }
    return e;
  }
  function lireEtat(stockage) {
    let brut = null;
    try { brut = stockage ? stockage.getItem(CLE) : null; } catch (e) { brut = null; }
    let s = null; try { s = brut ? JSON.parse(brut) : null; } catch (e) { s = null; }
    return nettoyerEtat(s);
  }
  function ecrireEtat(stockage, etat) { try { if (stockage) stockage.setItem(CLE, JSON.stringify(etat)); return true; } catch (e) { return false; } }

  // ─── le hasard : l'identifiant (UUID) et le jeton secret (32 octets en hexadécimal, jamais envoyé ailleurs qu'aux fonctions du classement) ───
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

  // ─── la décision d'envoyer sa fortune ───
  // raison : 'lancement', 'feuille', 'fond' (passage en arrière-plan), 'periodique'
  function deciderEnvoi(etat, fortune, maintenant, raison) {
    if (!etat || !etat.rejoint || !etat.id || !etat.jeton || !etat.pseudo) return { envoyer: false, pourquoi: 'pas-rejoint' };
    if (typeof fortune !== 'number' || !Number.isFinite(fortune) || fortune < 0) return { envoyer: false, pourquoi: 'valeur' };
    const depuis = (t) => (t > maintenant + 60e3 ? Infinity : maintenant - (t || 0)); // une horloge remise en arrière ne bloque pas tout
    const essai = depuis(etat.essai);
    if (essai < REGLES.ecartMin) return { envoyer: false, pourquoi: 'trop-tot' };
    if (raison === 'periodique' && essai < REGLES.periode) return { envoyer: false, pourquoi: 'periode' };
    if (etat.valeur === fortune && depuis(etat.dernierEnvoi) < REGLES.rafraichir) return { envoyer: false, pourquoi: 'inchange' };
    return { envoyer: true, pourquoi: raison || '' };
  }

  // ─── les réponses du serveur, vérifiées avant d'être affichées ───
  function nettoyerClassement(d) {
    const o = { semaine: '', joueurs: 0, lignes: [], moi: null };
    if (!d || typeof d !== 'object') return o;
    if (typeof d.semaine === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.semaine)) o.semaine = d.semaine.slice(0, 10);
    if (Array.isArray(d.lignes)) {
      for (const l of d.lignes.slice(0, 100)) {
        if (!l || typeof l !== 'object' || !entier(l.rang)) continue;
        const v = Number(l.valeur);
        o.lignes.push({ rang: l.rang, pseudo: String(l.pseudo == null ? '' : l.pseudo).slice(0, 40), valeur: Number.isFinite(v) ? v : 0, moi: l.moi === true });
      }
    }
    o.joueurs = Math.max(entier(d.joueurs) || 0, o.lignes.length);
    if (d.moi && typeof d.moi === 'object' && entier(d.moi.rang)) { const v = Number(d.moi.valeur); o.moi = { rang: d.moi.rang, valeur: Number.isFinite(v) ? v : 0 }; o.joueurs = Math.max(o.joueurs, o.moi.rang); }
    return o;
  }

  // ─── le réseau : un POST vers une fonction du classement ───
  function lireConfig(c) {
    if (!c || typeof c !== 'object') return null;
    const url = typeof c.supabaseUrl === 'string' ? c.supabaseUrl.trim().replace(/\/+$/, '') : '', key = typeof c.supabaseKey === 'string' ? c.supabaseKey.trim() : '';
    if (!/^https:\/\/[^/\s]+$/.test(url) || !key) return null;
    return { url, key, bearer: c.bearer !== false }; // bearer : aussi « Authorization: Bearer <clé publique> », comme supabase-js
  }
  const ABSENT = ['PGRST202', 'PGRST205', '42883', '42P01']; // fonction ou table pas encore créées : le SQL n'a pas été collé
  async function appeler(config, nom, corps, o) {
    o = o || {};
    if (!config) return { etat: 'absent' };
    try { if (o.enLigne && o.enLigne() === false) return { etat: 'hors-ligne', detail: 'navigateur' }; } catch (e) { /* rien */ }
    const f = o.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) return { etat: 'erreur', detail: 'fetch' };
    let ctrl = null; try { ctrl = typeof AbortController === 'function' ? new AbortController() : null; } catch (e) { ctrl = null; }
    const headers = { 'Content-Type': 'application/json', apikey: config.key };
    if (config.bearer) headers.Authorization = 'Bearer ' + config.key;
    const init = { method: 'POST', headers, body: JSON.stringify(corps), cache: 'no-store', credentials: 'omit', mode: 'cors' };
    if (ctrl) init.signal = ctrl.signal;
    if (o.keepalive) init.keepalive = true;
    const url = `${config.url}/rest/v1/rpc/${nom}`;
    let minuterie = 0;
    const delai = new Promise((res) => { minuterie = setTimeout(() => { try { if (ctrl) ctrl.abort(); } catch (e) { /* rien */ } res({ etat: 'lent', detail: 'delai' }); }, o.delaiMax || REGLES.delaiMax); });
    const essai = (async () => {
      let res;
      try { res = await f(url, init); } catch (e) {
        if (e && e.name === 'AbortError') return { etat: 'lent', detail: 'delai' }; // coupé par notre délai : le serveur traîne, le téléphone est bien connecté
        if (!init.keepalive) return { etat: 'hors-ligne', detail: (e && e.name) || 'reseau' };
        try { delete init.keepalive; res = await f(url, init); } catch (e2) { return { etat: 'hors-ligne', detail: (e2 && e2.name) || 'reseau' }; } // un navigateur qui refuse keepalive : un envoi normal
      }
      let txt = ''; try { txt = await res.text(); } catch (e) { return { etat: 'hors-ligne', detail: 'lecture' }; }
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
      if (!res.ok) {
        const code = data && typeof data === 'object' ? String(data.code || '') : '';
        if (res.status === 404 || ABSENT.includes(code)) return { etat: 'pas-ouvert', statut: res.status, code };
        return { etat: 'erreur', statut: res.status, code };
      }
      if (!data || typeof data !== 'object') return { etat: 'erreur', detail: 'reponse' };
      return { etat: 'ok', data };
    })();
    try { return await Promise.race([essai, delai]); } catch (e) { return { etat: 'erreur', detail: 'interne' }; } finally { clearTimeout(minuterie); }
  }

  // ─── le moteur : l'état du joueur, les envois automatiques, la liste, le pseudo ───
  // env : { config(), fetch, stockage, maintenant(), fortune(), enLigne(), visible(), attendre(ms), delaiMax }
  function creerMoteur(env) {
    const E = Object.assign({ maintenant: () => Date.now(), attendre: (ms) => new Promise((r) => setTimeout(r, ms)), enLigne: () => true, visible: () => true, fortune: () => NaN }, env || {});
    let etat = lireEtat(E.stockage);
    const ecouteurs = [], cache = { semaine: null, total: null }, charge = { semaine: false, total: false };
    const enVol = { semaine: null, total: null }; // une seule lecture de la liste à la fois par onglet : qui la redemande reçoit la même
    let enCours = null, statut = '', demarre = false, minuteur = 0;
    let retrait = false; // « Quitter » en route : plus aucun envoi automatique (fond, minuteur) tant que le serveur n'a pas répondu
    let nettoyage = null; // au lancement, l'effacement discret d'une inscription dont la réponse s'était perdue
    let ecrit = true; // la dernière écriture dans le stockage a-t-elle réussi ? (sinon, le stockage est en retard sur la mémoire)
    const config = () => { try { return lireConfig(E.config ? E.config() : null); } catch (e) { return null; } };
    const sauver = () => { ecrit = ecrireEtat(E.stockage, etat); return ecrit; };
    const prevenir = () => { for (const f of ecouteurs.slice()) { try { f(); } catch (e) { /* l'interface ne casse pas le moteur */ } } };
    const fortune = () => { try { const v = E.fortune(); return typeof v === 'number' ? Math.floor(v) : NaN; } catch (e) { return NaN; } };
    const rpc = (nom, corps, o) => appeler(config(), nom, corps, { fetch: E.fetch, enLigne: E.enLigne, delaiMax: E.delaiMax, keepalive: o && o.keepalive });

    // une autre fenêtre (l'appli installée et l'onglet du navigateur partagent le même stockage) a pu écrire :
    // on reprend son identité si elle a changé (pseudo, rejoint, quitté), sinon l'horaire du dernier essai le plus récent (15 s pour toutes les fenêtres)
    function resynchroniser() {
      if (enCours || !ecrit) return false; // un envoi en vol garde l'état qu'il a commencé ; un stockage en retard ne fait pas reculer la mémoire
      let brut = null; try { brut = E.stockage ? E.stockage.getItem(CLE) : null; } catch (e) { return false; }
      if (brut == null) return false; // stockage vide ou indisponible : on garde l'état en mémoire
      const f = lireEtat(E.stockage);
      if (f.id !== etat.id || f.jeton !== etat.jeton || f.rejoint !== etat.rejoint || f.pseudo !== etat.pseudo) { etat = f; cache.semaine = cache.total = null; prevenir(); return true; }
      etat.essai = Math.max(etat.essai, f.essai);
      if (f.dernierEnvoi > etat.dernierEnvoi) { etat.dernierEnvoi = f.dernierEnvoi; etat.valeur = f.valeur; etat.dernier = f.dernier; }
      return false;
    }
    function noterRangs(d, maintenant) { // la place de la semaine est rangée sous le lundi du SERVEUR (l'horloge du téléphone peut avoir quelques minutes d'écart)
      const lundi = typeof d.semaine === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.semaine) ? d.semaine.slice(0, 10) : lundiParis(maintenant), avant = etat.dernier || {};
      const jt = entier(d.joueurs_total) || entier(d.joueurs);
      const js = entier(d.joueurs_semaine) || (avant.semaine && avant.semaine.lundi === lundi ? avant.semaine.joueurs : null) || jt;
      const semaine = entier(d.rang_semaine) ? { rang: d.rang_semaine, joueurs: Math.max(d.rang_semaine, js || 0), lundi } : null;
      const total = entier(d.rang_total) ? { rang: d.rang_total, joueurs: Math.max(d.rang_total, jt || 0) } : null;
      etat.dernier = (semaine || total) ? { semaine, total, quand: maintenant } : etat.dernier;
    }
    // un envoi au serveur ; le pseudo ne change dans l'état local qu'une fois accepté
    async function publier(pseudo, valeur, o) {
      etat.essai = E.maintenant(); sauver();
      const r = await rpc('fournil_publier', { p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur }, o);
      statut = r.etat;
      if (r.etat !== 'ok') { prevenir(); return r; }
      const d = r.data || {};
      if (d.ok === true) {
        const t = E.maintenant(); etat.pseudo = pseudo; etat.dernierEnvoi = t; etat.valeur = valeur; noterRangs(d, t); sauver();
        for (const c of [cache.semaine, cache.total]) if (c) c.quand = 0; // les listes gardées ne montrent plus la bonne fortune : à relire au prochain coup d'œil
        prevenir();
        return { etat: 'ok', data: d };
      }
      prevenir();
      return { etat: 'refus', erreur: typeof d.erreur === 'string' ? d.erreur : 'inconnue', data: d };
    }
    // les envois automatiques : au lancement, toutes les 5 min, à l'ouverture de la feuille, au passage en arrière-plan
    function envoyer(raison, o) {
      if (!config()) return Promise.resolve({ etat: 'absent' });
      if (enCours) return enCours;
      if (retrait) return Promise.resolve({ etat: 'saute', pourquoi: 'retrait' }); // le joueur est en train de quitter : surtout ne pas le réinscrire
      resynchroniser();
      const v = fortune(), d = deciderEnvoi(etat, v, E.maintenant(), raison);
      if (!d.envoyer) return Promise.resolve({ etat: 'saute', pourquoi: d.pourquoi });
      enCours = publier(etat.pseudo, v, o).then((r) => {
        // la ligne n'est plus à nous (jeton), ou elle a été effacée par le ménage des 90 jours et son pseudo repris entre-temps (pseudo_pris) :
        // on sort du classement, le pseudo reste proposé, et on rejoindra avec une nouvelle identité
        if (r.etat === 'refus' && (r.erreur === 'jeton' || r.erreur === 'pseudo_pris')) { etat.rejoint = false; etat.id = null; etat.jeton = null; etat.dernier = null; sauver(); prevenir(); }
        return r;
      }).catch(() => ({ etat: 'erreur' })).then((r) => { enCours = null; return r; });
      return enCours;
    }
    // le serveur ne prend qu'un envoi ACCEPTÉ toutes les 10 s par joueur : on attend son tour plutôt que d'essuyer « trop vite ».
    // Un refus (pseudo déjà pris, jeton) ne compte pas : le pseudo suivant part aussitôt. siAttente(ms) prévient l'interface d'une vraie attente.
    async function attendreTour(siAttente) {
      if (enCours) { try { await enCours; } catch (e) { /* rien */ } }
      const depuis = etat.rejoint ? (etat.dernierEnvoi || 0) : 0;
      const ecart = E.maintenant() - depuis;
      if (depuis && ecart >= 0 && ecart < REGLES.serveur) {
        if (siAttente && REGLES.serveur - ecart > 1e3) { try { siAttente(REGLES.serveur - ecart); } catch (e) { /* rien */ } }
        await E.attendre(REGLES.serveur - ecart);
      }
    }
    // rejoindre le classement, ou changer de pseudo : le même envoi, avec le nouveau pseudo.
    // o.annule() : le joueur a touché « Annuler » pendant l'attente ; o.attente(ms) : une attente de plus d'une seconde commence
    async function choisirPseudo(brut, o) {
      const annule = () => { try { return !!(o && typeof o.annule === 'function' && o.annule()); } catch (e) { return false; } };
      const siAttente = o && typeof o.attente === 'function' ? o.attente : null;
      const v = verifierPseudo(brut);
      if (!v.ok) return { etat: 'invalide', raison: v.raison };
      if (!config()) return { etat: 'absent' };
      const valeur = fortune(); if (!Number.isFinite(valeur) || valeur < 0) return { etat: 'erreur', detail: 'valeur' };
      if (nettoyage) { try { await nettoyage; } catch (e) { /* rien */ } } // l'effacement d'une inscription fantôme passe d'abord : jamais de course avec la nouvelle
      resynchroniser();
      if (!etat.id || !etat.jeton) { etat.id = nouvelId(); etat.jeton = nouveauJeton(); sauver(); } // gardés avant l'envoi : une réponse perdue se rattrape au suivant
      await attendreTour(siAttente);
      if (annule()) return { etat: 'annule' };
      let r = await publier(v.pseudo, valeur);
      if (r.etat === 'refus' && r.erreur === 'trop_vite') {
        if (siAttente) { try { siAttente(REGLES.serveur); } catch (e) { /* rien */ } }
        await E.attendre(REGLES.serveur);
        if (annule()) return { etat: 'annule' };
        r = await publier(v.pseudo, valeur);
      }
      if (r.etat === 'refus' && r.erreur === 'jeton' && !etat.rejoint) {
        etat.id = nouvelId(); etat.jeton = nouveauJeton(); sauver(); await attendreTour(siAttente);
        if (annule()) return { etat: 'annule' };
        r = await publier(v.pseudo, valeur);
      }
      if (r.etat === 'ok') { etat.rejoint = true; sauver(); cache.semaine = cache.total = null; prevenir(); }
      return r;
    }
    async function quitter() {
      if (retrait) return { etat: 'occupe' };
      retrait = true; // plus aucun envoi automatique (fond, minuteur) tant que le retrait est en route
      let r;
      try {
        if (enCours) { try { await enCours; } catch (e) { /* rien */ } }
        resynchroniser(); // une autre fenêtre a peut-être déjà quitté, ou changé d'identité
        if (!etat.rejoint && !etat.id) return { etat: 'ok' };
        if (!config()) return { etat: 'absent' };
        r = etat.id && etat.jeton ? await rpc('fournil_retirer', { p_id: etat.id, p_jeton: etat.jeton }) : { etat: 'ok', data: { ok: true } };
      } finally { retrait = false; }
      statut = r.etat;
      if (r.etat !== 'ok') { prevenir(); return r; } // pas de réponse : on reste inscrit, avec son jeton, pour réessayer
      // (un refus « jeton » veut dire que la ligne n'est pas à nous : on oublie l'identité, comme pour un retrait réussi)
      const pseudo = etat.pseudo; etat = etatNeuf(); etat.pseudo = pseudo; sauver(); // une nouvelle identité au prochain retour ; le pseudo reste proposé
      cache.semaine = cache.total = null; prevenir();
      return { etat: 'ok' };
    }
    function charger(periode) {
      const p = periode === 'total' ? 'total' : 'semaine';
      if (!config()) return Promise.resolve({ etat: 'absent' });
      if (enVol[p]) return enVol[p]; // une lecture déjà partie : on la partage au lieu d'en lancer une deuxième
      charge[p] = true; resynchroniser(); // p_id doit être celui de l'identité en cours, même changée dans une autre fenêtre
      const lecture = rpc('fournil_classement', { p_periode: p, p_id: etat.rejoint ? etat.id : null, p_limite: REGLES.limite }).then((r) => {
        charge[p] = false; statut = r.etat;
        const t = E.maintenant();
        if (r.etat === 'ok') {
          const data = nettoyerClassement(r.data); cache[p] = { etat: 'ok', data, quand: t };
          if (etat.rejoint && data.moi) {
            const d = etat.dernier || { semaine: null, total: null, quand: t };
            d[p] = p === 'semaine' ? { rang: data.moi.rang, joueurs: data.joueurs, lundi: data.semaine || lundiParis(t) } : { rang: data.moi.rang, joueurs: data.joueurs };
            d.quand = t; etat.dernier = d; sauver();
          }
        } else cache[p] = { etat: r.etat, data: null, quand: t };
        return cache[p];
      }, () => { charge[p] = false; cache[p] = { etat: 'erreur', data: null, quand: E.maintenant() }; return cache[p]; });
      enVol[p] = lecture.then((c) => { enVol[p] = null; prevenir(); return c; });
      prevenir();
      return enVol[p];
    }
    // la feuille s'ouvre : la liste part tout de suite, et sa fortune en même temps (si on a rejoint) ; si elle a été acceptée, on relit la liste une fois
    function ouvrir(periode) {
      const p = periode === 'total' ? 'total' : 'semaine';
      const lecture = charger(p);
      envoyer('feuille').then((r) => { if (r && r.etat === 'ok') lecture.then(() => charger(p)); }).catch(() => { /* rien */ });
      return lecture;
    }
    function demarrer(o) {
      if (demarre || !config()) return false;
      demarre = true;
      const ecart = E.maintenant() - (etat.essai || 0);
      if (!etat.rejoint && etat.id && etat.jeton && !(etat.essai && ecart >= 0 && ecart < 30e3)) { // une inscription dont la réponse s'est perdue : on efface la ligne fantôme, sans bruit (pas si une autre fenêtre inscrit à l'instant)
        const id = etat.id, jeton = etat.jeton;
        nettoyage = rpc('fournil_retirer', { p_id: id, p_jeton: jeton }).then((r) => {
          if (r.etat === 'ok' && r.data && r.data.ok === true && !etat.rejoint && etat.id === id) { etat.id = null; etat.jeton = null; sauver(); } // sinon on garde l'identité : on réessaiera au prochain lancement
        }).catch(() => { /* rien */ }).then(() => { nettoyage = null; });
      }
      envoyer('lancement');
      const pas = (o && o.pas) || 60e3;
      if (o && o.minuteur === false) return true;
      minuteur = setInterval(() => { tick(); }, pas);
      return true;
    }
    function tick() { // le minuteur : un envoi toutes les 5 min, seulement quand la page est visible
      let vu = true; try { vu = E.visible(); } catch (e) { vu = true; }
      return vu ? envoyer('periodique') : Promise.resolve({ etat: 'saute', pourquoi: 'cachee' });
    }
    function arreter() { if (minuteur) clearInterval(minuteur); minuteur = 0; demarre = false; }
    function resume() { // pour l'interface : rejoint, pseudo, et les dernières places connues (celle de la semaine seulement si c'est cette semaine, ou une plus récente : le téléphone peut retarder sur le serveur)
      const t = E.maintenant(), d = etat.dernier || {}, lundi = lundiParis(t);
      return { disponible: !!config(), rejoint: etat.rejoint, pseudo: etat.pseudo, semaine: d.semaine && typeof d.semaine.lundi === 'string' && d.semaine.lundi >= lundi ? d.semaine : null, total: d.total || null, quand: d.quand || 0, statut };
    }
    return {
      disponible: () => !!config(), etat: () => etat, resume, cache: (p) => cache[p === 'total' ? 'total' : 'semaine'], enChargement: (p) => charge[p === 'total' ? 'total' : 'semaine'],
      envoyer, charger, ouvrir, choisirPseudo, quitter, demarrer, arreter, ecouter: (f) => { ecouteurs.push(f); },
      relire: () => { etat = lireEtat(E.stockage); prevenir(); return etat; },
      resynchroniser, tick,
    };
  }

  // ─── dans le navigateur : la configuration de fournil/config.js, localStorage, fetch, la visibilité de la page ───
  function navigateur(o) {
    const w = typeof window !== 'undefined' ? window : null;
    if (!w || !lireConfig(w.FOURNIL_CONFIG)) return null; // l'artefact Claude n'a pas de config : le classement s'y cache
    let stockage = null; try { stockage = w.localStorage; } catch (e) { stockage = null; }
    const m = creerMoteur({
      config: () => w.FOURNIL_CONFIG, fetch: (u, i) => w.fetch(u, i), stockage, fortune: o && o.fortune,
      enLigne: () => !(w.navigator && w.navigator.onLine === false), visible: () => !(w.document && w.document.visibilityState === 'hidden'),
    });
    if (w.document) { // au passage en arrière-plan : un dernier envoi qui survit à la fermeture (fetch keepalive)
      const fond = () => { m.envoyer('fond', { keepalive: true }); };
      w.document.addEventListener('visibilitychange', () => { if (w.document.visibilityState === 'hidden') fond(); });
      w.addEventListener('pagehide', fond);
    }
    // une autre fenêtre du jeu (appli installée + onglet) a changé le classement : on suit tout de suite
    try { w.addEventListener('storage', (e) => { if (!e || e.key === CLE || e.key === null) m.resynchroniser(); }); } catch (e) { /* rien */ }
    return m;
  }

  return { CLE, REGLES, PSEUDO_MIN, PSEUDO_MAX, lundiParis, decalageParis, dateCourte, normaliserPseudo, verifierPseudo, messagePseudo, rangTexte, rangPhrase, boulangers,
    etatNeuf, nettoyerEtat, lireEtat, ecrireEtat, nouvelId, nouveauJeton, deciderEnvoi, nettoyerClassement, lireConfig, appeler, creerMoteur, navigateur };
});
