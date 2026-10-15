#!/usr/bin/env node
// Opération Poncin — le classement du butin, côté téléphone (PCLASSEMENT, src-poncin/classement.js), avec un FAUX supabase-js
// (createClient → rpc, en mémoire : aucun appel réseau, jamais le vrai Supabase) : les pièces d'une ligne (les mêmes que
// PBUTIN.deposer), le pseudo du jeu en ligne rendu acceptable, l'identité (id + jeton, sous 'poncin.classement', jamais dans
// 'poncin.v2'), publier / lire / vu / retirer, les replis (sans configuration, sans supabase-js, hors ligne, lent, fonctions pas
// installées, exceptions, stockage cassé) : des promesses qui ne rejettent jamais. Le contrat avec le vrai SQL :
// test/poncin-butin-sql.cjs. Sortie « ok / FAIL ».
'use strict';
const fs = require('fs'), path = require('path');
const B = require('../src-poncin/butin.js'), C = require('../src-poncin/classement.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const json = (o) => JSON.stringify(o);

// ─── un stockage en mémoire (comme localStorage) ───
function memoire(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, m };
}
// ─── un faux supabase-js : createClient(url, key, options) → { rpc(nom, args) → Promise<{ data, error, status }> } ───
// serveur : un petit serveur en mémoire (pseudos uniques, jetons, pièces comptées comme le SQL) ; ou une fonction (nom, args) → réponse
function fauxSupabase(serveur) {
  const lib = { appels: [], clients: 0, options: null };
  lib.createClient = (url, key, options) => { lib.clients++; lib.options = { url, key, options }; return { rpc: (nom, args) => { lib.appels.push({ nom, args: JSON.parse(JSON.stringify(args)) }); return serveur(nom, args); } }; };
  return lib;
}
function serveurMemoire() {
  const joueurs = new Map(); let horloge = 0;
  const S = (nom, a) => {
    const d = (data) => Promise.resolve({ data, error: null, status: 200 });
    if (nom === 'poncin_publier') {
      const j = joueurs.get(a.p_id), pris = [...joueurs.values()].some((x) => x.id !== a.p_id && x.pseudo.toLowerCase() === a.p_pseudo.toLowerCase());
      if (j && j.jeton !== a.p_jeton) return d({ ok: false, erreur: 'jeton' });
      if (pris) return d({ ok: false, erreur: 'pseudo_pris' });
      const p = a.p_valeur != null, pieces = p && a.p_extrait ? Math.round((a.p_valeur + a.p_primes) * (a.p_bonus ? 1.25 : 1)) : 0;
      const x = j || { id: a.p_id, jeton: a.p_jeton, pieces: 0, parties: 0, extractions: 0, record: 0, total: 0, vu: 0 };
      x.pseudo = a.p_pseudo; x.vu = horloge;
      const rec = p && a.p_score > x.record;
      if (p) { x.pieces += pieces; x.total += pieces; x.parties++; if (a.p_extrait) x.extractions++; x.record = Math.max(x.record, a.p_score); }
      joueurs.set(a.p_id, x);
      return d({ ok: true, erreur: null, version: 1, semaine: '2026-10-12', compte: p ? { pieces, score: a.p_score, record: rec } : null, rang_semaine: 1, rang_records: 1, joueurs_semaine: 1, joueurs: joueurs.size,
        pieces: x.pieces, parties: x.parties, extractions: x.extractions, parties_jour: x.parties, record: x.record, total: x.total, parties_total: x.parties });
    }
    if (nom === 'poncin_classement') {
      const l = [...joueurs.values()].sort((u, v) => (a.p_periode === 'semaine' ? v.pieces - u.pieces : v.record - u.record));
      const ligne = (x, i) => ({ rang: i + 1, pseudo: x.pseudo, pieces: a.p_periode === 'semaine' ? x.pieces : x.total, parties: x.parties, extractions: x.extractions, record: x.record, total: x.total, moi: x.id === a.p_id, en_ligne: horloge - x.vu < 240 });
      const i = l.findIndex((x) => x.id === a.p_id);
      return d({ version: 1, semaine: '2026-10-12', periode: a.p_periode, joueurs: l.length, en_ligne_n: l.filter((x) => horloge - x.vu < 240).length, lignes: l.map(ligne).slice(0, a.p_limite), moi: i >= 0 ? (({ pseudo, moi, ...r }) => r)(ligne(l[i], i)) : null });
    }
    if (nom === 'poncin_vu') { const j = joueurs.get(a.p_id); if (!j) return d({ ok: false, erreur: 'inconnu' }); if (j.jeton !== a.p_jeton) return d({ ok: false, erreur: 'jeton' }); j.vu = horloge; return d({ ok: true, erreur: null }); }
    if (nom === 'poncin_retirer') { const j = joueurs.get(a.p_id); if (j && j.jeton !== a.p_jeton) return d({ ok: false, erreur: 'jeton' }); joueurs.delete(a.p_id); return d({ ok: true, erreur: null }); }
    return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 });
  };
  S.joueurs = joueurs; S.avancer = (s) => { horloge += s; };
  return S;
}
const CONFIG = { supabaseUrl: 'https://banc.supabase.co', supabaseKey: 'sb_publishable_banc' };
// une ligne de résultat d'Extraction (les champs que lisent PBUTIN.deposer et PCLASSEMENT), cohérente : valeur = la somme des objets
function ligneDe(objets, o) {
  const valeur = B.valeurDe(objets), extrait = o.extrait !== false, primes = extrait ? o.primes || 0 : 0, points = o.points || 0;
  return { id: 'moi', nom: 'Toi', extrait, zoneSemaine: !!o.zoneSemaine, objets: extrait ? objets : [], materiel: [], valeur: extrait ? valeur : 0, primesGagnees: o.primes || 0, primes, points,
    score: B.score({ valeur: extrait ? valeur : 0, points, primes }), coffres: 3, coffresPar: {}, killsRobots: 1, kills: 1, morts: 0 };
}

(async () => {
  titre('Les pièces d’une ligne : exactement celles de PBUTIN.deposer');
  {
    const R = require('../src-poncin/regles.js'), rnd = R.mulberry32(7), ids = B.LISTE.map((v) => v.id); let pareil = 0, n = 0, avecBonus = 0, nonSorti = 0;
    for (let k = 0; k < 400; k++) {
      const objets = []; for (let i = Math.floor(rnd() * 7); i > 0; i--) objets.push(ids[Math.floor(rnd() * ids.length)]);
      const l = ligneDe(objets, { extrait: rnd() < 0.8, zoneSemaine: rnd() < 0.5, primes: rnd() < 0.4 ? 25 + Math.floor(rnd() * 226) : 0, points: Math.floor(rnd() * 120) });
      const g = B.deposer(B.coffreVide(), l).gain; n++; if (g === C.gainDe(l)) pareil++; if (l.zoneSemaine && l.extrait) avecBonus++; if (!l.extrait) nonSorti++;
    }
    check(pareil === n && avecBonus > 50 && nonSorti > 30, `${pareil}/${n} lignes tirées au hasard : gainDe(ligne) = PBUTIN.deposer(coffre, ligne).gain (dont ${avecBonus} avec le bonus de la zone de la semaine, ${nonSorti} pas sorties)`);
    check(C.gainDe(ligneDe(['calice', 'lingot'], { primes: 100, zoneSemaine: true })) === Math.round((380 + 320 + 100) * 1.25) && C.gainDe(ligneDe(['calice'], { extrait: false })) === 0 && C.gainDe(null) === 0 && C.gainDe({ extrait: true, valeur: 'x', primes: NaN }) === 0, 'sorti : (valeur + primes) × 1,25 dans la zone de la semaine ; pas sorti, ou ligne illisible : 0');
    const a = C.argsDe({ extrait: false, valeur: 300, primes: 50, score: 40, zoneSemaine: true });
    check(json(a) === json({ p_valeur: 0, p_primes: 0, p_extrait: false, p_bonus: true, p_score: 40 }), `argsDe : pas sorti, ni valeur ni primes envoyées (${json(a)})`);
    const b = C.argsDe({ extrait: true, valeur: 120.4, primes: -3, score: 2e9, zoneSemaine: 0 });
    check(b.p_valeur === 120 && b.p_primes === 0 && b.p_bonus === false && Number.isInteger(b.p_score), `argsDe : des entiers positifs (${json(b)})`);
  }

  titre('Le pseudo du jeu en ligne');
  {
    const cas = [['Castor Turbo 42', 'Castor Turbo 42'], ['Bouquetin Express 42', 'Bouquetin 42'], ['  Zoé   la  Reine ', 'Zoé la Reine'], ['Marie’s', "Marie's"], ['<b>Léa</b>', 'b Léa b'],
      ['Anticonstitutionnellement', 'Anticonstitution'], ['!!', null], ['x', null], ['', null], [null, null], ['🙂 Tom', 'Tom'], ['Écureuil Rétro 07', 'Écureuil 07'], ['Loutre Zen 07', 'Loutre Zen 07']];
    const rates = cas.filter(([e, s]) => C.pseudoPour(e) !== s);
    check(!rates.length, `pseudoPour : ${cas.map(([e]) => json(e)).join(', ')}${rates.length ? ' — raté : ' + rates.map(([e, s]) => `${json(e)} → ${json(C.pseudoPour(e))} (attendu ${json(s)})`).join(' ; ') : ''}`);
    const enligne = fs.readFileSync(path.join(__dirname, '..', 'src-poncin', 'enligne.js'), 'utf8');
    const liste = (n) => JSON.parse(new RegExp(`const ${n} = (\\[[^\\]]*\\])`).exec(enligne)[1].replace(/'/g, '"'));
    let tous = 0, ok = 0; for (const a of liste('ANIMAUX')) for (const b of liste('ADJECTIFS')) { tous++; const p = C.pseudoPour(`${a} ${b} 42`); if (p && C.verifierPseudo(p).ok && p.startsWith(a)) ok++; }
    check(tous > 100 && ok === tous, `les ${tous} pseudos tirés au hasard par le jeu en ligne (PENLIGNE.pseudoAuHasard) donnent tous un pseudo valable qui garde l'animal`);
  }

  titre('Sans configuration, sans supabase-js : rien ne part');
  {
    const lib = fauxSupabase(serveurMemoire()), st = memoire();
    const sans = C.creer({ config: null, supabase: lib, stockage: st }), sansLib = C.creer({ config: CONFIG, supabase: null, stockage: st }), vide = C.creer({ config: { supabaseUrl: '', supabaseKey: '' }, supabase: lib, stockage: st });
    const r = [await sans.publier(ligneDe(['montre'], {}), { pseudo: 'Léa' }), await sansLib.lire('semaine'), await vide.vu(), await sans.lire('records'), await sansLib.publier(null, { pseudo: 'Léa' })];
    check(r.every((x) => x.ok === false) && r[0].erreur === 'absent' && r[1].erreur === 'absent' && r[4].erreur === 'absent' && lib.appels.length === 0 && !st.m.size, `« absent », aucun appel, rien d'écrit (${r.map((x) => x.erreur).join(', ')})`);
    check(sans.disponible() === false && sansLib.disponible() === false && C.creer({ config: CONFIG, supabase: lib }).disponible() === true, 'disponible() : seulement avec la configuration ET supabase-js');
    const r2 = await C.publier(ligneDe(['montre'], {}), { pseudo: 'Léa' }), r3 = await C.lire('semaine'), r4 = await C.vu(), r5 = await C.retirer();
    check(r2.erreur === 'absent' && r3.erreur === 'absent' && r4.ok === false && r5.ok === true && C.etat().disponible === false, 'le moteur du navigateur, dans Node (ni window, ni configuration) : tout se replie sans rien casser');
  }

  titre('Publier, lire, en ligne, retirer (faux serveur en mémoire)');
  const srv = serveurMemoire(), lib = fauxSupabase(srv), st = memoire({ 'poncin.v2': '{"v":2,"coffre":{"pieces":5}}' });
  let t = Date.parse('2026-10-15T10:00:00Z');
  const M = C.creer({ config: () => CONFIG, supabase: () => lib, stockage: st, maintenant: () => t });
  {
    const l = ligneDe(['calice', 'montre'], { primes: 60, zoneSemaine: true, points: 30 });
    const r = await M.publier(l, { pseudo: 'Bouquetin Express 42' });
    const a = lib.appels[0], e = JSON.parse(st.getItem('poncin.classement'));
    check(r.ok && r.erreur === null && r.compte.pieces === C.gainDe(l) && r.compte.record === true && r.pseudo === 'Bouquetin 42' && r.semaine.rang === 1 && r.records.record === l.score, `première partie publiée : inscrit sous « Bouquetin 42 », ${r.compte.pieces} pièces comptées (= gainDe), nouveau record (${json(r.compte)})`);
    check(a.nom === 'poncin_publier' && json(Object.keys(a.args)) === json(['p_id', 'p_jeton', 'p_pseudo', 'p_valeur', 'p_primes', 'p_extrait', 'p_bonus', 'p_score']) && Number.isInteger(a.args.p_valeur) && a.args.p_extrait === true && a.args.p_bonus === true, `l'appel : poncin_publier(${Object.keys(a.args).join(', ')}), des entiers et des booléens`);
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(e.id) && /^[0-9a-f]{64}$/.test(e.jeton) && e.rejoint === true && e.pseudo === 'Bouquetin 42' && a.args.p_id === e.id && a.args.p_jeton === e.jeton, 'l’identité : un uuid v4 et un jeton de 64 chiffres hexadécimaux, gardés sous « poncin.classement »');
    check(st.getItem('poncin.v2') === '{"v":2,"coffre":{"pieces":5}}', 'la sauvegarde « poncin.v2 » n’est jamais touchée');
    check(lib.options && lib.options.url === CONFIG.supabaseUrl && lib.options.key === CONFIG.supabaseKey && lib.options.options.auth.persistSession === false, 'createClient(adresse, clé publique, sans session gardée)');
    t += 300e3;
    const r2 = await M.publier(ligneDe([], { extrait: false, points: 20 }), {});
    check(r2.ok && r2.compte.pieces === 0 && r2.compte.record === false && lib.appels[1].args.p_id === e.id && lib.appels[1].args.p_pseudo === 'Bouquetin 42' && lib.clients === 1, 'deuxième partie (pas sorti) : même identité, même pseudo (gardé), 0 pièce, un seul client supabase');
    const c = await M.lire('semaine');
    check(c.ok && c.periode === 'semaine' && c.lignes.length === 1 && c.lignes[0].moi && c.lignes[0].enLigne && c.moi && c.moi.rang === 1 && c.enLigneN === 1 && lib.appels[2].args.p_id === e.id && lib.appels[2].args.p_limite === 50, `lire('semaine') : ma ligne (moi, en ligne), 50 lignes au plus (${json(c.lignes[0])})`);
    const c2 = await M.lire('records'), c3 = await M.lire('total'), c4 = await M.lire();
    check(c2.ok && c2.periode === 'records' && c2.lignes[0].record === l.score && c3.ok === false && c3.erreur === 'periode' && c4.periode === 'semaine', 'lire(\'records\') ; une période inconnue : « periode », sans appel ; sans période : la semaine');
    const n0 = lib.appels.length, v1 = await M.vu(); t += 10e3; const v2 = await M.vu(); t += 61e3; const v3 = await M.vu();
    check(v1.ok && v2.ok && v2.saute === true && v3.ok && !v3.saute && lib.appels.length === n0 + 2 && lib.appels[n0].nom === 'poncin_vu', 'vu() : un battement, puis pas plus d’un par minute (les autres « sautent »)');
    // un autre joueur prend un pseudo
    const st2 = memoire(), M2 = C.creer({ config: CONFIG, supabase: lib, stockage: st2 });
    const p2 = await M2.publier(ligneDe(['bijoux'], {}), { pseudo: 'bouquetin 42' }), id2 = JSON.parse(st2.getItem('poncin.classement')).id;
    check(p2.ok === false && p2.erreur === 'pseudo_pris' && JSON.parse(st2.getItem('poncin.classement')).rejoint === false && id2, 'un autre téléphone, le même pseudo : « pseudo_pris » (pas rejoint, mais son identité est gardée pour réessayer)');
    const p3 = await M2.publier(ligneDe(['bijoux'], {}), { pseudo: 'Léa' });
    check(p3.ok && JSON.parse(st2.getItem('poncin.classement')).id === id2 && M2.etat().rejoint && M2.etat().pseudo === 'Léa', 'il réessaie sous un autre pseudo : la même identité, inscrit');
    const p4 = await M2.publier(null, { pseudo: 'Léa la Rapide' }), a4 = lib.appels[lib.appels.length - 1];
    check(p4.ok && p4.compte === null && json(Object.keys(a4.args)) === json(['p_id', 'p_jeton', 'p_pseudo']) && M2.etat().pseudo === 'Léa la Rapide', 'publier(null, { pseudo }) : changer de pseudo sans partie (ni valeur ni score envoyés)');
    const p5 = await M2.publier(null, { pseudo: '!!' }), p6 = await M2.publier('ligne', {}), p7 = await M2.publier([1, 2], {});
    check(p5.erreur === 'pseudo_invalide' && p6.erreur === 'ligne' && p7.erreur === 'ligne', 'un pseudo impossible, une ligne qui n’est pas un objet : refusés sans appel');
    // retirer
    const r8 = await M.retirer(), e8 = JSON.parse(st.getItem('poncin.classement'));
    check(r8.ok && !e8.id && !e8.jeton && e8.rejoint === false && e8.pseudo === 'Bouquetin 42' && !srv.joueurs.has(e.id), 'retirer() : la ligne part du serveur, l’identité est oubliée (le pseudo reste proposé)');
    const v4 = await M.vu(), r9 = await M.retirer();
    check(v4.ok === false && v4.erreur === 'inconnu' && r9.ok, 'après retirer : vu() « inconnu » sans appel, retirer() encore : ok');
    const r10 = await M.publier(ligneDe(['montre'], {}), {}), e10 = JSON.parse(st.getItem('poncin.classement'));
    check(r10.ok && e10.id && e10.id !== e.id, 'la partie suivante : une nouvelle identité, un nouveau départ');
  }

  titre('Les replis : hors ligne, lent, pas installé, exceptions, stockage cassé');
  {
    const essai = async (serveur, env) => { const l = fauxSupabase(serveur); const m = C.creer(Object.assign({ config: CONFIG, supabase: l, stockage: memoire(), delaiMax: 60 }, env)); return { r: await m.publier(ligneDe(['montre'], {}), { pseudo: 'Tom' }), l: await m.lire('semaine'), l2: l }; };
    const hl = await essai(serveurMemoire(), { enLigne: () => false });
    check(hl.r.erreur === 'hors-ligne' && hl.l.erreur === 'hors-ligne' && hl.l2.appels.length === 0, 'navigator.onLine faux : « hors-ligne », aucun appel');
    const lent = await essai(() => new Promise(() => {}));
    check(lent.r.erreur === 'lent' && lent.l.erreur === 'lent', 'pas de réponse : « lent » au bout du délai (la promesse ne reste jamais pendue)');
    const pi = await essai(() => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.poncin_publier' }, status: 404 }));
    check(pi.r.erreur === 'pas-installe' && pi.l.erreur === 'pas-installe', 'fonctions absentes (le SQL pas encore collé) : « pas-installe »');
    const res = await essai(() => Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }));
    check(res.r.erreur === 'hors-ligne', 'fetch qui échoue dans supabase-js : « hors-ligne »');
    const exc = await essai(() => { throw new Error('boum'); }), rej = await essai(() => Promise.reject(new Error('NetworkError when attempting to fetch')));
    check(exc.r.erreur === 'erreur' && exc.l.erreur === 'erreur' && rej.r.erreur === 'hors-ligne', 'rpc qui lance une exception, ou qui rejette : rattrapé');
    const fou = await essai(() => Promise.resolve({ data: 'n’importe quoi', error: null })), fou2 = await essai(() => Promise.resolve({ data: { lignes: [null, { rang: -1, pseudo: { x: 1 }, pieces: 'beaucoup', moi: 1 }], joueurs: -5 }, error: null }));
    check(fou.r.erreur === 'erreur' && fou.l.erreur === 'erreur' && fou2.l.ok && fou2.l.lignes.length === 1 && fou2.l.lignes[0].rang === null && fou2.l.lignes[0].pieces === 0 && fou2.l.lignes[0].moi === false && fou2.l.joueurs === 1, 'une réponse folle : nettoyée (rang null, 0 pièce), jamais affichée telle quelle');
    const libC = { createClient: () => { throw new Error('pas de client'); } }, mc = C.creer({ config: CONFIG, supabase: libC, stockage: memoire() });
    check((await mc.publier(ligneDe([], {}), { pseudo: 'Tom' })).erreur === 'absent' && (await mc.lire('semaine')).erreur === 'absent', 'createClient qui lance une exception : « absent »');
    const casse = { getItem: () => { throw new Error('interdit'); }, setItem: () => { throw new Error('plein'); } };
    const mk = C.creer({ config: CONFIG, supabase: fauxSupabase(serveurMemoire()), stockage: casse });
    const rk = await mk.publier(ligneDe(['montre'], {}), { pseudo: 'Tom' }), lk = await mk.lire('semaine');
    check(rk.ok && lk.ok && lk.moi && mk.etat().rejoint, 'stockage qui lance des exceptions (navigation privée) : l’identité vit en mémoire, tout marche');
    for (const brut of ['{abîmé', '[]', '{"id":"pas-un-uuid","jeton":"x","rejoint":true,"pseudo":"Tom"}', '{"id":"11111111-1111-4111-8111-111111111111","jeton":"ab","rejoint":true}', 'null']) {
      const e = C.lireEtat(memoire({ 'poncin.classement': brut }));
      if (e.id || e.jeton || e.rejoint) { check(false, `état abîmé ${brut} : repart à neuf`); break; }
    }
    check(true, 'un état local abîmé (JSON cassé, id ou jeton faux) repart à neuf : jamais un jeton inventé');
    // rien ne rejette, quoi qu'on passe
    const m = C.creer({ config: CONFIG, supabase: fauxSupabase(serveurMemoire()), stockage: memoire(), delaiMax: 30 });
    const bizarres = [undefined, null, 0, 'x', [], {}, { extrait: 'oui', valeur: {}, score: [] }, Object.create(null), new Proxy({}, { get: () => { throw new Error('piège'); } })];
    let rejets = 0, formes = 0;
    for (const x of bizarres) for (const f of [() => m.publier(x, { pseudo: x }), () => m.publier(x, x), () => m.lire(x), () => m.vu(x), () => m.retirer(x), () => C.publier(x, x), () => C.lire(x)]) {
      try { const r = await f(); if (r && typeof r === 'object' && typeof r.ok === 'boolean' && 'erreur' in r) formes++; } catch (e) { rejets++; }
    }
    check(rejets === 0 && formes === bizarres.length * 7, `${bizarres.length * 7} appels avec des entrées absurdes (dont un Proxy piégé) : aucune promesse rejetée, toujours { ok, erreur }`);
  }

  titre('Le build');
  {
    const b = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8'), l = /const PONCIN = (\[[^\]]*\])/.exec(b);
    const liste = l ? JSON.parse(l[1].replace(/'/g, '"')) : [];
    check(liste.indexOf('classement.js') === liste.indexOf('butin.js') + 1 && liste.indexOf('classement.js') < liste.indexOf('ui.js'), 'build.js : classement.js juste après butin.js, avant ui.js');
    const page = path.join(__dirname, '..', 'poncin', 'index.html');
    check(fs.existsSync(page) && /root\.PCLASSEMENT = factory\(\)/.test(fs.readFileSync(page, 'utf8')), 'poncin/index.html contient PCLASSEMENT (rebâtir avec node build.js)');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src-poncin', 'classement.js'), 'utf8');
    check(!/document\.|THREE|localStorage\.(get|set)Item\('poncin\.v2'/.test(src) && !/console\.error/.test(src), 'module pur : ni DOM ni THREE, jamais « poncin.v2 », jamais console.error');
  }

  console.log(`\n${oks} ok, ${fails} en échec`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('  FAIL exception : ' + (e && e.stack || e)); process.exit(1); });
