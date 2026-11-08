#!/usr/bin/env node
// Opération Poncin a quitté la Salle de jeux (8 nov. 2026) : le patch supabase/poncin-suppression.sql éprouvé POUR DE VRAI dans un
// Postgres local (PGlite, Postgres en WebAssembly ; aucune connexion à Supabase). Lancé À LA MAIN, pas en CI.
// Comme test/fournil-classement-sql.cjs et test/zombies-defi-sql.cjs : les rôles de Supabase (anon, authenticated, un propriétaire non
// superutilisateur, les droits par défaut larges), puis, collés comme dans le SQL Editor :
//   1. tout le SQL du Fournil (fournil-classement.sql complet, les cadeaux, le chat, les idées et votes), puis celui de Poncin
//      (poncin-butin.sql, lu dans l'historique git : il a quitté le dépôt), puis celui de Dernier Rempart (le défi, le social) ;
//      un joueur dans chaque jeu ; et des restes possibles sur le serveur : une ancienne version de poncin_publier, une vue, une
//      séquence et un type poncin_ ajoutés à la main ;
//   2. le refus : une vue d'un AUTRE jeu qui lit une table poncin_ → le patch s'arrête, et rien n'est effacé (une transaction, pas de cascade) ;
//   3. le patch collé DEUX FOIS : il passe, et sa requête de contrôle répond poncin_restants = 0 les deux fois ;
//   4. plus aucun objet poncin_ dans la base ; tout le reste (tables, fonctions, droits, données du Fournil et des zombies) à l'identique ;
//      les fonctions du Fournil et du défi zombies répondent toujours, en tant qu'anon.
// Lancement (PGlite n'est pas dans le dépôt) :
//   npm install --prefix /tmp/pglite --no-save --no-package-lock @electric-sql/pglite@0.5.8
//   node test/poncin-suppression-sql.cjs /tmp/pglite
//   (PONCIN_SQL=<fichier> : le SQL de Poncin à coller à la place de celui de l'historique git)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const RACINE = path.join(__dirname, '..');

function chargerPGlite() {
  const arg = process.argv[2], essais = [];
  if (arg) { const a = path.resolve(arg); essais.push(path.join(a, 'node_modules', '@electric-sql', 'pglite'), path.join(a, '@electric-sql', 'pglite'), a); }
  essais.push('@electric-sql/pglite');
  for (const e of essais) { try { const m = require(e); if (m && m.PGlite) return m; } catch (err) { /* l'essai suivant */ } }
  console.log('  FAIL PGlite introuvable : installe @electric-sql/pglite hors du dépôt, puis donne son dossier en argument');
  process.exit(1);
}
let fails = 0, oks = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else fails++; return ok; };
const titre = (t) => console.log(`── ${t} ──`);
const joueur = () => ({ id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex') });
const lire = (f) => fs.readFileSync(path.join(RACINE, 'supabase', f), 'utf8');

// le SQL de Poncin : il a quitté le dépôt ; on le lit sur master 9ec2192 (le dernier commit qui l'a), ou dans PONCIN_SQL
const COMMIT_PONCIN = '9ec2192';
function sqlPoncin() {
  if (process.env.PONCIN_SQL) return fs.readFileSync(process.env.PONCIN_SQL, 'utf8');
  try { return execFileSync('git', ['show', `${COMMIT_PONCIN}:supabase/poncin-butin.sql`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 16 << 20 }); } catch (e) {
    console.log(`  FAIL le SQL de Poncin introuvable dans l'historique (git show ${COMMIT_PONCIN}:supabase/poncin-butin.sql) : donne-le par PONCIN_SQL=<fichier>`);
    process.exit(1);
  }
}
const FOURNIL = ['fournil-classement.sql', 'fournil-cadeaux.sql', 'fournil-chat.sql', 'fournil-retours.sql'];
const ZOMBIES = ['zombies-defi.sql', 'zombies-social.sql'];
const PATCH = lire('poncin-suppression.sql');

(async () => {
  const { PGlite } = chargerPGlite();
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
    create role proprio nologin createrole; -- le propriétaire, comme « postgres » chez Supabase : pas superutilisateur
    grant usage, create on schema public to proprio; grant usage on schema public to anon, authenticated, service_role;
    set role proprio;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    reset role;
  `);
  console.log('Opération Poncin — la suppression de son SQL dans ' + (await db.query('select version() as v')).rows[0].v.split(' on ')[0]);
  const sup = async (sql, p) => (await db.query(sql, p)).rows;
  const comme = async (role, sql, p) => { await db.exec(`set role ${role}`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  // comme le SQL Editor (le propriétaire) ; sur une erreur, la transaction restée ouverte est annulée (le SQL Editor, lui, jette la connexion)
  const coller = async (sql) => {
    await db.exec('set role proprio');
    try { return await db.exec(sql); } catch (e) { try { await db.exec('rollback'); } catch (x) { /* pas de transaction ouverte */ } throw e; } finally { await db.exec('reset role'); }
  };
  await sup(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'cf-connecting-ip': '203.0.113.7' })]);

  // les objets poncin_ de toute la base (hors catalogues) : relations, fonctions, types (tableaux compris), règles
  const objetsPoncin = async () => (await sup(`
      select 'rel:' || n.nspname || '.' || c.relname || ':' || c.relkind::text as o from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relname like '%poncin%' and n.nspname not in ('pg_catalog', 'information_schema')
      union all select 'fn:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname like '%poncin%' and n.nspname not in ('pg_catalog', 'information_schema')
      union all select 'type:' || n.nspname || '.' || t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where t.typname like '%poncin%' and n.nspname not in ('pg_catalog', 'information_schema')
      union all select 'regle:' || polname from pg_policy where polrelid::regclass::text like '%poncin%'
      order by 1`)).map((r) => r.o);
  // tout le reste du schéma public : la structure (colonnes, index, droits, règles, corps des fonctions) et les données de chaque table
  const photo = async () => {
    const rel = await sup(`select c.relname, c.relkind, coalesce(c.relacl::text, '') as acl, c.relrowsecurity as rls,
        (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || coalesce(' = ' || pg_get_expr(d.adbin, d.adrelid), ''), ', ' order by a.attnum)
           from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
        coalesce((select pg_get_indexdef(c.oid) where c.relkind = 'i'), '') as idx
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname not like 'poncin%' order by 1`);
    const fns = await sup(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, md5(pg_get_functiondef(p.oid)) as corps, coalesce(p.proacl::text, '') as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not like 'poncin%' and p.prokind <> 'a' order by 1`);
    const regles = await sup(`select polrelid::regclass::text || '.' || polname as r from pg_policy order by 1`);
    const donnees = {};
    for (const { relname } of rel.filter((r) => r.relkind === 'r')) donnees[relname] = (await sup(`select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as h from public.${relname} t`))[0];
    return { rel, fns, regles, donnees };
  };

  titre('1. le Fournil, Poncin et Dernier Rempart collés comme sur le serveur');
  for (const f of FOURNIL) { try { await coller(lire(f)); check(true, `supabase/${f} se colle`); } catch (e) { check(false, `supabase/${f} : ${e.message}`); process.exit(1); } }
  try { await coller(sqlPoncin()); check(true, `supabase/poncin-butin.sql (de ${process.env.PONCIN_SQL || COMMIT_PONCIN}) se colle par-dessus`); } catch (e) { check(false, 'poncin-butin.sql : ' + e.message); process.exit(1); }
  for (const f of ZOMBIES) { try { await coller(lire(f)); check(true, `supabase/${f} se colle après`); } catch (e) { check(false, `supabase/${f} : ${e.message}`); process.exit(1); } }
  const F = joueur(), P = joueur(), Z = joueur();
  const rf = (await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4) as r', [F.id, F.jeton, 'Fanny', '12345']))[0].r;
  const rp = (await comme('anon', 'select public.poncin_publier(p_id => $1, p_jeton => $2, p_pseudo => $3) as r', [P.id, P.jeton, 'Paulo']))[0].r;
  const jour = (await sup(`select (now() at time zone 'Europe/Paris')::date::text as j`))[0].j;
  const rz = (await comme('anon', 'select public.zombies_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_jour => $4, p_score => $5, p_vague => $6, p_tues => $7) as r', [Z.id, Z.jeton, 'Zoé', jour, 120, 2, 15]))[0].r;
  check(rf && rf.ok && rp && rp.ok && rz && rz.ok, `un joueur dans chaque jeu (Fournil ${rf && rf.ok}, Poncin ${rp && rp.ok}, zombies ${rz && rz.ok}${rz && rz.erreur ? ' ' + rz.erreur : ''})`);
  check((await sup('select count(*)::int as n from public.poncin_joueurs'))[0].n === 1, 'Poncin a sa ligne dans poncin_joueurs');
  // des restes possibles sur le serveur : une ancienne version de poncin_publier (d'autres paramètres), et des ajouts à la main
  await coller(`
    create function public.poncin_publier(p_id uuid, p_jeton text, p_pseudo text, p_pieces bigint default null, p_score integer default null)
      returns json language sql as $$ select '{"ok": true}'::json $$;
    create view public.poncin_vue as select count(*) as n from public.poncin_joueurs;
    create sequence public.poncin_numeros;
    create type public.poncin_sorte as enum ('arene', 'extraction');
    create type public.poncin_paire as (a integer, b integer);
  `);
  const avant = await objetsPoncin();
  check(avant.includes('rel:public.poncin_joueurs:r') && avant.includes('rel:public.poncin_portes:r') && avant.includes('rel:public.poncin_joueurs_pseudo:i')
    && avant.filter((o) => o.startsWith('fn:public.poncin_publier(')).length === 2 && avant.filter((o) => o.startsWith('fn:')).length === 13,
    `${avant.length} objets poncin_ avant le patch (dont 13 fonctions : deux versions de poncin_publier ; tables, index, vue, séquence, types)`);
  const photo0 = await photo();
  check(photo0.fns.some((f) => f.sig.startsWith('fournil_publier(')) && photo0.fns.some((f) => f.sig.startsWith('zombies_publier(')) && photo0.fns.some((f) => f.sig.startsWith('zombies_mondial(')),
    `la photo du reste : ${photo0.rel.length} relations, ${photo0.fns.length} fonctions (fournil_…, zombies_…), ${Object.keys(photo0.donnees).length} tables`);

  titre('2. le refus : un objet d’un autre jeu dépend d’une table poncin_');
  {
    await coller('create view public.zombies_essai_vue as select count(*) as n from public.poncin_joueurs');
    let err = null;
    try { await coller(PATCH); } catch (e) { err = e.message; }
    check(!!err && /depend/i.test(err), `le patch s’arrête (pas de cascade) : « ${err ? err.split('\n')[0] : 'aucune erreur'} »`);
    check(JSON.stringify(await objetsPoncin()) === JSON.stringify(avant) && (await sup('select count(*)::int as n from public.poncin_joueurs'))[0].n === 1, 'rien n’est effacé : les objets et la ligne de Poncin sont tous là (une seule transaction)');
    await coller('drop view public.zombies_essai_vue');
    check(JSON.stringify(await photo()) === JSON.stringify(photo0), 'le reste de la base est intact');
  }

  titre('3. le patch, collé deux fois');
  for (const fois of ['une première fois', 'une seconde fois']) {
    let res = null;
    try { res = await coller(PATCH); } catch (e) { check(false, `il se colle ${fois} : ${e.message}`); continue; }
    const dernier = res[res.length - 1];
    const ligne = dernier && dernier.rows && dernier.rows[0];
    check(ligne && Object.keys(ligne).join() === 'poncin_restants' && Number(ligne.poncin_restants) === 0, `il se colle ${fois} ; le contrôle final : poncin_restants = ${ligne && ligne.poncin_restants}`);
  }

  titre('4. ce qui reste');
  const apres = await objetsPoncin();
  check(apres.length === 0, `aucun objet poncin_ dans la base (relations, fonctions, types, règles)${apres.length ? ' : ' + apres.join(', ') : ''}`);
  const photo1 = await photo();
  check(JSON.stringify(photo1.rel) === JSON.stringify(photo0.rel), `les ${photo1.rel.length} relations du Fournil et des zombies : à l’identique (colonnes, index, droits, sécurité ligne par ligne)`);
  check(JSON.stringify(photo1.fns) === JSON.stringify(photo0.fns), `leurs ${photo1.fns.length} fonctions : à l’identique (corps et droits)`);
  check(JSON.stringify(photo1.regles) === JSON.stringify(photo0.regles), 'leurs règles de sécurité : à l’identique');
  check(JSON.stringify(photo1.donnees) === JSON.stringify(photo0.donnees), `leurs données : ${Object.entries(photo1.donnees).filter(([, v]) => v.n).map(([k, v]) => `${k} ${v.n}`).join(', ')}`);
  // les fonctions des autres jeux répondent toujours, en tant qu'anon, comme le téléphone
  const heure = (await comme('anon', 'select public.fournil_heure() as r'))[0].r;
  check(heure && heure.ok !== false, 'fournil_heure répond');
  const cf = (await comme('anon', 'select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['total', F.id]))[0].r;
  check(cf && !cf.erreur && Array.isArray(cf.lignes) && cf.lignes.some((j) => j.pseudo === 'Fanny'), 'fournil_classement répond : Fanny y est' + (cf && Array.isArray(cf.lignes) ? '' : ' — ' + JSON.stringify(cf).slice(0, 300)));
  const F2 = joueur();
  const rf2 = (await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4) as r', [F2.id, F2.jeton, 'Fred', '500']))[0].r;
  check(rf2 && rf2.ok, 'fournil_publier inscrit encore un joueur');
  const chat = (await comme('anon', 'select public.fournil_chat_lire(p_apres => 0, p_limite => 10, p_id => $1, p_jeton => $2) as r', [F.id, F.jeton]))[0].r;
  check(chat && chat.ok, 'fournil_chat_lire répond');
  const cz = (await comme('anon', 'select public.zombies_classement(p_periode => $1, p_jour => $2, p_id => $3) as r', ['jour', jour, Z.id]))[0].r;
  check(cz && !cz.erreur && Array.isArray(cz.lignes) && cz.lignes.some((j) => j.pseudo === 'Zoé' && j.score === 120), 'zombies_classement (le défi du jour) répond : Zoé y est, 120 points' + (cz && Array.isArray(cz.lignes) ? '' : ' — ' + JSON.stringify(cz).slice(0, 300)));
  const Z2 = joueur();
  const rz2 = (await comme('anon', 'select public.zombies_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_jour => $4, p_score => $5, p_vague => $6, p_tues => $7) as r', [Z2.id, Z2.jeton, 'Zack', jour, 80, 1, 9]))[0].r;
  check(rz2 && rz2.ok, 'zombies_publier inscrit encore un joueur');
  const mz = (await comme('anon', 'select public.zombies_mondial(p_critere => $1) as r', ['vague']))[0].r;
  check(mz && mz.ok !== false, 'zombies_mondial (le social) répond');
  let refus = 'accepté'; try { await comme('anon', 'select public.poncin_classement($1) as r', ['semaine']); } catch (e) { refus = e.code || e.message; }
  check(refus === '42883', `poncin_classement n’existe plus (${refus})`);

  await db.close();
  console.log(fails ? `\n${fails} échec(s) sur ${fails + oks}` : `\nTout passe (${oks} vérifications).`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
