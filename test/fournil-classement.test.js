#!/usr/bin/env node
// Le classement du Fournil (src/classement.js) : la partie pure (lundi de Paris, pseudo, rangs, décision d'envoi, état local)
// et le moteur avec un faux réseau (en-têtes, corps des appels, états hors ligne / pas encore ouvert / erreur, pseudo pris, quitter).
'use strict';
const CL = require('../src/classement.js');
let echecs = 0, n = 0;
const check = (ok, m) => { n++; if (!ok) { echecs++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  console.log('── le lundi de la semaine, heure de Paris ──');
  const viaIntl = (ms) => { // la référence : le calendrier de Paris d'après Intl
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const j = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
    return new Date(Date.UTC(+p.year, +p.month - 1, +p.day - j)).toISOString().slice(0, 10);
  };
  check(CL.lundiParis(Date.UTC(2026, 9, 4, 22, 0)) === '2026-10-05', 'lundi 5 octobre 2026, minuit à Paris (22 h UTC, heure d’été) : « 2026-10-05 »');
  check(CL.lundiParis(Date.UTC(2026, 9, 4, 21, 59, 59)) === '2026-09-28', 'dimanche 4 octobre, 23 h 59 à Paris : encore la semaine du 28 septembre');
  check(CL.lundiParis(Date.UTC(2026, 9, 25, 0, 59)) === '2026-10-19' && CL.lundiParis(Date.UTC(2026, 9, 25, 1, 0)) === '2026-10-19', 'la nuit du passage à l’heure d’hiver (dimanche 25 octobre) reste dans la semaine du 19');
  check(CL.lundiParis(Date.UTC(2026, 9, 25, 22, 59)) === '2026-10-19' && CL.lundiParis(Date.UTC(2026, 9, 25, 23, 0)) === '2026-10-26', 'lundi 26 octobre commence à 23 h UTC (heure d’hiver)');
  check(CL.lundiParis(Date.UTC(2027, 2, 28, 22, 0)) === '2027-03-29' && CL.lundiParis(Date.UTC(2027, 2, 28, 21, 59)) === '2027-03-22', 'lundi 29 mars 2027 commence à 22 h UTC (heure d’été depuis la veille)');
  check(CL.lundiParis(Date.UTC(2026, 11, 31, 23, 30)) === '2026-12-28' && CL.lundiParis(Date.UTC(2027, 0, 3, 23, 0)) === '2027-01-04', 'le passage de l’année');
  { let faux = 0, k = 0; let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (; k < 4000; k++) { const t = Date.UTC(2019, 0, 1) + Math.floor(rnd() * 20 * 365.25 * 864e5); if (CL.lundiParis(t) !== viaIntl(t)) faux++; }
    for (let a = 2020; a <= 2040; a++) for (const mois of [2, 9]) for (let j = 24; j <= 31; j++) for (const h of [0, 0.999, 1, 21.999, 22, 22.999, 23]) { const t = Date.UTC(a, mois, j) + h * 3600e3; k++; if (CL.lundiParis(t) !== viaIntl(t)) faux++; }
    check(faux === 0, `${k} instants de 2019 à 2040 (dont toutes les nuits de changement d’heure) : même lundi qu’Intl (Europe/Paris)${faux ? ` — ${faux} écarts` : ''}`); }
  check(CL.dateCourte('2026-10-05') === '5 oct.' && CL.dateCourte('2026-06-01') === '1er juin' && CL.dateCourte('n’importe quoi') === '', 'la date courte : « 5 oct. », « 1er juin »');

  console.log('── le pseudo ──');
  check(CL.normaliserPseudo('  Mamie   Jo ') === 'Mamie Jo' && CL.normaliserPseudo('L’as\tdu\n four') === "L'as du four" && CL.normaliserPseudo(null) === '', 'espaces repliés, apostrophe typographique de l’iPhone remplacée par la droite');
  check(CL.normaliserPseudo('Léa') === 'Léa', 'accents composés ramenés à un seul caractère (NFC)');
  const ok = ['Léa', 'Mamie Jo', "L'as du four", 'Zoé_42', 'J.-P.', 'Œufs Brouillés', 'Ÿvette', 'Łukasz', 'Şeker', 'Žofia', 'ab', '0123456789abcdef'];
  check(ok.every((p) => CL.verifierPseudo(p).ok), 'acceptés : ' + ok.join(' · '));
  const ko = { '': 'vide', '   ': 'vide', a: 'court', '0123456789abcdefg': 'long', 'Paulo le boulanger': 'long', 'pain@chocolat': 'caracteres', 'Léa 🥐': 'caracteres', 'Σigma': 'caracteres', 'Ivan ×2': 'caracteres', 'ɐbc': 'caracteres', 'Pauǀ': 'caracteres', 'Marıe': 'caracteres', 'ǃǃ': 'caracteres', 'Ŀéa': 'caracteres', 'ſam': 'caracteres', '<b>x</b>': 'caracteres', "--__''": 'lettre', '..': 'lettre' };
  check(Object.entries(ko).every(([p, r]) => { const v = CL.verifierPseudo(p); return !v.ok && v.raison === r; }), 'refusés avec la bonne raison : ' + Object.entries(ko).map(([p, r]) => `« ${p} » → ${r}`).join(', '));
  check(CL.verifierPseudo('  Mamie    Jo  ').pseudo === 'Mamie Jo' && CL.verifierPseudo('0123456789abcde ').ok, 'la longueur se compte après normalisation');
  check(CL.verifierPseudo('Ééééééééééééééé').ok && CL.verifierPseudo('Éééééééééééééééé').ok && !CL.verifierPseudo('Ééééééééééééééééé').ok, '16 lettres accentuées passent, 17 non (on compte des caractères, pas des octets)');
  check(/«\s@\s»/.test(CL.messagePseudo(CL.verifierPseudo('pain@chocolat'))) && /16 au plus/.test(CL.messagePseudo(CL.verifierPseudo('Paulo le boulanger'))) && /«\sLéa\s»/.test(CL.messagePseudo(CL.verifierPseudo(' Léa '))), 'les messages sous le champ : le caractère refusé, la longueur, l’aperçu');

  console.log('── les rangs ──');
  check(CL.rangTexte(1) === '1er' && CL.rangTexte(2) === '2e' && CL.rangTexte(21) === '21e' && CL.rangTexte(0) === '—' && CL.rangTexte(null) === '—' && CL.rangTexte(2.5) === '—', '1er, 2e, 21e ; rien pour un rang invalide');
  check(CL.rangPhrase(3, 7, 'semaine') === '3e cette semaine sur 7' && CL.rangPhrase(1, 12, 'total') === '1er de tous les temps sur 12' && CL.rangPhrase(5, 3, 'total') === '5e de tous les temps sur 5' && CL.rangPhrase(null, 3) === '', 'les phrases : « 3e cette semaine sur 7 », « 1er de tous les temps sur 12 »');
  check(CL.boulangers(1) === '1 boulanger' && CL.boulangers(7) === '7 boulangers', '1 boulanger, 7 boulangers');

  console.log('── la décision d’envoyer ──');
  const T = Date.UTC(2026, 9, 9, 12);
  const rejoint = { id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', jeton: 'a'.repeat(64), pseudo: 'Léa', rejoint: true, essai: T - 60e3, dernierEnvoi: T - 60e3, valeur: 100 };
  const dec = (e, v, t, r) => CL.deciderEnvoi(e, v, t, r);
  check(!dec({ ...rejoint, rejoint: false }, 200, T, 'lancement').envoyer && dec({ ...rejoint, rejoint: false }, 200, T).pourquoi === 'pas-rejoint', 'pas rejoint : rien ne part');
  check(dec(rejoint, 200, T, 'lancement').envoyer, 'au lancement, la fortune a bougé : envoi');
  check(!dec({ ...rejoint, essai: T - 14e3 }, 200, T, 'feuille').envoyer && dec({ ...rejoint, essai: T - 15e3 }, 200, T, 'feuille').envoyer, 'jamais plus d’un envoi toutes les 15 s');
  check(!dec(rejoint, 100, T, 'feuille').envoyer && dec(rejoint, 100, T, 'feuille').pourquoi === 'inchange', 'fortune inchangée depuis le dernier envoi réussi : rien');
  check(dec({ ...rejoint, essai: T - 31 * 60e3, dernierEnvoi: T - 31 * 60e3 }, 100, T, 'periodique').envoyer, 'inchangée mais plus de 30 min : envoi quand même (changement de semaine)');
  check(!dec({ ...rejoint, essai: T - 4 * 60e3 }, 200, T, 'periodique').envoyer && dec({ ...rejoint, essai: T - 5 * 60e3 }, 200, T, 'periodique').envoyer, 'l’envoi périodique attend 5 min après le précédent');
  check(dec({ ...rejoint, essai: T + 3600e3, dernierEnvoi: T + 3600e3 }, 200, T, 'lancement').envoyer, 'une horloge remise en arrière ne bloque pas les envois');
  check(!dec(rejoint, NaN, T).envoyer && !dec(rejoint, -1, T).envoyer && !dec(rejoint, Infinity, T).envoyer, 'valeur absurde : rien');

  console.log('── l’état local ──');
  const memoire = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const casse = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
  check(egal(CL.lireEtat(casse), CL.etatNeuf()) && CL.ecrireEtat(casse, CL.etatNeuf()) === false && egal(CL.lireEtat(null), CL.etatNeuf()), 'stockage indisponible : un état neuf, aucune exception');
  { const s = memoire(); s.setItem(CL.CLE, '{abîmé'); check(egal(CL.lireEtat(s), CL.etatNeuf()), 'JSON abîmé : un état neuf'); }
  { const s = memoire(); s.setItem(CL.CLE, JSON.stringify({ id: 'pas-un-uuid', jeton: 'court', pseudo: 'Léa', rejoint: true, dernierEnvoi: 'hier', essai: null, valeur: 'beaucoup', dernier: { semaine: { rang: -2 }, total: { rang: 4, joueurs: 2 } } }));
    const e = CL.lireEtat(s); check(e.id === null && e.jeton === null && e.rejoint === false && e.pseudo === 'Léa' && e.dernierEnvoi === 0 && e.valeur === null && e.dernier.semaine === null && egal(e.dernier.total, { rang: 4, joueurs: 4 }), 'champs faux : écartés un par un (pas d’identité, donc pas rejoint ; rang total 4 sur au moins 4)'); }
  { const s = memoire(), e = { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Mamie Jo', rejoint: true, dernierEnvoi: T, valeur: 1234, essai: T, dernier: { semaine: { rang: 3, joueurs: 7, lundi: '2026-10-05' }, total: { rang: 12, joueurs: 30 }, quand: T } };
    CL.ecrireEtat(s, e); check(egal(CL.lireEtat(s), e), 'aller-retour fidèle'); }
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(CL.nouvelId()) && /^[0-9a-f]{64}$/.test(CL.nouveauJeton()) && CL.nouveauJeton() !== CL.nouveauJeton(), 'identifiant UUID v4, jeton de 32 octets en hexadécimal, tirés au hasard');
  { const c = globalThis.crypto; Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const id = CL.nouvelId(), j = CL.nouveauJeton(); Object.defineProperty(globalThis, 'crypto', { value: c, configurable: true });
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) && /^[0-9a-f]{64}$/.test(j), 'sans crypto : repli qui garde le bon format'); }

  console.log('── la configuration et les réponses ──');
  check(CL.lireConfig(null) === null && CL.lireConfig({ supabaseUrl: '', supabaseKey: 'x' }) === null && CL.lireConfig({ supabaseUrl: 'http://exemple.supabase.co', supabaseKey: 'x' }) === null, 'pas de configuration (artefact Claude), ou pas en https : classement caché');
  check(egal(CL.lireConfig({ supabaseUrl: 'https://abc.supabase.co/', supabaseKey: ' sb_publishable_x ' }), { url: 'https://abc.supabase.co', key: 'sb_publishable_x', bearer: true, vapid: '' }), 'configuration lue : barre finale et espaces retirés');
  { const d = CL.nettoyerClassement({ semaine: '2026-10-05', joueurs: 2, lignes: [{ rang: 1, pseudo: 'A', valeur: '12.5', moi: false }, { rang: 0, pseudo: 'faux' }, null, { rang: 2, pseudo: '<i>B</i>', valeur: 3, moi: true }], moi: { rang: 70, valeur: 1 } });
    check(d.lignes.length === 2 && d.lignes[0].valeur === 12.5 && d.lignes[1].moi === true && d.joueurs === 70 && d.moi.rang === 70 && d.semaine === '2026-10-05', 'réponse nettoyée : lignes invalides écartées, nombre de joueurs au moins le rang'); }
  check(egal(CL.nettoyerClassement('n’importe quoi'), { semaine: '', joueurs: 0, lignes: [], moi: null, version: 0 }), 'réponse absurde : liste vide');

  console.log('── le moteur, avec un faux réseau ──');
  const URL = 'https://jklbitrlkfrktmnarejc.supabase.co', CLEF = 'sb_publishable_test';
  const faux = (gerer) => { const appels = []; return { appels, fetch: async (url, init) => { appels.push({ url, init, corps: JSON.parse(init.body) }); return gerer(url, init, JSON.parse(init.body)); } }; };
  const rep = (status, obj) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj) });
  let horloge = T; const temps = { maintenant: () => horloge, attendre: async (ms) => { horloge += ms; } };
  let fortune = 1234.9;
  const moteur = (reseau, extra) => CL.creerMoteur({ config: () => ({ supabaseUrl: URL, supabaseKey: CLEF }), fetch: reseau.fetch, stockage: (extra && extra.stockage) || memoire(), fortune: () => fortune, ...temps, ...(extra || {}) });
  // un faux serveur qui suit le contrat (sans le sha256 : il garde le jeton tel quel)
  const serveur = () => {
    const lignes = new Map(), dernier = new Map(); let pris = new Set(['mamie jo']);
    return { lignes, gerer: (url, init, c) => {
      const nom = url.split('/rpc/')[1];
      if (nom === 'fournil_publier') {
        if (dernier.has(c.p_id) && horloge - dernier.get(c.p_id) < 10e3) return rep(200, { ok: false, erreur: 'trop_vite', rang_semaine: null, rang_total: null, joueurs: lignes.size });
        const l = lignes.get(c.p_id);
        if (l && l.jeton !== c.p_jeton) return rep(200, { ok: false, erreur: 'jeton', rang_semaine: null, rang_total: null, joueurs: lignes.size });
        if ([...lignes.values()].some((x) => x !== l && x.pseudo.toLowerCase() === c.p_pseudo.toLowerCase()) || pris.has(c.p_pseudo.toLowerCase())) return rep(200, { ok: false, erreur: 'pseudo_pris', rang_semaine: null, rang_total: null, joueurs: lignes.size });
        dernier.set(c.p_id, horloge); lignes.set(c.p_id, { jeton: c.p_jeton, pseudo: c.p_pseudo, fortune: c.p_fortune });
        return rep(200, { ok: true, erreur: null, rang_semaine: 2, rang_total: 5, joueurs: 9 });
      }
      if (nom === 'fournil_classement') return rep(200, { semaine: '2026-10-05', joueurs: 4, lignes: [{ rang: 1, pseudo: 'Mamie Jo', valeur: 9e9, moi: false }], moi: lignes.has(c.p_id) ? { rang: 4, valeur: 1234 } : null });
      if (nom === 'fournil_retirer') { const l = lignes.get(c.p_id); if (l && l.jeton === c.p_jeton) lignes.delete(c.p_id); return rep(200, { ok: !!l }); }
      return rep(404, { code: 'PGRST202' });
    } };
  };
  { const sv = serveur(), r = faux(sv.gerer), s = memoire(), m = moteur(r, { stockage: s });
    check(m.disponible() && m.resume().rejoint === false, 'moteur prêt, pas encore rejoint');
    check((await m.envoyer('lancement')).etat === 'saute' && r.appels.length === 0, 'pas rejoint : aucun appel au lancement');
    check((await m.choisirPseudo('x')).etat === 'invalide' && r.appels.length === 0, 'pseudo invalide : aucun appel');
    const pris = await m.choisirPseudo('  mamie   JO ');
    check(pris.etat === 'refus' && pris.erreur === 'pseudo_pris' && !m.resume().rejoint, 'pseudo déjà pris : refus, toujours pas rejoint');
    const a0 = r.appels[0];
    check(a0.url === URL + '/rest/v1/rpc/fournil_publier' && a0.init.method === 'POST' && a0.init.headers.apikey === CLEF && a0.init.headers.Authorization === 'Bearer ' + CLEF && a0.init.headers['Content-Type'] === 'application/json', 'POST vers /rest/v1/rpc/fournil_publier avec apikey, Authorization: Bearer et Content-Type JSON');
    check(egal(Object.keys(a0.corps).sort(), ['p_fortune', 'p_id', 'p_jeton', 'p_pseudo']) && a0.corps.p_fortune === 1234 && a0.corps.p_pseudo === 'mamie JO' && /^[0-9a-f]{64}$/.test(a0.corps.p_jeton), 'corps : p_id, p_jeton (64 hexa), p_pseudo normalisé, p_fortune = Math.floor(st.lifetime)');
    const t0 = horloge, ok1 = await m.choisirPseudo('Léa');
    check(ok1.etat === 'ok' && m.resume().rejoint && m.resume().pseudo === 'Léa' && horloge - t0 < 1e3, 'un autre pseudo juste après un refus : rejoint sans attendre (un refus ne compte pas pour les 10 s du serveur)');
    check(sv.lignes.get(m.etat().id).jeton === a0.corps.p_jeton && r.appels.length === 2, 'même identité qu’au premier essai, et pas d’envoi en trop');
    const e = JSON.parse(s.getItem(CL.CLE));
    check(e.rejoint === true && e.pseudo === 'Léa' && e.valeur === 1234 && e.dernier.semaine.rang === 2 && e.dernier.total.rang === 5 && e.dernier.total.joueurs === 9 && e.dernier.semaine.lundi === '2026-10-05', 'état local écrit : rejoint, pseudo, valeur, derniers rangs (2e cette semaine, 5e de tous les temps sur 9)');
    check(m.resume().semaine.rang === 2 && m.resume().total.rang === 5, 'résumé pour l’interface');
    horloge += 5e3; check((await m.envoyer('feuille')).pourquoi === 'trop-tot', '5 s plus tard : pas d’envoi');
    horloge += 20e3; check((await m.envoyer('feuille')).pourquoi === 'inchange', 'fortune inchangée : pas d’envoi');
    fortune = 5000.7; const env = await m.envoyer('fond', { keepalive: true }), dern = r.appels[r.appels.length - 1];
    check(env.etat === 'ok' && dern.corps.p_fortune === 5000 && dern.init.keepalive === true && dern.corps.p_pseudo === 'Léa', 'passage en arrière-plan : fetch keepalive avec la nouvelle fortune');
    const ch = await m.charger('semaine'), ac = r.appels[r.appels.length - 1];
    check(ch.etat === 'ok' && ch.data.lignes.length === 1 && ac.corps.p_periode === 'semaine' && ac.corps.p_id === m.etat().id && ac.corps.p_limite === 50 && !('p_jeton' in ac.corps), 'la liste : fournil_classement(semaine, mon id, 50), sans le jeton');
    check(m.etat().dernier.semaine.rang === 4 && m.etat().dernier.semaine.joueurs === 4, 'ma place lue dans la liste : 4e sur 4');
    horloge += 20e3; fortune = 6000; await m.envoyer('feuille');
    check(m.cache('semaine').quand === 0 && m.cache('semaine').etat === 'ok', 'un envoi réussi rend les listes gardées périmées (relues au prochain coup d’œil)');
    horloge += 20e3; const q = await m.quitter(), aq = r.appels[r.appels.length - 1];
    check(q.etat === 'ok' && aq.url.endsWith('/fournil_retirer') && egal(Object.keys(aq.corps).sort(), ['p_id', 'p_jeton']) && sv.lignes.size === 0 && !m.resume().rejoint && m.etat().id === null && m.resume().pseudo === 'Léa', 'quitter : fournil_retirer(id, jeton), ligne effacée, identité oubliée, pseudo proposé pour un retour');
    horloge += 20e3; check((await m.envoyer('lancement')).pourquoi === 'pas-rejoint', 'après avoir quitté : plus aucun envoi');
  }
  { // les états du réseau
    const etats = {};
    for (const [nom, gerer] of Object.entries({
      'hors-ligne': async () => { throw new TypeError('Failed to fetch'); },
      'pas-ouvert': async () => rep(404, { code: 'PGRST202', message: 'Could not find the function public.fournil_classement' }),
      'pas-ouvert-2': async () => rep(400, { code: 'PGRST202' }),
      erreur: async () => rep(500, { message: 'boum' }),
      'erreur-json': async () => ({ ok: true, status: 200, text: async () => '<html>' }),
      lent: () => new Promise(() => {}),
    })) { const m = moteur(faux(gerer), { delaiMax: 50 }); etats[nom] = (await m.charger('total')).etat; }
    check(etats['hors-ligne'] === 'hors-ligne', 'réseau coupé : « hors ligne »');
    check(etats.lent === 'lent', 'serveur muet (délai dépassé) : « lent », pas « hors ligne » (le téléphone est connecté)');
    { const ra = faux(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }); check((await moteur(ra).charger('total')).etat === 'lent', 'fetch coupé par notre délai (AbortError) : « lent » aussi'); }
    check(etats['pas-ouvert'] === 'pas-ouvert' && etats['pas-ouvert-2'] === 'pas-ouvert', 'fonction absente (404, PGRST202) : « pas encore ouvert »');
    check(etats.erreur === 'erreur' && etats['erreur-json'] === 'erreur', 'erreur du serveur ou réponse illisible : « erreur »');
    const r = faux(async () => rep(200, {})), m = moteur(r, { enLigne: () => false });
    check((await m.charger('semaine')).etat === 'hors-ligne' && r.appels.length === 0, 'navigateur hors ligne : aucun appel');
    const sans = CL.creerMoteur({ config: () => undefined, fetch: r.fetch, stockage: memoire(), fortune: () => 1 });
    check(!sans.disponible() && (await sans.charger('semaine')).etat === 'absent' && (await sans.envoyer('lancement')).etat === 'absent' && sans.demarrer() === false && r.appels.length === 0, 'sans configuration : rien ne part, rien ne démarre');
    let essais = 0; const rk = faux(async (u, init) => { essais++; if (init.keepalive) throw new TypeError('keepalive refusé'); return rep(200, { ok: true, rang_semaine: 1, rang_total: 1, joueurs: 1 }); });
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true });
    const mk = moteur(rk, { stockage: s }); horloge += 60e3;
    check((await mk.envoyer('fond', { keepalive: true })).etat === 'ok' && essais === 2, 'un navigateur qui refuse keepalive : l’envoi repart sans');
  }
  { // une ligne qui n'est plus à nous (jeton refusé) : on oublie l'identité, le joueur rejoindra
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true });
    const m = moteur(faux(async () => rep(200, { ok: false, erreur: 'jeton' })), { stockage: s }); horloge += 60e3;
    const r = await m.envoyer('lancement');
    check(r.etat === 'refus' && r.erreur === 'jeton' && !m.resume().rejoint && m.etat().id === null, 'jeton refusé : plus rejoint, identité oubliée');
  }
  { // effacé par le ménage des 90 jours, et son pseudo repris entre-temps : l'envoi automatique reçoit « pseudo_pris »
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true });
    const m = moteur(faux(async () => rep(200, { ok: false, erreur: 'pseudo_pris' })), { stockage: s }); horloge += 60e3;
    const r = await m.envoyer('lancement'), lu = CL.lireEtat(s);
    check(r.etat === 'refus' && r.erreur === 'pseudo_pris' && !m.resume().rejoint && m.etat().id === null && m.resume().pseudo === 'Léa' && !lu.rejoint && lu.id === null && lu.pseudo === 'Léa',
      'pseudo repris pendant une longue absence : plus rejoint, identité oubliée, le pseudo reste proposé');
  }
  { // trop vite malgré l'attente : un seul nouvel essai
    let n = 0; const m = moteur(faux(async () => { n++; return rep(200, n === 1 ? { ok: false, erreur: 'trop_vite' } : { ok: true, rang_semaine: 1, rang_total: 1, joueurs: 1 }); }));
    horloge += 60e3; check((await m.choisirPseudo('Zoé')).etat === 'ok' && n === 2, '« trop vite » au premier essai : on attend 10 s et on réessaie une fois');
  }
  { // le minuteur : un envoi toutes les 5 min quand la page est visible, rien quand elle est cachée
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true, essai: horloge, dernierEnvoi: horloge, valeur: 1 });
    const r = faux(async () => rep(200, { ok: true, rang_semaine: 1, rang_total: 1, joueurs: 1 })); let visible = false;
    const m = moteur(r, { stockage: s, visible: () => visible }); fortune = 99;
    const envois = () => r.appels.filter((a) => a.url.endsWith('/fournil_publier')).length; // (les récompenses sont lues à part, au lancement)
    horloge += 6 * 60e3; m.demarrer({ minuteur: false }); await new Promise((ok) => setTimeout(ok, 10));
    check(envois() === 1, 'au démarrage (après les gains hors ligne) : un envoi');
    fortune = 120; visible = true; await m.tick(); check(envois() === 1, 'aussitôt après : le minuteur n’envoie rien (5 min pas écoulées)');
    horloge += 5 * 60e3; visible = false; await m.tick(); check(envois() === 1, '5 min plus tard, page cachée : rien');
    visible = true; await m.tick(); check(envois() === 2, '5 min plus tard, page visible : un envoi');
  }
  // ─── les corrections de la relecture ───
  const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
  // un faux serveur qui répond après un vrai délai (en ms), par fonction ; 'panne' : le réseau coupe
  const serveurLent = (lat) => {
    const lignes = new Map(), appels = [];
    return { lignes, appels, fetch: (url, init) => {
      const nom = url.split('/rpc/')[1], c = JSON.parse(init.body); appels.push({ nom, c });
      return new Promise((ok, ko) => setTimeout(() => {
        if (lat[nom] === 'panne') return ko(new TypeError('Failed to fetch'));
        let d;
        if (nom === 'fournil_publier') { const l = lignes.get(c.p_id); if (l && l.jeton !== c.p_jeton) d = { ok: false, erreur: 'jeton' }; else { lignes.set(c.p_id, { jeton: c.p_jeton, pseudo: c.p_pseudo }); d = { ok: true, erreur: null, rang_semaine: 1, rang_total: 1, joueurs: lignes.size }; } }
        else if (nom === 'fournil_retirer') { const l = lignes.get(c.p_id); if (!l || l.jeton === c.p_jeton) lignes.delete(c.p_id); d = { ok: !l || l.jeton === c.p_jeton }; }
        else d = { semaine: '2026-10-05', joueurs: lignes.size, lignes: [], moi: null };
        ok(rep(200, d));
      }, typeof lat[nom] === 'number' ? lat[nom] : 5));
    } };
  };
  const compte = (appels, nom) => appels.filter((a) => (a.nom || a.url.split('/rpc/')[1]) === nom).length;

  console.log('── le tour des 10 s : seul un envoi accepté compte ──');
  { const sv = serveur(), r = faux(sv.gerer), m = moteur(r);
    horloge += 60e3; check((await m.choisirPseudo('Ancien')).etat === 'ok', 'inscrit sous « Ancien »');
    const tAccepte = horloge; horloge += 2e3; const n0 = r.appels.length; let attente = 0;
    const res = await m.choisirPseudo('Nouveau', { attente: (ms) => { attente = ms; } });
    check(res.etat === 'ok' && m.etat().pseudo === 'Nouveau' && horloge - tAccepte >= 10e3 && r.appels.length === n0 + 1, 'changer de pseudo 2 s après un envoi accepté : on attend son tour (10 s), un seul appel, pas de « trop vite »');
    check(attente > 1e3, 'l’interface est prévenue d’une vraie attente (pour dire « encore quelques secondes »)');
  }

  console.log('── « Annuler » pendant l’attente ──');
  { const sv = serveur(), r = faux(sv.gerer), m = moteur(r);
    horloge += 60e3; await m.choisirPseudo('Ancien'); horloge += 2e3; const n0 = r.appels.length;
    const res = await m.choisirPseudo('Pas Voulu', { annule: () => true });
    check(res.etat === 'annule' && m.etat().pseudo === 'Ancien' && r.appels.length === n0 && [...sv.lignes.values()][0].pseudo === 'Ancien', 'annulé pendant l’attente : rien ne part, le pseudo ne change pas');
    const res2 = await m.choisirPseudo('Pas Voulu', { annule: () => false });
    check(res2.etat === 'ok' && m.etat().pseudo === 'Pas Voulu' && r.appels.length === n0 + 1, 'pas annulé : le pseudo part');
  }

  console.log('── l’ouverture de la feuille : la liste tout de suite, une seule lecture à la fois ──');
  { const sv = serveurLent({ fournil_publier: 40, fournil_classement: 10 }), m = moteur(sv);
    horloge += 60e3; await m.choisirPseudo('Ouvreur'); horloge += 60e3; fortune += 10;
    const avant = compte(sv.appels, 'fournil_classement'), lecture = m.ouvrir('semaine');
    check(compte(sv.appels, 'fournil_classement') === avant + 1 && sv.appels.filter((a) => a.nom !== 'fournil_recompenses').pop().nom === 'fournil_publier', 'la liste part tout de suite, l’envoi de la fortune en même temps (plus d’attente en série)');
    check(m.charger('semaine') === lecture && compte(sv.appels, 'fournil_classement') === avant + 1 && m.enChargement('semaine'), 'redemandée pendant la lecture : la même promesse, pas de deuxième appel');
    const c = await lecture; check(c.etat === 'ok', 'liste lue');
    await dormir(80);
    check(compte(sv.appels, 'fournil_classement') === avant + 2 && m.cache('semaine').etat === 'ok' && m.cache('semaine').quand > 0, 'fortune acceptée : la liste est relue une fois, en silence');
  }

  console.log('── quitter, puis passer aussitôt en arrière-plan ──');
  for (const [nom, lat, apres] of [
    ['passage en arrière-plan', { fournil_retirer: 30, fournil_publier: 60 }, (m) => m.envoyer('fond', { keepalive: true })],
    ['minuteur des 5 min', { fournil_retirer: 30, fournil_publier: 60 }, (m) => { horloge += 5 * 60e3; return m.tick(); }],
  ]) {
    const sv = serveurLent(lat), m = moteur(sv);
    horloge += 60e3; await m.choisirPseudo('Mamie Jeanne'); horloge += 60e3; fortune += 10;
    const q = m.quitter(), f = apres(m), [rq, rf] = [await q, await f]; await dormir(80);
    check(rq.etat === 'ok' && rf.etat === 'saute' && rf.pourquoi === 'retrait' && sv.lignes.size === 0 && !m.resume().rejoint && compte(sv.appels, 'fournil_publier') === 1, `${nom} pendant « Quitter » : l’envoi est sauté, le serveur reste vide`);
  }
  { const sv = serveurLent({ fournil_retirer: 'panne' }), m = moteur(sv);
    horloge += 60e3; await m.choisirPseudo('Têtu'); const id = m.etat().id; horloge += 60e3;
    const q = await m.quitter();
    check(q.etat === 'hors-ligne' && m.resume().rejoint && m.etat().id === id && m.etat().jeton, 'retrait sans réseau : toujours inscrit, avec son jeton, pour réessayer');
    horloge += 60e3; fortune += 10; check((await m.envoyer('fond')).etat === 'ok', 'et l’envoi suivant repart');
  }

  console.log('── deux fenêtres (appli installée + onglet) sur le même stockage ──');
  { const sv = serveur(), r = faux(sv.gerer), s = memoire();
    const A = moteur(r, { stockage: s }); horloge += 60e3; await A.choisirPseudo('Gaston'); horloge += 60e3;
    const B = moteur(r, { stockage: s }); horloge += 60e3;
    check((await A.quitter()).etat === 'ok' && sv.lignes.size === 0, 'A quitte le classement');
    horloge += 6 * 60e3; fortune += 10; const rb = await B.envoyer('fond', { keepalive: true });
    check(rb.etat === 'saute' && rb.pourquoi === 'pas-rejoint' && sv.lignes.size === 0 && JSON.parse(s.getItem(CL.CLE)).rejoint === false && !B.resume().rejoint, 'B ne réinscrit pas A : il relit le stockage avant d’envoyer');
    horloge += 60e3; await A.choisirPseudo('Gaston'); horloge += 60e3; await A.choisirPseudo('Tonton Paul');
    horloge += 6 * 60e3; fortune += 10; const rt = await B.tick();
    check(rt.etat === 'ok' && sv.lignes.size === 1 && [...sv.lignes.values()][0].pseudo === 'Tonton Paul' && JSON.parse(s.getItem(CL.CLE)).pseudo === 'Tonton Paul', 'A change de pseudo : B envoie le nouveau, pas l’ancien');
    horloge += 5e3; fortune += 10; check((await A.envoyer('feuille')).pourquoi === 'trop-tot', 'les 15 s entre deux envois valent pour toutes les fenêtres');
  }
  { const r = faux(serveur().gerer), m = moteur(r, { stockage: casse });
    horloge += 60e3; check((await m.choisirPseudo('Ninon')).etat === 'ok', 'stockage qui lève une exception : on rejoint quand même');
    horloge += 60e3; fortune += 10; check((await m.envoyer('fond')).etat === 'ok' && m.resume().rejoint, 'et l’identité en mémoire est gardée');
    const vieux = JSON.stringify({ ...CL.etatNeuf(), pseudo: 'Vieux' }), plein = { getItem: () => vieux, setItem: () => { throw new Error('QuotaExceededError'); } };
    const m2 = moteur(faux(serveur().gerer), { stockage: plein }); horloge += 60e3; await m2.choisirPseudo('Ninon');
    horloge += 60e3; fortune += 10; check((await m2.envoyer('fond')).etat === 'ok' && m2.resume().pseudo === 'Ninon', 'stockage plein (écriture refusée) : son vieux contenu n’écrase pas la mémoire');
  }

  console.log('── une inscription dont la réponse s’est perdue ──');
  { const s = memoire(), lignes = new Map(), appels = []; let perdre = true;
    const rf = { fetch: async (url, init) => { const nom = url.split('/rpc/')[1], c = JSON.parse(init.body); appels.push({ nom, c });
      if (nom === 'fournil_publier') { lignes.set(c.p_id, c.p_pseudo); return perdre ? new Promise(() => {}) : rep(200, { ok: true, erreur: null, rang_semaine: 1, rang_total: 1, joueurs: lignes.size }); }
      if (nom === 'fournil_retirer') { lignes.delete(c.p_id); return rep(200, { ok: true, erreur: null }); }
      return rep(200, { semaine: '2026-10-05', joueurs: 0, lignes: [], moi: null }); } };
    horloge += 60e3; const r1 = await moteur(rf, { stockage: s, delaiMax: 30 }).choisirPseudo('Fantôme');
    const vieil = JSON.parse(s.getItem(CL.CLE)).id;
    check(r1.etat === 'lent' && JSON.parse(s.getItem(CL.CLE)).rejoint === false && lignes.size === 1, 'réponse perdue : le jeu dit « pas rejoint », mais la ligne existe sur le serveur');
    perdre = false; horloge += 60e3; const m2 = moteur(rf, { stockage: s }); const n0 = appels.length;
    m2.demarrer({ minuteur: false }); const r2 = await m2.choisirPseudo('Fantôme');
    const suite = appels.slice(n0).map((a) => a.nom), pub = appels.slice(n0).find((a) => a.nom === 'fournil_publier');
    check(suite[0] === 'fournil_retirer' && appels[n0].c.p_id === vieil && suite.indexOf('fournil_publier') > 0, 'au lancement suivant : la ligne fantôme est effacée d’abord, et l’inscription lancée aussitôt l’attend');
    check(r2.etat === 'ok' && pub.c.p_id !== vieil && lignes.size === 1 && !lignes.has(vieil) && m2.resume().rejoint, 'puis on rejoint avec une nouvelle identité : une seule ligne');
    const s3 = memoire(); CL.ecrireEtat(s3, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Pressé', essai: horloge - 5e3 }); const n1 = appels.length;
    moteur(rf, { stockage: s3 }).demarrer({ minuteur: false }); await dormir(5);
    check(appels.length === n1, 'une inscription d’il y a 5 s (peut-être en cours dans une autre fenêtre) n’est pas effacée');
  }

  console.log('── la place de la semaine suit le lundi du serveur ──');
  { const S = Date.UTC(2026, 9, 11, 22, 2); // lundi 12 octobre, 00 h 02 à Paris
    horloge = S - 4 * 60e3; // le téléphone retarde de 4 min : chez lui, c'est encore dimanche 23 h 58
    const m = moteur(faux(async () => rep(200, { ok: true, erreur: null, rang_semaine: 1, rang_total: 3, joueurs: 3, joueurs_total: 3, joueurs_semaine: 1, semaine: '2026-10-12' })));
    await m.choisirPseudo('Ponctuel');
    check(m.etat().dernier.semaine.lundi === '2026-10-12' && m.resume().semaine && m.resume().semaine.rang === 1, 'téléphone en retard : la place est rangée sous le lundi du serveur (12 oct.), et affichée');
    horloge = S + 60e3; check(m.resume().semaine && m.resume().semaine.rang === 1, 'le téléphone passe minuit : la place reste');
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Pressé', rejoint: true, dernier: { semaine: { rang: 2, joueurs: 5, lundi: '2026-10-05' }, total: { rang: 4, joueurs: 9 }, quand: S - 5 * 60e3 } });
    horloge = S; const m2 = moteur(faux(async () => rep(200, {})), { stockage: s });
    check(m2.resume().semaine === null && m2.resume().total.rang === 4, 'téléphone en avance (lundi chez lui) : la place de l’ancienne semaine est masquée, celle de tous les temps reste');
  }
  console.log('── les récompenses du podium (contrat v2) ──');
  check(CL.metal(1) === 'or' && CL.metal(2) === 'argent' && CL.metal(3) === 'bronze' && CL.metal(4) === null && CL.metal(null) === null, '1er : or, 2e : argent, 3e : bronze ; au-delà, rien');
  check(CL.decalerSemaine('2026-10-12', -1) === '2026-10-05' && CL.decalerSemaine('2027-01-04', -1) === '2026-12-28' && CL.decalerSemaine('2026-10-19', 1) === '2026-10-26' && CL.decalerSemaine('2027-03-22', 1) === '2027-03-29' && CL.decalerSemaine('n’importe', 1) === '', 'la semaine d’avant, d’après (passage de l’année et changements d’heure compris)');
  { const r = CL.nettoyerRecompenses({ podiums: [{ semaine: '2026-10-05', rang: 2 }, { semaine: '2026-09-28', rang: 1 }, { semaine: '2026-10-05', rang: 3 }, { semaine: 'hier', rang: 1 }, { semaine: '2026-09-21', rang: 4 }, null, { semaine: '2026-09-14', rang: '1' }], tenue: 'platine', vu: 12 });
    check(egal(r, { podiums: [{ semaine: '2026-09-28', rang: 1 }, { semaine: '2026-10-05', rang: 2 }], tenue: 'auto', vu: '', quartier: null, quartierPodium: null, evenements: {}, equipe: [], equipeAttente: '',
      places: [{ semaine: '2026-09-28', rang: 1, joueurs: null }, { semaine: '2026-10-05', rang: 2, joueurs: null }], payees: [], depuis: '', evtPayes: [] }), 'récompenses nettoyées : une coupe par semaine (la meilleure), triées, rangs 1 à 3 seulement ; tenue inconnue → automatique ; une sauvegarde d’avant la 6.5 : ses podiums deviennent ses places, rien de payable (depuis vide)'); }
  console.log('── les places de la semaine, du 1er au 15e (version 6.5) ──');
  { const R = (n) => CL.recompenseRang(n), court = (x) => (x ? `${x.etoiles}★ ×${x.mult} ${x.secs}s${x.tenue ? ' tenue' : ''}` : '—');
    check([1, 2, 3, 4, 6, 7, 10, 11, 15].map((n) => court(R(n))).join(' | ') === '5★ ×5 1800s tenue | 4★ ×5 1800s tenue | 3★ ×5 1800s tenue | 3★ ×3 1800s | 3★ ×3 1800s | 2★ ×2 1800s | 2★ ×2 1800s | 1★ ×2 900s | 1★ ×2 900s',
      `RECOMPENSES_RANG : 1er/2e/3e 5/4/3 étoiles + ×5 30 min (et la tenue) ; 4e-6e 3 + ×3 30 min ; 7e-10e 2 + ×2 30 min ; 11e-15e 1 + ×2 15 min (${[1, 4, 7, 11].map((n) => court(R(n))).join(', ')})`);
    check(R(16) === null && R(0) === null && R(null) === null && R(2.5) === null && CL.RANG_MAX === 15, 'au-delà du 15e, rang 0 ou absurde : rien');
    check(CL.RECOMPENSES_RANG.every((x, k, l) => x.de <= x.a && (k === 0 ? x.de === 1 : x.de === l[k - 1].a + 1)) && CL.RECOMPENSES_RANG[CL.RECOMPENSES_RANG.length - 1].a === 15 && CL.RECOMPENSES_RANG.every((x, k, l) => k === 0 || (x.etoiles <= l[k - 1].etoiles && x.mult * x.secs <= l[k - 1].mult * l[k - 1].secs)),
      'la table couvre 1 à 15 sans trou ni chevauchement, et ne récompense jamais mieux une place plus basse');
    const p = CL.nettoyerPlaces([{ semaine: '2026-10-05', rang: 7, joueurs: 12 }, { semaine: '2026-10-05', rang: 9, joueurs: 12 }, { semaine: '2026-09-28', rang: 16, joueurs: 20 }, { semaine: '2026-09-21', rang: 15, joueurs: 3 }, { semaine: '2026-09-14', rang: 2 }, { semaine: '2026-09-14', rang: 2, joueurs: 8 }, { semaine: 'x', rang: 1 }, null]);
    check(egal(p, [{ semaine: '2026-09-14', rang: 2, joueurs: 8 }, { semaine: '2026-09-21', rang: 15, joueurs: null }, { semaine: '2026-10-05', rang: 7, joueurs: 12 }]), `places nettoyées : une par semaine (la meilleure, celle qui sait combien de joueurs), rangs 1 à 15, joueurs ≥ rang (${JSON.stringify(p)})`);
    check(CL.phrasePlace({ rang: 7, joueurs: 12 }) === 'Tu as fini 7e cette semaine sur 12' && CL.phrasePlace({ rang: 1, joueurs: null }) === 'Tu as fini 1er cette semaine', '« Tu as fini 7e cette semaine sur 12 »');
    const rec = Object.assign(CL.recompensesNeuves(), { places: p.concat([{ semaine: '2026-10-12', rang: 3, joueurs: 12 }]), depuis: '2026-09-21', payees: ['2026-09-21'] });
    check(egal(CL.placesAPayer(rec, '2026-10-12').map((x) => [x.semaine, x.recompense.etoiles]), [['2026-10-05', 2]]) && CL.placesAPayer(Object.assign({}, rec, { depuis: '' }), '2026-10-19').length === 0,
      'à payer : depuis la première semaine payable, avant la semaine en cours, pas encore payée (sans « depuis » : rien)'); }
  console.log('── les acharnés de la Maison hantée : la place au classement final de l’événement, du 1er au 15e (version 6.6) ──');
  { const R = (n) => CL.recompenseEvt(n), S = (n) => CL.recompenseRang(n), court = (x) => (x ? `${x.etoiles}★ ×${x.mult} ${x.secs}s${x.tenue ? ' tenue' : ''}` : '—');
    check([1, 2, 3, 4, 6, 7, 10, 11, 15].map((n) => court(R(n))).join(' | ') === '7★ ×5 3600s tenue | 6★ ×5 3600s tenue | 5★ ×5 3600s tenue | 4★ ×3 3600s | 4★ ×3 3600s | 3★ ×3 1800s | 3★ ×3 1800s | 2★ ×2 1800s | 2★ ×2 1800s',
      `RECOMPENSES_EVT : 1er/2e/3e 7/6/5 étoiles + ×5 1 h (et la tenue en or) ; 4e-6e 4 + ×3 1 h ; 7e-10e 3 + ×3 30 min ; 11e-15e 2 + ×2 30 min`);
    check(R(16) === null && R(0) === null && R(null) === null && R(2.5) === null && CL.RECOMPENSES_EVT.every((x, k, l) => x.de <= x.a && (k === 0 ? x.de === 1 : x.de === l[k - 1].a + 1)) && CL.RECOMPENSES_EVT[CL.RECOMPENSES_EVT.length - 1].a === 15
      && CL.RECOMPENSES_EVT.every((x, k, l) => k === 0 || (x.etoiles <= l[k - 1].etoiles && x.mult * x.secs <= l[k - 1].mult * l[k - 1].secs)), 'la table couvre 1 à 15 sans trou, ne récompense jamais mieux une place plus basse ; au-delà du 15e ou absurde : rien');
    { const ko = []; for (let n = 1; n <= 15; n++) { const e = R(n), w = S(n); if (!(e.etoiles > w.etoiles && e.mult * e.secs > w.mult * w.secs && e.tenue === w.tenue)) ko.push(n); }
      check(!ko.length, `à chaque place, un peu plus fort que la même place de la semaine (plus d’étoiles, un boost plus gros) ; la tenue aux trois premiers seulement${ko.length ? ' — sauf ' + ko.join(', ') : ''}`); }
    const ev = CL.nettoyerEvenements({ hantee: { rang: 7, joueurs: 12, podium: [{ rang: 1, pseudo: 'A', valeur: 3 }, { rang: 2, pseudo: 'B', valeur: 2 }, { rang: 3, pseudo: 'C', valeur: 1 }, { rang: 7, pseudo: 'G', valeur: 0.5 }] } });
    check(egal(ev, { hantee: { rang: 7, joueurs: 12, podium: [{ rang: 1, pseudo: 'A', valeur: 3 }, { rang: 2, pseudo: 'B', valeur: 2 }, { rang: 3, pseudo: 'C', valeur: 1 }] } }), `relu : rang 7, 12 joueurs, le podium des trois premiers (${JSON.stringify(ev)})`);
    const vieux = CL.nettoyerEvenements({ hantee: { rang: 2, podium: [] } }), absurdes = [{ rang: 16, joueurs: 20 }, { rang: 7, joueurs: 3 }, { rang: '7', joueurs: 'douze' }, { rang: 0 }].map((x) => CL.nettoyerEvenements({ hantee: x }).hantee);
    check(egal(vieux.hantee, { rang: 2, joueurs: null, podium: [] }) && absurdes[0].rang === null && absurdes[1].rang === 7 && absurdes[1].joueurs === null && absurdes[2].rang === null && absurdes[2].joueurs === null && absurdes[3].rang === null,
      'un serveur d’avant (rang 1 à 3, sans joueurs) : lu tel quel ; un rang au-delà de 15, des joueurs moins nombreux que le rang, des types faux : écartés');
    check(CL.phraseEvt({ id: 'hantee', rang: 7, joueurs: 12 }) === 'Tu as fini 7e de la Maison hantée sur 12' && CL.phraseEvt({ id: 'hantee', rang: 1, joueurs: null }) === 'Tu as fini 1er de la Maison hantée' && CL.phraseEvt({ id: 'noel', rang: 1 }) === '', '« Tu as fini 7e de la Maison hantée sur 12 »');
    const rec = Object.assign(CL.recompensesNeuves(), { evenements: ev });
    check(egal(CL.evtAPayer(rec), [{ id: 'hantee', rang: 7, joueurs: 12, recompense: R(7) }]) && CL.evtAPayer(Object.assign({}, rec, { evtPayes: ['hantee'] })).length === 0 && CL.evtAPayer(Object.assign(CL.recompensesNeuves(), { evenements: { hantee: { rang: null, joueurs: 12, podium: [] } } })).length === 0,
      'à payer : une place figée du 1er au 15e, pas encore payée (payée, ou sans rang : rien)');
    check(egal(CL.nettoyerRecompenses({ evtPayes: ['hantee', 'hantee', 'quartier', 3, null] }).evtPayes, ['hantee']), 'evtPayes relu : les événements connus, sans doublon (le Quartier n’en a pas)');
    const cl = CL.nettoyerClassement({ version: 6, lignes: [{ rang: 1, pseudo: 'Jo', valeur: 5, titre: 'legende-manoir' }, { rang: 2, pseudo: 'Lu', valeur: 4, titre: '<b>roi</b>' }, { rang: 3, pseudo: 'Mo', valeur: 3, titre: null }], moi: { rang: 1, valeur: 5, titre: 'legende-manoir' } });
    check(cl.lignes[0].titre === 'legende-manoir' && !('titre' in cl.lignes[1]) && !('titre' in cl.lignes[2]) && cl.moi.titre === 'legende-manoir' && CL.TITRES['legende-manoir'] === 'Légende du Manoir', 'la liste (serveur v6.6) : le titre « Légende du Manoir » gardé ; un titre inconnu ou du HTML : écarté'); }
  check(CL.nettoyerRecompenses({ tenue: null }).tenue === null && CL.nettoyerRecompenses({ tenue: 'bronze' }).tenue === 'bronze' && egal(CL.nettoyerRecompenses('abîmé'), CL.recompensesNeuves()), 'tenue « aucune » (null) gardée ; réponse absurde : rien');
  { const rec = { podiums: [{ semaine: '2026-09-21', rang: 3 }, { semaine: '2026-10-05', rang: 2 }], tenue: 'auto', vu: '' }, L = '2026-10-12';
    check(CL.tenuePortee(rec, L) === 'argent' && CL.coupeDuComptoir(rec, L) === 'argent', 'automatique : la semaine qui suit le podium, la tenue et la coupe d’argent');
    check(CL.tenuePortee(rec, '2026-10-19') === null && CL.coupeDuComptoir(rec, '2026-10-19') === null, 'la semaine d’après : plus rien d’office (tenue blanche, coupe rangée dans la vitrine)');
    check(CL.tenuePortee({ ...rec, tenue: 'bronze' }, '2026-10-19') === 'bronze' && CL.tenuePortee({ ...rec, tenue: null }, L) === null && CL.tenuePortee({ ...rec, tenue: 'or' }, L) === 'argent', 'tenue choisie : celle-là, gardée à vie ; « aucune » : la blanche ; une tenue jamais gagnée : retour à l’automatique');
    const a = CL.aAnnoncer(rec, L);
    check(a && a.semaine === '2026-10-05' && a.rang === 2 && a.metal === 'argent' && a.autres === 1 && CL.aAnnoncer({ ...rec, vu: '2026-10-05' }, L) === null && CL.aAnnoncer({ ...rec, vu: '2026-09-21' }, L).autres === 0, 'l’annonce : le podium le plus récent pas encore annoncé (et combien d’autres depuis la dernière visite)');
    check(CL.phraseAnnonce(a) === 'Bravo ! 2e de la semaine : la tenue d’argent et la coupe d’argent sont à toi' && /1er de la semaine : la tenue d’or et la coupe d’or/.test(CL.phraseAnnonce({ rang: 1, metal: 'or' })) && /tenue de bronze/.test(CL.phraseAnnonce({ rang: 3, metal: 'bronze' })), 'la phrase : « ' + CL.phraseAnnonce(a) + ' »');
    check(egal(CL.tenuesGagnees(rec), ['argent', 'bronze']), 'les tenues gagnées, dans l’ordre or, argent, bronze'); }
  { const d = CL.nettoyerClassement({ semaine: '2026-10-12', joueurs: 3, lignes: [{ rang: 1, pseudo: 'A', valeur: 5, podium: 2 }, { rang: 2, pseudo: 'B', valeur: 4, podium: 7 }, { rang: 3, pseudo: 'C', valeur: 3 }], moi: { rang: 1, valeur: 5, podium: 2 } });
    check(d.lignes[0].podium === 2 && d.lignes[1].podium === null && d.lignes[2].podium === null && d.moi.podium === 2, 'les lignes du classement portent le podium de la semaine passée (1, 2, 3 ou null)'); }
  { const d = CL.nettoyerRecompensesServeur({ ok: true, podiums: [{ semaine: '2026-10-05', rang: 1 }], derniere: { semaine: '2026-10-05', podium: [{ rang: 1, pseudo: 'Léa', valeur: '12' }, { rang: 9, pseudo: 'x' }, { rang: 2, pseudo: '<b>Jo</b>', valeur: 3 }] } });
    check(d.ok && d.podiums.length === 1 && d.derniere.podium.length === 2 && d.derniere.podium[0].valeur === 12 && d.derniere.podium[1].pseudo === '<b>Jo</b>', 'réponse de fournil_recompenses nettoyée (le pseudo reste du texte : l’interface l’échappe)');
    check(CL.nettoyerRecompensesServeur({ ok: true, podiums: [], derniere: { semaine: '2026-10-05', podium: [] } }).derniere === null && !CL.nettoyerRecompensesServeur(null).ok, 'podium vide : derniere = null ; réponse absente : pas ok'); }
  { // le moteur : lecture au lancement, podiums ajoutés à ceux du téléphone, lundi du serveur, choix de la tenue, annonce, quitter
    const S = Date.UTC(2026, 9, 12, 10); horloge = S; // lundi 12 octobre 2026
    const s = memoire(), id = CL.nouvelId(), jeton = CL.nouveauJeton();
    CL.ecrireEtat(s, { ...CL.etatNeuf(), id, jeton, pseudo: 'Léa', rejoint: true, essai: S, dernierEnvoi: S, valeur: 1, recompenses: { podiums: [{ semaine: '2026-08-31', rang: 3 }], tenue: 'auto', vu: '2026-08-31' } });
    let reponse = { ok: true, erreur: null, podiums: [{ semaine: '2026-09-21', rang: 1 }, { semaine: '2026-10-05', rang: 2 }], derniere: { semaine: '2026-10-05', podium: [{ rang: 1, pseudo: 'Mamie Jo', valeur: 9e6 }, { rang: 2, pseudo: 'Léa', valeur: 5e6 }, { rang: 3, pseudo: 'Tonton', valeur: 1e6 }] } };
    const r = faux(async (url) => (url.endsWith('/fournil_recompenses') ? rep(200, reponse) : rep(200, { ok: true, erreur: null, rang_semaine: 1, rang_total: 1, joueurs: 1, semaine: '2026-10-12' })));
    const m = moteur(r, { stockage: s }); fortune = 1;
    m.demarrer({ minuteur: false }); await new Promise((ok) => setTimeout(ok, 20));
    const ar = r.appels.find((a) => a.url.endsWith('/fournil_recompenses'));
    check(ar && egal(Object.keys(ar.corps).sort(), ['p_id', 'p_jeton']) && ar.corps.p_id === id && ar.corps.p_jeton === jeton, 'au lancement : fournil_recompenses(p_id, p_jeton)');
    let v = m.recompenses();
    check(egal(v.podiums.map((p) => p.semaine), ['2026-08-31', '2026-09-21', '2026-10-05']) && v.portee === 'argent' && v.coupe === 'argent' && egal(v.coupes, ['bronze', 'or', 'argent']) && v.derniere.podium[0].pseudo === 'Mamie Jo', 'podiums du serveur ajoutés à ceux du téléphone ; cette semaine : tenue et coupe d’argent ; la vitrine : bronze, or, argent');
    check(v.annonce && v.annonce.semaine === '2026-10-05' && v.annonce.rang === 2 && v.annonce.autres === 1, 'à annoncer : le 2e de la semaine du 5 oct. (et un autre podium depuis la dernière visite)');
    check(JSON.parse(s.getItem(CL.CLE)).recompenses.podiums.length === 3, 'les podiums sont écrits dans « fournil.classement »');
    const nR = () => r.appels.filter((a) => a.url.endsWith('/fournil_recompenses')).length, n0 = nR();
    await m.chargerRecompenses(); check(nR() === n0, 'relue tout de suite : rien ne part (30 min au plus souvent, une minute à l’ouverture de la feuille)');
    horloge += 61e3; m.ouvrir('semaine'); await new Promise((ok) => setTimeout(ok, 20)); check(nR() === n0 + 1, 'à l’ouverture de la feuille, une minute plus tard : relue');
    check(m.choisirTenue('bronze') && m.recompenses().portee === 'bronze' && !m.choisirTenue('platine') && m.choisirTenue(null) && m.recompenses().portee === null, 'choisir la tenue : bronze (gagnée), « aucune » ; une tenue inconnue est refusée');
    reponse = { ok: true, erreur: null, podiums: [], derniere: null }; horloge += 31 * 60e3; await m.chargerRecompenses();
    check(m.recompenses().podiums.length === 3, 'le serveur n’en sait plus rien (ménage des 90 jours) : le téléphone garde tout');
    check(m.annonceFaite('2026-10-05') && m.recompenses().vu === '2026-10-05' && m.recompenses().tenue === 'auto' && m.recompenses().annonce === null && !m.annonceFaite('2026-09-21'), 'l’annonce faite : notée, et la tenue du nouveau podium se porte d’office (retour à l’automatique)');
    horloge = S + 7 * 864e5; check(m.lundi() === '2026-10-19' && m.recompenses().portee === null && m.recompenses().coupe === null, 'la semaine suivante : la tenue blanche revient d’office, la coupe quitte le comptoir (elle reste dans la vitrine)');
    horloge = S;
    const q = await m.quitter();
    check(q.etat === 'ok' && m.etat().id === null && m.recompenses().podiums.length === 3 && JSON.parse(s.getItem(CL.CLE)).recompenses.podiums.length === 3, 'quitter le classement : les coupes et les tenues restent à lui');
    const n1 = r.appels.length; await m.chargerRecompenses({ ecart: 0 }); check(r.appels.length === n1, 'pas (ou plus) au classement : les récompenses ne sont pas demandées'); }
  { // deux fenêtres : un podium appris par l'une, une tenue choisie dans l'autre
    const s = memoire(), id = CL.nouvelId(), jeton = CL.nouveauJeton(); horloge = Date.UTC(2026, 9, 12, 10);
    CL.ecrireEtat(s, { ...CL.etatNeuf(), id, jeton, pseudo: 'Léa', rejoint: true, essai: horloge, dernierEnvoi: horloge, valeur: 1 });
    const r = faux(async (url) => rep(200, url.endsWith('/fournil_recompenses') ? { ok: true, podiums: [{ semaine: '2026-10-05', rang: 3 }], derniere: null } : { ok: true }));
    const A = moteur(r, { stockage: s }), B = moteur(r, { stockage: s });
    await A.chargerRecompenses({ ecart: 0 });
    check(B.recompenses().podiums.length === 0 && (B.resynchroniser(), B.recompenses().podiums.length === 1), 'B apprend le podium trouvé par A en relisant le stockage');
    B.choisirTenue(null); A.resynchroniser(); check(A.recompenses().tenue === null && A.recompenses().podiums.length === 1, 'A suit la tenue choisie dans B, sans perdre de podium');
    const p = await moteur(faux(async () => rep(200, { ok: false, erreur: 'jeton', podiums: [], derniere: null })), { stockage: memoire() }).chargerRecompenses();
    check(p.etat === 'saute', 'pas d’identité : aucun appel'); }
  { // l'horloge du jeu (HORLOGE) plutôt que celle du téléphone, et le lundi du serveur s'il est en avance
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true, recompenses: { podiums: [{ semaine: '2026-10-05', rang: 1 }], tenue: 'auto', vu: '' } });
    horloge = Date.UTC(2026, 9, 11, 21, 50); // dimanche 11 oct., 23 h 50 à Paris chez le téléphone, le serveur est déjà lundi
    const m = moteur(faux(async () => rep(200, { ok: true, podiums: [{ semaine: '2026-10-05', rang: 1 }], derniere: { semaine: '2026-10-05', podium: [{ rang: 1, pseudo: 'Léa', valeur: 1 }] } })), { stockage: s });
    check(m.recompenses().portee === null, 'avant toute réponse : le lundi du téléphone (encore la semaine du podium : rien d’office)');
    await m.chargerRecompenses({ ecart: 0 });
    check(m.lundi() === '2026-10-12' && m.recompenses().portee === 'or' && m.recompenses().coupe === 'or', 'le serveur dit que la semaine du podium est finie : tenue et coupe d’or tout de suite'); }

  console.log('── les points de boulanger (contrat v3) ──');
  { const e = { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true, dernierEnvoi: T, essai: T - 60e3, valeur: 50, points: 12, lundiPoints: '2026-10-05' };
    check(CL.deciderEnvoi(e, 50, T + 20e3, 'feuille', { points: 12, lundi: '2026-10-05' }).pourquoi === 'inchange', 'mêmes points, même fortune : rien ne part');
    check(CL.deciderEnvoi(e, 50, T + 20e3, 'feuille', { points: 14, lundi: '2026-10-05' }).envoyer === true, 'des points de plus (même fortune) : ça part');
    check(CL.deciderEnvoi(e, 50, T + 20e3, 'feuille', { points: 0, lundi: '2026-10-12' }).envoyer === true, 'une nouvelle semaine (0 point) : ça part');
    check(CL.deciderEnvoi(e, 50, T + 20e3, 'feuille', { points: -3, lundi: 'hier' }).pourquoi === 'inchange' && CL.deciderEnvoi(e, 50, T + 20e3, 'feuille').pourquoi === 'inchange', 'des points absurdes, ou pas de points : comme avant (la fortune seule décide)'); }
  { const s = memoire(); s.setItem(CL.CLE, JSON.stringify({ points: 12.5, lundiPoints: 'lundi' })); const e = CL.lireEtat(s);
    check(e.points === null && e.lundiPoints === '', 'état local : des points abîmés sont écartés');
    const s2 = memoire(), e2 = { ...CL.etatNeuf(), points: 40, lundiPoints: '2026-10-12' }; CL.ecrireEtat(s2, e2); check(egal(CL.lireEtat(s2), e2), 'état local : les derniers points envoyés font l’aller-retour'); }
  { const d = CL.nettoyerClassement({ version: 3, semaine: '2026-10-12', joueurs: 2, lignes: [{ rang: 1, pseudo: 'A', points: 52, valeur: 1e6 }, { rang: 2, pseudo: 'B', points: -4, valeur: 9e12 }, { rang: 3, pseudo: 'C', points: '7', valeur: 1 }], moi: { rang: 2, points: 7.5, valeur: 3 } });
    check(d.version === 3 && d.lignes[0].points === 52 && d.lignes[1].points === null && d.lignes[2].points === null && d.moi.points === null, 'réponse v3 : les points (entiers positifs) et la version ; le reste écarté');
    check(CL.nettoyerClassement({ semaine: '2026-10-12', lignes: [] }).version === 2, 'une réponse sans version : un serveur v2 (classé à l’argent)');
    const r = CL.nettoyerRecompensesServeur({ ok: true, podiums: [], derniere: { semaine: '2026-10-05', podium: [{ rang: 1, pseudo: 'Léa', points: 400, valeur: 12 }, { rang: 2, pseudo: 'Jo', valeur: 3 }] } });
    check(r.derniere.podium[0].points === 400 && r.derniere.podium[1].points === null, 'le podium de la semaine passée garde ses points (null pour une semaine figée en v2)'); }
  { // le moteur envoie ses points de la semaine et leur lundi ; il apprend la version du serveur ; ses rangs et ses points reviennent
    horloge = Date.UTC(2026, 9, 14, 10); let mesPoints = { points: 33, lundi: '2026-10-12' };
    const r = faux(async (url, init, c) => rep(200, url.endsWith('/fournil_publier') ? { ok: true, erreur: null, version: 3, rang_semaine: 2, rang_total: 4, joueurs: 9, joueurs_semaine: 5, semaine: '2026-10-12', points_semaine: c.p_points, points_total: 120, points_comptes: 3, points_plafonnes: false, compte: 0 } : { version: 3, semaine: '2026-10-12', joueurs: 5, lignes: [{ rang: 1, pseudo: 'Zoé', points: 80, valeur: 1e3, moi: false }], moi: { rang: 2, points: 33, valeur: 9 } }));
    const m = moteur(r, { points: () => mesPoints }); fortune = 5000;
    let res = await m.choisirPseudo('Léa');
    const c = r.appels[0].corps;
    check(res.etat === 'ok' && egal(Object.keys(c).sort(), ['p_fortune', 'p_id', 'p_jeton', 'p_lundi', 'p_points', 'p_pseudo']) && c.p_points === 33 && c.p_lundi === '2026-10-12' && m.version() === 3, 'rejoindre : fournil_publier avec ses points de la semaine (p_points) et leur lundi (p_lundi) ; serveur v3');
    check(m.resume().semaine && m.resume().semaine.rang === 2 && m.resume().semaine.points === 33 && m.resume().total.points === 120 && m.etat().points === 33, 'ses rangs (aux points) et ses points reviennent dans le résumé (l’icône du classement les montre)');
    horloge += 20e3; res = await m.envoyer('feuille');
    check(res.etat === 'saute' && res.pourquoi === 'inchange', 'rien de neuf : rien ne part');
    mesPoints = { points: 35, lundi: '2026-10-12' }; res = await m.envoyer('feuille');
    check(res.etat === 'ok' && r.appels[r.appels.length - 1].corps.p_points === 35, 'deux points de plus : ils partent (même si la fortune n’a pas bougé)');
    mesPoints = { points: 1.5, lundi: 'x' }; horloge += 31 * 60e3; res = await m.envoyer('periodique');
    check(res.etat === 'ok' && !('p_points' in r.appels[r.appels.length - 1].corps), 'des points illisibles (jeu abîmé) : la fortune part seule'); }
  { // un serveur encore en version 2 (SQL pas recollé) : la fonction à six paramètres n'existe pas → la fortune seule, comme avant
    horloge = Date.UTC(2026, 9, 14, 11);
    const r = faux(async (url, init, c) => { if (url.endsWith('/fournil_publier') && 'p_points' in c) return rep(404, { code: 'PGRST202', message: 'Could not find the function public.fournil_publier(p_fortune, p_id, p_jeton, p_lundi, p_points, p_pseudo)' }); return rep(200, url.endsWith('/fournil_publier') ? { ok: true, erreur: null, rang_semaine: 1, rang_total: 1, joueurs: 3, semaine: '2026-10-12' } : { semaine: '2026-10-12', joueurs: 1, lignes: [{ rang: 1, pseudo: 'Léa', valeur: 9 }], moi: null }); });
    const m = moteur(r, { points: () => ({ points: 8, lundi: '2026-10-12' }) }); fortune = 70;
    const res = await m.choisirPseudo('Léa');
    check(res.etat === 'ok' && r.appels.length === 2 && 'p_points' in r.appels[0].corps && !('p_points' in r.appels[1].corps) && m.version() === 2, 'serveur v2 : refus « fonction introuvable » avec les points, aussitôt renvoyé sans eux — accepté, le classement marche comme avant');
    horloge += 31 * 60e3; fortune = 90; await m.envoyer('periodique');
    check(r.appels.length === 3 && !('p_points' in r.appels[2].corps), 'ensuite, plus de points envoyés à ce serveur (jusqu’au prochain lancement)');
    const c = await m.charger('semaine');
    check(c.data.version === 2 && c.data.lignes[0].points === null, 'sa liste : version 2, pas de points (l’interface affiche l’argent, comme avant)'); }

  console.log(`\n${n - echecs}/${n} vérifications.`);
  console.log('── l’événement « Le Quartier » (contrat v4) ──');
  { // le moteur envoie ses billets (p_quartier) ; un serveur v3 les refuse → renvoyés sans ; la période « quartier » ; le podium final gardé à vie
    horloge = Date.UTC(2026, 9, 14, 12); let billets = 123456;
    const v4 = (url, c) => (url.endsWith('/fournil_publier') ? { ok: true, erreur: null, version: 4, rang_semaine: 1, rang_total: 2, rang_quartier: 3, quartier: c.p_quartier, quartier_plafonne: false, joueurs: 9, semaine: '2026-10-12', points_semaine: c.p_points, points_total: 5, compte: 0 }
      : url.endsWith('/fournil_recompenses') ? { ok: true, erreur: null, podiums: [], derniere: null, quartier: 2, quartier_podium: [{ rang: 1, pseudo: 'Mamie', valeur: 9e15 }, { rang: 2, pseudo: 'Léa', valeur: 5e15 }] }
      : { version: 4, semaine: '2026-10-12', periode: c.p_periode, joueurs: 4, lignes: [{ rang: 1, pseudo: 'Mamie', points: null, valeur: 9e15, moi: false, podium: 1 }, { rang: 2, pseudo: 'Léa', points: null, valeur: 5e15, moi: true, podium: 2 }], moi: { rang: 2, points: null, valeur: 5e15, podium: 2 } });
    const r = faux(async (url, init, c) => rep(200, v4(url, c)));
    const m = moteur(r, { points: () => ({ points: 3, lundi: '2026-10-12' }), quartier: () => billets }); fortune = 5000;
    let res = await m.choisirPseudo('Léa');
    const c = r.appels[0].corps;
    check(res.etat === 'ok' && egal(Object.keys(c).sort(), ['p_fortune', 'p_id', 'p_jeton', 'p_lundi', 'p_points', 'p_pseudo', 'p_quartier']) && c.p_quartier === 123456 && m.version() === 4, 'rejoindre : fournil_publier avec ses billets (p_quartier) ; serveur v4');
    check(m.resume().quartier && m.resume().quartier.rang === 3 && m.etat().quartier === 123456, 'son rang à l’événement revient dans le résumé, ses billets envoyés sont notés');
    horloge += 20e3; res = await m.envoyer('feuille');
    check(res.etat === 'saute' && res.pourquoi === 'inchange', 'rien de neuf : rien ne part');
    billets = 200000; res = await m.envoyer('feuille');
    check(res.etat === 'ok' && r.appels[r.appels.length - 1].corps.p_quartier === 200000, 'des billets en plus : ils partent (même sans nouveaux points)');
    billets = 0; horloge += 31 * 60e3; res = await m.envoyer('periodique');
    check(res.etat === 'ok' && !('p_quartier' in r.appels[r.appels.length - 1].corps), 'sans billets (pas de Planque) : rien n’est envoyé pour le quartier');
    const l = await m.charger('quartier');
    check(l.etat === 'ok' && l.data.version === 4 && l.data.lignes.length === 2 && l.data.lignes[0].points === null && l.data.lignes[1].moi && l.data.moi.podium === 2 && m.cache('quartier') === l && m.resume().quartier.rang === 2 && m.resume().quartier.joueurs === 4, 'la période « quartier » : la liste en billets, « moi » 2e, gardée en cache sous son nom');
    const rec = await m.chargerRecompenses({ ecart: 0 });
    check(rec.etat === 'ok' && m.recompenses().quartier === 2 && m.recompenses().quartierPodium.length === 2 && m.recompenses().quartierPodium[0].pseudo === 'Mamie', 'le podium final lu : 2e de l’événement, les trois premiers gardés');
    check(CL.lireEtat(r.stockage || null) !== null, 'l’état se relit');
    const q = await m.quitter();
    check(q.etat === 'ok' && m.recompenses().quartier === 2, 'quitter le classement : le rang au podium final reste sur le téléphone'); }
  { // un serveur encore en version 3 : la fonction à sept paramètres n'existe pas → les points sans les billets, puis plus jamais de billets
    horloge = Date.UTC(2026, 9, 14, 13);
    const r = faux(async (url, init, c) => { if (url.endsWith('/fournil_publier') && 'p_quartier' in c) return rep(404, { code: 'PGRST202', message: 'Could not find the function public.fournil_publier(p_fortune, p_id, p_jeton, p_lundi, p_points, p_pseudo, p_quartier)' }); return rep(200, url.endsWith('/fournil_publier') ? { ok: true, erreur: null, version: 3, rang_semaine: 1, rang_total: 1, joueurs: 3, semaine: '2026-10-12', points_semaine: 8, points_total: 8, compte: 0 } : { version: 3, semaine: '2026-10-12', joueurs: 1, lignes: [], moi: null }); });
    const m = moteur(r, { points: () => ({ points: 8, lundi: '2026-10-12' }), quartier: () => 777 }); fortune = 70;
    const res = await m.choisirPseudo('Léa');
    check(res.etat === 'ok' && r.appels.length === 2 && 'p_quartier' in r.appels[0].corps && !('p_quartier' in r.appels[1].corps) && 'p_points' in r.appels[1].corps && m.version() === 3, 'serveur v3 : refus « fonction introuvable » avec les billets, aussitôt renvoyé sans eux (les points restent) — accepté');
    horloge += 31 * 60e3; fortune = 90; await m.envoyer('periodique');
    check(r.appels.length === 3 && !('p_quartier' in r.appels[2].corps) && 'p_points' in r.appels[2].corps, 'ensuite, plus de billets envoyés à ce serveur (jusqu’au prochain lancement)'); }
  { // les récompenses nettoyées : le rang du quartier et son podium, ou rien
    const r = CL.nettoyerRecompensesServeur({ ok: true, podiums: [], derniere: null, quartier: 7, quartier_podium: [{ rang: 1, pseudo: 'A', valeur: 'x' }, { rang: 4, pseudo: 'B', valeur: 1 }] });
    check(r.quartier === null && r.quartierPodium.length === 1 && r.quartierPodium[0].valeur === 0, 'un rang absurde est écarté, le podium garde les rangs 1 à 3 (valeur illisible → 0)');
    check(CL.nettoyerRecompensesServeur({ ok: true, podiums: [] }).quartierPodium === null && CL.nettoyerRecompenses({ podiums: [], quartier: 1, quartierPodium: 'x' }).quartier === 1, 'un serveur v3 : pas de podium (null) ; un état local avec son rang : gardé'); }
  console.log('── la borne du serveur (1e24) : plafonner plutôt que se faire refuser ──');
  { // fournil_publier refuse (« valeur ») toute fortune, tous billets ou tout score au-dessus de 1e24 (supabase/fournil-classement.sql) : un
    // cadeau énorme bloquait pour toujours tous les envois ; le moteur envoie la borne. Le faux serveur suit ce contrat à la lettre
    horloge = Date.UTC(2026, 9, 26, 12); const vieux = fortune; fortune = 1e26;
    const borne = (c) => ['p_fortune', 'p_quartier', 'p_score'].every((k) => !(k in c) || (c[k] >= 0 && c[k] <= 1e24));
    const r = faux(async (url, init, c) => rep(200, url.endsWith('/fournil_publier')
      ? (borne(c) ? { ok: true, erreur: null, version: 5, rang_semaine: 1, rang_total: 1, joueurs: 3, semaine: '2026-10-26', points_semaine: c.p_points, points_total: 3, compte: 0, quartier: c.p_quartier || null, evt: c.p_evt || null, evt_score: c.p_score || null, rang_evt: c.p_evt ? 1 : null } : { ok: false, erreur: 'valeur', rang_semaine: null, rang_total: null, joueurs: 3 })
      : { version: 5, semaine: '2026-10-26', joueurs: 1, lignes: [], moi: null }));
    const m = moteur(r, { points: () => ({ points: 3, lundi: '2026-10-26' }), quartier: () => 3e25, evenement: () => ({ id: 'hantee', score: 5e27 }) });
    const res = await m.choisirPseudo('Crésus'), c = r.appels[0].corps;
    check(res.etat === 'ok' && m.resume().rejoint && c.p_fortune === 1e24 && c.p_quartier === 1e24 && c.p_score === 1e24 && CL.REGLES.fortuneMax === 1e24, 'une fortune de 1e26 (des billets à 3e25, un score à 5e27) part à la borne, 1e24, et l’envoi est accepté');
    fortune = Infinity; horloge += 20e3; const ri = await m.envoyer('feuille');
    check(ri.etat !== 'ok' && r.appels.every((a) => borne(a.corps)), 'une fortune infinie (sauvegarde abîmée) ne se déguise pas en 1e24 : rien d’absurde ne part');
    fortune = vieux; }
  console.log('── La Maison hantée (contrat v5 : p_evt, période « hantee ») et « en ligne » (fournil_vu) ──');
  { // un serveur v5 : les bonbons partent avec p_evt / p_score, la période « hantee », le podium final gardé à vie, le battement
    horloge = Date.UTC(2026, 9, 28, 12); let bonbons = 5e6, cache = true, enLigneNav = true; const vus = [];
    const v5 = (url, c) => {
      const nom = url.split('/rpc/')[1];
      if (nom === 'fournil_publier') return { ok: true, erreur: null, version: 5, rang_semaine: 1, rang_total: 2, joueurs: 9, semaine: '2026-10-26', points_semaine: c.p_points, points_total: 5, compte: 0, evt: c.p_evt || null, evt_score: c.p_score || null, rang_evt: c.p_evt ? 2 : null, evt_plafonne: c.p_evt ? false : null };
      if (nom === 'fournil_vu') { vus.push(c); return { ok: true, erreur: null }; }
      if (nom === 'fournil_recompenses') return { ok: true, erreur: null, podiums: [], derniere: null, quartier: null, quartier_podium: [], evenements: { hantee: { rang: 3, podium: [{ rang: 1, pseudo: 'Mamie', valeur: 9e14 }, { rang: 2, pseudo: 'Jo', valeur: 5e14 }, { rang: 3, pseudo: 'Léa', valeur: 4e14 }] }, inconnu: { rang: 1, podium: [] } } };
      return { version: 5, semaine: '2026-10-26', periode: c.p_periode, joueurs: 4, en_ligne_n: 1, lignes: [{ rang: 1, pseudo: 'Mamie', points: null, valeur: 9e14, moi: false, podium: null, en_ligne: true }, { rang: 2, pseudo: 'Léa', points: null, valeur: 5e6, moi: true, podium: null, en_ligne: false }], moi: { rang: 2, points: null, valeur: 5e6, podium: null, en_ligne: false } };
    };
    const r = faux(async (url, init, c) => rep(200, v5(url, c)));
    const m = moteur(r, { points: () => ({ points: 3, lundi: '2026-10-26' }), evenement: () => ({ id: 'hantee', score: bonbons + 0.7 }), visible: () => cache, enLigne: () => enLigneNav }); fortune = 5000;
    let res = await m.choisirPseudo('Léa');
    const c = r.appels[0].corps;
    check(res.etat === 'ok' && egal(Object.keys(c).sort(), ['p_evt', 'p_fortune', 'p_id', 'p_jeton', 'p_lundi', 'p_points', 'p_pseudo', 'p_score']) && c.p_evt === 'hantee' && c.p_score === 5e6 && m.version() === 5, 'rejoindre : fournil_publier avec ses bonbons (p_evt = « hantee », p_score arrondi vers le bas) ; serveur v5');
    check(m.resume().hantee && m.resume().hantee.rang === 2 && egal(m.etat().evt, { id: 'hantee', valeur: 5e6 }), 'son rang à Halloween revient dans le résumé (resume().hantee), ses bonbons envoyés sont notés');
    horloge += 20e3; res = await m.envoyer('feuille');
    check(res.etat === 'saute' && res.pourquoi === 'inchange', 'rien de neuf : rien ne part');
    bonbons = 7e6; res = await m.envoyer('feuille');
    check(res.etat === 'ok' && r.appels[r.appels.length - 1].corps.p_score === 7e6 && !('p_quartier' in r.appels[r.appels.length - 1].corps), 'des bonbons en plus : ils partent (sans p_quartier : pas de billets)');
    { const n0 = r.appels.length; res = await m.battre('periodique');
      check(res.etat === 'saute' && res.pourquoi === 'recent' && r.appels.length === n0, 'un envoi accepté par la v5 vaut un signe de vie : pas de battement juste après'); }
    horloge += 2 * 60e3; res = await m.battre('periodique');
    check(res.etat === 'ok' && vus.length === 1 && egal(Object.keys(vus[0]).sort(), ['p_id', 'p_jeton']) && vus[0].p_id === m.etat().id, '2 min plus tard : un battement fournil_vu (p_id, p_jeton), rien d’autre');
    horloge += 60e3; res = await m.battre('periodique');
    check(res.etat === 'saute' && res.pourquoi === 'recent' && vus.length === 1, 'pas plus d’un battement toutes les 2 min');
    cache = false; horloge += 5 * 60e3; res = await m.battre('periodique');
    check(res.etat === 'saute' && res.pourquoi === 'cachee' && vus.length === 1, 'page cachée (arrière-plan) : aucun battement');
    res = await m.tick(); check(res.etat === 'saute' && vus.length === 1, 'le minuteur, page cachée : ni envoi ni battement');
    cache = true; enLigneNav = false; res = await m.battre('retour');
    check(res.etat === 'saute' && res.pourquoi === 'hors-ligne' && vus.length === 1, 'hors ligne : aucun battement');
    enLigneNav = true; res = await m.battre('retour');
    check(res.etat === 'ok' && vus.length === 2, 'retour au premier plan : un battement tout de suite');
    horloge += 5e3; res = await m.battre('retour');
    check(res.etat === 'saute' && vus.length === 2, 'deux retours en 5 s : un seul battement');
    horloge += 2 * 60e3; const n1 = r.appels.length; res = await m.tick();
    check(res.etat === 'saute' && vus.length === 3 && r.appels.length === n1 + 2, 'le minuteur, page visible, rien de neuf à envoyer : les récompenses, puis un battement');
    const l = await m.charger('hantee');
    check(l.etat === 'ok' && l.data.lignes.length === 2 && l.data.lignes[0].enLigne === true && l.data.lignes[1].enLigne === false && l.data.moi.enLigne === false && l.data.enLigneN === 1 && m.cache('hantee') === l && m.resume().hantee.rang === 2 && m.resume().hantee.joueurs === 4 && r.appels[r.appels.length - 1].corps.p_periode === 'hantee',
      'la période « hantee » (onglet Halloween) : la liste en bonbons, « moi » 2e, chaque ligne porte enLigne, la liste enLigneN (1 en ligne)');
    const rec = await m.chargerRecompenses({ ecart: 0 });
    check(rec.etat === 'ok' && m.recompenses().evenements.hantee && m.recompenses().evenements.hantee.rang === 3 && m.recompenses().evenements.hantee.podium.length === 3 && !('inconnu' in m.recompenses().evenements), 'le podium final d’Halloween lu : 3e, les trois premiers gardés (un événement inconnu est ignoré)');
    const q = await m.quitter();
    check(q.etat === 'ok' && m.recompenses().evenements.hantee.rang === 3, 'quitter le classement : le rang au podium final d’Halloween reste sur le téléphone');
    res = await m.battre('retour'); check(res.etat === 'saute' && res.pourquoi === 'pas-rejoint', 'sans avoir rejoint : aucun battement'); }
  { // un serveur encore en version 4 : p_evt inconnu → renvoyé sans (avec les billets s'il y en a), plus jamais de bonbons, aucun battement
    horloge = Date.UTC(2026, 9, 27, 11, 30);
    const r = faux(async (url, init, c) => {
      if (url.endsWith('/fournil_publier') && 'p_evt' in c) return rep(404, { code: 'PGRST202', message: 'Could not find the function public.fournil_publier(p_evt, p_fortune, p_id, p_jeton, p_lundi, p_points, p_pseudo, p_quartier, p_score)' });
      if (url.endsWith('/fournil_vu')) return rep(404, { code: 'PGRST202' });
      return rep(200, url.endsWith('/fournil_publier') ? { ok: true, erreur: null, version: 4, rang_semaine: 1, rang_total: 1, rang_quartier: 1, quartier: c.p_quartier || 0, joueurs: 3, semaine: '2026-10-26', points_semaine: 8, points_total: 8, compte: 0 } : { version: 4, semaine: '2026-10-26', joueurs: 1, lignes: [{ rang: 1, pseudo: 'Léa', points: 8, valeur: 1, moi: true, podium: null }], moi: { rang: 1, points: 8, valeur: 1, podium: null } });
    });
    const m = moteur(r, { points: () => ({ points: 8, lundi: '2026-10-26' }), quartier: () => 777, evenement: () => ({ id: 'hantee', score: 99 }) }); fortune = 70;
    const res = await m.choisirPseudo('Léa');
    check(res.etat === 'ok' && r.appels.length === 2 && 'p_evt' in r.appels[0].corps && r.appels[0].corps.p_quartier === 777 && !('p_evt' in r.appels[1].corps) && r.appels[1].corps.p_quartier === 777 && m.version() === 4 && m.etat().evt === null && m.etat().quartier === 777,
      'serveur v4 (à l’heure de grâce du Quartier) : refus « fonction introuvable » avec les bonbons, aussitôt renvoyé avec les billets seuls — accepté, aucun bonbon noté');
    horloge += 31 * 60e3; fortune = 90; await m.envoyer('periodique');
    check(r.appels.length === 3 && !('p_evt' in r.appels[2].corps) && 'p_quartier' in r.appels[2].corps, 'ensuite, plus de bonbons envoyés à ce serveur (jusqu’au prochain lancement)');
    const b = await m.battre('retour');
    check(b.etat === 'saute' && b.pourquoi === 'ancien-serveur' && !r.appels.some((a) => a.url.endsWith('/fournil_vu')), 'un serveur v4 connu : aucun battement (fournil_vu n’existe pas)');
    const l = await m.charger('semaine');
    check(l.etat === 'ok' && !('enLigne' in l.data.lignes[0]) && !('enLigne' in l.data.moi) && !('enLigneN' in l.data), 'sa liste : enLigne et enLigneN absents (rien ne casse)'); }
  { // la version du serveur pas encore connue, fournil_vu absente : un seul essai, puis plus rien jusqu'au prochain lancement
    horloge = Date.UTC(2026, 9, 28, 12);
    const r = faux(async (url) => (url.endsWith('/fournil_vu') ? rep(404, { code: 'PGRST202' }) : rep(200, { ok: true })));
    const st = memoire(); CL.ecrireEtat(st, Object.assign(CL.etatNeuf(), { id: '0b9a3e4c-1d2e-4f50-8a6b-7c8d9e0f1a2b', jeton: 'a'.repeat(64), pseudo: 'Léa', rejoint: true }));
    const m = moteur(r, { stockage: st });
    let b = await m.battre('lancement'); check(b.etat === 'pas-ouvert' && r.appels.length === 1, 'premier battement : « fonction introuvable »');
    horloge += 10 * 60e3; b = await m.battre('periodique');
    check(b.etat === 'saute' && b.pourquoi === 'ancien-serveur' && r.appels.length === 1, 'ensuite : plus aucun battement vers ce serveur'); }
  { // sans configuration (l'artefact Claude) : rien
    const m = CL.creerMoteur({ config: () => null, stockage: memoire(), fetch: async () => { throw new Error('jamais'); } });
    check((await m.battre('retour')).etat === 'absent', 'sans configuration : aucun battement'); }
  { // l'état local : le dernier score d'événement et le rang d'Halloween se relisent ; les absurdités sont écartées
    const e = CL.nettoyerEtat({ id: '0b9a3e4c-1d2e-4f50-8a6b-7c8d9e0f1a2b', jeton: 'b'.repeat(64), pseudo: 'Léa', rejoint: true, evt: { id: 'hantee', valeur: 12 }, dernier: { hantee: { rang: 4, joueurs: 9 }, quand: 5 }, recompenses: { podiums: [], evenements: { hantee: { rang: 2, podium: [{ rang: 1, pseudo: 'Jo', valeur: 3 }] }, autre: { rang: 1 } } } });
    check(egal(e.evt, { id: 'hantee', valeur: 12 }) && e.dernier && e.dernier.hantee.rang === 4 && e.recompenses.evenements.hantee.rang === 2 && !('autre' in e.recompenses.evenements), 'le score envoyé, le rang et le podium final d’Halloween se relisent');
    const f = CL.nettoyerEtat({ evt: { id: 'quartier', valeur: 3 }, recompenses: { evenements: { hantee: { rang: 16, podium: 'x' } } } }); // (version 6.6 : de 1 à 15 ; 16, absurde)
    check(f.evt === null && f.recompenses.evenements.hantee.rang === null && egal(f.recompenses.evenements.hantee.podium, []), 'un événement inconnu ou un rang absurde : écartés'); }
  { // les onglets d'événement du classement (pour l'interface)
    const Q = require('../src/quartier.js'), H = require('../src/hantee.js');
    // (le Quartier est écarté depuis le 27 oct., QUARTIER.ECARTE : ses règles sont rejouées ici comme s'il revenait, Qr, puis telles quelles)
    const Qr = Object.assign({}, Q, { ECARTE: false });
    const liste = (masque, R) => [{ periode: 'quartier', nom: 'Événement', regles: R || Qr, masque: !!masque }, { periode: 'hantee', nom: 'Halloween', regles: H }];
    check(egal(CL.ongletsEvenements(liste(), Date.UTC(2026, 9, 20)), [['quartier', 'Événement']]), 'le 20 octobre : l’onglet Événement seul');
    check(egal(CL.ongletsEvenements(liste(), H.DEBUT + 3600e3), [['quartier', 'Événement'], ['hantee', 'Halloween']]) && egal(CL.ongletsEvenements(liste(true), H.DEBUT + 3600e3), [['hantee', 'Halloween']]), 'le 27 octobre après midi : le podium final du Quartier et Halloween (le Quartier masqué : Halloween seul)');
    check(Q.ECARTE === true && egal(CL.ongletsEvenements(liste(false, Q), Date.UTC(2026, 9, 20)), []) && egal(CL.ongletsEvenements(liste(false, Q), H.DEBUT + 3600e3), [['hantee', 'Halloween']]), 'le Quartier écarté : plus d’onglet, même pendant ses deux semaines de podium (Halloween seul)');
    check(egal(CL.ongletsEvenements(liste(), H.FIN + 13 * 864e5), [['hantee', 'Halloween']]) && egal(CL.ongletsEvenements(liste(), H.FIN + 15 * 864e5), []), 'deux semaines après Halloween, l’onglet s’efface');
    check(CL.PERIODES.includes('hantee') && CL.EVTS.join() === 'hantee', 'la période « hantee » est connue du moteur'); }

  console.log('── les copains (contrat v6) : la photo de la boutique ──');
  const G = require('../src/game.js');
  { const st = G.newState(T); st.nomBoutique = 'Chez Lucas'; st.boutiques = 2; st.stations.forEach((s, i) => { s.niv = 250 + i; s.staff = true; }); st.apprentis[G.PRODUITS[1].id] = { xp: G.APPRENTI_NIVEAUX[2] };
    for (const m of G.MOBILIER) st.mobilier[m.id] = m.max; st.chat = { nom: 'Réglisse' }; st.chatNoir = true; st.chatPelage = 'noir'; st.xp = 0; for (let n = 1; n < 30; n++) st.xp += G.XP_NIVEAU(n);
    G.donnerVetement(st, 'or-toque'); G.equiper(st, 'tete', 'or-toque'); st.quartier = { decos: ['graffiti', 'neon'] }; st.hantee = { decos: ['citrouilles', '<script>'] };
    st.saison = { id: G.RECETTES_SAISON[0].id, annee: 2026, niv: 3, prog: 0, actif: false };
    const p = CL.photo(st, { G, coupes: ['or', 'argent', 'bronze', 'platine'], badge: true }), o = CL.octetsJson(p);
    check(p && o <= 2048 && p.nom === 'Chez Lucas' && p.q === 1 && p.p.length === G.PRODUITS.length && p.p[1][2] === 3 && p.p[0][1] === 1 && p.m.four === 4 && p.t[0] === 'or-toque' && egal(p.c, { n: 'Réglisse', p: 'noir', a: 'chat-noir' }) && egal(p.dq, ['graffiti', 'neon']) && egal(p.dh, ['citrouilles']) && p.g === 30 && egal(p.k, ['or', 'argent', 'bronze']) && p.o === 1 && p.s === G.RECETTES_SAISON[0].id,
      `la photo : nom, quartier, postes (niveau, apprenti, grade), crans, tenue, chat noir, décos, niveau, coupes, badge (${o} octets ≤ 2048)`);
    const b = CL.boutiqueDepuisPhoto(p, { G, maintenant: T });
    check(b && b.st.visite === true && b.nom === 'Chez Lucas' && b.quartier === G.QUARTIERS[1].nom && G.mobilierCran(b.st, 'four') === 4 && b.st.stations[3].niv === 253 && b.st.stations[3].staff && G.gradeApprenti(b.st, 1) === 3 && G.niveau(b.st) === 30 && G.toqueMetal(b.st) === 'or' && b.st.chat.nom === 'Réglisse' && G.pelageChat(b.st, false) === 'noir' && b.st.saison.niv === 1 && b.badge && b.coupes.length === 3 && b.st.coins === 0,
      'la boutique rebâtie depuis la photo (GAME.newState + ses champs) : mêmes crans, postes, grades, niveau, toque d’or, chat noir, recette de saison');
    const grosse = Object.assign({}, p, { nom: 'x'.repeat(5000), p: Array.from({ length: 400 }, () => [1e12, 1, 9]), k: Array(500).fill('or') });
    const longue = CL.photo(Object.assign(G.newState(T), { nomBoutique: 'Ω'.repeat(400) }), { G, coupes: Array(400).fill('or') });
    check(longue !== null && CL.octetsJson(longue) <= 2048, 'une boutique au nom démesuré : la photo reste sous 2 Ko');
    check(CL.nettoyerPhoto(grosse) === null && CL.nettoyerPhoto(null) === null && CL.nettoyerPhoto([1]) === null && CL.nettoyerPhoto('x') === null, 'une photo trop grosse ou absurde venue du réseau : écartée');
    const sale = CL.nettoyerPhoto({ nom: '<img src=x onerror=alert(1)>Fournil', q: 99, p: [[-5, 'oui', 77], 'x'], m: { four: 999, 'Mauvais id': 2 }, t: ['or-toque', '<b>', 42], c: { n: '<i>Chat</i>', p: 'vert' }, dq: ['graffiti', 'graffiti', 'A B'], k: ['or', 'diamant'], g: -3, o: 'oui' });
    check(sale && !/[<>]/.test(sale.nom) && egal(sale.p, [[0, 1, 5], [0, 0, 1]]) && sale.m.four === 20 && !('Mauvais id' in sale.m) && egal(sale.t, ['or-toque', null, null]) && !/[<>]/.test(sale.c.n) && sale.c.p === 'roux' && egal(sale.dq, ['graffiti']) && egal(sale.k, ['or']) && sale.g === 1,
      'une photo piégée : pas de balise, nombres bornés, ids inconnus écartés');
    const b2 = CL.boutiqueDepuisPhoto({ q: 99, p: [], m: { four: 999 }, t: ['n-existe-pas'] }, { G, maintenant: T });
    check(b2 && b2.st.stations[0].niv === 1 && G.mobilierCran(b2.st, 'four') === 4 && G.tenueBoulanger(b2.st).tete.forme === 'toque' && G.quartier(b2.st) < G.QUARTIERS.length, 'une photo pauvre : une boutique de départ, crans plafonnés au maximum, tenue de base');
    // les recettes de boutique (19 octobre) : les seize postes passent, au pire sous 2 Ko ; une photo d'avant (huit postes) se rebâtit, les autres à 0 ;
    // un quartier du parcours (la gare, n°10) se retrouve chez le copain
    const s16 = G.newState(T); s16.boutiques = 10; s16.quartierFixe = G.quartierDe(10); s16.nomBoutique = 'Ω'.repeat(30); s16.stations.forEach((x, i) => { x.niv = 999999 - i; x.staff = true; }); for (const pr of G.PRODUITS) s16.apprentis[pr.id] = { xp: G.APPRENTI_NIVEAUX[4] };
    const p16 = CL.photo(s16, { G, coupes: Array(12).fill('or'), badge: true }), b16 = CL.boutiqueDepuisPhoto(p16, { G, maintenant: T });
    check(p16 && CL.octetsJson(p16) <= 2048 && p16.p.length === 16 && p16.p[15][0] === 999984 && p16.p[15][2] === 5 && b16.st.stations[15].niv === 999984 && G.gradeApprenti(b16.st, 15) === 5 && b16.quartier === 'la gare',
      `seize recettes : les niveaux des recettes de boutique passent, grade compris (${p16 && CL.octetsJson(p16)} octets au pire), le quartier de la gare aussi`);
    const avant8 = Object.assign({}, p, { p: p.p.slice(0, 8) }), b8 = CL.boutiqueDepuisPhoto(avant8, { G, maintenant: T });
    check(b8 && b8.st.stations.length === G.PRODUITS.length && b8.st.stations[7].niv === 257 && b8.st.stations.slice(8).every((x) => x.niv === 0 && !x.staff), 'une photo d’avant (huit postes) : rebâtie, les recettes de boutique à 0'); }
  { // les meubles du 17 octobre (tables 5 et 6, bar, coin salon, terrasse) : dans la photo ; la photo d'un copain d'avant cette version se charge (crans à 0)
    const st = G.newState(T); st.nomBoutique = 'Ω'.repeat(30); st.stations.forEach((s) => { s.niv = 1e6; s.staff = true; }); for (const m of G.MOBILIER) st.mobilier[m.id] = m.max;
    const p = CL.photo(st, { G, coupes: Array(12).fill('or'), badge: true }), o = CL.octetsJson(p), b = CL.boutiqueDepuisPhoto(p, { G, maintenant: T });
    check(p && o <= 2048 && p.m.tables === 6 && p.m.bar === 3 && p.m.banquette === 3 && p.m.terrasse === 3 && Object.keys(p.m).length === 9 && p.k.length === 12
      && b && G.mobilierCran(b.st, 'tables') === 6 && G.mobilierCran(b.st, 'terrasse') === 3 && G.places(b.st).bar === 4 && G.places(b.st).banquette === 3, `les neuf meubles au maximum dans la photo (${o} octets ≤ 2048, rien de retiré), rebâtis chez le visiteur`);
    const avant = { v: 1, nom: 'Chez Lucas', q: 0, p: [[40, 1, 2]], m: { tables: 4, four: 4, vitrine: 3, caisse: 3, froid: 3, deco: 4 }, t: [null, null, null, null], c: null, g: 12 }, bv = CL.boutiqueDepuisPhoto(avant, { G, maintenant: T });
    check(bv && G.mobilierCran(bv.st, 'tables') === 4 && G.mobilierCran(bv.st, 'deco') === 4 && ['bar', 'banquette', 'terrasse'].every((id) => G.mobilierCran(bv.st, id) === 0) && JSON.stringify(G.places(bv.st)) === '{"tables":4,"bar":0,"banquette":0,"terrasse":0}', 'la photo d’un copain d’avant cette version : ses six meubles, pas de bar, de coin salon ni de terrasse');
    const plus = CL.nettoyerPhoto(Object.assign({}, avant, { m: Object.assign({ bar: 3, banquette: 3, terrasse: 3, piano: 2 }, avant.m) }));
    check(plus && Object.keys(plus.m).length === 10 && plus.m.piano === 2 && G.mobilierCran(CL.boutiqueDepuisPhoto(plus, { G, maintenant: T }).st, 'piano') === 0, 'un meuble encore inconnu de ce téléphone (une version plus neuve) : gardé dans la photo, ignoré dans la boutique'); }

  console.log('── la photo : les statistiques (x) et l’événement en cours (e) ──');
  const Q = require('../src/quartier.js'), H = require('../src/hantee.js');
  { const st = G.newState(T); st.nomBoutique = 'Chez Lucas'; st.etoiles = 42; st.boutiques = 3; st.stats.ventes = 123456; st.stats.serieMax = 9; st.lifetime = 98765432.1;
    st.trophees = { premiere: T, cent: T, inconnu: T };
    const q = Q.neuf(T); q.majeur = true; q.ouvertLe = T; q.postes[0].niv = 60; q.postes[0].staff = true; q.postes[1].niv = 12; q.decos = ['graffiti', 'neon']; q.paliers = [1, 2, 3, 4]; q.total = Q.PALIERS[3].total + 5;
    const p = CL.photo(st, { G, ev: { id: 'quartier', q } });
    check(p && egal(p.x, { e: 42, b: 3, v: 123456, tr: 2, s: 9, f: 98770000 }), `x : étoiles, boutique, ventes, trophées (connus seulement), série, fortune à 4 chiffres (${JSON.stringify(p && p.x)})`);
    check(p && egal(p.e, { id: 'quartier', p: [[60, 1], [12, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], d: ['graffiti', 'neon'], pa: 4, t: Q.PALIERS[3].total + 5 }), `e : l’événement, ses huit postes (niveau, apprenti), ses décos, ses paliers, son total (${JSON.stringify(p && p.e)})`);
    { // une Planque au bout de l'événement : huit postes à des milliers de niveaux, tous les apprentis, vingt paliers, toutes les décos ; une vieille photo à six postes
      const q8 = Q.neuf(T); q8.postes.forEach((x) => { x.niv = 4999; x.staff = true; }); q8.decos = Q.DECOS.slice(); q8.paliers = Q.PALIERS.map((x) => x.n); q8.total = 1e17;
      const p8 = CL.photo(st, { G, coupes: Array(12).fill('or'), badge: true, ev: { id: 'quartier', q: q8 } }), r8 = CL.evenementDepuisPhoto(p8, { R: Q, id: 'quartier', maintenant: T });
      check(p8 && p8.e && p8.e.p.length === 8 && CL.octetsJson(p8) <= 2048 && p8.e.d.length === 4 && r8 && r8.q.postes.every((x) => x.niv === 4999 && x.staff) && r8.equipe === 8 && r8.postes === 8, `huit postes : la photo porte toute la Planque (${CL.octetsJson(p8)} octets ≤ 2048, rien de retiré), rebâtie avec ses huit postes et ses huit apprentis`);
      const v6 = JSON.parse(JSON.stringify(p8)); v6.e.p = v6.e.p.slice(0, 6); const r6 = CL.evenementDepuisPhoto(v6, { R: Q, id: 'quartier', maintenant: T });
      check(r6 && r6.q.postes.length === 8 && r6.q.postes.slice(6).every((x) => x.niv === 0 && !x.staff) && r6.postes === 6, 'la photo d’un copain encore à six postes : ses deux dernières recettes fermées, rien de rejeté'); }
    check(!('e' in CL.photo(st, { G })) && !('e' in CL.photo(st, { G, ev: { id: 'n-importe', q } })), 'sans événement en cours (ou d’un id inconnu) : pas de champ e');
    // le pire cas : 16 postes, toutes les décos, 12 coupes, un nom long, des compteurs énormes, un événement à 16 postes et 8 décos
    const pire = G.newState(T); pire.nomBoutique = 'Ω'.repeat(400); while (pire.stations.length < 16) pire.stations.push({ niv: 0, staff: false, prog: 0, actif: false });
    pire.stations.forEach((x) => { x.niv = 1e9; x.staff = true; }); for (const m of G.MOBILIER) pire.mobilier[m.id] = m.max; pire.amenagement = { v: 1, tables: Array.from({ length: 6 }, (_, i) => [35 - i, 35]), bar: [35, 35], salon: [35, 35], terrasse: [35, 35, 35] }; pire.chat = { nom: 'Ω'.repeat(40) }; pire.saison = { id: G.RECETTES_SAISON[0].id, niv: 3 };
    pire.etoiles = 1e12; pire.boutiques = 1e9; pire.stats.ventes = 1e20; pire.stats.serieMax = 1e9; pire.lifetime = 1.23456789e300; for (const t of G.TROPHEES) pire.trophees[t.id] = T; pire.xp = 1e15;
    const qp = Q.neuf(T); qp.postes = Array.from({ length: 30 }, () => ({ niv: 1e9, staff: true })); qp.decos = Q.DECOS.concat(H.DECOS, ['fantome', 'chauvesouris', 'lanternes']); qp.paliers = Array.from({ length: 40 }, (_, k) => k + 1); qp.total = 1e30;
    pire.distinctions = ['legende-manoir']; // version 6.6 : le titre gagné au 20e palier de la Maison hantée (ti)
    const tous = { G, coupes: Array(40).fill('bronze'), badge: true, dq: Q.DECOS.concat(['a', 'b', 'c', 'd', 'e']), dh: H.DECOS.concat(['bestiaire', 'legende', 'fantome', 'x', 'y']), ev: { id: 'quartier', q: qp } };
    const pp = CL.photo(pire, tous), op = CL.octetsJson(pp);
    check(pp && op <= 2048 && pp.p.length === 16 && pp.k.length === 12 && pp.e && pp.e.p.length === 16 && pp.e.d.length === 8 && pp.x.f === 1e30 && pp.x.v === 1e15 && pp.ti === 'legende-manoir', `le pire cas (16 postes, toutes les décos, 12 coupes, un nom long, un événement à 16 postes, le titre) : ${op} octets ≤ 2048, rien de retiré`);
    check(pp && pp.a === 'zzyzxzwzvzuzzzzzzzz' && G.codeAmenagement(G.amenagementDepuisCode(pp.a)) === pp.a, `a : l’aménagement le plus long (tout déplacé) tient en ${pp && pp.a ? pp.a.length : 0} caractères, relu tel quel`);
    console.log(`       (taille au pire cas : ${op} octets)`);
    // le standing (17 octobre) : le champ l (palier 0 à 5) est dans le pire cas ; relu borné ; une vieille photo sans l → palier 0
    { const sv = Object.assign({}, pp); delete sv.l; const bv = CL.boutiqueDepuisPhoto(sv, { G, maintenant: T }), b5 = CL.boutiqueDepuisPhoto(pp, { G, maintenant: T });
      check(pp.l === 5 && G.standing(b5.st) === 5 && CL.nettoyerPhoto(sv).l === 0 && G.standing(bv.st) === 0 && CL.nettoyerPhoto(Object.assign({}, pp, { l: 42 })).l === 5 && CL.nettoyerPhoto(Object.assign({}, pp, { l: 'x' })).l === 0,
        'le standing dans la photo (l = 5 au pire cas, compté dans les 2048 octets) ; une vieille photo sans l : palier 0 ; l borné entre 0 et 5'); }
    { // le champ a : absent au plan d'origine ; relu borné (un code abîmé ou absurde : le plan d'origine) ; appliqué à la boutique du copain
      const s0 = G.newState(T); check(!('a' in CL.photo(s0, { G })), 'a : absent tant que rien n’est déplacé');
      s0.amenagement = { v: 1, tables: [[3, 2], null, null, null, null, null], bar: null, salon: null, terrasse: [null, 6, null] };
      const pa = CL.photo(s0, { G }), na = CL.nettoyerPhoto(pa), ba = CL.boutiqueDepuisPhoto(pa, { G, maintenant: T });
      check(pa.a === '32' + '-'.repeat(14) + '-6-' && na.a === pa.a && ba && ba.st.amenagement && ba.st.amenagement.tables[0][0] === 3 && ba.st.amenagement.terrasse[1] === 6, `a : '${pa.a}' (${pa.a.length} o), relu et appliqué à la boutique visitée`);
      const abimes = ['32', '-'.repeat(19), 'ZZ--------------6--', '3----------------6-', '32---------------6-x', 42, { a: 1 }, '<script>alert(1)</>'].map((x) => CL.nettoyerPhoto(Object.assign({}, pa, { a: x })));
      check(abimes.every((o) => o && !('a' in o)) && abimes.every((o) => !CL.boutiqueDepuisPhoto(o, { G, maintenant: T }).st.amenagement), 'a abîmé (trop court, tout à l’origine, majuscules, une case à moitié, trop long, pas une chaîne) : retiré, la boutique visitée garde le plan d’origine');
    }
    // le repli, éprouvé en abaissant la limite : le nom et les coupes d'abord, puis e.d, puis e, puis rien
    const max0 = CL.PHOTO.max, taille = (o) => CL.octetsJson(o), s1 = taille(Object.assign({}, pp, { k: [], nom: pp.nom.slice(0, 12) })), e2 = Object.assign({}, pp.e); delete e2.d;
    const s2 = taille(Object.assign({}, pp, { k: [], nom: pp.nom.slice(0, 12), e: e2 })), sansE = Object.assign({}, pp, { k: [], nom: pp.nom.slice(0, 12) }); delete sansE.e; const s3 = taille(sansE);
    try {
      CL.PHOTO.max = op - 1; const r1 = CL.photo(pire, tous);
      CL.PHOTO.max = s1 - 1; const r2 = CL.photo(pire, tous);
      CL.PHOTO.max = s2 - 1; const r3 = CL.photo(pire, tous);
      CL.PHOTO.max = s3 - 1; const r4 = CL.photo(pire, tous);
      check(r1 && r1.k.length === 0 && r1.nom.length === 12 && r1.e && r1.e.d.length === 8 && r2 && r2.e && !('d' in r2.e) && r2.e.p.length === 16 && r3 && !('e' in r3) && r3.x && r4 === null,
        `trop grosse : d’abord le nom et les coupes (${s1} octets), puis les décos de l’événement (${s2}), puis l’événement (${s3}), puis plus de photo`);
    } finally { CL.PHOTO.max = max0; }
    // relue du réseau : x et e bornés et nettoyés
    const brute = { v: 1, nom: 'A', q: 0, p: [], m: {}, t: [], dq: [], dh: [], g: 1, k: [], o: 0,
      x: { e: -5, b: 'trois', v: 1e40, tr: 1e6, s: '<b>', f: -1, z: 'intrus' }, e: { id: 'quartier', p: [[-3, 'oui'], 'x', { niv: 5, staff: 1 }, ...Array(40).fill([2e9, 1])], d: ['graffiti', 'A B', '<script>', 'neon', 'graffiti', ...Array(20).fill(0).map((_, k) => 'd' + k)], pa: 1e9, t: -8, a: { x: 1 } } };
    const n1 = CL.nettoyerPhoto(brute);
    check(n1 && egal(n1.x, { e: 0, b: 1, v: 1e15, tr: 999, s: 0, f: 0 }), `x relu : nombres bornés, types faux ramenés au minimum, champ inconnu écarté (${JSON.stringify(n1 && n1.x)})`);
    check(n1 && n1.e && n1.e.id === 'quartier' && n1.e.p.length === 16 && egal(n1.e.p.slice(0, 4), [[0, 1], [0, 0], [0, 0], [1e6, 1]]) && egal(n1.e.d.slice(0, 3), ['graffiti', 'neon', 'd0']) && n1.e.d.length === 8 && n1.e.pa === 99 && n1.e.t === 0 && !('a' in n1.e),
      `e relu : 16 postes au plus, niveaux bornés (un poste qui n’est pas une paire : [0, 0]), 8 décos valides au plus (sans doublon ni balise), paliers et total bornés (${JSON.stringify(n1 && n1.e).slice(0, 120)}…)`);
    check(!('e' in CL.nettoyerPhoto(Object.assign({}, brute, { e: { id: 'casino', p: [] } }))) && !('e' in CL.nettoyerPhoto(Object.assign({}, brute, { e: [1, 2] }))) && !('e' in CL.nettoyerPhoto(Object.assign({}, brute, { e: 'quartier' }))) && !('x' in CL.nettoyerPhoto(Object.assign({}, brute, { x: [1, 2] }))),
      'un id d’événement inconnu, un e ou un x d’un mauvais type : écartés');
    check(CL.nettoyerPhoto(Object.assign({}, brute, { e: { id: 'quartier', p: Array(3000).fill([1, 1]) } })) === null, 'une photo gonflée par e (plus de 4 Ko) : écartée tout entière');
    // une vieille photo (d'avant x et e) : toujours acceptée
    const vieille = { v: 1, nom: 'Chez Lucas', q: 2, p: [[40, 1, 2]], m: { four: 3 }, t: ['or-toque', null, null, null], c: null, g: 12 };
    const nv = CL.nettoyerPhoto(vieille), bv = CL.boutiqueDepuisPhoto(vieille, { G, maintenant: T });
    check(nv && !('x' in nv) && !('e' in nv) && nv.m.four === 3 && bv && bv.stats === null && bv.nom === 'Chez Lucas' && CL.evenementDepuisPhoto(vieille, { R: Q, id: 'quartier', maintenant: T }) === null, 'une vieille photo sans x ni e : acceptée, sa boutique se rebâtit, pas de statistiques ni de Planque');
    check(egal(CL.boutiqueDepuisPhoto(p, { G, maintenant: T }).stats, p.x), 'la boutique rebâtie porte ses statistiques (pour la fiche « Tous les temps »)');
    // version 6.6 : le titre (ti) : absent sans distinction ; relu seulement s'il est connu ; une vieille photo sans ti reste valable
    { const s0 = G.newState(T); check(!('ti' in CL.photo(s0, { G })) && CL.photo(Object.assign(G.newState(T), { distinctions: ['legende-manoir'] }), { G }).ti === 'legende-manoir' && CL.photo(Object.assign(G.newState(T), { distinctions: ['roi-du-monde'] }), { G }).ti === undefined,
        'ti : absent sans titre gagné ; « legende-manoir » une fois gagné (G.distinctions) ; un titre inconnu n’est pas envoyé');
      const avec = CL.nettoyerPhoto(Object.assign({}, vieille, { ti: 'legende-manoir' })), faux = ['<b>Roi</b>', 'roi-du-monde', 42, { a: 1 }, 'legende-manoir'.repeat(3)].map((x) => CL.nettoyerPhoto(Object.assign({}, vieille, { ti: x })));
      check(avec.ti === 'legende-manoir' && CL.boutiqueDepuisPhoto(avec, { G, maintenant: T }).titre === 'Légende du Manoir' && faux.every((o) => o && !('ti' in o)) && !('ti' in nv) && CL.boutiqueDepuisPhoto(vieille, { G, maintenant: T }).titre === null,
        'ti relu : « Légende du Manoir » dans la visite ; du HTML, un titre inconnu, un mauvais type : écartés (la photo reste) ; une vieille photo sans ti : pas de titre'); }
    // la Planque rebâtie depuis e
    const r = CL.evenementDepuisPhoto(p, { R: Q, id: 'quartier', maintenant: T });
    check(r && r.id === 'quartier' && r.q.postes.length === Q.PRODUITS.length && r.q.postes[0].niv === 60 && r.q.postes[0].staff && r.q.postes[1].niv === 12 && !r.q.postes[1].staff && egal(r.q.decos, ['graffiti', 'neon']) && egal(r.q.paliers, [1, 2, 3, 4]) && r.q.total === Q.PALIERS[3].total + 5 && r.q.billets === 0 && r.equipe === 1 && r.postes === 2 && r.q.visite && Q.paliersAtteints(r.q).length === 4,
      'la Planque rebâtie (QUARTIER.neuf + e) : ses postes et son équipe, ses décos, ses paliers, son total ; rien en poche');
    check(Q.tauxParSeconde(r.q) > 0 && Q.etat({ quartier: r.q }, T) === r.q, 'l’état rebâti est un état valide des règles (taux, etat() le garde tel quel)');
    const ph = CL.photo(st, { G, ev: { id: 'hantee', q: Object.assign(H.neuf(T), { decos: ['citrouilles', 'graffiti'], total: 777, paliers: [1] }) } });
    const rh = CL.evenementDepuisPhoto(ph, { R: H, id: 'hantee', maintenant: T });
    check(rh && rh.q.postes.length === H.PRODUITS.length && egal(rh.q.decos, ['citrouilles']) && rh.q.total === 777 && rh.paliers === 1 && CL.evenementDepuisPhoto(ph, { R: Q, id: 'quartier', maintenant: T }) === null,
      'le Manoir rebâti (HANTEE) : seules ses décos connues restent ; demandé depuis l’onglet du Quartier, rien');
    const pauvre = CL.evenementDepuisPhoto({ e: { id: 'quartier', p: [], d: [], pa: 0, t: 0 } }, { R: Q, id: 'quartier', maintenant: T });
    check(pauvre && pauvre.q.postes[0].niv === 1 && pauvre.equipe === 0, 'un e vide : une Planque de départ (le premier produit ouvert)');
    // la clé de comparaison : les compteurs qui bougent à chaque fournée n'y sont pas
    const p2 = CL.photo(Object.assign(st, { lifetime: st.lifetime * 2 }), { G, ev: { id: 'quartier', q: Object.assign(q, { total: q.total + 999 }) } }); st.stats.ventes += 500; const p3 = CL.photo(st, { G, ev: { id: 'quartier', q } });
    check(CL.clePhoto(p) === CL.clePhoto(p2) && CL.clePhoto(p2) === CL.clePhoto(p3) && JSON.stringify(p) !== JSON.stringify(p3), 'la clé de la photo ignore ventes, fortune et total de l’événement');
    q.postes[2].niv = 1; check(CL.clePhoto(CL.photo(st, { G, ev: { id: 'quartier', q } })) !== CL.clePhoto(p3), 'un poste de la Planque ouvert : la clé change'); }

  console.log('── les copains (contrat v6) : le moteur ──');
  const ID6 = '0b9a3e4c-1d2e-4f50-8a6b-7c8d9e0f1a2b', JET6 = 'c'.repeat(64);
  const inscrit = () => { const s = memoire(); CL.ecrireEtat(s, Object.assign(CL.etatNeuf(), { id: ID6, jeton: JET6, pseudo: 'Léa', rejoint: true })); return s; };
  // un faux serveur v6 : toutes les fonctions du contrat, en mémoire ; v5 : true → les nouvelles fonctions et p_photo n'existent pas
  const serveur6 = (o) => {
    const x = { v5: !!(o && o.v5), v64: !!(o && o.v64), photos: 0, dons: [], pourboires: [], vus: null, vuObj: null, abos: [], plan: [], essais: 0, objectif: { semaine: '2026-10-05', but: 600, total: 150, joueurs: 4, reussi: false, pourcent: 25 }, recompense: null, places: [], perdre: new Set() };
    const g = (url, init, c) => {
      const nom = url.split('/rpc/')[1];
      const NOUVELLES = ['fournil_boutique', 'fournil_pourboire', 'fournil_objectif', 'fournil_abonner', 'fournil_desabonner', 'fournil_planifier', 'fournil_notif_essai', 'fournil_vu_pourboires', 'fournil_vu_objectif'];
      if (x.v5 && (NOUVELLES.includes(nom) || (nom === 'fournil_publier' && 'p_photo' in c))) return rep(404, { code: 'PGRST202' });
      if (x.v64 && nom === 'fournil_vu_objectif') return rep(404, { code: 'PGRST202' }); // la v6.4 : pas de fournil_vu_objectif
      if (nom === 'fournil_recompenses' && x.v64) { const o2 = { ok: true, podiums: [], derniere: null, pourboires: x.pourboires, objectif: x.recompense }; x.pourboires = []; x.recompense = null; return rep(200, o2); } // la v6.4 : la lecture marque tout
      if (nom === 'fournil_recompenses') return rep(200, { ok: true, podiums: x.places.filter((p) => p.rang <= 3).map((p) => ({ semaine: p.semaine, rang: p.rang })), places: x.places, derniere: null, pourboires: x.pourboires.slice(), objectif: x.recompense, evenements: x.evenements || {} }); // (x.evenements : le podium final des événements, version 6.6 : jusqu'au 15e)
      if (nom === 'fournil_vu_objectif') { x.vuObj = c.p_semaine; if (x.recompense && x.recompense.semaine <= c.p_semaine) x.recompense = null; return rep(200, { ok: true, erreur: null }); }
      if (nom === 'fournil_publier') { if ('p_photo' in c) x.photos++; return rep(200, { ok: true, erreur: null, version: x.v5 ? 5 : 6, rang_semaine: 1, rang_total: 1, joueurs: 3, ...(x.v5 ? {} : { photo_maj: new Date(horloge).toISOString() }) }); }
      if (nom === 'fournil_classement') return rep(200, { version: x.v5 ? 5 : 6, semaine: '2026-10-05', joueurs: 2, lignes: [{ rang: 1, pseudo: 'Lucas', points: 40, valeur: 1, moi: false }], moi: null });
      if (nom === 'fournil_boutique') return c.p_pseudo === 'Lucas' ? rep(200, { ok: true, pseudo: 'Lucas', photo: { v: 1, nom: 'Chez Lucas', q: 2, p: [[40, 1, 2]], m: { four: 3 }, t: ['or-toque', null, null, null], c: null, g: 12 }, maj: '2026-10-09T10:00:00Z', en_ligne: true, ...(c.p_id ? { restants: 3 - x.dons.filter((d) => d.ok).length, deja: x.dons.some((d) => d.ok && d.p_pour === 'Lucas') } : {}) }) : rep(200, { ok: false, erreur: 'inconnu' });
      if (nom === 'fournil_pourboire') { x.dons.push(c); const auj = x.dons.filter((d) => d.ok); if (c.p_pour === 'Léa') return rep(200, { ok: false, erreur: 'soi', restants: 3 - auj.length }); if (auj.some((d) => d.p_pour === c.p_pour)) return rep(200, { ok: false, erreur: 'deja', restants: 3 - auj.length }); if (auj.length >= 3) return rep(200, { ok: false, erreur: 'quota', restants: 0 }); c.ok = true; return rep(200, { ok: true, erreur: null, restants: 2 - auj.length, points_semaine: 4, etoile: 1 }); }
      if (nom === 'fournil_objectif') return rep(200, x.objectif);
      if (nom === 'fournil_vu_pourboires') { x.vus = c.p_jusqua; x.pourboires = x.pourboires.filter((p) => p.quand > c.p_jusqua.replace('.000Z', 'Z') && new Date(p.quand) > new Date(c.p_jusqua)); return rep(200, { ok: true }); }
      if (nom === 'fournil_abonner') { x.abos.push(c); return rep(200, { ok: true, erreur: null, prefs: c.p_prefs, appareils: 1 }); }
      if (nom === 'fournil_desabonner') { x.desabo = c; return rep(200, { ok: true, erreur: null }); }
      if (nom === 'fournil_planifier') { x.plan.push(c.p_pleine_a); return rep(200, { ok: true, erreur: null, planifiee: !!c.p_pleine_a }); }
      if (nom === 'fournil_notif_essai') { x.essais++; return rep(200, { ok: true, erreur: null }); }
      if (nom === 'fournil_vu' || nom === 'fournil_retirer') return rep(200, { ok: true });
      return rep(404, { code: 'PGRST202' });
    };
    x.gerer = (url, init, c) => { const r = g(url, init, c), nom = url.split('/rpc/')[1]; if (x.perdre.has(nom)) { x.perdre.delete(nom); throw new TypeError('réponse perdue'); } return r; }; // le serveur a fait son travail, la réponse se perd
    return x;
  };
  const etat0 = G.newState(T);
  { // la photo part avec fournil_publier : au plus une fois toutes les 10 min, et seulement si elle a changé (ou toutes les 6 h)
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), m = moteur(r, { stockage: inscrit(), photo: () => CL.photo(etat0, { G }), points: () => ({ points: 3, lundi: '2026-10-05' }) });
    await m.envoyer('lancement'); const p1 = r.appels.filter((a) => a.url.endsWith('/fournil_publier'));
    check(p1.length === 1 && p1[0].corps.p_photo && p1[0].corps.p_photo.v === 1 && sv.photos === 1 && m.etat().photoQuand === horloge && m.version() === 6, 'la photo part avec le premier envoi (p_photo), le serveur v6 la garde (photo_maj)');
    horloge += 5 * 60e3; fortune += 1; await m.envoyer('periodique');
    check(sv.photos === 1 && !('p_photo' in r.appels[r.appels.length - 1].corps), '5 min plus tard : l’envoi part sans la photo');
    horloge += 6 * 60e3; fortune += 1; await m.envoyer('periodique');
    check(sv.photos === 1, '11 min plus tard, rien n’a changé : pas de photo');
    etat0.mobilier.four = 1; horloge += 6 * 60e3; fortune += 1; await m.envoyer('periodique');
    check(sv.photos === 2 && r.appels[r.appels.length - 1].corps.p_photo.m.four === 1, 'le four amélioré : la nouvelle photo part (10 min après la précédente)');
    horloge += 7 * 3600e3; fortune += 1; await m.envoyer('periodique');
    check(sv.photos === 3, '7 h plus tard, même inchangée : elle repart (le serveur l’a peut-être perdue)'); }
  { // la mise à jour : la photo d'avant (sans x ni e) est gardée sur le téléphone ; la nouvelle part une fois, dans les 10 min, puis plus souvent qu'avant
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), s0 = inscrit(), vieux = CL.photo(etat0, { G }); delete vieux.x;
    CL.ecrireEtat(s0, Object.assign(CL.lireEtat(s0), { photoQuand: T - 4 * 60e3, photoCle: JSON.stringify(vieux) })); // envoyée il y a 4 min par l'ancienne version
    const sx = G.newState(T), m = moteur(r, { stockage: s0, photo: () => CL.photo(sx, { G }), points: () => ({ points: 3, lundi: '2026-10-05' }) });
    await m.envoyer('lancement'); check(sv.photos === 0, 'juste après la mise à jour, la dernière photo a 4 min : elle attend');
    horloge += 6 * 60e3; fortune += 1; await m.envoyer('periodique'); const der = r.appels.filter((a) => a.url.endsWith('/fournil_publier')).pop();
    check(sv.photos === 1 && der.corps.p_photo.x && der.corps.p_photo.x.v === 0, '10 min après la précédente : la photo avec x part (une fois)');
    for (let k = 0; k < 6; k++) { sx.stats.ventes += 1000; sx.lifetime += 5e4; horloge += 11 * 60e3; fortune += 1; await m.envoyer('periodique'); }
    check(sv.photos === 1, 'pendant une heure, seules les ventes et la fortune bougent : pas de nouvelle photo (pas plus souvent qu’avant)');
    sx.etoiles += 1; horloge += 11 * 60e3; fortune += 1; await m.envoyer('periodique');
    check(sv.photos === 2 && r.appels.filter((a) => a.url.endsWith('/fournil_publier')).pop().corps.p_photo.x.v === 6000, 'une étoile de plus : la photo repart, avec les ventes du moment'); }
  { // un serveur encore en version 5 : p_photo inconnu → le même envoi refait sans elle, puis plus jamais de photo ; les boutons des copains se cachent
    horloge = T; const sv = serveur6({ v5: true }), r = faux(sv.gerer), m = moteur(r, { stockage: inscrit(), photo: () => CL.photo(etat0, { G }), points: () => ({ points: 3, lundi: '2026-10-05' }) });
    check(m.copains(), 'version pas encore connue : les copains sont proposés');
    const e = await m.envoyer('lancement'); const pubs = r.appels.filter((a) => a.url.endsWith('/fournil_publier'));
    check(e.etat === 'ok' && pubs.length === 2 && 'p_photo' in pubs[0].corps && !('p_photo' in pubs[1].corps) && pubs[1].corps.p_points === 3, 'serveur v5 : l’envoi avec photo est refusé (fonction introuvable), aussitôt refait sans elle');
    horloge += 11 * 60e3; fortune += 5; await m.envoyer('periodique');
    check(r.appels.filter((a) => a.url.endsWith('/fournil_publier')).length === 3 && !('p_photo' in r.appels[r.appels.length - 1].corps), 'ensuite : plus de photo (un seul appel par envoi)');
    check(!m.copains() && (await m.objectif()).etat === 'pas-installe' && m.notifsPossibles() !== '', 'serveur v5 : copains, objectif commun et notifications cachés');
    const v = await m.boutique('Lucas'); check(v.etat === 'pas-installe', 'visiter sur un serveur v5 : « pas-installe »'); }
  { // visiter, laisser des pourboires
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), m = moteur(r, { stockage: inscrit() });
    const v = await m.boutique('  Lucas '); const a = r.appels[0];
    check(v.etat === 'ok' && v.data.pseudo === 'Lucas' && v.data.enLigne && v.data.photo.m.four === 3 && a.corps.p_pseudo === 'Lucas' && a.corps.p_id === ID6, 'fournil_boutique(p_pseudo, p_id, p_jeton) : la photo de Lucas');
    { const r0 = faux(sv.gerer), m0 = moteur(r0, { stockage: memoire() }); const v0 = await m0.boutique('Lucas'); check(v0.etat === 'ok' && !('p_id' in r0.appels[0].corps), 'pas inscrit : fournil_boutique(p_pseudo) seul, lisible par tous'); }
    check((await m.boutique('Personne')).etat === 'refus', 'un pseudo inconnu : refus « inconnu »');
    check(m.dons().restants === 3 && !m.dons().deja('Lucas'), 'au matin : 3 pourboires à donner');
    let p = await m.pourboire('Lucas'); const ap = r.appels[r.appels.length - 1];
    check(p.etat === 'ok' && p.restants === 2 && ap.corps.p_id === ID6 && ap.corps.p_jeton === JET6 && ap.corps.p_pour === 'Lucas' && m.dons().deja('lucas'), 'fournil_pourboire(p_id, p_jeton, p_pour) : accepté, encore 2 aujourd’hui, Lucas noté');
    p = await m.pourboire('Lucas'); check(p.etat === 'refus' && p.erreur === 'deja' && p.restants === 2, 'deux fois au même copain : « deja »');
    { const s2 = inscrit(), m5 = moteur(faux(sv.gerer), { stockage: s2 }); await m5.boutique('Lucas'); check(m5.dons().deja('Lucas') && m5.dons().restants === 2, 'un autre téléphone : la visite apprend du serveur le pourboire déjà laissé et les restants (deja, restants)'); }
    p = await m.pourboire('Léa'); check(p.etat === 'refus' && p.erreur === 'soi', 'à soi-même : « soi »');
    await m.pourboire('Mamie Jo'); await m.pourboire('Tonton'); p = await m.pourboire('Papy');
    check(p.etat === 'refus' && p.erreur === 'quota' && m.dons().restants === 0, 'le quatrième du jour : « quota », plus rien à donner');
    horloge += 864e5; check(m.dons().restants === 3 && !m.dons().deja('Lucas'), 'le lendemain (jour de Paris) : 3 de nouveau');
    const m2 = moteur(faux(sv.gerer), { stockage: memoire() }); const n0 = r.appels.length;
    check((await m2.pourboire('Lucas')).etat === 'pas-rejoint' && r.appels.length === n0, 'pas rejoint : pas de pourboire, aucun appel'); }
  { // l'objectif commun : lu une fois par minute au plus
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), m = moteur(r, { stockage: memoire() });
    const o = await m.objectif(); await m.objectif();
    check(o.etat === 'ok' && egal(o.data, { semaine: '2026-10-05', but: 600, total: 150, joueurs: 4, reussi: false, pourcent: 25 }) && r.appels.length === 1 && m.objectifVu().data.total === 150, 'fournil_objectif() : « 150 / 600 croissants », relu une fois par minute au plus');
    horloge += 61e3; sv.objectif = { semaine: '2026-10-05', but: 600, total: 900, joueurs: 5 }; const o2 = await m.objectif();
    check(r.appels.length === 2 && o2.data.reussi && o2.data.pourcent === 100, 'au-delà du but : réussi, la jauge à 100 %'); }
  { // les pourboires reçus (version 6.5) : rangés, sauvés, PUIS accusés au serveur ; une réponse perdue les rend de nouveau, sans les payer deux fois
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), s = inscrit(), m = moteur(r, { stockage: s });
    const pause = () => new Promise((res) => setTimeout(res, 0)), vus = () => r.appels.filter((x) => /fournil_vu_pourboires/.test(x.url));
    sv.pourboires = [{ de: 'Lucas', quand: '2026-10-09T08:00:00Z' }, { de: 'Mamie Jo', quand: '2026-10-09T09:00:00Z' }];
    sv.perdre.add('fournil_recompenses'); // la première lecture : la réponse se perd en route
    const e0 = await m.chargerRecompenses({ ecart: 0 });
    check(e0.etat === 'hors-ligne' && m.pourboiresRecus().length === 0 && sv.pourboires.length === 2 && vus().length === 0, 'la réponse de fournil_recompenses se perd : rien de rangé, rien d’accusé, le serveur les garde');
    horloge += 61e3; await m.chargerRecompenses({ ecart: 0 }); await pause();
    check(egal(m.pourboiresRecus().map((x) => x.de), ['Lucas', 'Mamie Jo']), 'la lecture suivante les rend : ils attendent leur feuille (rangés sur le téléphone)');
    check(egal(CL.lireEtat(s).recus.attente.map((x) => x.de), ['Lucas', 'Mamie Jo']) && vus().length === 1 && vus()[0].corps.p_jusqua === '2026-10-09T09:00:00.000Z' && vus()[0].corps.p_id === ID6 && vus()[0].corps.p_jeton === JET6 && sv.pourboires.length === 0,
      'sauvés dans le stockage, PUIS accusés : fournil_vu_pourboires(p_id, p_jeton, p_jusqua = le plus récent reçu)');
    sv.pourboires = [{ de: 'Lucas', quand: '2026-10-09T08:00:00Z' }, { de: 'Mamie Jo', quand: '2026-10-09T09:00:00Z' }]; // l'accusé s'était perdu : le serveur les rend encore
    horloge += 61e3; await m.chargerRecompenses({ ecart: 0 }); await pause();
    check(m.pourboiresRecus().length === 2 && vus().length === 2 && sv.pourboires.length === 0, 'rendus de nouveau (l’accusé s’était perdu) : reconnus, pas rangés deux fois ; accusés de nouveau');
    let a = m.accueillirPourboires();
    check(a.boosts === 2 && a.liste.length === 2 && m.pourboiresRecus().length === 0, 'accueillis : deux boosts ×2');
    sv.pourboires = [{ de: 'Mamie Jo', quand: '2026-10-09T09:00:00Z' }]; horloge += 61e3; await m.chargerRecompenses({ ecart: 0 }); await pause();
    check(m.pourboiresRecus().length === 0, 'si le serveur en rendait encore un déjà accueilli : il ne revient pas (sa clé est gardée)');
    sv.pourboires = [{ de: 'Tonton', quand: '2026-10-09T10:00:00Z' }, { de: 'Papy', quand: '2026-10-09T10:05:00Z' }]; horloge += 61e3; await m.chargerRecompenses({ ecart: 0 });
    a = m.accueillirPourboires(); check(a.liste.length === 2 && a.boosts === 1, 'deux de plus le même jour : un seul boost (3 par jour au plus sur le téléphone)');
    // l'objectif commun : rangé, sauvé, accusé (fournil_vu_objectif) ; une réponse perdue la rend de nouveau, une seule annonce
    check(m.recompenses().objectifAnnonce === null && !m.recompenses().badge, 'pas encore d’objectif réussi');
    sv.recompense = { semaine: '2026-09-28', reussi: true, recompense: true }; sv.perdre.add('fournil_vu_objectif'); horloge += 61e3; await m.chargerRecompenses({ ecart: 0 }); await pause();
    check(m.recompenses().objectifAnnonce === '2026-09-28' && CL.lireEtat(s).recompenses.equipeAttente === '2026-09-28' && sv.vuObj === '2026-09-28', 'l’objectif réussi du 28 sept. : sa récompense attend son annonce (sauvée), puis l’accusé part (fournil_vu_objectif(p_semaine))… et se perd');
    sv.recompense = { semaine: '2026-09-28', reussi: true, recompense: true }; sv.vuObj = null; horloge += 61e3; // (perdu avant d'arriver : le serveur la rend encore)
    await m.chargerRecompenses({ ecart: 0 }); await pause();
    check(m.recompenses().objectifAnnonce === '2026-09-28' && sv.recompense === null, 'relue : la même (pas deux annonces), accusée de nouveau, le serveur ne la rend plus');
    check(m.objectifFait('2026-09-28') === true && m.objectifFait('2026-09-28') === false && m.recompenses().badge && m.recompenses().objectifAnnonce === null, 'annoncée une fois : le badge « Esprit d’équipe » gagné, la récompense ne revient pas');
    sv.recompense = { semaine: '2026-09-28', reussi: true, recompense: true }; horloge += 61e3; await m.chargerRecompenses({ ecart: 0 }); await pause();
    check(m.recompenses().objectifAnnonce === null && sv.recompense === null, 'rendue encore après l’annonce (un accusé perdu) : rien de neuf, accusée');
    const relu = CL.lireEtat(s); check(relu.recompenses.equipe.includes('2026-09-28') && relu.recus.vu === '2026-10-09T10:05:00.000Z' && relu.recus.n === 3 && relu.recus.cles.length === 4, 'le badge, les pourboires vus et leurs clés sont gardés dans le stockage');
    const m3 = moteur(faux(sv.gerer), { stockage: s }); await m3.quitter(); const apres = CL.lireEtat(s);
    check(apres.recompenses.equipe.includes('2026-09-28') && !apres.rejoint, 'quitter le classement : le badge reste'); }
  { // un stockage qui n'écrit plus : rien n'est accusé (ce qui n'est pas sauvé n'est pas perdu au serveur)
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), s = inscrit(), m = moteur(r, { stockage: s });
    s.setItem = () => { throw new Error('plein'); };
    sv.pourboires = [{ de: 'Lucas', quand: '2026-10-09T08:00:00Z' }]; sv.recompense = { semaine: '2026-09-28', reussi: true, recompense: true };
    await m.chargerRecompenses({ ecart: 0 }); await new Promise((res) => setTimeout(res, 0));
    check(m.pourboiresRecus().length === 1 && !r.appels.some((x) => /fournil_vu_/.test(x.url)) && sv.pourboires.length === 1 && sv.recompense, 'le stockage refuse d’écrire : ni fournil_vu_pourboires ni fournil_vu_objectif (le serveur les garde)'); }
  { // un serveur encore en v6.4 (la lecture marque tout ; pas de fournil_vu_objectif) : rien ne casse, un seul essai d'accusé de l'objectif par lancement
    horloge = T; const sv = serveur6({ v64: true }), r = faux(sv.gerer), m = moteur(r, { stockage: inscrit() });
    sv.pourboires = [{ de: 'Lucas', quand: '2026-10-09T08:00:00Z' }]; sv.recompense = { semaine: '2026-09-28', reussi: true, recompense: true };
    await m.chargerRecompenses({ ecart: 0 }); await new Promise((res) => setTimeout(res, 0));
    horloge += 61e3; sv.recompense = { semaine: '2026-09-28', reussi: true, recompense: true }; await m.chargerRecompenses({ ecart: 0 }); await new Promise((res) => setTimeout(res, 0));
    check(m.pourboiresRecus().length === 1 && m.recompenses().objectifAnnonce === '2026-09-28' && r.appels.filter((x) => /fournil_vu_objectif/.test(x.url)).length === 1, 'serveur v6.4 : les pourboires et l’objectif arrivent comme avant ; fournil_vu_objectif introuvable, plus essayée jusqu’au prochain lancement'); }
  { // le pourboire donné (version 6.5) : l'étoile du donneur, même quand la réponse du premier envoi s'est perdue (une par copain et par jour)
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), s = inscrit(), m = moteur(r, { stockage: s });
    let p = await m.pourboire('Lucas');
    check(p.etat === 'ok' && p.etoile === true, 'un pourboire accepté : l’étoile est à verser');
    sv.perdre.add('fournil_pourboire'); p = await m.pourboire('Mamie Jo');
    check(p.etat === 'hors-ligne' && !m.dons().deja('Mamie Jo') && sv.dons.filter((d) => d.ok).length === 2, 'à Mamie Jo : le serveur l’a pris, mais la réponse s’est perdue (« hors ligne » sur le téléphone, pas d’étoile)');
    p = await m.pourboire('Mamie Jo');
    check(p.etat === 'refus' && p.erreur === 'deja' && p.etoile === true && m.dons().deja('Mamie Jo'), 'il réessaie : « deja »… et l’étoile est quand même à verser (elle ne l’avait pas été)');
    p = await m.pourboire('Mamie Jo'); check(p.etat === 'refus' && p.erreur === 'deja' && p.etoile === false, 'encore « deja » : plus d’étoile (une par copain et par jour)');
    p = await m.pourboire('Lucas'); check(p.erreur === 'deja' && p.etoile === false, 'à Lucas (déjà payé) : « deja », pas d’étoile');
    sv.perdre.add('fournil_pourboire'); await m.pourboire('Tonton'); // perdu aussi ; cette fois il passe par la visite de sa boutique
    sv.gererBoutique = true;
    const avant = sv.gerer; sv.gerer = (url, init, c) => (url.endsWith('/fournil_boutique') ? rep(200, { ok: true, pseudo: c.p_pseudo, photo: null, maj: null, en_ligne: false, restants: 0, deja: sv.dons.some((d) => d.ok && d.p_pour === c.p_pseudo) }) : avant(url, init, c));
    const r2 = faux(sv.gerer), m2 = moteur(r2, { stockage: s });
    let v = await m2.boutique('Tonton'); check(v.etat === 'ok' && v.data.etoile === true && m2.dons().deja('Tonton'), 'la visite de Tonton apprend du serveur que le pourboire était passé : l’étoile est à verser');
    v = await m2.boutique('Tonton'); check(v.etat === 'ok' && !v.data.etoile, 'revisité : plus d’étoile');
    v = await m2.boutique('Lucas'); check(v.etat === 'ok' && !v.data.etoile, 'Lucas (déjà payé) : pas d’étoile');
    check(egal(CL.lireEtat(s).dons.etoiles.sort(), ['lucas', 'mamie jo', 'tonton']), 'les étoiles versées du jour sont gardées dans le stockage');
    const vieux = CL.nettoyerEtat({ id: ID6, jeton: JET6, pseudo: 'Léa', rejoint: true, dons: { jour: '2026-10-09', a: ['lucas'], restants: 2 } });
    check(egal(vieux.dons.etoiles, ['lucas']), 'une sauvegarde d’avant la 6.5 : ses dons du jour comptent comme payés (aucune étoile en double)');
    const vr = CL.nettoyerEtat({ recus: { attente: [], vu: '2026-10-09T09:00:00Z', jour: '2026-10-09', n: 2 } }).recus;
    check(vr.seuil === '2026-10-09T09:00:00.000Z' && vr.cles.length === 0, 'et ses pourboires déjà accueillis : rien d’aussi ancien que le dernier ne revient (seuil)');
    horloge += 864e5; sv.dons.length = 0; check(m.dons().restants === 3, 'le lendemain : tout repart'); p = await m.pourboire('Mamie Jo'); check(p.etat === 'ok' && p.etoile === true, 'le lendemain : une nouvelle étoile pour Mamie Jo'); }
  { // les places de la semaine (version 6.5) : la première lecture fixe « depuis » à la semaine passée ; chaque place se paie une fois
    horloge = T; const sv = serveur6(), r = faux(sv.gerer), s = inscrit(), m = moteur(r, { stockage: s });
    sv.places = [{ semaine: '2026-09-14', rang: 2, joueurs: 11 }, { semaine: '2026-09-21', rang: 9, joueurs: 12 }, { semaine: '2026-09-28', rang: 7, joueurs: 12 }];
    await m.chargerRecompenses({ ecart: 0 });
    let rv = m.recompenses();
    check(CL.lireEtat(s).recompenses.depuis === '2026-09-28' && rv.places.length === 3 && rv.podiums.length === 1 && egal(rv.aPayer.map((p) => [p.semaine, p.rang, p.joueurs, p.recompense.etoiles, p.recompense.mult, p.recompense.secs]), [['2026-09-28', 7, 12, 2, 2, 1800]]),
      `première lecture : depuis = la semaine passée ; les trois places gardées, la 2e place du 14 sept. aussi en podium ; à payer : la 7e place du 28 sept. (${JSON.stringify(rv.aPayer.map((p) => p.semaine))})`);
    check(m.placePayee('2026-09-28') === true && m.placePayee('2026-09-28') === false && m.placePayee('2026-09-21') === false && m.recompenses().aPayer.length === 0 && egal(CL.lireEtat(s).recompenses.payees, ['2026-09-28']), 'payée une fois (true, puis false) ; une semaine d’avant « depuis » ne se paie pas');
    const m2 = moteur(faux(sv.gerer), { stockage: s }); check(m2.recompenses().aPayer.length === 0 && m2.placePayee('2026-09-28') === false, 'une autre fenêtre (le même stockage) ne la paie pas une seconde fois');
    horloge = Date.UTC(2026, 9, 12, 7); sv.places.push({ semaine: '2026-10-05', rang: 1, joueurs: 12 }); await m.chargerRecompenses({ ecart: 0 });
    rv = m.recompenses();
    check(egal(rv.aPayer.map((p) => [p.semaine, p.rang, p.recompense.etoiles, p.recompense.mult, p.recompense.tenue]), [['2026-10-05', 1, 5, 5, true]]) && rv.annonce && rv.annonce.semaine === '2026-10-05' && rv.podiums.length === 2,
      'le lundi suivant, 1er : à payer (5 étoiles, ×5, la tenue) et le podium à annoncer, comme avant');
    check(CL.lireEtat(s).recompenses.depuis === '2026-09-28', '« depuis » ne bouge plus'); }
  { // les acharnés de la Maison hantée (version 6.6) : sa place au classement final de l'événement, payée une fois, même d'une autre fenêtre
    horloge = Date.UTC(2026, 10, 3, 9); const sv = serveur6(), s = inscrit(), m = moteur(faux(sv.gerer), { stockage: s });
    const POD = [{ rang: 1, pseudo: 'Abel', valeur: 9e16 }, { rang: 2, pseudo: 'Berthe', valeur: 8e16 }, { rang: 3, pseudo: 'Camille', valeur: 7e16 }];
    sv.evenements = { hantee: { rang: 7, joueurs: 12, podium: POD } };
    await m.chargerRecompenses({ ecart: 0 });
    let rv = m.recompenses();
    check(egal(rv.evtAPayer.map((p) => [p.id, p.rang, p.joueurs, p.recompense.etoiles, p.recompense.mult, p.recompense.secs, p.recompense.tenue]), [['hantee', 7, 12, 3, 3, 1800, false]]) && egal(rv.evtPlaces.map((p) => [p.id, p.rang, p.payee]), [['hantee', 7, false]]) && CL.phraseEvt(rv.evtAPayer[0]) === 'Tu as fini 7e de la Maison hantée sur 12' && rv.evenements.hantee.podium.length === 3,
      `7e de la Maison hantée sur 12 : à payer (3 étoiles, un boost ×3 de 30 min), le podium des trois premiers gardé (${JSON.stringify(rv.evtAPayer)})`);
    check(m.evtPaye('hantee') === true && m.evtPaye('hantee') === false && m.evtPaye('quartier') === false && m.recompenses().evtAPayer.length === 0 && m.recompenses().evtPlaces[0].payee === true && egal(CL.lireEtat(s).recompenses.evtPayes, ['hantee']), 'payée une fois (true, puis false), notée dans le stockage ; le Quartier : rien');
    const m2 = moteur(faux(sv.gerer), { stockage: s }); check(m2.recompenses().evtAPayer.length === 0 && m2.evtPaye('hantee') === false, 'une autre fenêtre (le même stockage) ne la paie pas une seconde fois');
    await m.chargerRecompenses({ ecart: 0 }); check(m.recompenses().evtAPayer.length === 0 && m.recompenses().evenements.hantee.rang === 7 && m.recompenses().evenements.hantee.joueurs === 12, 'relue au lancement suivant : toujours payée, rien de neuf');
    const s2 = inscrit(), sv2 = serveur6(), m3 = moteur(faux(sv2.gerer), { stockage: s2 }); sv2.evenements = { hantee: { rang: 2, podium: POD } }; // un serveur d'avant la 6.6 (podium à trois, sans joueurs)
    await m3.chargerRecompenses({ ecart: 0 }); const a = m3.recompenses().evtAPayer;
    check(a.length === 1 && a[0].rang === 2 && a[0].joueurs === null && a[0].recompense.tenue === true && a[0].recompense.etoiles === 6 && CL.phraseEvt(a[0]) === 'Tu as fini 2e de la Maison hantée', `un serveur d’avant la 6.6 (2e, sans le nombre de joueurs) : la tenue en or et 6 étoiles, « ${CL.phraseEvt(a[0])} »`); }
  { // les notifications
    horloge = T; const sv = serveur6(), r = faux(sv.gerer);
    const push = { possible: () => true, abonner: async (cle) => { push.cle = cle; return push.reponse || { sub: { endpoint: 'https://push.exemple/abc', keys: { p256dh: 'BP' + 'x'.repeat(85), auth: 'y'.repeat(22) } } }; }, desabonner: async () => ({ endpoint: 'https://push.exemple/abc' }) };
    const VAPID = 'B' + 'A'.repeat(86);
    const mN = (o) => CL.creerMoteur({ config: () => ({ supabaseUrl: URL, supabaseKey: CLEF, vapid: o && o.sansCle ? undefined : VAPID }), fetch: r.fetch, stockage: (o && o.stockage) || inscrit(), fortune: () => fortune, ...temps, push: o && o.sansPush ? null : push });
    check(mN({ sansCle: true }).notifsPossibles() === 'bientot', 'pas de clé publique dans config.js : « bientôt »');
    check(mN({ sansPush: true }).notifsPossibles() === 'impossible', 'pas de PushManager (iPhone hors écran d’accueil) : « impossible »');
    check(CL.lireConfig({ supabaseUrl: URL, supabaseKey: 'k', vapid: 'pas une clé' }).vapid === '' && CL.cleVapid(VAPID).length === 65, 'la clé publique : 87 caractères base64url, 65 octets ; une valeur fausse est ignorée');
    const s = inscrit(), m = mN({ stockage: s });
    check(m.notifsPossibles() === '' && !m.notifs().actif, 'clé publique et PushManager : possibles, pas encore abonné');
    const ab = await m.abonner({ pleine: true, evenements: false, pourboires: true, objectif: true }), aa = sv.abos[0];
    check(ab.etat === 'ok' && push.cle === VAPID && aa.p_id === ID6 && aa.p_jeton === JET6 && aa.p_sub.endpoint === 'https://push.exemple/abc' && aa.p_sub.keys.auth && egal(aa.p_prefs, { pleine: true, evenements: false, pourboires: true, objectif: true }) && m.notifs().actif && CL.lireEtat(s).notifs.actif,
      'fournil_abonner(p_id, p_jeton, p_sub { endpoint, keys }, p_prefs) : abonné, gardé sur le téléphone');
    const pleine = horloge + 8 * 3600e3;
    let pl = await m.planifier(pleine); check(pl.etat === 'ok' && sv.plan[0] === new Date(pleine).toISOString(), 'en quittant : fournil_planifier(p_pleine_a) à l’heure où la boutique sera pleine (8 h)');
    pl = await m.planifier(pleine + 5e3); check(pl.etat === 'saute' && sv.plan.length === 1, 'pagehide puis visibilitychange : un seul appel');
    pl = await m.planifier(null); check(pl.etat === 'ok' && sv.plan[1] === null && m.notifs().pleineA === 0, 'au retour : p_pleine_a null annule');
    pl = await m.planifier(null); check(pl.etat === 'saute' && sv.plan.length === 2, 'rien d’annoncé : pas d’appel au retour');
    check((await m.essai()).etat === 'ok' && sv.essais === 1, '« M’envoyer un essai » : fournil_notif_essai');
    await m.abonner({ pleine: false, evenements: true, pourboires: true, objectif: true }); pl = await m.planifier(pleine);
    check(pl.etat === 'saute' && sv.plan.length === 2, 'le cas « boutique pleine » décoché : rien n’est planifié');
    const d = await m.desabonner(); check(d.etat === 'ok' && sv.desabo.p_endpoint === 'https://push.exemple/abc' && !m.notifs().actif && m.notifs().prefs.pleine === false, 'désactiver : fournil_desabonner(p_endpoint), les cas choisis restent');
    push.reponse = { erreur: 'refuse' }; const n0 = sv.abos.length;
    check((await m.abonner()).etat === 'refuse' && sv.abos.length === n0 && !m.notifs().actif, 'permission refusée : « refuse », rien d’envoyé');
    push.reponse = null; const m4 = mN({ stockage: memoire() });
    check((await m4.abonner()).etat === 'pas-rejoint', 'pas rejoint : on ne peut pas s’abonner (il faut une ligne au classement)'); }
  check(CL.jourParis(Date.UTC(2026, 9, 9, 21, 59)) === '2026-10-09' && CL.jourParis(Date.UTC(2026, 9, 9, 22, 0)) === '2026-10-10', 'le jour de Paris : minuit à 22 h UTC en été');

  console.log('── la série de jours de suite (version 6.7 du SQL, comptée par le serveur) ──');
  { const b = []; for (let k = -1; k <= 22; k++) b.push(CL.serieBonus(k));
    check(egal(CL.SERIE, { 3: 10, 7: 20 }) && egal(b, [0, 0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 10, 0, 0, 0, 20, 0, 0, 10, 0, 0, 0, 20, 0]) && CL.serieBonus(2.5) === 0 && CL.serieBonus('3') === 0,
      `SERIE = { 3: 10, 7: 20 } ; le bonus du jour -1 à 22, comme fournil_serie_bonus : ${b.join(',')}`);
    const P = (j, a) => { const p = CL.serieProchaine(j, a); return `${p.jour}/${p.points}/${p.dans}`; };
    const vus = [P(0, false), P(1, true), P(1, false), P(2, true), P(2, false), P(3, true), P(6, false), P(6, true), P(7, true), P(9, false), P(13, true), P(14, true)];
    check(vus.join(' ') === '3/10/2 3/10/2 3/10/1 3/10/1 3/10/0 7/20/4 7/20/0 7/20/1 10/10/3 10/10/0 14/20/1 17/10/3',
      `serieProchaine(jours, aujourdhui) → { jour, points, dans } (0 : aujourd’hui, s’il ne compte pas encore) : ${vus.join(' · ')}`);
    check(egal(CL.serieProchaine(-5, false), CL.serieProchaine(0, false)) && egal(CL.serieProchaine('n’importe quoi', true), CL.serieProchaine(0, true)) && CL.serieProchaine(1e9, true).jour === 10003, 'des valeurs absurdes : bornées (0 à 10 000), jamais d’exception ni de boucle sans fin'); }
  { const J = (iso, h = 10) => Date.parse(iso + 'T00:00:00Z') + h * 3600e3; // vers 11 h ou midi à Paris
    const s = { jours: 4, auj: true, bonus: 10, lundi: '2026-10-19', jour: '2026-10-22', quand: J('2026-10-22') };
    check(egal(CL.serieVue(s, J('2026-10-22', 20)), { jours: 4, aujourdhui: true, bonus: 10, prochain: { jour: 7, points: 20, dans: 3 } }), 'reçue aujourd’hui (jeudi, 4e jour) : 4 jours, aujourd’hui compte, +10 cette semaine, le prochain bonus au 7e jour, dans 3 jours');
    check(egal(CL.serieVue(s, J('2026-10-23')), { jours: 4, aujourdhui: false, bonus: 10, prochain: { jour: 7, points: 20, dans: 2 } }), 'le lendemain, avant tout envoi : la série tient encore (4), aujourd’hui ne compte pas encore');
    check(egal(CL.serieVue(s, J('2026-10-24')), { jours: 0, aujourdhui: false, bonus: 10, prochain: { jour: 3, points: 10, dans: 2 } }), 'deux jours plus tard : cassée (0), le prochain bonus au 3e jour');
    check(CL.serieVue(s, J('2026-10-26')).bonus === 0 && CL.serieVue(s, J('2026-10-25', 22)).bonus === 10, 'les points de série : ceux de la semaine en cours seulement (0 le lundi suivant)');
    const h = { jours: 2, auj: false, bonus: 0, lundi: '2026-10-19', jour: '2026-10-22', quand: 0 }; // le serveur a répondu jeudi « 2, pas encore aujourd’hui » : le dernier jour qui a compté est mercredi
    check(CL.serieVue(h, J('2026-10-22')).jours === 2 && CL.serieVue(h, J('2026-10-22')).prochain.dans === 0 && CL.serieVue(h, J('2026-10-23')).jours === 0, 'une réponse « pas encore aujourd’hui » (2 jours jusqu’à hier) : 2 le jour même, avec le bonus du 3e jour à prendre aujourd’hui ; cassée le lendemain');
    const ete = { jours: 6, auj: true, bonus: 10, lundi: '2026-10-19', jour: '2026-10-24', quand: 0 };
    check(CL.serieVue(ete, Date.UTC(2026, 9, 25, 22, 30)).jours === 6 && CL.serieVue(ete, Date.UTC(2026, 9, 25, 22, 30)).aujourdhui === false && CL.serieVue(ete, Date.UTC(2026, 9, 25, 23, 30)).jours === 0,
      'la nuit du passage à l’heure d’hiver (le dimanche a 25 h) : reçue samedi, la série tient tout dimanche jusqu’à minuit à Paris, cassée lundi');
    check(CL.serieVue(null, T) === null && CL.serieVue({ jours: 3 }, T) === null && CL.serieVue({ jours: 3, jour: 'hier' }, T) === null, 'rien de reçu, ou une série illisible : null');
    check(egal(CL.nettoyerSerie({ jours: 1e9, auj: 'oui', bonus: -4, lundi: 'lundi', jour: '2026-10-22', quand: NaN }), { jours: 10000, auj: false, bonus: 0, lundi: '', jour: '2026-10-22', quand: 0 }), 'une série abîmée : bornée champ par champ (0…10 000 jours, 0…1 000 points)');
    check(CL.serieDeReponse({ ok: true, version: 6 }, T, '2026-10-05') === null && egal(CL.serieDeReponse({ ok: true, serie: 3, serie_auj: true, serie_bonus: 10 }, T, '2026-10-05'), { jours: 3, auj: true, bonus: 10, lundi: '2026-10-05', jour: '2026-10-09', quand: T }),
      'une réponse sans serie (un serveur d’avant la 6.7) : rien ; avec : { jours, auj, bonus, lundi, jour, quand }'); }
  { // la série par le moteur, avec un faux serveur qui la rend
    const st = memoire(); let serie = null;
    const r = faux(async (url) => {
      if (url.endsWith('/fournil_retirer')) return rep(200, { ok: true });
      if (!url.endsWith('/fournil_publier')) return rep(404, { code: 'PGRST202' });
      const d = { ok: true, erreur: null, version: 6, rang_semaine: 1, rang_total: 1, joueurs: 3, semaine: CL.lundiParis(horloge), points_semaine: 40 };
      if (serie && serie.tropVite) return rep(200, Object.assign({}, d, { ok: false, erreur: 'trop_vite', serie: serie.jours, serie_auj: true, serie_bonus: serie.bonus }));
      return rep(200, serie ? Object.assign(d, { serie: serie.jours, serie_auj: serie.auj, serie_bonus: serie.bonus }) : d);
    });
    horloge = Date.UTC(2026, 9, 20, 9); // mardi 20 octobre, 11 h à Paris
    const m = moteur(r, { stockage: st });
    check(m.resume().serie === null, 'pas rejoint : resume().serie = null');
    await m.choisirPseudo('Sérieuse');
    check(m.resume().rejoint && m.resume().serie === null && !CL.lireEtat(st).dernier.serie, 'un serveur d’avant la 6.7 (pas de serie dans la réponse) : resume().serie = null, rien de rangé');
    serie = { jours: 1, auj: true, bonus: 0 }; horloge += 20e3; fortune += 100; await m.envoyer('feuille');
    check(egal(m.resume().serie, { jours: 1, aujourdhui: true, bonus: 0, prochain: { jour: 3, points: 10, dans: 2 } }) && egal(CL.lireEtat(st).dernier.serie, { jours: 1, auj: true, bonus: 0, lundi: '2026-10-19', jour: '2026-10-20', quand: horloge }),
      `la 6.7 : la réponse porte la série, rangée dans etat.dernier.serie = { jours, auj, bonus, lundi, jour, quand } ; resume().serie = ${JSON.stringify(m.resume().serie)}`);
    check(m.resume().semaine.rang === 1 && m.resume().semaine.points === 40, 'les rangs restent à côté de la série');
    horloge = Date.UTC(2026, 9, 22, 8); serie = { jours: 3, auj: true, bonus: 10, tropVite: true }; await m.envoyer('fond');
    check(m.resume().serie.jours === 3 && m.resume().serie.bonus === 10 && m.resume().serie.prochain.jour === 7, 'une réponse « trop_vite » redonne aussi la série : rangée (3 jours, +10 cette semaine)');
    serie = { jours: 3, auj: true, bonus: 10 }; horloge += 20e3; fortune += 100; await m.envoyer('feuille');
    check(m.resume().serie.jours === 3 && CL.lireEtat(st).dernier.serie.jours === 3 && m.etat().dernier.semaine.rang === 1, 'un envoi accepté ensuite : les rangs de la réponse sont notés, la série reste (noterRangs ne l’efface pas)');
    horloge = Date.UTC(2026, 9, 23, 8);
    check(m.resume().serie.jours === 3 && m.resume().serie.aujourdhui === false && m.resume().serie.prochain.dans === 3, 'le lendemain, avant d’envoyer : 3 jours, aujourd’hui ne compte pas encore, le +20 dans 3 jours');
    horloge = Date.UTC(2026, 9, 24, 8);
    check(m.resume().serie.jours === 0 && m.resume().serie.bonus === 10, 'deux jours sans envoi : la série affichée retombe à 0 (les points de la semaine restent)');
    const m2 = moteur(r, { stockage: st }); check(m2.resume().serie.jours === 0 && CL.lireEtat(st).dernier.serie.jours === 3, 'relue depuis le stockage (une autre fenêtre) : la même vue');
    horloge += 20e3; const q = await m.quitter(); check(q.etat === 'ok' && !m.resume().rejoint && m.resume().serie === null, 'après avoir quitté : null'); }
  console.log(echecs ? `${echecs} échec(s)` : 'Tout passe.');
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
