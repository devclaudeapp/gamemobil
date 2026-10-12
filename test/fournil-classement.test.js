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
  check(egal(CL.lireConfig({ supabaseUrl: 'https://abc.supabase.co/', supabaseKey: ' sb_publishable_x ' }), { url: 'https://abc.supabase.co', key: 'sb_publishable_x', bearer: true }), 'configuration lue : barre finale et espaces retirés');
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
    check(egal(r, { podiums: [{ semaine: '2026-09-28', rang: 1 }, { semaine: '2026-10-05', rang: 2 }], tenue: 'auto', vu: '' }), 'récompenses nettoyées : une coupe par semaine (la meilleure), triées, rangs 1 à 3 seulement ; tenue inconnue → automatique'); }
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
  console.log(echecs ? `${echecs} échec(s)` : 'Tout passe.');
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
