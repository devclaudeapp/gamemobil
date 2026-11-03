#!/usr/bin/env node
// Dernier Rempart : le SQL du classement du défi du jour (supabase/zombies-defi.sql) éprouvé POUR DE VRAI dans un Postgres local
// (PGlite, Postgres en WebAssembly ; aucune connexion à Supabase). Comme test/poncin-butin-sql.cjs : les rôles de Supabase (anon,
// authenticated, un propriétaire non superutilisateur, les droits par défaut larges), le SQL collé DEUX FOIS, puis chaque fonction
// jouée EN TANT QU'ANON, comme le téléphone :
//   · structure et droits (tables fermées, deux fonctions seules points d'entrée) ;
//   · la borne de score, égale à ZDONNEES.DEFI.borneScore ; un vrai score de partie passe ;
//   · publier (meilleur score du jour gardé), « trop_vite », jour refusé (ni demain ni avant-hier), valeur refusée ;
//   · « Aujourd'hui » et « Cette semaine » (somme des meilleurs scores de chaque jour), ex æquo, ma ligne hors des premiers ;
//   · pseudo pris, jeton d'un autre, accès direct aux tables refusé, limites d'inscription, ménage ;
//   · le contrat : le VRAI module du téléphone (src-zombies/classement.js) branché sur ce Postgres par un faux supabase-js.
// Le temps est simulé : public.zombies_maintenant() est remplacée par une horloge de test.
// Lancement (PGlite n'est pas dans le dépôt) :
//   npm install --prefix /tmp/pglite --no-save @electric-sql/pglite@0.5.8
//   node test/zombies-defi-sql.cjs /tmp/pglite
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const D = require('../src-zombies/donnees.js'), C = require('../src-zombies/classement.js'), J = require('../src-zombies/jeu.js');

function chargerPGlite() {
  const arg = process.argv[2], essais = [];
  if (arg) { const a = path.resolve(arg); essais.push(path.join(a, 'node_modules', '@electric-sql', 'pglite'), path.join(a, '@electric-sql', 'pglite'), a); }
  essais.push('@electric-sql/pglite');
  for (const e of essais) { try { const m = require(e); if (m && m.PGlite) return m; } catch (err) { /* l'essai suivant */ } }
  console.log('  FAIL PGlite introuvable : installe @electric-sql/pglite hors du dépôt, puis donne son dossier en argument');
  process.exit(1);
}
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; return ok; };
const titre = (t) => console.log(`── ${t} ──`);
const joueur = () => ({ id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex') });
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'zombies-defi.sql'), 'utf8');

async function base(PGlite) {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin noinherit; create role authenticated nologin noinherit; create role proprio nologin createrole;
    grant usage, create on schema public to proprio; grant usage on schema public to anon, authenticated;
    set role proprio;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    reset role;
    create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
    grant usage on schema banc to proprio; grant select on banc.horloge to proprio;
  `);
  return db;
}

(async () => {
  const { PGlite } = chargerPGlite();
  const db = await base(PGlite);
  console.log('Dernier Rempart — le SQL du défi du jour dans ' + (await db.query('select version() as v')).rows[0].v.split(' on ')[0]);
  const sup = async (sql, p) => (await db.query(sql, p)).rows;
  const comme = async (role, sql, p) => { await db.exec(`set role ${role}`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  const refus = async (role, sql, p) => { try { await comme(role, sql, p); return 'accepté'; } catch (err) { return err.code || err.message; } };
  const coller = async () => { await db.exec('set role proprio'); try { await db.exec(SQL); } finally { await db.exec('reset role'); } };
  let horloge = Date.parse('2026-11-04T10:00:00Z'); // un mercredi, 11 h à Paris
  const heure = async (q) => { horloge = typeof q === 'number' ? q : Date.parse(q); await sup('update banc.horloge set t = $1', [new Date(horloge).toISOString()]); };
  const avancer = (s) => heure(horloge + s * 1000);
  const installerHorloge = async () => { await sup(`create or replace function public.zombies_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`); await heure(horloge); };
  const reponses = [];
  const publier = async (j, pseudo, p) => { const r = (p
    ? await comme('anon', 'select public.zombies_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_jour => $4, p_score => $5, p_vague => $6, p_tues => $7) as r', [j.id, j.jeton, pseudo, p.jour, p.score, p.vague, p.tues])
    : await comme('anon', 'select public.zombies_publier(p_id => $1, p_jeton => $2, p_pseudo => $3) as r', [j.id, j.jeton, pseudo]))[0].r; reponses.push(r); return r; };
  const classement = async (periode, jour, id) => { const r = (await comme('anon', 'select public.zombies_classement(p_periode => $1, p_jour => $2, p_id => $3) as r', [periode, jour || null, id || null]))[0].r; reponses.push(r); return r; };
  const vider = () => db.exec('delete from public.zombies_scores; delete from public.zombies_joueurs; delete from public.zombies_portes');
  const entetes = (h) => sup(`select set_config('request.headers', $1, false)`, [h ? JSON.stringify(h) : '']);

  titre('installation');
  try { await coller(); check(true, 'supabase/zombies-defi.sql se colle tel quel (propriétaire non superutilisateur, droits par défaut de Supabase)'); } catch (err) { check(false, 'il se colle : ' + err.message); process.exit(1); }
  await installerHorloge();
  {
    const a = joueur(); await publier(a, 'Avant', { jour: '2026-11-04', score: 500, vague: 3, tues: 40 });
    const photo = async () => JSON.stringify(await sup('select * from public.zombies_scores order by joueur'));
    const p1 = await photo();
    try { await coller(); check(true, 'il se recolle sans erreur'); } catch (err) { check(false, 'il se recolle : ' + err.message); }
    await installerHorloge();
    check(await photo() === p1, 'rien ne se perd au recollage');
    await vider();
  }

  titre('structure et droits');
  {
    const t = await sup(`select relname, relrowsecurity as rls from pg_class where relnamespace = 'public'::regnamespace and relname like 'zombies\\_%' and relkind = 'r' order by 1`);
    check(t.length === 3 && t.every((x) => x.rls), `trois tables, sécurité ligne par ligne activée (${t.map((x) => x.relname).join(', ')})`);
    check(await refus('anon', 'select * from public.zombies_joueurs') === '42501' && await refus('anon', 'select * from public.zombies_scores') === '42501' && await refus('anon', `insert into public.zombies_scores values (gen_random_uuid(), current_date, 1, 1, 1, 1, now())`) === '42501', 'anon ne lit ni n’écrit aucune table directement');
    const f = await sup(`select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'zombies\\_%' and has_function_privilege('anon', oid, 'execute') order by 1`);
    check(f.map((x) => x.proname).join() === 'zombies_classement,zombies_publier', `anon n’appelle que deux fonctions (${f.map((x) => x.proname).join(', ')})`);
    check(await refus('anon', 'select public.zombies_borne_score(5)') === '42501', 'les fonctions internes lui sont fermées');
    const sd = await sup(`select proname, prosecdef, proconfig::text as c from pg_proc where proname in ('zombies_publier', 'zombies_classement')`);
    check(sd.length === 2 && sd.every((x) => x.prosecdef && /search_path=\\?"\\?"/.test(x.c)), 'security definer, search_path vide');
  }

  titre('les bornes');
  {
    const v = [1, 2, 5, 10, 25, 60, 400]; const s = await sup(`select v, public.zombies_borne_score(v)::float8 as b from unnest($1::int[]) as v`, [v]);
    check(s.every((x) => x.b === D.DEFI.borneScore(x.v)), `zombies_borne_score = ZDONNEES.DEFI.borneScore (${s.map((x) => x.v + ':' + x.b).join(' ')})`);
    // une vraie partie de défi, jouée par le joueur automatique de la simulation, passe la borne
    const d = J.defiDu('2026-11-04'), jeu = J.creer({ arene: d.arene, graine: d.graine, mod: d.mod, attente: 0.5 });
    for (let k = 0; k < 60 * 400 && !jeu.fini; k++) { const m = jeu.joueurs[0]; if (jeu.choix) J.choisirAtout(jeu, 'moi', jeu.choix.options[0]); m.vie = Math.max(m.vie, m.vieMax * 0.5); jeu.serie.t = jeu.t; J.pas(jeu, {}, 1 / 60); jeu.evs.length = 0; }
    const m = jeu.joueurs[0];
    check(m.score > 0 && m.score <= D.DEFI.borneScore(jeu.vague) && m.tues <= (await sup('select public.zombies_borne_tues($1)::int as b', [jeu.vague]))[0].b, `une partie réelle (vague ${jeu.vague}, ${m.score} pts, ${m.tues} tués, série forcée) reste sous les bornes (${D.DEFI.borneScore(jeu.vague)})`);
  }

  titre('publier');
  const A = joueur(), B = joueur(), Cc = joueur();
  {
    const r = await publier(A, 'Alice', { jour: '2026-11-04', score: 1200, vague: 6, tues: 90 });
    check(r.ok && r.record && r.meilleur === 1200 && r.rang === 1 && r.joueurs === 1 && r.jour === '2026-11-04', 'Alice s’inscrit avec sa partie : meilleur 1 200, 1re');
    const tv = await publier(A, 'Alice', { jour: '2026-11-04', score: 1500, vague: 7, tues: 99 });
    check(tv.ok === false && tv.erreur === 'trop_vite' && tv.meilleur === 1200, 'aussitôt une autre : « trop_vite », rien ne change');
    await avancer(20);
    const moins = await publier(A, 'Alice', { jour: '2026-11-04', score: 800, vague: 5, tues: 60 });
    check(moins.ok && !moins.record && moins.meilleur === 1200 && moins.vague === 6 && moins.parties === 2, 'une partie moins bonne : comptée, le meilleur reste 1 200 (vague 6)');
    await avancer(20);
    const mieux = await publier(A, 'Alice', { jour: '2026-11-04', score: 2000, vague: 8, tues: 140 });
    check(mieux.ok && mieux.record && mieux.meilleur === 2000 && mieux.vague === 8 && mieux.parties === 3, 'une meilleure : record battu, 2 000 (vague 8)');
    await avancer(20);
    check((await publier(A, 'Alice', { jour: '2026-11-05', score: 10, vague: 1, tues: 1 })).erreur === 'jour', 'demain : refusé (« jour »)');
    check((await publier(A, 'Alice', { jour: '2026-11-02', score: 10, vague: 1, tues: 1 })).erreur === 'jour', 'avant-hier : refusé');
    check((await publier(A, 'Alice', { jour: '2026-11-04', score: D.DEFI.borneScore(3) + 1, vague: 3, tues: 10 })).erreur === 'valeur', 'un score au-delà de la borne de sa vague : « valeur »');
    check((await publier(A, 'Alice', { jour: '2026-11-04', score: 10, vague: 0, tues: 0 })).erreur === 'valeur', 'vague 0 : « valeur »');
    const hier = await publier(A, 'Alice', { jour: '2026-11-03', score: 700, vague: 4, tues: 50 });
    check(hier.ok && hier.jour === '2026-11-03' && hier.meilleur === 700, 'hier (une partie commencée avant minuit) : acceptée, comptée pour hier');
    check((await publier(B, 'ALICE', null)).erreur === 'pseudo_pris', 'pseudo pris (sans tenir compte des majuscules)');
    check((await publier({ id: A.id, jeton: B.jeton }, 'Alice', null)).erreur === 'jeton', 'le jeton d’un autre : refusé');
    check((await publier(B, 'x', null)).erreur === 'pseudo_invalide' && (await publier(B, "Rob'); drop table x;--", null)).erreur === 'pseudo_invalide', 'pseudos invalides (trop court, caractères interdits)');
    const b = await publier(B, 'Bob', { jour: '2026-11-04', score: 2000, vague: 9, tues: 150 });
    check(b.ok && b.rang === 1 && b.joueurs === 2, 'Bob à égalité avec Alice : même rang (1er)');
    await publier(Cc, 'Chloé', { jour: '2026-11-04', score: 300, vague: 2, tues: 20 });
  }

  titre('les classements');
  {
    const c = await classement('jour', null, Cc.id);
    check(c.jour === '2026-11-04' && c.joueurs === 3 && c.lignes.map((l) => `${l.rang}${l.pseudo}`).join() === '1Alice,1Bob,3Chloé' && c.lignes[2].moi && c.moi.rang === 3 && c.moi.score === 300, `« Aujourd’hui » : ${c.lignes.map((l) => `${l.rang}. ${l.pseudo} ${l.score}`).join(', ')}`);
    const s = await classement('semaine', null, A.id);
    check(s.lundi === '2026-11-02' && s.lignes[0].pseudo === 'Alice' && s.lignes[0].score === 2700 && s.lignes[0].parties === 2 && s.moi.rang === 1, `« Cette semaine » : la somme des meilleurs de chaque jour (Alice ${s.lignes[0].score} sur ${s.lignes[0].parties} jours)`);
    const h = await classement('jour', '2026-11-03');
    check(h.jour === '2026-11-03' && h.lignes.length === 1 && h.lignes[0].score === 700, 'le défi d’hier se relit');
    check((await classement('jour', '2027-01-01')).jour === '2026-11-04', 'une date future : ramenée à aujourd’hui');
    check((await classement('mois')).erreur === 'periode', 'une période inconnue : « periode »');
    await heure('2026-11-09T09:00:00Z'); // lundi suivant, 10 h à Paris
    const s2 = await classement('semaine');
    check(s2.lundi === '2026-11-09' && s2.lignes.length === 0, 'le lundi suivant : la semaine repart de zéro');
    check(JSON.stringify(reponses).indexOf(A.jeton) < 0 && JSON.stringify(reponses).indexOf(A.id) < 0, 'aucune réponse ne contient d’identifiant ni de jeton');
  }

  titre('limites et ménage');
  {
    await vider(); await entetes({ 'cf-connecting-ip': '203.0.113.7' });
    let n = 0; for (let k = 0; k < 12; k++) { const r = await publier(joueur(), 'Robot' + k, null); if (r.ok) n++; }
    check(n === 10, `une même source : 10 inscriptions par heure au plus (${n})`);
    await entetes({ 'cf-connecting-ip': '2001:db8::1' }); const v6a = await publier(joueur(), 'Six A', null);
    await entetes({ 'cf-connecting-ip': '2001:db8::2' }); const v6b = await publier(joueur(), 'Six B', null);
    check(v6a.ok && v6b.ok && (await sup('select count(distinct empreinte)::int as n from public.zombies_portes'))[0].n === 2, 'en IPv6, le bloc /64 compte pour une source');
    await entetes(null);
    await avancer(8 * 86400); const r = await publier(joueur(), 'Nouveau', null);
    check(r.ok && (await sup('select count(*)::int as n from public.zombies_joueurs'))[0].n === 1, 'les inscriptions sans partie partent au bout de 7 jours');
  }

  titre('le contrat avec src-zombies/classement.js');
  {
    await vider(); await heure('2026-11-04T22:30:00Z'); // 23 h 30 à Paris
    const params = Object.fromEntries((await sup(`select proname as n, pg_get_function_arguments(oid) as a from pg_proc where proname in ('zombies_publier', 'zombies_classement')`)).map((x) => [x.n, x.a.split(', ').map((s) => s.split(' ')[0])]));
    const appels = [];
    const lib = { createClient: () => ({ rpc: async (nom, args) => {
      appels.push({ nom, args });
      if (!params[nom]) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 };
      const ks = Object.keys(args);
      try { return { data: (await comme('anon', `select public.${nom}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, ks.map((k) => args[k])))[0].r, error: null, status: 200 }; } catch (err) { return { data: null, error: { code: err.code, message: err.message }, status: 400 }; }
    } }) };
    const store = new Map(), stockage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    const tel = C.creer({ config: { supabaseUrl: 'https://banc.supabase.co', supabaseKey: 'sb_publishable_banc' }, supabase: lib, stockage });
    const jour = C.jourParis(horloge);
    check(jour === '2026-11-04' && C.jourParis(Date.parse('2026-11-04T23:30:00Z')) === '2026-11-05' && C.lundiDe('2026-11-08') === '2026-11-02', `jourParis : 23 h 30 à Paris = ${jour}, minuit passé = le lendemain ; lundiDe`);
    const p = await tel.publier({ jour, score: 1840, vague: 7, tues: 120 }, { pseudo: '  Zoé   la Brave ' });
    check(p.ok && p.record && p.rang === 1 && p.pseudo === 'Zoé la Brave' && JSON.parse(store.get(C.CLE)).rejoint, `publier : inscrite (« ${p.pseudo} »), 1re, l’identité gardée`);
    check(appels.every((a) => Object.keys(a.args).every((k) => params[a.nom].includes(k))), 'chaque paramètre envoyé existe dans la fonction SQL');
    check((await tel.publier({ jour, score: 10, vague: 1, tues: 1 }, {})).erreur === 'trop_vite', '« trop_vite » remonte tel quel');
    const l = await tel.lire('jour', jour), s = await tel.lire('semaine', jour);
    check(l.ok && l.lignes[0].moi && l.moi.rang === 1 && l.lignes[0].score === 1840 && s.ok && s.lundi === '2026-11-02', 'lire(\'jour\') et lire(\'semaine\') : ma ligne');
    const pi = await C.creer({ config: { supabaseUrl: 'https://banc.supabase.co', supabaseKey: 'k' }, supabase: { createClient: () => ({ rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.zombies_publier' }, status: 404 }) }) } }).publier({ jour, score: 1, vague: 1, tues: 1 }, { pseudo: 'Tom' });
    check(pi.erreur === 'pas-installe', 'le SQL pas encore collé : « pas-installe »');
    check((await C.creer({}).lire('jour')).erreur === 'absent', 'sans configuration : « absent »');
  }

  await db.close();
  console.log(fails ? `\n${fails} échec(s).` : '\nTout passe (Dernier Rempart, SQL du défi).');
  process.exit(fails ? 1 : 0);
})();
