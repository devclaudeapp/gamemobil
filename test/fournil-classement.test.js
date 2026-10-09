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
  const ok = ['Léa', 'Mamie Jo', "L'as du four", 'Zoé_42', 'J.-P.', 'Œufs Brouillés', 'Ÿvette', 'ab', '0123456789abcdef'];
  check(ok.every((p) => CL.verifierPseudo(p).ok), 'acceptés : ' + ok.join(' · '));
  const ko = { '': 'vide', '   ': 'vide', a: 'court', '0123456789abcdefg': 'long', 'Paulo le boulanger': 'long', 'pain@chocolat': 'caracteres', 'Léa 🥐': 'caracteres', 'Ʃigma': 'caracteres', '<b>x</b>': 'caracteres', "--__''": 'lettre', '..': 'lettre' };
  check(Object.entries(ko).every(([p, r]) => { const v = CL.verifierPseudo(p); return !v.ok && v.raison === r; }), 'refusés avec la bonne raison : ' + Object.entries(ko).map(([p, r]) => `« ${p} » → ${r}`).join(', '));
  check(CL.verifierPseudo('  Mamie    Jo  ').pseudo === 'Mamie Jo' && CL.verifierPseudo('0123456789abcde ').ok, 'la longueur se compte après normalisation');
  check(CL.verifierPseudo('Ééééééééééééééé').ok && CL.verifierPseudo('Éééééééééééééééé').ok && !CL.verifierPseudo('Ééééééééééééééééé').ok, '16 lettres accentuées passent, 17 non (on compte des caractères, pas des octets)');
  check(/« @ »/.test(CL.messagePseudo(CL.verifierPseudo('pain@chocolat'))) && /16 au plus/.test(CL.messagePseudo(CL.verifierPseudo('Paulo le boulanger'))) && /« Léa »/.test(CL.messagePseudo(CL.verifierPseudo(' Léa '))), 'les messages sous le champ : le caractère refusé, la longueur, l’aperçu');

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
  check(egal(CL.nettoyerClassement('n’importe quoi'), { semaine: '', joueurs: 0, lignes: [], moi: null }), 'réponse absurde : liste vide');

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
    check(ok1.etat === 'ok' && m.resume().rejoint && m.resume().pseudo === 'Léa' && horloge - t0 >= 10e3, 'un autre pseudo : rejoint (après avoir attendu son tour : le serveur prend un envoi toutes les 10 s)');
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
    check(etats['hors-ligne'] === 'hors-ligne' && etats.lent === 'hors-ligne', 'réseau coupé ou muet (délai dépassé) : « hors ligne »');
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
  { // trop vite malgré l'attente : un seul nouvel essai
    let n = 0; const m = moteur(faux(async () => { n++; return rep(200, n === 1 ? { ok: false, erreur: 'trop_vite' } : { ok: true, rang_semaine: 1, rang_total: 1, joueurs: 1 }); }));
    horloge += 60e3; check((await m.choisirPseudo('Zoé')).etat === 'ok' && n === 2, '« trop vite » au premier essai : on attend 10 s et on réessaie une fois');
  }
  { // le minuteur : un envoi toutes les 5 min quand la page est visible, rien quand elle est cachée
    const s = memoire(); CL.ecrireEtat(s, { ...CL.etatNeuf(), id: CL.nouvelId(), jeton: CL.nouveauJeton(), pseudo: 'Léa', rejoint: true, essai: horloge, dernierEnvoi: horloge, valeur: 1 });
    const r = faux(async () => rep(200, { ok: true, rang_semaine: 1, rang_total: 1, joueurs: 1 })); let visible = false;
    const m = moteur(r, { stockage: s, visible: () => visible }); fortune = 99;
    horloge += 6 * 60e3; m.demarrer({ minuteur: false }); await new Promise((ok) => setTimeout(ok, 10));
    check(r.appels.length === 1, 'au démarrage (après les gains hors ligne) : un envoi');
    fortune = 120; visible = true; await m.tick(); check(r.appels.length === 1, 'aussitôt après : le minuteur n’envoie rien (5 min pas écoulées)');
    horloge += 5 * 60e3; visible = false; await m.tick(); check(r.appels.length === 1, '5 min plus tard, page cachée : rien');
    visible = true; await m.tick(); check(r.appels.length === 2, '5 min plus tard, page visible : un envoi');
  }
  console.log(`\n${n - echecs}/${n} vérifications.`);
  console.log(echecs ? `${echecs} échec(s)` : 'Tout passe.');
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
