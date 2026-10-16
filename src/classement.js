/* LE FOURNIL — le classement en ligne des boulangers, en POINTS DE BOULANGER (src/game.js : journées, défi, événements, Atelier, améliorations
   relatives à ses propres gains) : ceux de la semaine (depuis lundi, heure de Paris) et ceux depuis l'arrivée ; la fortune (st.lifetime) part aussi,
   affichée en petit, pour information. Serveur : supabase/fournil-classement.sql (version 4 : + l'événement « Le Quartier », ses billets envoyés
   avec p_quartier, son classement à part (periode 'quartier') et son podium final ; version 5 : + les événements génériques, dont « La Maison
   hantée » (src/hantee.js) : ses bonbons envoyés avec p_evt = 'hantee' et p_score, son classement à part (periode 'hantee', l'onglet
   « Halloween ») et son podium final (recompenses().evenements.hantee) ; + « en ligne » : un battement fournil_vu toutes les 2 min tant que la
   page est visible, et chaque ligne du classement porte enLigne (booléen), la liste enLigneN ; un serveur encore en version 4, 3 ou 2 reste servi).
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
    vu: 2 * 60e3, // « en ligne » : un battement (fournil_vu) toutes les 2 min tant que la page est visible et qu'on a rejoint
    vuRetour: 10e3, // au retour au premier plan, un battement tout de suite (pas plus d'un toutes les 10 s)
    pourboiresJour: 3, // version 6 : 3 pourboires donnés par jour (le serveur compte aussi), et au plus 3 boosts ×2 reçus par jour sur ce téléphone
    boostPourboire: [2, 600], // un pourboire reçu : un boost ×2 de 10 min dans la réserve
    boostObjectif: [5, 900], // l'objectif commun réussi (et qu'on y a contribué) : un boost ×5 de 15 min, et le badge « Esprit d'équipe »
    objectif: 60e3, // l'objectif commun relu une fois par minute au plus
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
  const etatNeuf = () => ({ id: null, jeton: null, pseudo: '', rejoint: false, dernierEnvoi: 0, valeur: null, points: null, lundiPoints: '', quartier: null, evt: null, essai: 0, dernier: null, recompenses: recompensesNeuves(),
    photoQuand: 0, photoCle: '', dons: donsNeufs(), recus: recusNeufs(), notifs: notifsNeuves() }); // version 6 : la photo envoyée, les pourboires donnés et reçus, les notifications
  // les pourboires donnés aujourd'hui (jour de Paris) : à qui (pseudos en minuscules), et combien il en reste d'après le serveur (null : pas encore su)
  const donsNeufs = () => ({ jour: '', a: [], restants: null });
  // les pourboires reçus : ceux qui attendent la feuille « X t'a laissé un pourboire ! » (attente), le plus récent déjà accueilli (vu),
  // et les boosts déjà donnés aujourd'hui (n, au plus REGLES.pourboiresJour)
  const recusNeufs = () => ({ attente: [], vu: '', jour: '', n: 0 });
  // les notifications : actif (abonné), ses quatre cas, l'adresse d'envoi (endpoint) et l'heure « boutique pleine » déjà annoncée au serveur
  const notifsNeuves = (prefs) => ({ actif: false, prefs: nettoyerPrefs(prefs), endpoint: '', pleineA: 0 });
  // les événements génériques que ce téléphone connaît (version 5 du serveur : p_evt) ; chacun est aussi une période du classement
  const EVTS = ['hantee'];
  const evtOk = (id) => EVTS.includes(id);

  // ─── les récompenses du podium : les trois premiers de chaque semaine gagnent une tenue (toque et tablier) et une coupe, or, argent ou bronze ───
  // recompenses : { podiums: [{ semaine: 'AAAA-MM-JJ' (le lundi de la semaine du podium), rang: 1 | 2 | 3 }] du plus ancien au plus récent,
  //                 tenue: 'auto' (celle du dernier podium, la semaine qui suit ; par défaut) | null (aucune) | 'or' | 'argent' | 'bronze',
  //                 vu: le lundi du dernier podium déjà annoncé }. Gardées à vie sur le téléphone, même après avoir quitté le classement.
  const METAUX = ['or', 'argent', 'bronze'], JOUR = /^\d{4}-\d{2}-\d{2}$/;
  const metal = (rang) => METAUX[rang - 1] || null; // 1 → 'or', 2 → 'argent', 3 → 'bronze'
  const NOMS_METAL = { or: 'd’or', argent: 'd’argent', bronze: 'de bronze' }; // « la tenue d’or », « la coupe de bronze »
  const recompensesNeuves = () => ({ podiums: [], tenue: 'auto', vu: '', quartier: null, quartierPodium: null, evenements: {}, equipe: [], equipeAttente: '' }); // quartier : son rang au podium final de l'événement « Le Quartier » (1, 2, 3), quartierPodium : les trois premiers ; evenements : { hantee: { rang: 1 | 2 | 3 | null, podium: [{ rang, pseudo, valeur }] } } (version 5)
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
    o.evenements = nettoyerEvenements(r.evenements);
    o.equipe = Array.isArray(r.equipe) ? [...new Set(r.equipe.filter((x) => typeof x === 'string' && JOUR.test(x)))].sort().slice(-200) : []; // les semaines d'objectif commun réussi (le badge « Esprit d'équipe », version 6)
    o.equipeAttente = typeof r.equipeAttente === 'string' && JOUR.test(r.equipeAttente) && !o.equipe.includes(r.equipeAttente) ? r.equipeAttente : ''; // sa récompense pas encore annoncée
    return o;
  }
  // les podiums finaux des événements génériques : { id: { rang: 1 | 2 | 3 | null, podium: [...] } }, seulement les événements connus
  function nettoyerEvenements(e) {
    const o = {};
    if (!e || typeof e !== 'object' || Array.isArray(e)) return o;
    for (const id of EVTS) {
      const x = e[id]; if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
      o[id] = { rang: [1, 2, 3].includes(x.rang) ? x.rang : null, podium: Array.isArray(x.podium) ? nettoyerPodiumQuartier(x.podium) : [] };
    }
    return o;
  }
  function fusionnerEvenements(a, b) { // l'union : un rang gagné n'est jamais retiré, le podium le plus récent (b) l'emporte
    const o = {};
    for (const id of EVTS) {
      const x = a && a[id], y = b && b[id]; if (!x && !y) continue;
      o[id] = { rang: (y && y.rang) || (x && x.rang) || null, podium: (y && y.podium && y.podium.length ? y.podium : x && x.podium) || [] };
    }
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
    if (s.evt && typeof s.evt === 'object' && evtOk(s.evt.id) && typeof s.evt.valeur === 'number' && Number.isFinite(s.evt.valeur) && s.evt.valeur >= 0) e.evt = { id: s.evt.id, valeur: s.evt.valeur }; // le dernier score d'événement accepté (version 5)
    if (s.dernier && typeof s.dernier === 'object') {
      const d = { semaine: nettoyerRang(s.dernier.semaine, true), total: nettoyerRang(s.dernier.total), quand: fini(s.dernier.quand) }, q = nettoyerRang(s.dernier.quartier);
      if (q) d.quartier = q; // son rang à l'événement « Le Quartier » (version 4)
      let ev = false; for (const id of EVTS) { const r = nettoyerRang(s.dernier[id]); if (r) { d[id] = r; ev = true; } } // son rang aux événements génériques (version 5)
      if (d.semaine || d.total || q || ev) e.dernier = d;
    }
    e.recompenses = nettoyerRecompenses(s.recompenses);
    e.photoQuand = fini(s.photoQuand); e.photoCle = typeof s.photoCle === 'string' ? s.photoCle.slice(0, 4096) : '';
    if (s.dons && typeof s.dons === 'object' && JOUR.test(String(s.dons.jour || ''))) e.dons = { jour: s.dons.jour, a: (Array.isArray(s.dons.a) ? s.dons.a : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 10), restants: Number.isInteger(s.dons.restants) && s.dons.restants >= 0 ? Math.min(REGLES.pourboiresJour, s.dons.restants) : null };
    if (s.recus && typeof s.recus === 'object') e.recus = { attente: nettoyerPourboires(s.recus.attente).slice(-20), vu: quandOk(s.recus.vu) && s.recus.vu ? new Date(s.recus.vu).toISOString() : '', jour: JOUR.test(String(s.recus.jour || '')) ? s.recus.jour : '', n: borne(s.recus.n, 0, 99) };
    if (s.notifs && typeof s.notifs === 'object') e.notifs = { actif: s.notifs.actif === true && !!e.id, prefs: nettoyerPrefs(s.notifs.prefs), endpoint: typeof s.notifs.endpoint === 'string' && /^https:\/\//.test(s.notifs.endpoint) ? s.notifs.endpoint.slice(0, 1000) : '', pleineA: fini(s.notifs.pleineA) };
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
  // evt : { id, score } (le score de l'événement générique en cours, facultatif)
  function deciderEnvoi(etat, fortune, maintenant, raison, pts, quartier, evt) {
    if (!etat || !etat.rejoint || !etat.id || !etat.jeton || !etat.pseudo) return { envoyer: false, pourquoi: 'pas-rejoint' };
    if (typeof fortune !== 'number' || !Number.isFinite(fortune) || fortune < 0) return { envoyer: false, pourquoi: 'valeur' };
    const depuis = (t) => (t > maintenant + 60e3 ? Infinity : maintenant - (t || 0)); // une horloge remise en arrière ne bloque pas tout
    const essai = depuis(etat.essai);
    if (essai < REGLES.ecartMin) return { envoyer: false, pourquoi: 'trop-tot' };
    if (raison === 'periodique' && essai < REGLES.periode) return { envoyer: false, pourquoi: 'periode' };
    const memesPoints = !ptsOk(pts) || (etat.points === pts.points && etat.lundiPoints === pts.lundi);
    const memesBillets = !(typeof quartier === 'number' && Number.isFinite(quartier) && quartier > 0) || etat.quartier === quartier;
    const memesBonbons = !(evt && evtOk(evt.id) && typeof evt.score === 'number' && Number.isFinite(evt.score) && evt.score > 0) || (!!etat.evt && etat.evt.id === evt.id && etat.evt.valeur === evt.score);
    if (etat.valeur === fortune && memesPoints && memesBillets && memesBonbons && depuis(etat.dernierEnvoi) < REGLES.rafraichir) return { envoyer: false, pourquoi: 'inchange' };
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
        const ligne = { rang: l.rang, pseudo: String(l.pseudo == null ? '' : l.pseudo).slice(0, 40), points: pts(l.points), valeur: Number.isFinite(v) ? v : 0, moi: l.moi === true, podium: [1, 2, 3].includes(l.podium) ? l.podium : null, toque: toqueOk(l.toque) };
        if (typeof l.en_ligne === 'boolean') ligne.enLigne = l.en_ligne; // version 5 : « en ligne » (absent avec un serveur plus ancien)
        o.lignes.push(ligne);
      }
    }
    o.joueurs = Math.max(entier(d.joueurs) || 0, o.lignes.length);
    if (d.moi && typeof d.moi === 'object' && entier(d.moi.rang)) { const v = Number(d.moi.valeur); o.moi = { rang: d.moi.rang, points: pts(d.moi.points), valeur: Number.isFinite(v) ? v : 0, podium: [1, 2, 3].includes(d.moi.podium) ? d.moi.podium : null, toque: toqueOk(d.moi.toque) }; if (typeof d.moi.en_ligne === 'boolean') o.moi.enLigne = d.moi.en_ligne; o.joueurs = Math.max(o.joueurs, o.moi.rang); }
    if (Number.isInteger(d.en_ligne_n) && d.en_ligne_n >= 0) o.enLigneN = Math.min(d.en_ligne_n, o.joueurs); // combien de joueurs de cette liste sont en ligne (version 5)
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
    o.evenements = nettoyerEvenements(d.evenements); // les podiums finaux des événements génériques (version 5 ; {} sinon)
    o.pourboires = nettoyerPourboires(d.pourboires); // version 6 : les pourboires reçus pas encore vus ([] sinon)
    const ob = d.objectif; // version 6 : la récompense de l'objectif commun d'une semaine finie, réussie, à laquelle on a contribué (une fois)
    o.objectif = ob && typeof ob === 'object' && JOUR.test(String(ob.semaine || '').slice(0, 10)) ? { semaine: String(ob.semaine).slice(0, 10), reussi: ob.reussi === true, recompense: ob.recompense === true || (!!ob.recompense && typeof ob.recompense === 'object') } : null;
    const r = d.derniere;
    if (r && typeof r === 'object' && JOUR.test(String(r.semaine || '')) && Array.isArray(r.podium)) {
      const podium = r.podium.slice(0, 30).filter((x) => x && typeof x === 'object' && [1, 2, 3].includes(x.rang)).map((x) => { const v = Number(x.valeur); return { rang: x.rang, pseudo: String(x.pseudo == null ? '' : x.pseudo).slice(0, 40), points: Number.isInteger(x.points) && x.points >= 0 ? x.points : null, valeur: Number.isFinite(v) ? v : 0 }; });
      if (podium.length) o.derniere = { semaine: r.semaine, podium };
    }
    return o;
  }

  // ─── version 6 du serveur : les copains (visiter une boutique, laisser un pourboire, l'objectif commun) et les notifications ───
  // La PHOTO de sa boutique : un petit JSON (2 Ko au plus, sérialisé) envoyé avec fournil_publier (p_photo), au plus une fois toutes les
  // 10 min, et rendu aux autres par fournil_boutique(pseudo) pour la visite (une scène en lecture seule). Ce qu'elle porte :
  //   { v: 1, nom: le nom donné à la boutique ('' : celui du quartier), q: le quartier (0-4), s: la recette de saison préparée (id) | null,
  //     p: [[niveau, apprenti 0/1, grade 1-5], …] (les postes, dans l'ordre de GAME.PRODUITS), m: { tables, four, vitrine, caisse, froid, deco } (crans),
  //     t: [tête, haut, pieds, accessoire] (la tenue portée, ids de la garde-robe), c: { n: nom, p: 'roux' | 'noir' } | null (le chat),
  //     dq / dh: les décos gagnées au Quartier et à la Maison hantée, g: le niveau du boulanger (son grade), k: les coupes de la vitrine (métaux),
  //     o: 1 si le badge « Esprit d'équipe » (objectif commun réussi) est gagné }.
  // Celle d'un autre joueur vient du réseau : relue champ par champ (nettoyerPhoto), jamais crue.
  const PHOTO = { max: 2048, ecart: 10 * 60e3, refaire: 6 * 3600e3 };
  const ID_OK = /^[a-z0-9][a-z0-9-]{0,39}$/, PIECES = ['tete', 'haut', 'pieds', 'accessoire'];
  const borne = (v, min, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min; };
  const texteCourt = (s, n) => Array.from(normaliserPseudo(s).replace(/[<>\u0000-\u001f\u007f]/g, '')).slice(0, n).join('');
  const idsOk = (l, n) => (Array.isArray(l) ? [...new Set(l.filter((x) => typeof x === 'string' && ID_OK.test(x)))].slice(0, n) : []);
  const octetsJson = (o) => { const j = JSON.stringify(o); try { return new TextEncoder().encode(j).length; } catch (e) { return unescape(encodeURIComponent(j)).length; } };
  const leJeu = (G) => G || (typeof GAME !== 'undefined' ? GAME : null);
  // la photo de SA boutique ; o : { G (GAME), coupes: ['or', …], badge, dq, dh (les décos gagnées, sinon lues dans st) }
  function photo(st, o) {
    o = o || {}; const G = leJeu(o.G);
    if (!st || typeof st !== 'object' || !G || !Array.isArray(st.stations)) return null;
    try {
      const eq = G.garderobe(st).equipe, hd = o.dh || (st.hantee && st.hantee.decos);
      const p = {
        v: 1, nom: texteCourt(st.nomBoutique || '', 30), q: G.quartier(st), s: st.saison && st.saison.niv > 0 && ID_OK.test(String(st.saison.id)) ? st.saison.id : null,
        p: st.stations.slice(0, 16).map((s, i) => [borne(s.niv, 0, 1e6), s.staff ? 1 : 0, G.gradeApprenti(st, i)]),
        m: {}, t: PIECES.map((k) => (typeof eq[k] === 'string' && ID_OK.test(eq[k]) ? eq[k] : null)),
        c: st.chat ? { n: texteCourt(st.chat.nom, 16), p: G.pelageChat(st, false) === 'noir' ? 'noir' : 'roux' } : null,
        dq: idsOk(o.dq || (st.quartier && st.quartier.decos), 8), dh: idsOk(hd, 8), g: borne(G.niveau(st), 1, 9999),
        k: (Array.isArray(o.coupes) ? o.coupes : []).filter((m) => METAUX.includes(m)).slice(-12), o: o.badge ? 1 : 0,
      };
      for (const m of G.MOBILIER) p.m[m.id] = borne(G.mobilierCran(st, m.id), 0, 20);
      if (octetsJson(p) > PHOTO.max) { p.k = []; p.nom = p.nom.slice(0, 12); }
      return octetsJson(p) <= PHOTO.max ? p : null;
    } catch (e) { return null; }
  }
  function nettoyerPhoto(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    try { if (octetsJson(p) > PHOTO.max * 2) return null; } catch (e) { return null; }
    const o = { v: borne(p.v, 1, 99), nom: texteCourt(p.nom == null ? '' : p.nom, 30), q: borne(p.q, 0, 99), s: typeof p.s === 'string' && ID_OK.test(p.s) ? p.s : null,
      p: (Array.isArray(p.p) ? p.p.slice(0, 16) : []).map((x) => (Array.isArray(x) ? [borne(x[0], 0, 1e6), x[1] ? 1 : 0, borne(x[2], 1, 5)] : [0, 0, 1])),
      m: {}, t: (Array.isArray(p.t) ? p.t.slice(0, 4) : []).map((x) => (typeof x === 'string' && ID_OK.test(x) ? x : null)), c: null,
      dq: idsOk(p.dq, 8), dh: idsOk(p.dh, 8), g: borne(p.g, 1, 9999), k: (Array.isArray(p.k) ? p.k : []).filter((m) => METAUX.includes(m)).slice(-12), o: p.o ? 1 : 0 };
    if (p.m && typeof p.m === 'object' && !Array.isArray(p.m)) for (const k of Object.keys(p.m).slice(0, 12)) if (ID_OK.test(k)) o.m[k] = borne(p.m[k], 0, 20);
    if (p.c && typeof p.c === 'object') o.c = { n: texteCourt(p.c.n == null ? '' : p.c.n, 16), p: p.c.p === 'noir' ? 'noir' : 'roux' };
    return o;
  }
  // la boutique d'un copain, reconstruite pour la scène : un état neuf (GAME.newState) habillé des champs de la photo, marqué st.visite.
  // Rien n'est sauvé : la scène le lit, la simulation des clients y passe, il est jeté au retour. o : { G, maintenant }
  function boutiqueDepuisPhoto(ph, o) {
    o = o || {}; const G = leJeu(o.G), p = nettoyerPhoto(ph); if (!G || !p) return null;
    const now = Number.isFinite(o.maintenant) ? o.maintenant : Date.now(), st = G.newState(now);
    st.visite = true; st.nomBoutique = p.nom; st.boutiques = (p.q % G.QUARTIERS.length) + 1;
    st.stations.forEach((s, i) => {
      const x = p.p[i]; s.niv = x ? x[0] : i === 0 ? 1 : 0; s.staff = !!(x && x[1] && s.niv > 0); s.prog = 0; s.actif = false;
      if (x && x[2] > 1 && G.APPRENTI_NIVEAUX) st.apprentis[G.PRODUITS[i].id] = { xp: G.APPRENTI_NIVEAUX[x[2] - 1] };
    });
    if (!st.stations.some((s) => s.niv > 0)) st.stations[0].niv = 1;
    for (const m of G.MOBILIER) st.mobilier[m.id] = Math.min(m.max, p.m[m.id] || 0);
    const r = p.s && (G.RECETTES_SAISON || []).find((x) => x.id === p.s); if (r) st.saison = { id: r.id, annee: new Date(now).getUTCFullYear(), niv: 1, prog: 0, actif: false };
    const g = G.garderobeNeuve();
    PIECES.forEach((k, i) => { const id = p.t[i], v = id ? G.vetement(id) : null; if (v && v.piece === k) { g.objets[id] = { niv: 1, depuis: 0 }; g.equipe[k] = id; } else if (p.t.length > i && id === null) g.equipe[k] = null; });
    st.garderobe = g;
    if (p.c) { st.chat = { nom: p.c.n || 'Brioche', caresses: 0, dernier: 0, adopte: now }; st.chatNoir = p.c.p === 'noir'; st.chatPelage = p.c.p; }
    let xp = 0; for (let n = 1; n < Math.min(p.g, 400); n++) xp += G.XP_NIVEAU(n); st.xp = xp;
    st.evTimer = 1e9; st.mystereTimer = 1e9; st.chatAttente = null; // rien ne surgit dans la boutique d'un autre
    const q = G.QUARTIERS[G.quartier(st)];
    return { st, nom: G.nomBoutique(st), quartier: q ? q.nom : '', decosQuartier: p.dq, decosHantee: p.dh, pelage: p.c ? p.c.p : 'roux', coupes: p.k, badge: !!p.o };
  }
  // la réponse de fournil_boutique(pseudo)
  function nettoyerBoutique(d) {
    if (!d || typeof d !== 'object') return { ok: false, erreur: 'reponse' };
    if (d.ok !== true) return { ok: false, erreur: typeof d.erreur === 'string' ? d.erreur.slice(0, 40) : 'inconnu' };
    const maj = typeof d.maj === 'string' && !isNaN(Date.parse(d.maj)) ? new Date(d.maj).toISOString() : null;
    return { ok: true, pseudo: String(d.pseudo == null ? '' : d.pseudo).slice(0, 40), photo: nettoyerPhoto(d.photo), maj, enLigne: d.en_ligne === true };
  }
  // la réponse de fournil_objectif() : { semaine, but, total, joueurs, reussi, pourcent }
  function nettoyerObjectif(d) {
    if (!d || typeof d !== 'object') return null;
    const but = borne(d.but, 0, 1e9), total = borne(d.total, 0, 1e12); if (!(but > 0)) return null;
    const pc = Number(d.pourcent);
    return { semaine: JOUR.test(String(d.semaine || '').slice(0, 10)) ? String(d.semaine).slice(0, 10) : '', but, total, joueurs: borne(d.joueurs, 0, 1e6), reussi: d.reussi === true || total >= but,
      pourcent: Number.isFinite(pc) ? Math.max(0, Math.min(100, pc)) : Math.min(100, Math.floor(total / but * 100)) };
  }
  const quandOk = (q) => (typeof q === 'string' || typeof q === 'number') && !isNaN(new Date(q).getTime());
  // les pourboires reçus (fournil_recompenses, version 6) : [{ de: pseudo, quand: ISO }], du plus ancien au plus récent
  function nettoyerPourboires(l) {
    return (Array.isArray(l) ? l.slice(0, 50) : []).filter((x) => x && typeof x === 'object' && quandOk(x.quand) && String(x.de == null ? '' : x.de).trim())
      .map((x) => ({ de: String(x.de).slice(0, 40), quand: new Date(x.quand).toISOString() })).sort((a, b) => (a.quand < b.quand ? -1 : a.quand > b.quand ? 1 : 0));
  }
  // le jour de Paris ('AAAA-MM-JJ') : les quotas de pourboires (3 donnés, 3 boosts reçus) repartent chaque jour, comme au serveur
  function jourParis(ms) { const t = Number.isFinite(ms) ? ms : Date.now(); return new Date(t + decalageParis(t)).toISOString().slice(0, 10); }
  // les préférences des notifications : les quatre cas (a) boutique pleine, (b) ouverture et fin d'un événement, (c) pourboire, (d) objectif commun
  const PREFS = ['pleine', 'evenements', 'pourboires', 'objectif'];
  function nettoyerPrefs(p) { const o = {}; for (const k of PREFS) o[k] = !(p && typeof p === 'object' && p[k] === false); return o; }
  // la clé publique VAPID (fournil/config.js : vapid), en base64url : 65 octets non compressés (87 caractères) ; absente : « bientôt »
  const VAPID_OK = /^[A-Za-z0-9_-]{80,100}$/;
  function cleVapid(b64) { // base64url → Uint8Array (pour PushManager.subscribe)
    const s = String(b64).replace(/-/g, '+').replace(/_/g, '/'), pad = s + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = typeof atob === 'function' ? atob(pad) : Buffer.from(pad, 'base64').toString('binary');
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  // ─── le réseau : un POST vers une fonction du classement ───
  function lireConfig(c) {
    if (!c || typeof c !== 'object') return null;
    const url = typeof c.supabaseUrl === 'string' ? c.supabaseUrl.trim().replace(/\/+$/, '') : '', key = typeof c.supabaseKey === 'string' ? c.supabaseKey.trim() : '';
    if (!/^https:\/\/[^/\s]+$/.test(url) || !key) return null;
    const vapid = typeof c.vapid === 'string' && VAPID_OK.test(c.vapid.trim()) ? c.vapid.trim() : ''; // la clé PUBLIQUE des notifications (version 6) ; '' : pas encore
    return { url, key, bearer: c.bearer !== false, vapid }; // bearer : aussi « Authorization: Bearer <clé publique> », comme supabase-js
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
  //         l'événement « Le Quartier » (null : rien à envoyer), evenement() → { id: 'hantee', score } (le score de l'événement générique en
  //         cours, null : rien à envoyer), enLigne(), visible(), attendre(ms), delaiMax }
  const PERIODES = ['semaine', 'total', 'quartier', ...EVTS];
  const periodeDe = (p) => (PERIODES.includes(p) ? p : 'semaine');
  // les onglets d'événement du classement, pour l'interface : regles = [{ periode: 'quartier', nom: 'Événement', regles: QUARTIER, masque },
  // { periode: 'hantee', nom: 'Halloween', regles: HANTEE, masque }] ; un onglet se montre pendant son événement et deux semaines après
  // (regles.fenetre(maintenant).classement : le podium final), sauf si l'événement est masqué. Rend [[periode, nom], …], dans l'ordre donné.
  function ongletsEvenements(liste, maintenant) {
    const o = [];
    for (const x of Array.isArray(liste) ? liste : []) {
      if (!x || !PERIODES.includes(x.periode) || x.masque) continue;
      let f = null; try { f = x.regles && typeof x.regles.fenetre === 'function' ? x.regles.fenetre(maintenant) : null; } catch (e) { f = null; }
      if (f && f.classement) o.push([x.periode, String(x.nom || x.periode)]);
    }
    return o;
  }
  function creerMoteur(env) {
    const E = Object.assign({ maintenant: () => Date.now(), attendre: (ms) => new Promise((r) => setTimeout(r, ms)), enLigne: () => true, visible: () => true, fortune: () => NaN, points: () => null, quartier: () => null, evenement: () => null,
      photo: () => null, push: null }, env || {}); // version 6 : photo() → la photo de sa boutique ; push : { possible(), abonner(cleVapid) → { sub } | { erreur }, desabonner() → { endpoint } }
    let etat = lireEtat(E.stockage);
    const ecouteurs = [], cache = {}, charge = {}, enVol = {}; // par période ; une seule lecture de la liste à la fois par onglet : qui la redemande reçoit la même
    for (const p of PERIODES) { cache[p] = null; charge[p] = false; enVol[p] = null; }
    const viderCache = () => { for (const p of PERIODES) cache[p] = null; };
    let enCours = null, statut = '', demarre = false, minuteur = 0;
    let retrait = false; // « Quitter » en route : plus aucun envoi automatique (fond, minuteur) tant que le serveur n'a pas répondu
    let nettoyage = null; // au lancement, l'effacement discret d'une inscription dont la réponse s'était perdue
    let ecrit = true; // la dernière écriture dans le stockage a-t-elle réussi ? (sinon, le stockage est en retard sur la mémoire)
    let lundiServeur = ''; // le lundi de la semaine en cours d'après le serveur (appris à chaque réponse) : l'heure du téléphone ne décide pas seule
    let version = 0; // la version du serveur : 5 (événements génériques, en ligne), 4 (l'événement du quartier), 3 (points), 2 (argent seulement : on n'envoie plus de points jusqu'au prochain lancement), 0 (pas encore vue)
    let dernierVu = 0, vuVol = null, vuAbsent = false; // « en ligne » : le dernier signe de vie envoyé, le battement en vol, un serveur sans fournil_vu (jusqu'au prochain lancement)
    let recVol = null, recQuand = 0, derniere = null; // la lecture des récompenses en cours, l'heure de la dernière, le podium de la semaine passée
    let sansPhoto = false, sansCopains = false; // un serveur sans p_photo / sans les fonctions des copains (version 5 ou plus ancienne) : jusqu'au prochain lancement
    let objCache = null, objVol = null; // l'objectif commun : la dernière lecture { etat, data, quand }, celle en vol
    const config = () => { try { return lireConfig(E.config ? E.config() : null); } catch (e) { return null; } };
    const sauver = () => { ecrit = ecrireEtat(E.stockage, etat); return ecrit; };
    const prevenir = () => { for (const f of ecouteurs.slice()) { try { f(); } catch (e) { /* l'interface ne casse pas le moteur */ } } };
    const fortune = () => { try { const v = E.fortune(); return typeof v === 'number' ? Math.floor(v) : NaN; } catch (e) { return NaN; } };
    const points = () => { try { const p = E.points(); return ptsOk(p) ? { points: p.points, lundi: p.lundi } : null; } catch (e) { return null; } };
    const quartier = () => { try { const v = E.quartier(); return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null; } catch (e) { return null; } }; // ses billets : seulement s'il y en a
    const evenement = () => { try { const v = E.evenement(); return v && typeof v === 'object' && evtOk(v.id) && typeof v.score === 'number' && Number.isFinite(v.score) && v.score > 0 ? { id: v.id, score: Math.floor(v.score) } : null; } catch (e) { return null; } }; // son score d'événement : seulement s'il y en a
    const rpc = (nom, corps, o) => appeler(config(), nom, corps, { fetch: E.fetch, enLigne: E.enLigne, delaiMax: E.delaiMax, keepalive: o && o.keepalive });

    // une autre fenêtre (l'appli installée et l'onglet du navigateur partagent le même stockage) a pu écrire :
    // on reprend son identité si elle a changé (pseudo, rejoint, quitté), sinon l'horaire du dernier essai le plus récent (15 s pour toutes les fenêtres)
    function resynchroniser() {
      if (enCours || !ecrit) return false; // un envoi en vol garde l'état qu'il a commencé ; un stockage en retard ne fait pas reculer la mémoire
      let brut = null; try { brut = E.stockage ? E.stockage.getItem(CLE) : null; } catch (e) { return false; }
      if (brut == null) return false; // stockage vide ou indisponible : on garde l'état en mémoire
      const f = lireEtat(E.stockage);
      // les récompenses : l'union des podiums (rien ne se perd), la tenue choisie dans l'autre fenêtre (chaque choix est écrit aussitôt), le dernier annoncé
      const equipe = [...new Set(etat.recompenses.equipe.concat(f.recompenses.equipe))].sort();
      const rec = { podiums: nettoyerPodiums(etat.recompenses.podiums.concat(f.recompenses.podiums)), tenue: f.recompenses.tenue, vu: f.recompenses.vu > etat.recompenses.vu ? f.recompenses.vu : etat.recompenses.vu, quartier: f.recompenses.quartier || etat.recompenses.quartier, quartierPodium: f.recompenses.quartierPodium || etat.recompenses.quartierPodium, evenements: fusionnerEvenements(etat.recompenses.evenements, f.recompenses.evenements),
        equipe, equipeAttente: [f.recompenses.equipeAttente, etat.recompenses.equipeAttente].find((x) => x && !equipe.includes(x)) || '' };
      if (f.id !== etat.id || f.jeton !== etat.jeton || f.rejoint !== etat.rejoint || f.pseudo !== etat.pseudo) { etat = f; etat.recompenses = rec; viderCache(); prevenir(); return true; }
      // version 6 : les pourboires accueillis dans l'autre fenêtre ne reviennent pas ici ; ses dons du jour et ses notifications (écrits aussitôt) font foi
      if (f.recus.vu > etat.recus.vu || (f.recus.vu === etat.recus.vu && f.recus.attente.length < etat.recus.attente.length)) etat.recus = f.recus;
      if (f.dons.jour > etat.dons.jour || (f.dons.jour === etat.dons.jour && f.dons.a.length > etat.dons.a.length)) etat.dons = f.dons;
      etat.notifs = f.notifs; if (f.photoQuand > etat.photoQuand) { etat.photoQuand = f.photoQuand; etat.photoCle = f.photoCle; }
      const avantRec = JSON.stringify(etat.recompenses); etat.recompenses = rec; if (JSON.stringify(rec) !== avantRec) prevenir();
      etat.essai = Math.max(etat.essai, f.essai);
      if (f.dernierEnvoi > etat.dernierEnvoi) { etat.dernierEnvoi = f.dernierEnvoi; etat.valeur = f.valeur; etat.quartier = f.quartier; etat.evt = f.evt; etat.dernier = f.dernier; }
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
      const ev = evtOk(d.evt) && entier(d.rang_evt) ? { rang: d.rang_evt, joueurs: Math.max(d.rang_evt, (avant[d.evt] && avant[d.evt].joueurs) || 0) } : null; // son rang à l'événement générique (version 5)
      if (semaine || total || q || ev) {
        const n = { semaine, total, quartier: q, quand: maintenant };
        for (const id of EVTS) if (avant[id] && !(ev && d.evt === id)) n[id] = avant[id]; // les rangs des autres événements restent
        if (ev) n[d.evt] = ev;
        etat.dernier = n;
      }
    }
    // la photo à joindre au prochain envoi, ou null (serveur trop ancien, envoyée il y a moins de 10 min, inchangée depuis moins de 6 h)
    function photoAEnvoyer() {
      if (sansPhoto || (version >= 2 && version <= 5)) return null;
      const t = E.maintenant(), depuis = t - (etat.photoQuand || 0), recente = etat.photoQuand > 0 && depuis >= 0;
      if (recente && depuis < PHOTO.ecart) return null;
      let p = null; try { p = E.photo(); } catch (e) { p = null; }
      if (!p || typeof p !== 'object') return null;
      const cle = JSON.stringify(p); if (cle.length > PHOTO.max * 2) return null;
      if (recente && cle === etat.photoCle && depuis < PHOTO.refaire) return null;
      return { p, cle };
    }
    // un envoi au serveur ; le pseudo ne change dans l'état local qu'une fois accepté
    async function publier(pseudo, valeur, o, pts, billets, ev) {
      etat.essai = E.maintenant(); sauver();
      const avecPoints = !!pts && version !== 2, avecBillets = avecPoints && billets != null && version !== 3, avecEvt = avecPoints && !!ev && !(version >= 2 && version <= 4);
      const INTROUVABLE = (r) => r.etat === 'pas-ouvert' && ['PGRST202', '42883'].includes(r.code); // la fonction n'a pas cette forme : le SQL n'est pas recollé
      // version 6 : la photo de la boutique part avec, au plus une fois toutes les 10 min (et seulement si elle a changé, ou toutes les 6 h) ;
      // un serveur qui ne connaît pas p_photo (version 5) : le même envoi aussitôt refait sans elle, et plus de photo jusqu'au prochain lancement
      let ph = photoAEnvoyer(), photoPartie = null;
      const pub = async (c) => {
        if (ph) { const r1 = await rpc('fournil_publier', Object.assign({}, c, { p_photo: ph.p }), o); if (!INTROUVABLE(r1)) { photoPartie = ph; return r1; } sansPhoto = true; ph = null; }
        return rpc('fournil_publier', c, o);
      };
      let r = null;
      if (avecEvt) { // version 5 : le score de l'événement générique (p_evt, p_score), avec les billets du Quartier s'il y en a encore
        r = avecBillets ? await pub({ p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur, p_points: pts.points, p_lundi: pts.lundi, p_quartier: billets, p_evt: ev.id, p_score: ev.score })
          : await pub({ p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur, p_points: pts.points, p_lundi: pts.lundi, p_evt: ev.id, p_score: ev.score });
        if (INTROUVABLE(r)) { version = 4; r = null; } // un serveur encore en version 4 : pas de bonbons (le reste part comme avant)
      }
      if (!r && avecBillets) r = await pub({ p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur, p_points: pts.points, p_lundi: pts.lundi, p_quartier: billets });
      if (r && INTROUVABLE(r)) { version = 3; r = null; } // un serveur encore en version 3 : les points sans les billets
      if (!r && avecPoints) r = await pub({ p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur, p_points: pts.points, p_lundi: pts.lundi });
      if (r && avecPoints && INTROUVABLE(r)) { version = 2; r = null; } // un serveur encore en version 2 (SQL pas recollé) : sa fortune seule, comme avant
      if (!r) r = await pub({ p_id: etat.id, p_jeton: etat.jeton, p_pseudo: pseudo, p_fortune: valeur });
      statut = r.etat;
      if (r.etat !== 'ok') { prevenir(); return r; }
      const d = r.data || {};
      if (entier(d.version)) version = d.version; else if (d.ok === true && !avecPoints && version === 0) version = 2;
      if (d.ok === true) {
        const t = E.maintenant(); etat.pseudo = pseudo; etat.dernierEnvoi = t; etat.valeur = valeur;
        if (avecPoints && version >= 3) { etat.points = pts.points; etat.lundiPoints = pts.lundi; }
        if (avecBillets && version >= 4) etat.quartier = billets;
        if (avecEvt && version >= 5) { etat.evt = { id: ev.id, valeur: ev.score }; }
        if (version >= 5) dernierVu = t; // un envoi accepté par la version 5 est aussi un signe de vie
        if (photoPartie && (d.photo_maj !== undefined || version >= 6)) { etat.photoQuand = t; etat.photoCle = photoPartie.cle; } // la photo est gardée par le serveur (version 6)
        noterRangs(d, t); sauver();
        for (const p of PERIODES) if (cache[p]) cache[p].quand = 0; // les listes gardées ne montrent plus la bonne fortune : à relire au prochain coup d'œil
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
      const v = fortune(), p = version === 2 ? null : points(), b = version === 2 || version === 3 || !p ? null : quartier(), ev = (version >= 2 && version <= 4) || !p ? null : evenement(), d = deciderEnvoi(etat, v, E.maintenant(), raison, p, b, ev);
      if (!d.envoyer) return Promise.resolve({ etat: 'saute', pourquoi: d.pourquoi });
      enCours = publier(etat.pseudo, v, o, p, b, ev).then((r) => {
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
      let r = await publier(v.pseudo, valeur, null, points(), quartier(), evenement());
      if (r.etat === 'refus' && r.erreur === 'trop_vite') {
        if (siAttente) { try { siAttente(REGLES.serveur); } catch (e) { /* rien */ } }
        await E.attendre(REGLES.serveur);
        if (annule()) return { etat: 'annule' };
        r = await publier(v.pseudo, valeur, null, points(), quartier(), evenement());
      }
      if (r.etat === 'refus' && r.erreur === 'jeton' && !etat.rejoint) {
        etat.id = nouvelId(); etat.jeton = nouveauJeton(); sauver(); await attendreTour(siAttente);
        if (annule()) return { etat: 'annule' };
        r = await publier(v.pseudo, valeur, null, points(), quartier(), evenement());
      }
      if (r.etat === 'ok') { etat.rejoint = true; sauver(); viderCache(); prevenir(); }
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
      const pseudo = etat.pseudo, rec = etat.recompenses, prefs = etat.notifs.prefs; etat = etatNeuf(); etat.pseudo = pseudo; etat.recompenses = rec; etat.notifs = notifsNeuves(prefs); sauver(); // une nouvelle identité au prochain retour ; le pseudo reste proposé, les coupes et les tenues restent à lui (ses abonnements partent avec sa ligne)
      viderCache(); prevenir();
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
            if (p === 'quartier' || evtOk(p)) d[p].valeur = data.moi.valeur;
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
        const avant = JSON.stringify([etat.recompenses.podiums, etat.recompenses.quartier, etat.recompenses.quartierPodium, etat.recompenses.evenements]);
        etat.recompenses.podiums = nettoyerPodiums(etat.recompenses.podiums.concat(d.podiums));
        if (d.quartier) etat.recompenses.quartier = d.quartier; // le podium final de l'événement, gardé à vie (jamais retiré)
        if (d.quartierPodium) etat.recompenses.quartierPodium = d.quartierPodium;
        etat.recompenses.evenements = fusionnerEvenements(etat.recompenses.evenements, d.evenements); // les podiums finaux des événements génériques, gardés à vie
        let neuf = false;
        // version 6 : les pourboires reçus attendent leur feuille (gardés sur le téléphone : le serveur peut les marquer vus dès cette lecture)
        const deja = new Set(etat.recus.attente.map((x) => x.de + '|' + x.quand)), recus = d.pourboires.filter((x) => x.quand > etat.recus.vu && !deja.has(x.de + '|' + x.quand));
        if (recus.length) { etat.recus.attente = etat.recus.attente.concat(recus).slice(-20); neuf = true; }
        // l'objectif commun réussi d'une semaine finie : sa récompense attend son annonce (une fois par semaine)
        const ob = d.objectif; if (ob && ob.reussi && ob.recompense && !etat.recompenses.equipe.includes(ob.semaine) && etat.recompenses.equipeAttente !== ob.semaine) { etat.recompenses.equipeAttente = ob.semaine; neuf = true; }
        if (neuf || JSON.stringify([etat.recompenses.podiums, etat.recompenses.quartier, etat.recompenses.quartierPodium, etat.recompenses.evenements]) !== avant) sauver();
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
      return { podiums: rec.podiums.slice(), tenue: rec.tenue, vu: rec.vu, lundi: l, portee: tenuePortee(rec, l), coupe: coupeDuComptoir(rec, l), coupes: rec.podiums.map((p) => metal(p.rang)), gagnees: tenuesGagnees(rec), annonce: aAnnoncer(rec, l), derniere, quartier: rec.quartier, quartierPodium: rec.quartierPodium, evenements: JSON.parse(JSON.stringify(rec.evenements || {})),
        equipe: rec.equipe.slice(), badge: rec.equipe.length > 0, objectifAnnonce: rec.equipeAttente || null }; // version 6 : le badge « Esprit d'équipe », la récompense de l'objectif à annoncer
    }
    // « en ligne » : un battement (fournil_vu) qui ne compte rien ; raison : 'periodique' (le minuteur : un toutes les 2 min), 'retour' (la page
    // revient au premier plan : tout de suite, pas plus d'un toutes les 10 s), 'lancement'. Jamais caché, hors ligne, sans configuration, ni sans
    // avoir rejoint ; un serveur sans fournil_vu (version 4 ou plus ancienne) : plus aucun battement jusqu'au prochain lancement.
    function battre(raison) {
      if (!config()) return Promise.resolve({ etat: 'absent' });
      if (vuAbsent || (version >= 2 && version <= 4)) return Promise.resolve({ etat: 'saute', pourquoi: 'ancien-serveur' });
      if (vuVol) return vuVol;
      if (retrait) return Promise.resolve({ etat: 'saute', pourquoi: 'retrait' });
      let vu = true; try { vu = E.visible() !== false; } catch (e) { vu = true; }
      if (!vu) return Promise.resolve({ etat: 'saute', pourquoi: 'cachee' });
      let co = true; try { co = E.enLigne() !== false; } catch (e) { co = true; }
      if (!co) return Promise.resolve({ etat: 'saute', pourquoi: 'hors-ligne' });
      resynchroniser();
      if (!etat.rejoint || !etat.id || !etat.jeton) return Promise.resolve({ etat: 'saute', pourquoi: 'pas-rejoint' });
      const t = E.maintenant(), depuis = t - dernierVu, ecart = raison === 'retour' ? REGLES.vuRetour : REGLES.vu - 5e3;
      if (dernierVu && depuis >= 0 && depuis < ecart) return Promise.resolve({ etat: 'saute', pourquoi: 'recent' });
      dernierVu = t;
      vuVol = rpc('fournil_vu', { p_id: etat.id, p_jeton: etat.jeton }).then((r) => {
        if (r.etat === 'pas-ouvert') vuAbsent = true; // un serveur encore en version 4 : plus de battement (rien ne casse, enLigne reste absent)
        else if (r.etat !== 'ok') dernierVu = 0; // pas de réponse : on réessaiera au prochain tour du minuteur
        return r;
      }).catch(() => { dernierVu = 0; return { etat: 'erreur' }; }).then((r) => { vuVol = null; return r; });
      return vuVol;
    }
    // ─── version 6 : les copains ───
    const ancien = () => sansCopains || (version >= 2 && version <= 5); // un serveur sans les fonctions des copains : on cache les boutons
    const pasInstalle = (r) => { if (r && r.etat === 'pas-ouvert') { sansCopains = true; prevenir(); return { etat: 'pas-installe' }; } return null; };
    const moi = () => ({ p_id: etat.id, p_jeton: etat.jeton });
    // la boutique d'un copain (fournil_boutique, lisible par tous) : { etat: 'ok', data: { pseudo, photo, maj, enLigne } } ; 'refus' (erreur 'inconnu'),
    // 'pas-installe' (serveur version 5), ou un état du réseau
    async function boutique(pseudo) {
      if (!config()) return { etat: 'absent' };
      const p = normaliserPseudo(pseudo); if (!p) return { etat: 'invalide' };
      resynchroniser(); const avecMoi = etat.rejoint && etat.id && etat.jeton; // inscrit : le serveur dit aussi ses pourboires restants et s'il en a déjà laissé un à ce copain
      const r = await rpc('fournil_boutique', avecMoi ? Object.assign({ p_pseudo: p }, moi()) : { p_pseudo: p }), x = pasInstalle(r); if (x) return x;
      if (r.etat !== 'ok') return r;
      const d = nettoyerBoutique(r.data); if (!d.ok) return { etat: 'refus', erreur: d.erreur };
      if (avecMoi && r.data && (Number.isInteger(r.data.restants) || typeof r.data.deja === 'boolean')) {
        majDons(); if (Number.isInteger(r.data.restants) && r.data.restants >= 0) etat.dons.restants = Math.min(REGLES.pourboiresJour, r.data.restants);
        const k = p.toLowerCase(); if (r.data.deja === true && !etat.dons.a.includes(k)) etat.dons.a.push(k); sauver();
      }
      return { etat: 'ok', data: d };
    }
    function majDons() { const j = jourParis(E.maintenant()); if (etat.dons.jour !== j) etat.dons = { jour: j, a: [], restants: null }; }
    // ses pourboires du jour : combien il en reste (3 par jour), et s'il en a déjà laissé un à ce copain aujourd'hui
    function dons() { resynchroniser(); majDons(); const d = etat.dons; return { restants: d.restants == null ? Math.max(0, REGLES.pourboiresJour - d.a.length) : d.restants, a: d.a.slice(), deja: (p) => d.a.includes(normaliserPseudo(p).toLowerCase()) }; }
    // laisser un pourboire à un copain (fournil_pourboire) : { etat: 'ok', restants } ou { etat: 'refus', erreur: 'deja' | 'quota' | 'soi' | 'inconnu' | 'jeton', restants }
    async function pourboire(pseudo) {
      if (!config()) return { etat: 'absent' };
      resynchroniser(); if (!etat.rejoint || !etat.id || !etat.jeton) return { etat: 'pas-rejoint' };
      const p = normaliserPseudo(pseudo); if (!verifierPseudo(p).ok) return { etat: 'invalide' };
      const r = await rpc('fournil_pourboire', Object.assign(moi(), { p_pour: p })), x = pasInstalle(r); if (x) return x;
      if (r.etat !== 'ok') return r;
      const d = r.data || {}; resynchroniser(); majDons();
      if (Number.isInteger(d.restants) && d.restants >= 0) etat.dons.restants = Math.min(REGLES.pourboiresJour, d.restants);
      if ((d.ok === true || d.erreur === 'deja') && !etat.dons.a.includes(p.toLowerCase())) etat.dons.a.push(p.toLowerCase());
      if (d.erreur === 'quota') etat.dons.restants = 0;
      sauver(); prevenir();
      const restants = dons().restants;
      return d.ok === true ? { etat: 'ok', restants } : { etat: 'refus', erreur: typeof d.erreur === 'string' ? d.erreur : 'inconnue', restants };
    }
    // l'objectif commun de la semaine (fournil_objectif, lisible par tous) : relu une fois par minute au plus ; objectifVu() : la dernière lecture
    function objectif(o) {
      if (!config()) return Promise.resolve({ etat: 'absent' });
      if (ancien()) return Promise.resolve({ etat: 'pas-installe' });
      if (objVol) return objVol;
      const t = E.maintenant(), ecart = o && typeof o.ecart === 'number' ? o.ecart : REGLES.objectif;
      if (objCache && objCache.etat === 'ok' && t - objCache.quand >= 0 && t - objCache.quand < ecart) return Promise.resolve(objCache);
      objVol = rpc('fournil_objectif', {}).then((r) => {
        const x = pasInstalle(r); if (x) { objCache = null; return x; }
        if (r.etat === 'ok') { const d = nettoyerObjectif(r.data); objCache = d ? { etat: 'ok', data: d, quand: E.maintenant() } : objCache; return d ? objCache : { etat: 'erreur', detail: 'reponse' }; }
        return r;
      }).catch(() => ({ etat: 'erreur' })).then((r) => { objVol = null; prevenir(); return r; });
      return objVol;
    }
    // les pourboires reçus qui attendent leur feuille (fournil_recompenses ne les rend qu'une fois : ils sont gardés ici jusque-là) ;
    // accueillirPourboires() les marque vus et dit combien de boosts ×2 donner (au plus 3 par jour sur ce téléphone)
    function pourboiresRecus() { return etat.recus.attente.slice(); }
    function accueillirPourboires() {
      resynchroniser();
      const l = etat.recus.attente.slice(); if (!l.length) return { liste: [], boosts: 0 };
      const j = jourParis(E.maintenant()); if (etat.recus.jour !== j) { etat.recus.jour = j; etat.recus.n = 0; }
      const boosts = Math.max(0, Math.min(l.length, REGLES.pourboiresJour - etat.recus.n)), jusqua = l.reduce((m, x) => (x.quand > m ? x.quand : m), etat.recus.vu);
      etat.recus.n += boosts; etat.recus.vu = jusqua; etat.recus.attente = []; sauver(); prevenir();
      return { liste: l, boosts }; // (le serveur v6 les marque vus dès sa lecture : rien à accuser ; recus.vu les écarte s'ils revenaient)
    }
    // la récompense de l'objectif commun : annoncée une fois (rend true la première fois seulement), la semaine rejoint le badge
    function objectifFait(semaine) {
      resynchroniser(); const r = etat.recompenses;
      if (!JOUR.test(String(semaine || '')) || r.equipe.includes(semaine)) return false;
      r.equipe = r.equipe.concat([semaine]).sort(); if (r.equipeAttente === semaine) r.equipeAttente = ''; sauver(); prevenir(); return true;
    }

    // ─── version 6 : les notifications (Web Push) ───
    // pourquoi elles ne sont pas possibles : 'absent' (pas de configuration), 'bientot' (pas encore de clé publique dans config.js),
    // 'impossible' (pas de PushManager : un iPhone hors de l'écran d'accueil, un vieux navigateur), 'pas-installe' (serveur version 5), '' : possibles
    function notifsPossibles() {
      const c = config(); if (!c) return 'absent';
      if (!c.vapid) return 'bientot';
      if (ancien()) return 'pas-installe';
      let ok = false; try { ok = !!(E.push && E.push.possible()); } catch (e) { ok = false; }
      return ok ? '' : 'impossible';
    }
    function notifs() { return { actif: etat.notifs.actif, prefs: Object.assign({}, etat.notifs.prefs), endpoint: etat.notifs.endpoint, pleineA: etat.notifs.pleineA }; }
    // s'abonner (ou changer ses cas) : la permission, PushManager.subscribe avec la clé publique, puis fournil_abonner
    async function abonner(prefs) {
      const raison = notifsPossibles(); if (raison) return { etat: raison };
      resynchroniser(); if (!etat.rejoint || !etat.id || !etat.jeton) return { etat: 'pas-rejoint' };
      const p = nettoyerPrefs(prefs || etat.notifs.prefs);
      let s = null; try { s = await E.push.abonner(config().vapid); } catch (e) { s = { erreur: 'erreur' }; }
      if (!s || s.erreur || !s.sub) return { etat: (s && s.erreur) || 'erreur' }; // 'refuse' (permission refusée), 'ignore' (pas de réponse), 'erreur'
      const r = await rpc('fournil_abonner', Object.assign(moi(), { p_sub: s.sub, p_prefs: p })), x = pasInstalle(r); if (x) return x;
      if (r.etat !== 'ok') return r;
      if (!r.data || r.data.ok !== true) return { etat: 'refus', erreur: r.data && typeof r.data.erreur === 'string' ? r.data.erreur : 'inconnue' };
      const pr = r.data.prefs && typeof r.data.prefs === 'object' ? nettoyerPrefs(r.data.prefs) : p; // les cas gardés par le serveur
      resynchroniser(); etat.notifs = { actif: true, prefs: pr, endpoint: String(s.sub.endpoint).slice(0, 1000), pleineA: 0 }; sauver(); prevenir();
      return { etat: 'ok' };
    }
    async function desabonner() {
      resynchroniser();
      let endpoint = etat.notifs.endpoint; try { const s = E.push ? await E.push.desabonner() : null; if (s && s.endpoint) endpoint = s.endpoint; } catch (e) { /* le navigateur a déjà oublié l'abonnement */ }
      etat.notifs = notifsNeuves(etat.notifs.prefs); sauver(); prevenir();
      if (!config() || !etat.id || !etat.jeton || !endpoint || ancien()) return { etat: 'ok' };
      const r = await rpc('fournil_desabonner', Object.assign(moi(), { p_endpoint: endpoint }));
      return r.etat === 'ok' || r.etat === 'pas-ouvert' ? { etat: 'ok' } : r;
    }
    // l'heure où la boutique sera pleine (ms), annoncée en quittant le jeu ; null au retour (annule). Un seul appel par changement.
    function planifier(ms) {
      if (!config() || ancien()) return Promise.resolve({ etat: 'saute', pourquoi: 'absent' });
      if (!etat.notifs.actif || !etat.notifs.prefs.pleine || !etat.rejoint || !etat.id) return Promise.resolve({ etat: 'saute', pourquoi: 'pas-abonne' });
      const v = Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null, avant = etat.notifs.pleineA;
      if (v == null && !avant) return Promise.resolve({ etat: 'saute', pourquoi: 'rien' });
      if (v != null && avant && Math.abs(avant - v) < 60e3) return Promise.resolve({ etat: 'saute', pourquoi: 'deja' });
      etat.notifs.pleineA = v || 0; sauver();
      return rpc('fournil_planifier', Object.assign(moi(), { p_pleine_a: v == null ? null : new Date(v).toISOString() }), { keepalive: true }).then((r) => {
        if (r.etat === 'pas-ouvert') sansCopains = true;
        else if (r.etat !== 'ok' && etat.notifs.pleineA === (v || 0)) { etat.notifs.pleineA = avant; sauver(); } // pas parti : on réessaiera
        return r;
      });
    }
    async function essai() {
      if (!config() || !etat.rejoint || !etat.id) return { etat: 'pas-rejoint' };
      const r = await rpc('fournil_notif_essai', moi()), x = pasInstalle(r); if (x) return x;
      if (r.etat !== 'ok') return r;
      return r.data && r.data.ok === true ? { etat: 'ok' } : { etat: 'refus', erreur: r.data && typeof r.data.erreur === 'string' ? r.data.erreur : 'inconnue' };
    }

    // les cadeaux (supabase/fournil-cadeaux.sql) : des euros déposés pour ce joueur, reçus une fois. cadeaux() → { etat, cadeaux: [{ n, montant, motif }] } ;
    // cadeauRecu(n) les retire de la boîte. Un serveur sans la boîte (pas encore collée) : plus aucune lecture jusqu'au prochain lancement.
    let cadeauxAbsents = false;
    function cadeaux() {
      if (!config() || cadeauxAbsents) return Promise.resolve({ etat: 'absent', cadeaux: [] });
      resynchroniser();
      if (!etat.rejoint || !etat.id || !etat.jeton) return Promise.resolve({ etat: 'saute', cadeaux: [] });
      return rpc('fournil_mes_cadeaux', { p_id: etat.id, p_jeton: etat.jeton }).then((r) => {
        if (r.etat === 'pas-ouvert') cadeauxAbsents = true;
        const liste = r.etat === 'ok' && r.data && r.data.ok === true && Array.isArray(r.data.cadeaux) ? r.data.cadeaux : [];
        return { etat: r.etat, cadeaux: liste.map((c) => ({ n: Math.floor(+c.n), montant: +c.montant, motif: typeof c.motif === 'string' ? c.motif.slice(0, 120) : '' })).filter((c) => c.n > 0 && Number.isFinite(c.montant) && c.montant > 0 && c.montant <= 1e30) };
      }).catch(() => ({ etat: 'erreur', cadeaux: [] }));
    }
    function cadeauRecu(n) {
      if (!config() || !etat.id || !etat.jeton) return Promise.resolve({ etat: 'absent' });
      return rpc('fournil_cadeau_recu', { p_id: etat.id, p_jeton: etat.jeton, p_n: n }).catch(() => ({ etat: 'erreur' }));
    }
    function demarrer(o) {
      if (demarre || !config()) return false;
      demarre = true;
      if (etat.notifs.pleineA) planifier(null); // le joueur est revenu : la notification « boutique pleine » n'a plus lieu d'être
      const ecart = E.maintenant() - (etat.essai || 0);
      if (!etat.rejoint && etat.id && etat.jeton && !(etat.essai && ecart >= 0 && ecart < 30e3)) { // une inscription dont la réponse s'est perdue : on efface la ligne fantôme, sans bruit (pas si une autre fenêtre inscrit à l'instant)
        const id = etat.id, jeton = etat.jeton;
        nettoyage = rpc('fournil_retirer', { p_id: id, p_jeton: jeton }).then((r) => {
          if (r.etat === 'ok' && r.data && r.data.ok === true && !etat.rejoint && etat.id === id) { etat.id = null; etat.jeton = null; sauver(); } // sinon on garde l'identité : on réessaiera au prochain lancement
        }).catch(() => { /* rien */ }).then(() => { nettoyage = null; });
      }
      envoyer('lancement').then((r) => { if (!(r && r.etat === 'ok')) battre('lancement'); }).catch(() => { /* rien */ }); // un envoi accepté vaut un signe de vie ; sinon, un battement
      chargerRecompenses({ ecart: 0 });
      const pas = (o && o.pas) || 60e3;
      if (o && o.minuteur === false) return true;
      minuteur = setInterval(() => { tick(); }, pas);
      return true;
    }
    function tick() { // le minuteur : un envoi toutes les 5 min et un battement toutes les 2 min, seulement quand la page est visible
      let vu = true; try { vu = E.visible(); } catch (e) { vu = true; }
      if (vu) chargerRecompenses();
      if (!vu) return Promise.resolve({ etat: 'saute', pourquoi: 'cachee' });
      return envoyer('periodique').then((r) => { if (!(r && r.etat === 'ok')) battre('periodique'); return r; });
    }
    function arreter() { if (minuteur) clearInterval(minuteur); minuteur = 0; demarre = false; }
    function resume() { // pour l'interface : rejoint, pseudo, et les dernières places connues (celle de la semaine seulement si c'est cette semaine, ou une plus récente : le téléphone peut retarder sur le serveur)
      const t = E.maintenant(), d = etat.dernier || {}, lundi = lundiParis(t);
      return { disponible: !!config(), rejoint: etat.rejoint, pseudo: etat.pseudo, semaine: d.semaine && typeof d.semaine.lundi === 'string' && d.semaine.lundi >= lundi ? d.semaine : null, total: d.total || null, quartier: d.quartier || null, hantee: d.hantee || null, quand: d.quand || 0, statut, version };
    }
    return {
      disponible: () => !!config(), etat: () => etat, resume, version: () => version, cache: (p) => cache[periodeDe(p)], enChargement: (p) => charge[periodeDe(p)],
      envoyer, charger, ouvrir, choisirPseudo, quitter, demarrer, arreter, ecouter: (f) => { ecouteurs.push(f); },
      chargerRecompenses, recompenses, choisirTenue, annonceFaite, lundi, battre, cadeaux, cadeauRecu,
      copains: () => !!config() && !ancien(), boutique, dons, pourboire, objectif, objectifVu: () => objCache, pourboiresRecus, accueillirPourboires, objectifFait,
      notifsPossibles, notifs, abonner, desabonner, planifier, essai,
      relire: () => { etat = lireEtat(E.stockage); prevenir(); return etat; },
      resynchroniser, tick,
    };
  }

  // ─── les notifications dans le navigateur : la permission, puis PushManager.subscribe (service worker fournil/sw.js) ───
  // Sur iPhone, PushManager n'existe que dans l'app ajoutée à l'écran d'accueil (iOS 16.4 ou plus) : sinon possible() est faux.
  // La permission est demandée en premier, encore dans le geste du joueur (Safari l'exige).
  function pushNavigateur(w) {
    const n = w.navigator;
    const pret = () => Promise.race([n.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    const memeCle = (sub, cle) => { try { const a = sub.options && sub.options.applicationServerKey; if (!a) return true; const x = new Uint8Array(a); return x.length === cle.length && x.every((v, i) => v === cle[i]); } catch (e) { return true; } };
    return {
      possible: () => !!(n && n.serviceWorker && 'PushManager' in w && 'Notification' in w),
      permission: () => { try { return w.Notification ? w.Notification.permission : 'absent'; } catch (e) { return 'absent'; } },
      async abonner(vapid) {
        let perm = w.Notification.permission;
        if (perm === 'default') perm = await new Promise((res) => { try { const p = w.Notification.requestPermission(res); if (p && p.then) p.then(res, () => res('default')); } catch (e) { res('default'); } });
        if (perm !== 'granted') return { erreur: perm === 'denied' ? 'refuse' : 'ignore' };
        const reg = await pret(); if (!reg || !reg.pushManager) return { erreur: 'sw' };
        const cle = cleVapid(vapid);
        let sub = await reg.pushManager.getSubscription();
        if (sub && !memeCle(sub, cle)) { try { await sub.unsubscribe(); } catch (e) { /* rien */ } sub = null; } // une autre clé (changée dans config.js) : on se réabonne
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle });
        const j = sub.toJSON ? sub.toJSON() : sub, k = j.keys || {};
        if (!j.endpoint || !k.p256dh || !k.auth) return { erreur: 'erreur' };
        return { sub: { endpoint: j.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } } };
      },
      async desabonner() {
        const reg = n.serviceWorker ? await pret() : null; const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
        if (!sub) return { endpoint: null };
        const e = sub.endpoint; try { await sub.unsubscribe(); } catch (x) { /* rien */ } return { endpoint: e };
      },
    };
  }
  // l'iPhone (ou l'iPad) ouvert dans Safari plutôt que depuis l'écran d'accueil : les notifications demandent d'abord l'ajout à l'écran d'accueil
  function iosHorsEcran(w) {
    try {
      const n = w.navigator, ua = String(n.userAgent || ''), ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1);
      const seule = n.standalone === true || (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches);
      const v = /OS (\d+)_(\d+)/.exec(ua), vieux = v ? +v[1] < 16 || (+v[1] === 16 && +v[2] < 4) : false;
      return ios ? { ios: true, horsEcran: !seule, vieux } : { ios: false, horsEcran: false, vieux: false };
    } catch (e) { return { ios: false, horsEcran: false, vieux: false }; }
  }

  // ─── dans le navigateur : la configuration de fournil/config.js, localStorage, fetch, la visibilité de la page ───
  function navigateur(o) {
    const w = typeof window !== 'undefined' ? window : null;
    if (!w || !lireConfig(w.FOURNIL_CONFIG)) return null; // l'artefact Claude n'a pas de config : le classement s'y cache
    let stockage = null; try { stockage = w.localStorage; } catch (e) { stockage = null; }
    const m = creerMoteur({
      config: () => w.FOURNIL_CONFIG, fetch: (u, i) => w.fetch(u, i), stockage, fortune: o && o.fortune, ...(o && typeof o.points === 'function' ? { points: o.points } : {}), ...(o && typeof o.quartier === 'function' ? { quartier: o.quartier } : {}),
      ...(o && typeof o.evenement === 'function' ? { evenement: o.evenement } : {}), // le score de l'événement générique en cours : { id: 'hantee', score } (null : rien)
      ...(o && typeof o.maintenant === 'function' ? { maintenant: o.maintenant } : {}), // l'horloge de confiance du jeu (HORLOGE), plutôt que celle du téléphone
      ...(o && typeof o.photo === 'function' ? { photo: o.photo } : {}), // version 6 : la photo de sa boutique (CLASSEMENT.photo)
      enLigne: () => !(w.navigator && w.navigator.onLine === false), visible: () => !(w.document && w.document.visibilityState === 'hidden'),
      push: pushNavigateur(w),
    });
    if (w.document) { // au passage en arrière-plan : un dernier envoi qui survit à la fermeture (fetch keepalive) ; au retour au premier plan : un signe de vie
      // version 6 : en quittant, l'heure où la boutique sera pleine (o.pleineA() : maintenant + ses heures d'absence) pour la notification ; au retour, on l'annule
      const pleine = () => { try { const v = o && typeof o.pleineA === 'function' ? o.pleineA() : null; if (Number.isFinite(v)) m.planifier(v); } catch (e) { /* rien */ } };
      const fond = () => { m.envoyer('fond', { keepalive: true }); pleine(); };
      w.document.addEventListener('visibilitychange', () => { if (w.document.visibilityState === 'hidden') fond(); else { m.battre('retour'); m.planifier(null); } });
      w.addEventListener('pagehide', fond);
      w.addEventListener('pageshow', (e) => { if (e && e.persisted) m.planifier(null); });
    }
    // une autre fenêtre du jeu (appli installée + onglet) a changé le classement : on suit tout de suite
    try { w.addEventListener('storage', (e) => { if (!e || e.key === CLE || e.key === null) m.resynchroniser(); }); } catch (e) { /* rien */ }
    return m;
  }

  return { CLE, REGLES, PERIODES, EVTS, ongletsEvenements, nettoyerEvenements, PSEUDO_MIN, PSEUDO_MAX, lundiParis, decalageParis, dateCourte, normaliserPseudo, verifierPseudo, messagePseudo, rangTexte, rangPhrase, boulangers,
    etatNeuf, nettoyerEtat, lireEtat, ecrireEtat, nouvelId, nouveauJeton, deciderEnvoi, nettoyerClassement, lireConfig, appeler, creerMoteur, navigateur,
    METAUX, NOMS_METAL, metal, decalerSemaine, recompensesNeuves, nettoyerRecompenses, nettoyerPodiums, nettoyerRecompensesServeur, tenuePortee, coupeDuComptoir, aAnnoncer, tenuesGagnees, phraseAnnonce,
    PHOTO, photo, nettoyerPhoto, boutiqueDepuisPhoto, nettoyerBoutique, nettoyerObjectif, nettoyerPourboires, jourParis, PREFS, nettoyerPrefs, cleVapid, pushNavigateur, iosHorsEcran, octetsJson };
});
