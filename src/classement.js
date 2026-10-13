/* LE FOURNIL — le classement en ligne des boulangers, en POINTS DE BOULANGER (src/game.js : journées, défi, événements, Atelier, améliorations
   relatives à ses propres gains) : ceux de la semaine (depuis lundi, heure de Paris) et ceux depuis l'arrivée ; la fortune (st.lifetime) part aussi,
   affichée en petit, pour information. Serveur : supabase/fournil-classement.sql (version 4 : + l'événement « Le Quartier », ses billets envoyés
   avec p_quartier, son classement à part (periode 'quartier') et son podium final ; un serveur encore en version 3 ou 2 reste servi).
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
    recompenses: 30 * 60e3, // les récompenses relues toutes les 30 min au plus (au lancement et à l'ouverture de la feuille, plus tôt)
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
  const etatNeuf = () => ({ id: null, jeton: null, pseudo: '', rejoint: false, dernierEnvoi: 0, valeur: null, points: null, lundiPoints: '', quartier: null, essai: 0, dernier: null, recompenses: recompensesNeuves() });

  // ─── les récompenses du podium : les trois premiers de chaque semaine gagnent une tenue (toque et tablier) et une coupe, or, argent ou bronze ───
  // recompenses : { podiums: [{ semaine: 'AAAA-MM-JJ' (le lundi de la semaine du podium), rang: 1 | 2 | 3 }] du plus ancien au plus récent,
  //                 tenue: 'auto' (celle du dernier podium, la semaine qui suit ; par défaut) | null (aucune) | 'or' | 'argent' | 'bronze',
  //                 vu: le lundi du dernier podium déjà annoncé }. Gardées à vie sur le téléphone, même après avoir quitté le classement.
  const METAUX = ['or', 'argent', 'bronze'], JOUR = /^\d{4}-\d{2}-\d{2}$/;
  const metal = (rang) => METAUX[rang - 1] || null; // 1 → 'or', 2 → 'argent', 3 → 'bronze'
  const NOMS_METAL = { or: 'd’or', argent: 'd’argent', bronze: 'de bronze' }; // « la tenue d’or », « la coupe de bronze »
  const recompensesNeuves = () => ({ podiums: [], tenue: 'auto', vu: '', quartier: null, quartierPodium: null }); // quartier : son rang au podium final de l'événement « Le Quartier » (1, 2, 3), quartierPodium : les trois premiers
  function decalerSemaine(lundi, k) { // '2026-10-12', -1 → '2026-10-05'
    if (!JOUR.test(String(lundi || ''))) return '';
    const d = new Date(lundi + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7 * k); return d.toISOString().slice(0, 10);
  }
  function nettoyerPodiums(liste) { // une coupe par semaine (la meilleure, si deux sources se contredisent), triées de la plus ancienne à la plus récente
    const par = new Map();
    for (const p of Array.isArray(liste) ? liste.slice(0, 2000) : []) {
      if (!p || typeof p !== 'object' || !JOUR.test(String(p.semaine || '')) || ![1, 2, 3].includes(p.rang)) continue;
      const a = par.get(p.semaine); if (!a || p.rang < a.rang) par.set(p.semaine, { semaine: p.semaine, rang: p.rang });
    }
    return [...par.values()].sort((a, b) => (a.semaine < b.semaine ? -1 : a.semaine > b.semaine ? 1 : 0));
  }
  function nettoyerRecompenses(r) {
    const o = recompensesNeuves();
    if (!r || typeof r !== 'object' || Array.isArray(r)) return o;
    o.podiums = nettoyerPodiums(r.podiums);
    if (r.tenue === null || r.tenue === 'auto' || METAUX.includes(r.tenue)) o.tenue = r.tenue;
    if (typeof r.vu === 'string' && JOUR.test(r.vu)) o.vu = r.vu;
    if ([1, 2, 3].includes(r.quartier)) o.quartier = r.quartier;
    if (Array.isArray(r.quartierPodium)) o.quartierPodium = nettoyerPodiumQuartier(r.quartierPodium);
    return o;
  }
  function nettoyerPodiumQuartier(l) { return l.slice(0, 30).filter((x) => x && typeof x === 'object' && [1, 2, 3].includes(x.rang)).map((x) => { const v = Number(x.valeur); return { rang: x.rang, pseudo: String(x.pseudo == null ? '' : x.pseudo).slice(0, 40), valeur: Number.isFinite(v) ? v : 0 }; }); }
  const podiumDe = (rec, semaine) => (rec && semaine ? rec.podiums.find((p) => p.semaine === semaine) || null : null);
  // la tenue que porte le boulanger cette semaine (lundi : le lundi de la semaine en cours) : celle choisie si elle a été gagnée,
  // sinon (« automatique ») celle du podium de la semaine passée ; null : la tenue blanche de toujours
  function tenuePortee(rec, lundi) {
    if (!rec || rec.tenue === null) return null;
    if (METAUX.includes(rec.tenue) && rec.podiums.some((p) => metal(p.rang) === rec.tenue)) return rec.tenue;
    const p = podiumDe(rec, decalerSemaine(lundi, -1)); return p ? metal(p.rang) : null;
  }
  // la coupe posée sur le comptoir : celle du podium de la semaine passée, toute la semaine qui suit
  function coupeDuComptoir(rec, lundi) { const p = podiumDe(rec, decalerSemaine(lundi, -1)); return p ? metal(p.rang) : null; }
  // le podium à annoncer : le plus récent des podiums finis pas encore annoncés (autres : combien d'autres sont arrivés depuis la dernière visite)
  function aAnnoncer(rec, lundi) {
    if (!rec) return null;
    const neufs = rec.podiums.filter((p) => p.semaine > (rec.vu || '') && (!lundi || p.semaine < lundi));
    if (!neufs.length) return null;
    const p = neufs[neufs.length - 1]; return { semaine: p.semaine, rang: p.rang, metal: metal(p.rang), autres: neufs.length - 1 };
  }
  function tenuesGagnees(rec) { const g = new Set((rec ? rec.podiums : []).map((p) => metal(p.rang))); return METAUX.filter((m) => g.has(m)); }
  function phraseAnnonce(a) { // « Bravo ! 2e de la semaine : la tenue d’argent et la coupe d’argent sont à toi »
    if (!a || !a.metal) return '';
    const n = NOMS_METAL[a.metal]; return `Bravo ! ${rangTexte(a.rang)} de la semaine : la tenue ${n} et la coupe ${n} sont à toi`;
  }
  function nettoyerRang(r, avecLundi) {
    if (!r || typeof r !== 'object' || !entier(r.rang)) return null;
    const o = { rang: r.rang, joueurs: Math.max(r.rang, entier(r.joueurs) || r.rang) };
    if (Number.isInteger(r.points) && r.points >= 0) o.points = r.points;
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
    e.points = Number.isInteger(s.points) && s.points >= 0 ? s.points : null;
    e.lundiPoints = typeof s.lundiPoints === 'string' && JOUR.test(s.lundiPoints) ? s.lundiPoints : '';
    e.quartier = typeof s.quartier === 'number' && Number.isFinite(s.quartier) && s.quartier >= 0 ? s.quartier : null;
    if (s.dernier && typeof s.dernier === 'object') {
      const d = { semaine: nettoyerRang(s.dernier.semaine, true), total: nettoyerRang(s.dernier.total), quand: fini(s.dernier.quand) }, q = nettoyerRang(s.dernier.quartier);
      if (q) d.quartier = q; // son rang à l'événement « Le Quartier » (version 4)
      if (d.semaine || d.total || q) e.dernier = d;
    }
    e.recompenses = nettoyerRecompenses(s.recompenses);
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

  // ─── la décision d'envoyer ses points et sa fortune ───
  // raison : 'lancement', 'feuille', 'fond' (passage en arrière-plan), 'periodique' ; pts : { points, lundi } (facultatif)
  const ptsOk = (p) => !!p && Number.isInteger(p.points) && p.points >= 0 && p.points <= 1e5 && JOUR.test(String(p.lundi || ''));
  function deciderEnvoi(etat, fortune, maintenant, raison, pts, quartier) {
    if (!etat || !etat.rejoint || !etat.id || !etat.jeton || !etat.pseudo) return { envoyer: false, pourquoi: 'pas-rejoint' };
    if (typeof fortune !== 'number' || !Number.isFinite(fortune) || fortune < 0) return { envoyer: false, pourquoi: 'valeur' };
    const depuis = (t) => (t > maintenant + 60e3 ? Infinity : maintenant - (t || 0)); // une horloge remise en arrière ne bloque pas tout
    const essai = depuis(etat.essai);
    if (essai < REGLES.ecartMin) return { envoyer: false, pourquoi: 'trop-tot' };
    if (raison === 'periodique' && essai < REGLES.periode) return { envoyer: false, pourquoi: 'periode' };
    const memesPoints = !ptsOk(pts) || (etat.points === pts.points && etat.lundiPoints === pts.lundi);
    const memesBillets = !(typeof quartier === 'number' && Number.isFinite(quartier) && quartier > 0) || etat.quartier === quartier;
    if (etat.valeur === fortune && memesPoints && memesBillets && depuis(etat.dernierEnvoi) < REGLES.rafraichir) return { envoyer: false, pourquoi: 'inchange' };
    return { envoyer: true, pourquoi: raison || '' };
  }

  // ─── les réponses du serveur, vérifiées avant d'être affichées ───
  function nettoyerClassement(d) {
    const o = { semaine: '', joueurs: 0, lignes: [], moi: null, version: 0 };
    if (!d || typeof d !== 'object') return o;
    o.version = entier(d.version) || 2; // la version 2 du serveur ne classe qu'à l'argent (pas de points) ; 4 : l'événement du quartier
    const pts = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    if (typeof d.semaine === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.semaine)) o.semaine = d.semaine.slice(0, 10);
    if (Array.isArray(d.lignes)) {
      for (const l of d.lignes.slice(0, 100)) {
        if (!l || typeof l !== 'object' || !entier(l.rang)) continue;
        const v = Number(l.valeur);
        o.lignes.push({ rang: l.rang, pseudo: String(l.pseudo == null ? '' : l.pseudo).slice(0, 40), points: pts(l.points), valeur: Number.isFinite(v) ? v : 0, moi: l.moi === true, podium: [1, 2, 3].includes(l.podium) ? l.podium : null, toque: toqueOk(l.toque) });
      }
    }
    o.joueurs = Math.max(entier(d.joueurs) || 0, o.lignes.length);
    if (d.moi && typeof d.moi === 'object' && entier(d.moi.rang)) { const v = Number(d.moi.valeur); o.moi = { rang: d.moi.rang, points: pts(d.moi.points), valeur: Number.isFinite(v) ? v : 0, podium: [1, 2, 3].includes(d.moi.podium) ? d.moi.podium : null, toque: toqueOk(d.moi.toque) }; o.joueurs = Math.max(o.joueurs, o.moi.rang); }
    return o;
  }
  // la toque portée, vue des autres : la pièce de tête de la garde-robe quand elle vient d'un podium ('or', 'argent', 'bronze' ; null sinon).
  // Un serveur qui la connaît (une version à venir de fournil_publier / fournil_classement) la rend sur chaque ligne (`toque`) ; sinon la
  // toque affichée reste celle du podium de la semaine passée (`podium`). La sienne se lit sur le téléphone (GAME.toqueMetal).
  const toqueOk = (t) => (METAUX.includes(t) ? t : null);
  // la réponse de fournil_recompenses : ses podiums, et le podium de la semaine passée (pour tout le monde)
  function nettoyerRecompensesServeur(d) {
    const o = { ok: false, podiums: [], derniere: null };
    if (!d || typeof d !== 'object') return o;
    o.ok = d.ok === true; o.podiums = nettoyerPodiums(d.podiums);
    o.quartier = [1, 2, 3].includes(d.quartier) ? d.quartier : null; // le podium final de l'événement « Le Quartier » (version 4)
    o.quartierPodium = Array.isArray(d.quartier_podium) ? nettoyerPodiumQuartier(d.quartier_podium) : null;
    const r = d.derniere;
    if (r && typeof r === 'object' && JOUR.test(String(r.semaine || '')) && Array.isArray(r.podium)) {
      const podium = r.podium.slice(0, 30).filter((x) => x && typeof x === 'object' && [1, 2, 3].includes(x.rang)).map((x) => { const v = Number(x.valeur); return { rang: x.rang, pseudo: String(x.pseudo == null ? '' : x.pseudo).slice(0, 40), points: Number.isInteger(x.points) && x.points >= 0 ? x.points : null, valeur: Number.isFinite(v) ? v : 0 }; });
      if (podium.length) o.derniere = { semaine: r.semaine, podium };
    }
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
  // env : { config(), fetch, stockage, maintenant(), fortune(), points() → { points, lundi } (ses points de la semaine), quartier() → ses billets de
  //         l'événement « Le Quartier » (null : rien à envoyer), enLigne(), visible(), attendre(ms), delaiMax }
  const PERIODES = ['semaine', 'total', 'quartier'];
  const periodeDe = (p) => (PERIODES.includes(p) ? p : 'semaine');
  function creerMoteur(env) {
    const E = Object.assign({ maintenant: () => Date.now(), attendre: (ms) => new Promise((r) => setTimeout(r, ms)), enLigne: () => true, visible: () => true, fortune: () => NaN, points: () => null, quartier: () => null }, env || {});
    let etat = lireEtat(E.stockage);
    const ecouteurs = [], cache = { semaine: null, total: null, quartier: null }, charge = { semaine: false, total: false, quartier: false };
    const enVol = { semaine: null, total: null, quartier: null }; // une seule lecture de la liste à la fois par onglet : qui la redemande reçoit la même
    let enCours = null, statut = '', demarre = false, minuteur = 0;
    let retrait = false; // « Quitter » en route : plus aucun envoi automatique (fond, minuteur) tant que le serveur n'a pas répondu
    let nettoyage = null; // au lancement, l'effacement discret d'une inscription dont la réponse s'était perdue
    let ecrit = true; // la dernière écriture dans le stockage a-t-elle réussi ? (sinon, le stockage est en retard sur la mémoire)
    let lundiServeur = ''; // le lundi de la semaine en cours d'après le serveur (appris à chaque réponse) : l'heure du téléphone ne décide pas seule
    let version = 0; // la version du serveur : 4 (l'événement du quartier), 3 (points), 2 (argent seulement : on n'envoie plus de points jusqu'au prochain lancement), 0 (pas encore vue)
    let recVol = null, recQuand = 0, derniere = null; // la lecture des récompenses en cours, l'heure de la dernière, le podium de la semaine passée
    const config = () => { try { return lireConfig(E.config ? E.config() : null); } catch (e) { return null; } };
    const sauver = () => { ecrit = ecrireEtat(E.stockage, etat); return ecrit; };
    const prevenir = () => { for (const f of ecouteurs.slice()) { try { f(); } catch (e) { /* l'interface ne casse pas le moteur */ } } };
    const fortune = () => { try { const v = E.fortune(); return typeof v === 'number' ? Math.floor(v) : NaN; } catch (e) { return NaN; } };
    const points = () => { try { const p = E.points(); return ptsOk(p) ? { points: p.points, lundi: p.lundi } : null; } catch (e) { return null; } };
    const quartier = () => { try { const v = E.quartier(); return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null; } catch (e) { return null; } }; // ses billets : seulement s'il y en a
    const rpc = (nom, corps, o) => appeler(config(), nom, corps, { fetch: E.fetch, enLigne: E.enLigne, delaiMax: E.delaiMax, keepalive: o && o.keepalive });

    // une autre fenêtre (l'appli installée et l'onglet du navigateur partagent le même stockage) a pu écrire :
    // on reprend son identité si elle a changé (pseudo, rejoint, quitté), sinon l'horaire du dernier essai le plus récent (15 s pour toutes les fenêtres)
    function resynchroniser() {
      if (enCours || !ecrit) return false; // un envoi en vol garde l'état qu'il a commencé ; un stockage en retard ne fait pas reculer la mémoire
      let brut = null; try { brut = E.stockage ? E.stockage.getItem(CLE) : null; } catch (e) { return false; }
      if (brut == null) return false; // stockage vide ou indisponible : on garde l'état en mémoire
      const f = lireEtat(E.stockage);
      // les récompenses : l'union des podiums (rien ne se perd), la tenue choisie dans l'autre fenêtre (chaque choix est écrit aussitôt), le dernier annoncé
      const rec = { podiums: nettoyerPodiums(etat.recompenses.podiums.concat(f.recompenses.podiums)), tenue: f.recompenses.tenue, vu: f.recompenses.vu > etat.recompenses.vu ? f.recompenses.vu : etat.recompenses.vu, quartier: f.recompenses.quartier || etat.recompenses.quartier, quartierPodium: f.recompenses.quartierPodium || etat.recompenses.quartierPodium };
      if (f.id !== etat.id || f.jeton !== etat.jeton || f.rejoint !== etat.rejoint || f.pseudo !== etat.pseudo) { etat = f; etat.recompenses = rec; cache.semaine = cache.total = cache.quartier = null; prevenir(); return true; }
      const avantRec = JSON.stringify(etat.recompenses); etat.recompenses = rec; if (JSON.stringify(rec) !== avantRec) prevenir();
      etat.essai = Math.max(etat.essai, f.essai);
      if (f.dernierEnvoi > etat.dernierEnvoi) { etat.dernierEnvoi = f.dernierEnvoi; etat.valeur = f.valeur; etat.quartier = f.quartier; etat.dernier = f.dernier; }
      return false;
    }
    const noterLundi = (l) => { if (typeof l === 'string' && JOUR.test(l.slice(0, 10)) && l.slice(0, 10) > lundiServeur) lundiServeur = l.slice(0, 10); };
    // le lundi de la semaine en cours : celui du serveur, ou celui de l'horloge du jeu s'il est plus récent (minuit est passé depuis la dernière réponse)
    function lundi() { const l = lundiParis(E.maintenant()); return lundiServeur > l ? lundiServeur : l; }
    function noterRangs(d, maintenant) { // la place de la semaine est rangée sous le lundi du SERVEUR (l'horloge du téléphone peut avoir quelques minutes d'écart)
      const lundi = typeof d.semaine === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.semaine) ? d.semaine.slice(0, 10) : lundiParis(maintenant), avant = etat.dernier || {};
      noterLundi(d.semaine);
      const jt = entier(d.joueurs_total) || entier(d.joueurs);
      const js = entier(d.joueurs_semaine) || (avant.semaine && avant.semaine.lundi === lundi ? avant.semaine.joueurs : null) || jt;
      const semaine = entier(d.rang_semaine) ? { rang: d.rang_semaine, joueurs: Math.max(d.rang_semaine, js || 0), lundi } : null;
      const total = entier(d.rang_total) ? { rang: d.rang_total, joueurs: Math.max(d.rang_total, jt || 0) } : null;
      if (semaine && Number.isInteger(d.points_semaine)) semaine.points = d.points_semaine;
      if (total && Number.isInteger(d.points_total)) total.points = d.points_total;
      const q = entier(d.rang_quartier) ? { rang: d.rang_quartier, joueurs: Math.max(d.rang_quartier, (avant.quartier && avant.quartier.joueurs) || 0) } : null; // son rang à l'événement (version 4) ; les joueurs : appris en lisant la liste
      etat.dernier = (semaine || total || q) ? { semaine, total, quartier: q, quand: maintenant } : etat.dernier;
    }
    // un envoi au serveur ; le pseudo ne change dans l'état local qu'une fois accepté
    async function publier(pseudo, valeur, o, pts, billets) {
      etat.essai = E.maintenant(); sauver();
      const avecPoints = !!pts && version !== 2, avecBillets = avecPoints && billets != null && version !== 3;
      const INTROUVABLE = (r) => r.etat === 'pas-ouvert' && ['PGRST202', '42883'].includes(r.code); // la fonction n'a pas cette forme : le SQL n'est pas recollé
      let r = avecBillets ? await rpc('fournil_publier', { p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur, p_points: pts.points, p_lundi: pts.lundi, p_quartier: billets }, o) : null;
      if (r && INTROUVABLE(r)) { version = 3; r = null; } // un serveur encore en version 3 : les points sans les billets
      if (!r && avecPoints) r = await rpc('fournil_publier', { p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur, p_points: pts.points, p_lundi: pts.lundi }, o);
      if (r && avecPoints && INTROUVABLE(r)) { version = 2; r = null; } // un serveur encore en version 2 (SQL pas recollé) : sa fortune seule, comme avant
      if (!r) r = await rpc('fournil_publier', { p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur }, o);
      statut = r.etat;
      if (r.etat !== 'ok') { prevenir(); return r; }
      const d = r.data || {};
      if (entier(d.version)) version = d.version; else if (d.ok === true && !avecPoints && version === 0) version = 2;
      if (d.ok === true) {
        const t = E.maintenant(); etat.pseudo = pseudo; etat.dernierEnvoi = t; etat.valeur = valeur;
        if (avecPoints && version >= 3) { etat.points = pts.points; etat.lundiPoints = pts.lundi; }
        if (avecBillets && version >= 4) etat.quartier = billets;
        noterRangs(d, t); sauver();
        for (const c of [cache.semaine, cache.total, cache.quartier]) if (c) c.quand = 0; // les listes gardées ne montrent plus la bonne fortune : à relire au prochain coup d'œil
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
      const v = fortune(), p = version === 2 ? null : points(), b = version === 2 || version === 3 || !p ? null : quartier(), d = deciderEnvoi(etat, v, E.maintenant(), raison, p, b);
      if (!d.envoyer) return Promise.resolve({ etat: 'saute', pourquoi: d.pourquoi });
      enCours = publier(etat.pseudo, v, o, p, b).then((r) => {
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
      let r = await publier(v.pseudo, valeur, null, points(), quartier());
      if (r.etat === 'refus' && r.erreur === 'trop_vite') {
        if (siAttente) { try { siAttente(REGLES.serveur); } catch (e) { /* rien */ } }
        await E.attendre(REGLES.serveur);
        if (annule()) return { etat: 'annule' };
        r = await publier(v.pseudo, valeur, null, points(), quartier());
      }
      if (r.etat === 'refus' && r.erreur === 'jeton' && !etat.rejoint) {
        etat.id = nouvelId(); etat.jeton = nouveauJeton(); sauver(); await attendreTour(siAttente);
        if (annule()) return { etat: 'annule' };
        r = await publier(v.pseudo, valeur, null, points(), quartier());
      }
      if (r.etat === 'ok') { etat.rejoint = true; sauver(); cache.semaine = cache.total = cache.quartier = null; prevenir(); }
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
      const pseudo = etat.pseudo, rec = etat.recompenses; etat = etatNeuf(); etat.pseudo = pseudo; etat.recompenses = rec; sauver(); // une nouvelle identité au prochain retour ; le pseudo reste proposé, les coupes et les tenues restent à lui
      cache.semaine = cache.total = cache.quartier = null; prevenir();
      return { etat: 'ok' };
    }
    function charger(periode) {
      const p = periodeDe(periode);
      if (!config()) return Promise.resolve({ etat: 'absent' });
      if (enVol[p]) return enVol[p]; // une lecture déjà partie : on la partage au lieu d'en lancer une deuxième
      charge[p] = true; resynchroniser(); // p_id doit être celui de l'identité en cours, même changée dans une autre fenêtre
      const lecture = rpc('fournil_classement', { p_periode: p, p_id: etat.rejoint ? etat.id : null, p_limite: REGLES.limite }).then((r) => {
        charge[p] = false; statut = r.etat;
        const t = E.maintenant();
        if (r.etat === 'ok') {
          const data = nettoyerClassement(r.data); cache[p] = { etat: 'ok', data, quand: t }; noterLundi(data.semaine); if (data.version) version = data.version;
          if (etat.rejoint && data.moi) {
            const d = etat.dernier || { semaine: null, total: null, quand: t };
            d[p] = p === 'semaine' ? { rang: data.moi.rang, joueurs: data.joueurs, lundi: data.semaine || lundiParis(t) } : { rang: data.moi.rang, joueurs: data.joueurs };
            if (data.moi.points != null) d[p].points = data.moi.points;
            if (p === 'quartier') d[p].valeur = data.moi.valeur;
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
      const p = periodeDe(periode);
      const lecture = charger(p);
      envoyer('feuille').then((r) => { if (r && r.etat === 'ok') lecture.then(() => charger(p)); }).catch(() => { /* rien */ });
      chargerRecompenses({ ecart: 60e3 }); // les récompenses aussi (une fois par minute au plus)
      return lecture;
    }
    // ses podiums et le podium de la semaine passée : au lancement, à l'ouverture de la feuille, puis toutes les 30 min au plus.
    // Les podiums reçus s'ajoutent à ceux du téléphone (jamais retirés : quitter le classement ou le ménage des 90 jours ne reprennent rien).
    function chargerRecompenses(o) {
      if (!config()) return Promise.resolve({ etat: 'absent' });
      if (recVol) return recVol;
      resynchroniser();
      if (!etat.rejoint || !etat.id || !etat.jeton) return Promise.resolve({ etat: 'saute', pourquoi: 'pas-rejoint' });
      const ecart = o && typeof o.ecart === 'number' ? o.ecart : REGLES.recompenses, t = E.maintenant();
      if (recQuand && t - recQuand >= 0 && t - recQuand < ecart) return Promise.resolve({ etat: 'saute', pourquoi: 'recent' });
      recQuand = t;
      recVol = rpc('fournil_recompenses', { p_id: etat.id, p_jeton: etat.jeton }).then((r) => {
        if (r.etat !== 'ok') { recQuand = 0; return r; } // pas de réponse : on réessaiera à la prochaine occasion
        const d = nettoyerRecompensesServeur(r.data);
        if (!d.ok) return { etat: 'refus', erreur: r.data && typeof r.data.erreur === 'string' ? r.data.erreur : 'inconnue' };
        resynchroniser();
        derniere = d.derniere; if (derniere) noterLundi(decalerSemaine(derniere.semaine, 1));
        const avant = JSON.stringify([etat.recompenses.podiums, etat.recompenses.quartier, etat.recompenses.quartierPodium]);
        etat.recompenses.podiums = nettoyerPodiums(etat.recompenses.podiums.concat(d.podiums));
        if (d.quartier) etat.recompenses.quartier = d.quartier; // le podium final de l'événement, gardé à vie (jamais retiré)
        if (d.quartierPodium) etat.recompenses.quartierPodium = d.quartierPodium;
        if (JSON.stringify([etat.recompenses.podiums, etat.recompenses.quartier, etat.recompenses.quartierPodium]) !== avant) sauver();
        return { etat: 'ok', data: d };
      }).catch(() => { recQuand = 0; return { etat: 'erreur' }; }).then((r) => { recVol = null; prevenir(); return r; });
      return recVol;
    }
    // le choix de la tenue (null : aucune, 'auto', ou un métal gagné) et l'annonce faite : écrits aussitôt
    function choisirTenue(t) {
      resynchroniser();
      if (!(t === null || t === 'auto' || (METAUX.includes(t) && tenuesGagnees(etat.recompenses).includes(t)))) return false;
      etat.recompenses.tenue = t; sauver(); prevenir(); return true;
    }
    function annonceFaite(semaine) {
      if (!JOUR.test(String(semaine || ''))) return false;
      resynchroniser();
      if (semaine <= etat.recompenses.vu) return false;
      // un nouveau podium : sa tenue se porte d'office la semaine qui suit, même si une autre avait été choisie
      etat.recompenses.vu = semaine; if (semaine === decalerSemaine(lundi(), -1)) etat.recompenses.tenue = 'auto';
      sauver(); prevenir(); return true;
    }
    // pour l'interface et la boutique en 3D : ce qui se voit cette semaine
    function recompenses() {
      const rec = etat.recompenses, l = lundi();
      return { podiums: rec.podiums.slice(), tenue: rec.tenue, vu: rec.vu, lundi: l, portee: tenuePortee(rec, l), coupe: coupeDuComptoir(rec, l), coupes: rec.podiums.map((p) => metal(p.rang)), gagnees: tenuesGagnees(rec), annonce: aAnnoncer(rec, l), derniere, quartier: rec.quartier, quartierPodium: rec.quartierPodium };
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
      chargerRecompenses({ ecart: 0 });
      const pas = (o && o.pas) || 60e3;
      if (o && o.minuteur === false) return true;
      minuteur = setInterval(() => { tick(); }, pas);
      return true;
    }
    function tick() { // le minuteur : un envoi toutes les 5 min, seulement quand la page est visible
      let vu = true; try { vu = E.visible(); } catch (e) { vu = true; }
      if (vu) chargerRecompenses();
      return vu ? envoyer('periodique') : Promise.resolve({ etat: 'saute', pourquoi: 'cachee' });
    }
    function arreter() { if (minuteur) clearInterval(minuteur); minuteur = 0; demarre = false; }
    function resume() { // pour l'interface : rejoint, pseudo, et les dernières places connues (celle de la semaine seulement si c'est cette semaine, ou une plus récente : le téléphone peut retarder sur le serveur)
      const t = E.maintenant(), d = etat.dernier || {}, lundi = lundiParis(t);
      return { disponible: !!config(), rejoint: etat.rejoint, pseudo: etat.pseudo, semaine: d.semaine && typeof d.semaine.lundi === 'string' && d.semaine.lundi >= lundi ? d.semaine : null, total: d.total || null, quartier: d.quartier || null, quand: d.quand || 0, statut, version };
    }
    return {
      disponible: () => !!config(), etat: () => etat, resume, version: () => version, cache: (p) => cache[periodeDe(p)], enChargement: (p) => charge[periodeDe(p)],
      envoyer, charger, ouvrir, choisirPseudo, quitter, demarrer, arreter, ecouter: (f) => { ecouteurs.push(f); },
      chargerRecompenses, recompenses, choisirTenue, annonceFaite, lundi,
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
      config: () => w.FOURNIL_CONFIG, fetch: (u, i) => w.fetch(u, i), stockage, fortune: o && o.fortune, ...(o && typeof o.points === 'function' ? { points: o.points } : {}), ...(o && typeof o.quartier === 'function' ? { quartier: o.quartier } : {}),
      ...(o && typeof o.maintenant === 'function' ? { maintenant: o.maintenant } : {}), // l'horloge de confiance du jeu (HORLOGE), plutôt que celle du téléphone
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

  return { CLE, REGLES, PERIODES, PSEUDO_MIN, PSEUDO_MAX, lundiParis, decalageParis, dateCourte, normaliserPseudo, verifierPseudo, messagePseudo, rangTexte, rangPhrase, boulangers,
    etatNeuf, nettoyerEtat, lireEtat, ecrireEtat, nouvelId, nouveauJeton, deciderEnvoi, nettoyerClassement, lireConfig, appeler, creerMoteur, navigateur,
    METAUX, NOMS_METAL, metal, decalerSemaine, recompensesNeuves, nettoyerRecompenses, nettoyerPodiums, nettoyerRecompensesServeur, tenuePortee, coupeDuComptoir, aAnnoncer, tenuesGagnees, phraseAnnonce };
});
