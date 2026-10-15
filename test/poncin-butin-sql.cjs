#!/usr/bin/env node
// Opération Poncin : le SQL du classement du butin (supabase/poncin-butin.sql) éprouvé POUR DE VRAI dans un Postgres local :
// PGlite, Postgres compilé en WebAssembly (aucun serveur, aucune connexion à Supabase).
// Comme test/fournil-classement-sql.cjs : on recrée les rôles de Supabase (anon, authenticated, un propriétaire qui n'est pas
// superutilisateur, et les droits par défaut très larges de Supabase), on colle d'abord le SQL du Fournil (version 5, tel qu'il est
// installé), puis celui de Poncin, DEUX FOIS (il doit se recoller sans casse et sans rien perdre, et sans rien changer au Fournil ;
// il doit aussi s'installer sur une base sans le Fournil), puis on joue chaque fonction EN TANT QU'ANON, comme le téléphone :
//   · structure et droits (sécurité ligne par ligne fermée, fonctions seules points d'entrée, search_path, propriétaire) ;
//   · les bornes de plausibilité, recalculées depuis src-poncin/regles.js et src-poncin/butin.js ;
//   · publier (les pièces comptées comme PBUTIN.deposer), « trop_vite » (120 s), le quota du jour (60), la borne de valeur ;
//   · la semaine qui change (nuit de dimanche à lundi à Paris, au passage à l'heure d'hiver), les records, « en ligne » ;
//   · retirer, pseudo pris, pseudos invalides, jeton d'un autre, injection impossible, accès direct aux tables refusé ;
//   · les limites d'inscription (par source, IPv6 en /64, communes, complet) et le ménage (7 et 90 jours) ;
//   · le contrat : le VRAI module du téléphone (src-poncin/classement.js) branché sur ce Postgres par un faux supabase-js.
// Le temps est simulé : la fonction public.poncin_maintenant() est remplacée par une horloge de test.
//
// Lancement (PGlite n'est pas dans le dépôt) :
//   npm install --prefix /tmp/pglite --no-save @electric-sql/pglite@0.5.8
//   TZ=Europe/Paris node test/poncin-butin-sql.cjs /tmp/pglite          (le dossier où PGlite est installé)
//   ou : NODE_PATH=/tmp/pglite/node_modules node test/poncin-butin-sql.cjs
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = require('../src-poncin/regles.js'), B = require('../src-poncin/butin.js'), C = require('../src-poncin/classement.js');

// ─── PGlite : le chemin donné en argument, sinon NODE_PATH ───
function chargerPGlite() {
  const arg = process.argv[2], essais = [];
  if (arg) { const a = path.resolve(arg); essais.push(path.join(a, 'node_modules', '@electric-sql', 'pglite'), path.join(a, '@electric-sql', 'pglite'), a); }
  essais.push('@electric-sql/pglite');
  for (const e of essais) { try { const m = require(e); if (m && m.PGlite) return m; } catch (err) { /* l'essai suivant */ } }
  console.log('  FAIL PGlite introuvable : installe @electric-sql/pglite (version exacte) hors du dépôt, puis donne son dossier en argument ou par NODE_PATH');
  process.exit(1);
}

let fails = 0, oks = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else fails++; return ok; };
const titre = (t) => console.log(`── ${t} ──`);
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const joueur = () => ({ id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex') });
const json = (o) => JSON.stringify(o);
// une partie : la ligne telle que le téléphone l'envoie (src-poncin/classement.js, argsDe)
const partie = (valeur, primes, extrait, bonus, score) => ({ valeur, primes, extrait, bonus, score });

const RACINE = path.join(__dirname, '..');
const SQL = fs.readFileSync(process.env.PONCIN_SQL || path.join(RACINE, 'supabase', 'poncin-butin.sql'), 'utf8'); // PONCIN_SQL : pour éprouver le test sur un fichier modifié
const SQL_FOURNIL = fs.readFileSync(path.join(RACINE, 'supabase', 'fournil-classement.sql'), 'utf8');

// un Postgres « comme Supabase » : rôles, propriétaire non superutilisateur, droits par défaut larges, l'horloge du banc d'essai
async function base(PGlite) {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role proprio nologin createrole;
    grant usage, create on schema public to proprio;
    grant usage on schema public to anon, authenticated, service_role;
    set role proprio;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    reset role;
    create schema banc;
    create table banc.horloge (t timestamptz);
    insert into banc.horloge values (null);
    grant usage on schema banc to proprio;
    grant select on banc.horloge to proprio;
  `);
  return db;
}

(async () => {
  const { PGlite } = chargerPGlite();
  const db = await base(PGlite);
  const version = (await db.query('select version() as v')).rows[0].v;
  console.log(`Opération Poncin — le SQL du classement du butin dans ${version.split(' on ')[0]}`);

  // ─── les outils : requêtes en superutilisateur (le banc d'essai), ou sous un rôle (anon : le téléphone) ───
  const sup = async (sql, p) => (await db.query(sql, p)).rows;
  const comme = async (role, sql, p) => { await db.exec(`set role ${role}`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  const refus = async (role, sql, p) => { try { await comme(role, sql, p); return 'accepté'; } catch (err) { return err.code || err.message; } };
  const coller = async (texte) => { await db.exec('set role proprio'); try { await db.exec(texte); } finally { await db.exec('reset role'); } };

  // l'horloge simulée
  let horloge = Date.parse('2026-10-14T10:00:00Z'); // un mercredi, midi à Paris : la semaine du lundi 12 octobre
  const heure = async (quand) => { horloge = typeof quand === 'number' ? quand : Date.parse(quand); await sup('update banc.horloge set t = $1', [new Date(horloge).toISOString()]); };
  const avancer = (s) => heure(horloge + s * 1000);
  const installerHorloge = async () => {
    await sup(`create or replace function public.poncin_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`);
    await heure(horloge);
  };

  // les quatre fonctions du jeu, appelées comme PostgREST le fait (paramètres nommés)
  const reponses = []; // toutes les réponses, pour vérifier qu'aucune ne laisse fuir un secret
  const garde = (r) => { reponses.push(r); return r; };
  const publier = async (j, pseudo, l, role = 'anon') => garde((l
    ? await comme(role, 'select public.poncin_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_valeur => $4, p_primes => $5, p_extrait => $6, p_bonus => $7, p_score => $8) as r', [j.id, j.jeton, pseudo, l.valeur, l.primes, l.extrait, l.bonus, l.score])
    : await comme(role, 'select public.poncin_publier(p_id => $1, p_jeton => $2, p_pseudo => $3) as r', [j.id, j.jeton, pseudo]))[0].r);
  const classement = async (periode, id = null, limite) => garde((await comme('anon', limite === undefined ? 'select public.poncin_classement(p_periode => $1, p_id => $2) as r' : 'select public.poncin_classement(p_periode => $1, p_id => $2, p_limite => $3) as r', limite === undefined ? [periode, id] : [periode, id, limite]))[0].r);
  const vu = async (j) => garde((await comme('anon', 'select public.poncin_vu(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r);
  const retirer = async (j) => garde((await comme('anon', 'select public.poncin_retirer(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r);
  const ligne = async (id) => (await sup('select pseudo, jeton, semaine::text as semaine, pieces::int as pieces, parties, extractions, jour::text as jour, parties_jour, record, total::int as total, parties_total, extractions_total, cree, maj, vu, partie_maj from public.poncin_joueurs where id = $1', [id]))[0] || null;
  const nb = async () => (await sup('select count(*)::int as n from public.poncin_joueurs'))[0].n;
  const vider = () => db.exec('delete from public.poncin_joueurs; delete from public.poncin_portes');
  const entetes = (h) => sup(`select set_config('request.headers', $1, false)`, [h ? JSON.stringify(h) : '']);

  // ─── 1. l'installation : par-dessus le Fournil v5, deux fois, sans rien lui changer ───
  titre('installation');
  try { await coller(SQL_FOURNIL); check(true, 'le SQL du Fournil (version 5) est installé d’abord, comme sur Supabase'); } catch (err) { check(false, 'le SQL du Fournil se colle : ' + err.message); process.exit(1); }
  await sup(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`);
  await heure(horloge);
  const fj = joueur();
  await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4)', [fj.id, fj.jeton, 'Boulanger', '1000']);
  const photoFournil = async () => json([
    await sup(`select p.proname, pg_get_function_identity_arguments(p.oid) as a, p.prosrc, p.proacl::text as acl, p.prosecdef, pg_get_userbyid(p.proowner) as o from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil%' order by 1, 2`),
    await sup(`select c.relname, c.relacl::text as acl, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'fournil%' order by 1`),
    await sup(`select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and table_name like 'fournil%' order by 1, 2`),
    await sup(`select * from public.fournil_joueurs order by id`)]);
  const avant = await photoFournil();
  try { await coller(SQL); check(true, 'supabase/poncin-butin.sql se colle tel quel (rôle propriétaire non superutilisateur, droits par défaut de Supabase)'); } catch (err) { check(false, 'poncin-butin.sql se colle : ' + err.message); process.exit(1); }
  await installerHorloge();
  {
    const a = joueur(), b = joueur();
    await publier(a, 'Avant Recollage', partie(200, 0, true, false, 230)); await publier(b, 'Autre Avant', null);
    const photo = async () => json(await sup('select * from public.poncin_joueurs order by id'));
    const p1 = await photo();
    try { await coller(SQL); check(true, 'il se recolle sans erreur (idempotent)'); } catch (err) { check(false, 'il se recolle : ' + err.message); }
    await installerHorloge();
    check(await photo() === p1, 'rien ne se perd au recollage : les joueurs, leurs pièces, leurs records restent tels quels');
  }
  check(await photoFournil() === avant, 'le Fournil est intact : ses fonctions (corps, droits, propriétaire), ses tables (droits, sécurité), ses colonnes et ses joueurs');
  { const r = (await comme('anon', 'select public.fournil_vu(p_id => $1, p_jeton => $2) as r', [fj.id, fj.jeton]))[0].r; check(r.ok === true, 'et il marche toujours (fournil_vu en tant qu’anon)'); }
  {
    const db2 = await base(PGlite);
    let ok = true; try { await db2.exec('set role proprio'); await db2.exec(SQL); await db2.exec('reset role'); } catch (err) { ok = false; console.log('    ' + err.message); }
    const n = ok ? (await db2.query(`select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'fournil%'`)).rows[0].n : -1;
    check(ok && n === 0, 'il s’installe aussi sur une base SANS le Fournil (il n’en utilise aucune fonction)');
    await db2.close();
  }
  await vider();

  // ─── 2. la structure et les droits ───
  titre('structure et droits');
  const JEU = ['poncin_classement', 'poncin_publier', 'poncin_retirer', 'poncin_vu'];
  const INTERNES = ['poncin_bornes', 'poncin_empreinte', 'poncin_jeton_valable', 'poncin_jour', 'poncin_lundi', 'poncin_maintenant', 'poncin_pseudo_propre', 'poncin_reponse'];
  {
    const cols = await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'poncin_joueurs' order by ordinal_position`);
    check(cols.map((c) => c.c).join() === 'id,jeton,pseudo,cree,maj,vu,partie_maj,semaine,pieces,parties,extractions,jour,parties_jour,record,total,parties_total,extractions_total', `poncin_joueurs : ${cols.length} colonnes (${cols.map((c) => c.c).join(', ')})`);
    const colsP = (await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'poncin_portes' order by ordinal_position`)).map((c) => c.c).join();
    check(colsP === 'empreinte,quand', `poncin_portes : une empreinte et une heure seulement (${colsP})`);
    const idx = await sup(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'poncin_joueurs'`);
    check(idx.some((i) => /UNIQUE/.test(i.indexdef) && /lower\(pseudo\)/.test(i.indexdef)), 'index unique sur lower(pseudo)');
    for (const t of ['poncin_joueurs', 'poncin_portes']) {
      const rls = (await sup(`select relrowsecurity as r from pg_class where oid = $1::regclass`, ['public.' + t]))[0];
      const pol = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = $1`, [t]))[0].n;
      const droits = await sup(`select r.rolname as role, p.priv from (values ('anon'), ('authenticated'), ('public')) r(rolname), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) where has_table_privilege(r.rolname, $1, p.priv)`, ['public.' + t]);
      check(rls && rls.r === true && pol === 0 && droits.length === 0, `${t} : sécurité ligne par ligne sans aucune règle, aucun droit pour anon, authenticated ni PUBLIC${droits.length ? ' : ' + droits.map((d) => d.role + ' ' + d.priv).join(', ') : ''}`);
    }
    // une règle ajoutée à la main est retirée au recollage
    await sup(`create policy tout_voir on public.poncin_joueurs for select using (true)`); await sup('grant select on public.poncin_joueurs to anon');
    await coller(SQL); await installerHorloge();
    const pol = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'poncin_joueurs'`))[0].n;
    check(pol === 0 && !(await sup(`select has_table_privilege('anon', 'public.poncin_joueurs', 'SELECT') as d`))[0].d, 'une règle ou un droit ajoutés à la main sont retirés au recollage');
    const fns = await sup(`select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.provolatile as vol, array_to_string(p.proconfig, ',') as conf, p.proacl is null as acl_defaut,
        has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
        exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pour_public, pg_get_userbyid(p.proowner) as proprio
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'poncin%' order by 1`);
    check(json(fns.map((f) => f.nom)) === json([...JEU, ...INTERNES].sort()), `les fonctions, ni plus ni moins, une seule signature chacune (${fns.map((f) => f.nom.replace('poncin_', '')).join(', ')})`);
    const sig = Object.fromEntries(fns.map((f) => [f.nom, f.args]));
    check(sig.poncin_publier === 'p_id uuid, p_jeton text, p_pseudo text, p_valeur integer, p_primes integer, p_extrait boolean, p_bonus boolean, p_score integer' && sig.poncin_classement === 'p_periode text, p_id uuid, p_limite integer' && sig.poncin_vu === 'p_id uuid, p_jeton text' && sig.poncin_retirer === 'p_id uuid, p_jeton text', 'les signatures du contrat (noms et types des paramètres)');
    let bon = 0;
    for (const f of fns) {
      const jeu = JEU.includes(f.nom), p = (/search_path=""/.test(f.conf) || /search_path=''/.test(f.conf)) && !f.acl_defaut && !f.pour_public && f.proprio === 'proprio'
        && (jeu ? f.definer && f.anon && f.auth && (f.nom === 'poncin_classement' ? f.vol === 's' : f.vol === 'v') : !f.definer && !f.anon && !f.auth);
      if (p) bon++; else check(false, `${f.nom} : ${json(f)}`);
    }
    check(bon === fns.length, `chaque fonction : search_path fixé, droits explicites (rien pour PUBLIC), au propriétaire des tables ; les quatre du jeu SECURITY DEFINER et exécutables par anon et authenticated (poncin_classement en lecture seule), les ${INTERNES.length} internes interdites à anon et authenticated`);
    const corps = (await sup(`select prosrc from pg_proc where proname = 'poncin_publier' and pronamespace = 'public'::regnamespace`))[0].prosrc, sans = corps.replace(/--[^\n]*/g, '');
    check(/pg_catalog\.pg_advisory_xact_lock\(/.test(corps) && !/x-forwarded-for/i.test(sans) && /poncin_maintenant\(\)/.test(sans) && !/clock_timestamp|statement_timestamp|now\(\)/.test(sans) && !/execute\s/i.test(sans), 'poncin_publier : inscriptions une à une (verrou), jamais x-forwarded-for, seulement l’heure du serveur (poncin_maintenant), aucun SQL dynamique');
    const internes = await Promise.all(['select public.poncin_bornes()', 'select public.poncin_maintenant()', `select public.poncin_empreinte('x')`, `select public.poncin_reponse(null, null, current_date, current_date)`].map((s) => refus('anon', s)));
    check(internes.every((c) => c === '42501'), `anon ne peut appeler aucune fonction interne (${internes.join(', ')})`);
  }

  // ─── 3. les bornes : recalculées depuis les règles du jeu ───
  titre('les bornes de plausibilité');
  const BO = (await sup('select (public.poncin_bornes()).*'))[0];
  {
    const X = R.MODES.extraction, parCase = Math.max(...B.LISTE.map((v) => v.valeur / v.cases)), dmax = Math.max(...X.durees);
    const valeur = B.SAC.max * parCase;
    const primes = (Math.floor((dmax - X.prime.premier) / X.prime.periode) + 1) * X.prime.max;
    const robots = X.gardiens.plafond + X.largage.gardes + Math.max(...Object.values(X.boss.nRenforts));
    const points = (robots - 1) * B.POINTS.gardien + X.boss.points + Math.floor(dmax / 5) * B.POINTS.joueur;
    const calc = { valeur_max: valeur, primes_max: primes, points_max: points, score_max: valeur + primes + points, gain_max: Math.round((valeur + primes) * (1 + B.BONUS_SEMAINE)), ecart: 120, parties_jour: 60 };
    check(json(BO) === json(calc), `poncin_bornes() = ce que donnent regles.js et butin.js : ${json(BO)}`);
    check(Number.isInteger(valeur) && B.effets({ sac: 99 }).cases <= B.SAC.max && B.sacVide(99).cases === B.SAC.max, `le sac : ${B.SAC.max} cases au plus (amélioration au maximum : ${B.effets({ sac: 99 }).cases}), ${parCase} pièces la case au mieux`);
    check(Math.min(...X.durees) * X.extraction.ouvre > BO.ecart, `une partie qui sort dure au moins ${Math.min(...X.durees) * X.extraction.ouvre} s (la sortie s'ouvre à mi-partie) : l'écart de ${BO.ecart} s ne gêne jamais un joueur honnête`);
    check(C.BORNES.valeur === BO.valeur_max && C.BORNES.primes === BO.primes_max && C.BORNES.score === BO.score_max && C.BORNES.gain === BO.gain_max && C.BORNES.ecart === BO.ecart && C.BORNES.partiesJour === BO.parties_jour && C.BORNES.bonus === B.BONUS_SEMAINE, 'PCLASSEMENT.BORNES (le téléphone) = poncin_bornes() (le serveur)');
  }

  // ─── 4. publier ───
  titre('publier une partie');
  const lea = joueur();
  {
    const l = partie(380 + 45, 60, true, true, 380 + 45 + 60 + 30);
    const r = await publier(lea, 'Léa', l);
    const attendu = Math.round((380 + 45 + 60) * 1.25), deposer = B.deposer(B.coffreVide(), { objets: ['calice', 'montre'], extrait: true, primes: 60, zoneSemaine: true, score: l.score }).gain;
    check(r.ok === true && r.erreur === null && r.version === 1 && r.semaine === '2026-10-12', `inscription avec sa première partie : ok, semaine du lundi 12 octobre (${json(r)})`);
    check(r.compte && r.compte.pieces === attendu && attendu === deposer && r.compte.pieces === C.gainDe({ extrait: true, valeur: l.valeur, primes: l.primes, zoneSemaine: true }) && r.compte.score === l.score && r.compte.record === true, `les pièces comptées : (425 + 60) × 1,25 = ${attendu} = PBUTIN.deposer = PCLASSEMENT.gainDe ; nouveau record ${l.score}`);
    const x = await ligne(lea.id);
    check(x.pieces === attendu && x.parties === 1 && x.extractions === 1 && x.record === l.score && x.total === attendu && x.parties_jour === 1 && x.jeton === sha(lea.jeton) && x.jeton !== lea.jeton, 'la ligne : pièces, parties, extractions, record, total ; le jeton gardé en empreinte sha256 seulement');
    check(r.rang_semaine === 1 && r.rang_records === 1 && r.joueurs_semaine === 1 && r.joueurs === 1 && r.pieces === attendu && r.parties === 1 && r.record === l.score && r.total === attendu && r.parties_jour === 1, 'la réponse : ses rangs et ses compteurs');
    await avancer(60);
    const avantTv = json(await ligne(lea.id)), tv = await publier(lea, 'Léa', partie(100, 0, true, false, 100));
    check(tv.ok === false && tv.erreur === 'trop_vite' && tv.rang_semaine === 1 && tv.pieces === attendu && json(await ligne(lea.id)) === avantTv, '60 s plus tard, une autre partie : « trop_vite », rien ne change (ses rangs sont redonnés)');
    await avancer(61);
    const r2 = await publier(lea, 'Léa', partie(0, 0, false, true, 40));
    const x2 = await ligne(lea.id);
    check(r2.ok && r2.compte.pieces === 0 && r2.compte.record === false && x2.parties === 2 && x2.extractions === 1 && x2.pieces === attendu && x2.record === l.score && x2.parties_jour === 2, '121 s après la première : comptée ; pas sortie (bonus ou non) : 0 pièce, une partie de plus, pas d’extraction, le record ne baisse pas');
    await avancer(5);
    const rn0 = await publier(lea, 'Léa la Rapide', null);
    await avancer(6);
    const avantRn = await ligne(lea.id), rn = await publier(lea, 'Léa la Rapide', null), rn2 = await publier(lea, 'Léa', null), apresRn = await ligne(lea.id);
    check(rn0.erreur === 'trop_vite' && rn.ok && rn.compte === null && apresRn.pseudo === 'Léa la Rapide' && apresRn.parties === avantRn.parties && apresRn.pieces === avantRn.pieces && rn2.erreur === 'trop_vite', 'un pseudo seul (sans partie) : pas dans les 10 s d’un envoi accepté (« trop_vite ») ; ensuite renommée, rien compté ; un autre dans les 10 s : « trop_vite »');
    await avancer(130);
    const r3 = await publier(lea, 'Léa', partie(3040, 5750, true, true, 12770));
    check(r3.ok && r3.compte.pieces === BO.gain_max && r3.compte.record === true, `aux bornes exactes (3 040 + 5 750, zone de la semaine, score 12 770) : accepté, ${BO.gain_max} pièces`);
  }
  titre('la borne de valeur et les jetons');
  {
    const tom = joueur();
    await publier(tom, 'Tom', partie(100, 0, true, false, 100)); await avancer(200);
    const photo = json(await ligne(tom.id));
    const mauvaises = [['valeur au-delà du sac plein', partie(3041, 0, true, false, 3041)], ['primes au-delà', partie(0, 5751, true, false, 5751)], ['score au-delà', partie(0, 0, true, false, 12771)],
      ['valeur négative', partie(-1, 0, true, false, 0)], ['primes négatives', partie(10, -5, true, false, 10)], ['score sous valeur + primes', partie(300, 50, true, false, 349)],
      ['pas sorti mais de la valeur', partie(10, 0, false, false, 10)], ['pas sorti mais une prime', partie(0, 25, false, false, 25)],
      ['une ligne à moitié (sans score)', partie(10, 0, true, false, null)], ['une ligne à moitié (sans « extrait »)', partie(10, 0, null, false, 10)]];
    const res = []; for (const [, l] of mauvaises) res.push(await publier(tom, 'Tom', l));
    check(res.every((r) => r.ok === false && r.erreur === 'valeur' && r.compte === null) && json(await ligne(tom.id)) === photo, `« valeur », rien ne change : ${mauvaises.map(([n]) => n).join(' ; ')}`);
    const deb = await refus('anon', 'select public.poncin_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_valeur => $4, p_primes => 0, p_extrait => true, p_score => 10)', [tom.id, tom.jeton, 'Tom', '99999999999']);
    const flo = await refus('anon', 'select public.poncin_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_valeur => $4, p_primes => 0, p_extrait => true, p_score => 10)', [tom.id, tom.jeton, 'Tom', '12.5']);
    check(deb === '22003' && flo === '22P02' && json(await ligne(tom.id)) === photo, `un nombre hors des entiers, ou à virgule : refusé par le type (${deb}, ${flo})`);
    const autre = { id: tom.id, jeton: joueur().jeton };
    const j1 = await publier(autre, 'Tom', partie(100, 0, true, false, 100)), j2 = await publier({ id: tom.id, jeton: 'court' }, 'Tom', null), j3 = await publier({ id: null, jeton: tom.jeton }, 'Tom', null), j4 = await publier({ id: tom.id, jeton: tom.jeton.toUpperCase() + "'" }, 'Tom', null);
    check([j1, j2, j3, j4].every((r) => r.ok === false && r.erreur === 'jeton') && json(await ligne(tom.id)) === photo, 'le jeton d’un autre, un jeton mal formé, pas d’identifiant : « jeton », rien ne change');
  }

  titre('le quota du jour');
  {
    await heure('2026-10-15T06:00:00Z'); // jeudi, 8 h à Paris
    const max = joueur(); let ok = 0;
    for (let i = 0; i < BO.parties_jour; i++) { const r = await publier(max, 'Marathon', partie(100, 0, true, false, 110)); if (r.ok) ok++; await avancer(121); }
    const q = await publier(max, 'Marathon', partie(100, 0, true, false, 110)), x = await ligne(max.id);
    check(ok === 60 && q.ok === false && q.erreur === 'quota' && q.parties_jour === 60 && x.parties === 60 && x.pieces === 6000, `60 parties dans la journée (une toutes les 121 s) : toutes comptées ; la 61e : « quota », rien ne change (${x.parties} parties, ${x.pieces} pièces)`);
    const rn = await publier(max, 'Marathon Man', null);
    check(rn.ok && (await ligne(max.id)).pseudo === 'Marathon Man', 'le quota ne bloque pas un changement de pseudo');
    await heure('2026-10-15T22:00:30Z'); // vendredi 0 h 00 à Paris
    const r = await publier(max, 'Marathon', partie(100, 0, true, false, 110)), x2 = await ligne(max.id);
    check(r.ok && x2.parties_jour === 1 && x2.jour === '2026-10-16' && x2.parties === 61, 'minuit à Paris : un nouveau jour, le quota repart (61e partie de la semaine comptée)');
  }
  await vider();

  // ─── 5. la semaine qui change, les records, en ligne ───
  titre('la semaine qui change (nuit de dimanche à lundi, au passage à l’heure d’hiver)');
  {
    const a = joueur(), b = joueur(), c = joueur();
    await heure('2026-10-24T22:30:00Z'); // dimanche 25 octobre, 0 h 30 à Paris (encore l'heure d'été) : la semaine du lundi 19
    await publier(a, 'Anna', partie(500, 0, true, false, 520));
    await heure('2026-10-25T21:30:00Z'); // dimanche 22 h 30 à Paris (heure d'hiver, UTC+1)
    await publier(b, 'Bruno', partie(300, 0, true, false, 310));
    await avancer(130); await publier(a, 'Anna', partie(200, 0, true, true, 230));
    const dim = await classement('semaine', a.id);
    check(dim.semaine === '2026-10-19' && dim.joueurs === 2 && dim.lignes[0].pseudo === 'Anna' && dim.lignes[0].pieces === 750 && dim.lignes[0].parties === 2 && dim.lignes[1].pieces === 300, `dimanche soir : la semaine du 19 octobre, Anna 750 pièces en 2 parties, Bruno 300 (${dim.lignes.map((l) => `${l.pseudo} ${l.pieces}`).join(', ')})`);
    await heure('2026-10-25T22:59:30Z'); // dimanche 23 h 59 min 30 à Paris
    check((await classement('semaine')).semaine === '2026-10-19', 'dimanche 23 h 59 : toujours la semaine du 19');
    await heure('2026-10-25T23:00:30Z'); // lundi 26 octobre, 0 h 00 min 30 à Paris
    const lun = await classement('semaine', a.id), rec = await classement('records', a.id);
    check(lun.semaine === '2026-10-26' && lun.joueurs === 0 && lun.lignes.length === 0 && lun.moi === null, 'lundi 0 h à Paris : une nouvelle semaine, vide');
    check(rec.joueurs === 2 && rec.moi.total === 750 && rec.moi.record === 520 && rec.moi.parties === 2, '« Records » garde tout : total, record, parties depuis l’arrivée');
    const r = await publier(a, 'Anna', partie(100, 0, true, false, 100)); await publier(c, 'Chloé', partie(0, 0, false, false, 10));
    const lun2 = await classement('semaine', a.id), xa = await ligne(a.id);
    check(r.ok && r.semaine === '2026-10-26' && r.pieces === 100 && r.parties === 1 && xa.total === 850 && xa.parties_total === 3 && lun2.joueurs === 2 && lun2.lignes[0].pseudo === 'Anna' && lun2.lignes[1].pseudo === 'Chloé' && lun2.lignes[1].pieces === 0,
      `la première partie de la semaine : ses compteurs repartent de zéro (100 pièces, 1 partie), le total continue (850) ; Chloé, 0 pièce, est classée aussi (${lun2.lignes.map((l) => `${l.rang} ${l.pseudo} ${l.pieces}`).join(', ')})`);
  }
  await vider();
  titre('les records');
  {
    await heure('2026-10-28T10:00:00Z');
    const js = [joueur(), joueur(), joueur(), joueur()], noms = ['Zoé', 'Yann', 'Xavier', 'Wanda'];
    const parts = [[partie(800, 0, true, false, 900)], [partie(800, 0, true, false, 900), partie(400, 0, true, false, 400)], [partie(300, 0, true, false, 330)], [partie(800, 0, true, false, 900)]];
    for (const [k, j] of js.entries()) for (const p of parts[k]) { await publier(j, noms[k], p); await avancer(125); }
    const r = await classement('records', js[2].id), s = await classement('semaine', js[2].id);
    const txt = r.lignes.map((l) => `${l.rang} ${l.pseudo} ${l.record}/${l.total}`).join(', ');
    check(txt === '1 Yann 900/1200, 2 Wanda 900/800, 2 Zoé 900/800, 4 Xavier 330/300', `rangés au meilleur score, puis au total ; ex æquo au même rang, puis par pseudo (${txt})`);
    check(r.moi && r.moi.rang === 4 && r.moi.record === 330 && s.lignes[0].pseudo === 'Yann' && s.lignes[0].pieces === 1200 && s.lignes[0].parties === 2, '« moi » ; la semaine, elle, est rangée aux pièces');
    const lim = await classement('records', js[2].id, 1), lim0 = await classement('records', null, 0), lim1000 = await classement('records', null, 1000);
    check(lim.lignes.length === 1 && lim.moi.rang === 4 && lim.joueurs === 4 && lim0.lignes.length === 1 && lim1000.lignes.length === 4, 'p_limite : 1 ligne, et « moi » quand même ; bornée entre 1 et 100');
    await avancer(125);
    const p = await publier(js[2], 'Xavier', partie(0, 0, true, false, 50));
    check(p.rang_records === 4 && p.rang_semaine === 4, `les rangs de la réponse sont ceux du classement (records ${p.rang_records}, semaine ${p.rang_semaine})`);
  }
  titre('en ligne');
  {
    const ids = (await sup('select id from public.poncin_joueurs')).length;
    await avancer(300);
    const c0 = await classement('semaine');
    check(c0.en_ligne_n === 0 && c0.lignes.every((l) => l.en_ligne === false), `5 minutes sans nouvelles : personne en ligne (${ids} joueurs)`);
    const zoe = (await sup(`select id from public.poncin_joueurs where pseudo = 'Zoé'`))[0].id;
    const lu = await sup(`select maj, pieces, parties from public.poncin_joueurs where id = $1`, [zoe]);
    // le vrai jeton de Zoé n'est pas connu ici : on rejoue avec un joueur neuf
    const v = joueur(); await publier(v, 'Vigie', partie(10, 0, true, false, 10)); await avancer(239);
    const c1 = await classement('semaine', v.id);
    check(c1.moi.en_ligne === true && c1.en_ligne_n === 1, 'une partie publiée : en ligne (encore 3 min 59 après)');
    await avancer(2);
    check((await classement('semaine', v.id)).moi.en_ligne === false, '4 minutes après : plus en ligne');
    const avantVu = await ligne(v.id), rv = await vu(v), apresVu = await ligne(v.id);
    check(rv.ok === true && (await classement('records', v.id)).moi.en_ligne === true && apresVu.parties === avantVu.parties && apresVu.pieces === avantVu.pieces && +apresVu.maj === +avantVu.maj, 'poncin_vu : de nouveau en ligne, sans rien compter (ni pièces, ni parties, ni maj)');
    const rv2 = await vu({ id: v.id, jeton: joueur().jeton }), rv3 = await vu(joueur()), rv4 = await vu({ id: v.id, jeton: 'x' });
    check(rv2.erreur === 'jeton' && rv3.erreur === 'inconnu' && rv4.erreur === 'jeton', 'le jeton d’un autre : « jeton » ; un inconnu : « inconnu » ; mal formé : « jeton »');
    check(json(await sup(`select maj, pieces, parties from public.poncin_joueurs where id = $1`, [zoe])) === json(lu), 'les autres lignes ne bougent pas');
  }

  // ─── 6. retirer, pseudos, injection ───
  titre('retirer, pseudos, injection');
  {
    await vider(); await avancer(3600);
    const m = joueur(), m2 = joueur();
    await publier(m, 'Marie', partie(50, 0, true, false, 50));
    const pris = await publier(m2, 'MARIE', partie(50, 0, true, false, 50)), pris2 = await publier(m2, '  marie ', null);
    check(pris.erreur === 'pseudo_pris' && pris2.erreur === 'pseudo_pris' && (await nb()) === 1, 'un pseudo pris, sans tenir compte des majuscules ni des espaces autour : « pseudo_pris », personne d’inscrit');
    const inval = [];
    for (const p of ['a', 'x'.repeat(17), '<script>', '...', '', null, 'Tom​', 'ǃǃ']) inval.push((await publier(m2, p, null)).erreur);
    check(inval.every((e) => e === 'pseudo_invalide'), `pseudos invalides (trop court, trop long, chevrons, que des points, vide, absent, caractère invisible, sosie de point d’exclamation) : ${inval.join(', ')}`);
    const z = await publier(m2, ' Zoé’s  Team ', null);
    check(z.ok && (await ligne(m2.id)).pseudo === "Zoé's Team", 'apostrophe typographique et espace insécable nettoyées (« Zoé\'s Team »)');
    const r1 = await retirer({ id: m.id, jeton: joueur().jeton });
    check(r1.ok === false && r1.erreur === 'jeton' && (await ligne(m.id)), 'retirer avec le jeton d’un autre : « jeton », la ligne reste');
    const r2 = await retirer(m), r3 = await retirer(m), r4 = await retirer({ id: m.id, jeton: '' });
    check(r2.ok && !(await ligne(m.id)) && r3.ok && r4.erreur === 'jeton', 'retirer : la ligne part ; encore : ok ; un jeton vide : « jeton »');
    await avancer(15);
    const libre = await publier(m2, 'Marie', null);
    check(libre.ok && (await ligne(m2.id)).pseudo === 'Marie', 'son pseudo est libre aussitôt');
    const n0 = await nb(), mechant = joueur();
    const i1 = await publier(mechant, "Bob'); drop table public.poncin_joueurs; --", partie(1, 0, true, false, 1));
    const i2 = await refus('anon', 'select public.poncin_classement(p_periode => $1)', ["semaine'; drop table public.poncin_joueurs; --"]);
    const i3 = await refus('anon', 'select public.poncin_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_valeur => $4)', [mechant.id, mechant.jeton, 'Bob', '1; drop table public.poncin_joueurs']);
    const i4 = await refus('anon', 'select public.poncin_vu(p_id => $1, p_jeton => $2)', ["'; delete from public.poncin_joueurs; --", mechant.jeton]);
    const i5 = await publier({ id: mechant.id, jeton: "' or '1'='1' --" + 'a'.repeat(40) }, 'Bob', null);
    check(i1.erreur === 'pseudo_invalide' && i2 === '22023' && i3 === '22P02' && i4 === '22P02' && i5.erreur === 'jeton' && (await nb()) === n0, `injection impossible : pseudo (« pseudo_invalide »), période (${i2}), nombre (${i3}), identifiant (${i4}), jeton (« jeton ») ; la table est intacte`);
    const directs = await Promise.all([
      refus('anon', 'select * from public.poncin_joueurs'), refus('anon', 'select * from public.poncin_portes'),
      refus('anon', `insert into public.poncin_joueurs (id, jeton, pseudo, cree, maj, semaine, jour) values (gen_random_uuid(), 'x', 'Pirate', now(), now(), current_date, current_date)`),
      refus('anon', `update public.poncin_joueurs set pieces = 1e9`), refus('anon', 'delete from public.poncin_joueurs'), refus('authenticated', 'select pseudo from public.poncin_joueurs'),
      refus('anon', 'truncate public.poncin_portes')]);
    check(directs.every((c) => c === '42501'), `l’accès direct aux tables est refusé (lire, écrire, modifier, effacer, vider ; anon et authenticated) : ${directs.join(', ')}`);
    const per = await refus('anon', 'select public.poncin_classement(p_periode => $1)', ['total']), per2 = await refus('anon', 'select public.poncin_classement(p_periode => null)');
    check(per === '22023' && per2 === '22023', 'une période inconnue : refusée (22023)');
  }

  // ─── 7. les inscriptions et le ménage ───
  titre('les limites d’inscription');
  {
    await vider(); await avancer(86400 * 2);
    await entetes({ 'cf-connecting-ip': '203.0.113.7' });
    let ok = 0; for (let i = 0; i < 10; i++) if ((await publier(joueur(), `Source ${i}`, null)).ok) ok++;
    const onze = await publier(joueur(), 'Source 10', null);
    check(ok === 10 && onze.erreur === 'trop_vite', `par source : 10 inscriptions dans l'heure, la 11e « trop_vite » (${onze.erreur})`);
    await entetes({ 'cf-connecting-ip': '203.0.113.8' });
    check((await publier(joueur(), 'Voisin', null)).ok, 'une autre adresse passe');
    await entetes({ 'cf-connecting-ip': '2001:db8:1:2::1' });
    let ok6 = 0; for (let i = 0; i < 10; i++) if ((await publier(joueur(), `Six ${i}`, null)).ok) ok6++;
    await entetes({ 'cf-connecting-ip': '2001:db8:1:2:ffff::9' });
    const six = await publier(joueur(), 'Six bis', null);
    check(ok6 === 10 && six.erreur === 'trop_vite', 'en IPv6, tout le bloc /64 compte ensemble');
    await entetes({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' });
    check((await publier(joueur(), 'Malin', null)).erreur === 'trop_vite', 'x-forwarded-for (que le téléphone remplit lui-même) ne change rien');
    await avancer(3700);
    await entetes({ 'cf-connecting-ip': '203.0.113.7' });
    let ok2 = 0; for (let i = 0; i < 11; i++) if ((await publier(joueur(), `Source b${i}`, null)).ok) ok2++;
    check(ok2 === 10, `une heure plus tard : 10 de plus, et pas une de plus (20 par jour) (${ok2})`);
    await avancer(86400);
    check((await publier(joueur(), 'Lendemain', null)).ok, 'le lendemain : de nouveau permis');
    await entetes(null);
    await vider(); await avancer(3600);
    let okC = 0; for (let i = 0; i < 61; i++) if ((await publier(joueur(), `Foule ${i}`, null)).ok) okC++;
    check(okC === 60, `pour tout le monde ensemble : 60 nouveaux joueurs par heure au plus (${okC})`);
    await vider();
    await sup(`insert into public.poncin_joueurs (id, jeton, pseudo, cree, maj, semaine, jour, parties_total) select gen_random_uuid(), 'x', 'Rempli ' || g, $1, $1, current_date, current_date, 1 from generate_series(1, 2000) g`, [new Date(horloge - 7200e3).toISOString()]);
    const plein = await publier(joueur(), 'En Trop', null);
    check(plein.erreur === 'complet', `2 000 joueurs : « complet » (${plein.erreur})`);
    await vider();
  }
  titre('le ménage');
  {
    await avancer(86400);
    const sansPartie = joueur(), unePartie = joueur(), vieux = joueur(), fidele = joueur(), appelant = joueur();
    await publier(sansPartie, 'Sans Partie', null); await publier(unePartie, 'Une Partie', partie(10, 0, true, false, 10));
    await publier(vieux, 'Vieux', partie(10, 0, true, false, 10)); await publier(fidele, 'Fidèle', partie(10, 0, true, false, 10)); await publier(appelant, 'Appelant', partie(10, 0, true, false, 10));
    await avancer(8 * 86400);
    await publier(appelant, 'Appelant', null);
    check(!(await ligne(sansPartie.id)) && (await ligne(unePartie.id)), 'au bout de 7 jours, une inscription sans aucune partie est effacée ; celle qui a joué reste');
    await avancer(60 * 86400); await vu(fidele); await avancer(30 * 86400);
    await publier(appelant, 'Appelant', null);
    check(!(await ligne(vieux.id)) && !(await ligne(unePartie.id)) && (await ligne(fidele.id)) && (await ligne(appelant.id)), '90 jours sans nouvelles : effacé ; un signe de vie (poncin_vu) garde la ligne ; celui qui appelle n’est jamais effacé');
    const re = await publier(vieux, 'Vieux', partie(20, 0, true, false, 20)), xv = await ligne(vieux.id);
    check(re.ok && xv.total === 20 && xv.parties_total === 1, 'l’effacé revient tout seul à sa partie suivante (il repart de zéro)');
  }

  // ─── 8. le contrat : le vrai module du téléphone, branché sur ce Postgres par un faux supabase-js ───
  titre('le contrat avec src-poncin/classement.js');
  {
    await vider(); await heure('2026-11-04T09:00:00Z');
    const params = Object.fromEntries((await sup(`select proname as n, pg_get_function_arguments(oid) as a from pg_proc where pronamespace = 'public'::regnamespace and proname in ('poncin_publier', 'poncin_classement', 'poncin_vu', 'poncin_retirer')`)).map((x) => [x.n, x.a.split(', ').map((s) => s.split(' ')[0])]));
    const appels = [];
    const lib = { createClient: () => ({ rpc: async (nom, args) => {
      appels.push({ nom, args });
      if (!/^poncin_[a-z]+$/.test(nom) || !params[nom]) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 };
      const ks = Object.keys(args); if (!ks.every((k) => /^p_[a-z]+$/.test(k))) return { data: null, error: { message: 'paramètre' }, status: 400 };
      try { return { data: (await comme('anon', `select public.${nom}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, ks.map((k) => args[k])))[0].r, error: null, status: 200 }; } catch (err) { return { data: null, error: { code: err.code, message: err.message }, status: 400 }; }
    } }) };
    const store = new Map(), stockage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    const tel = C.creer({ config: { supabaseUrl: 'https://banc.supabase.co', supabaseKey: 'sb_publishable_banc' }, supabase: lib, stockage, maintenant: () => horloge });
    const l = { id: 'moi', extrait: true, zoneSemaine: true, objets: ['lingot', 'pendule'], valeur: 385, primes: 25, points: 40, score: 450 };
    const p = await tel.publier(l, { pseudo: 'Bouquetin Express 42' });
    check(p.ok && p.compte.pieces === C.gainDe(l) && p.compte.pieces === B.deposer(B.coffreVide(), l).gain && !p.ecart && p.pseudo === 'Bouquetin 42' && p.semaine.rang === 1 && p.records.record === 450, `publier(ligne, { pseudo }) : inscrit, ${p.compte.pieces} pièces comptées par le serveur = gainDe = PBUTIN.deposer`);
    check(appels.every((a) => Object.keys(a.args).every((k) => params[a.nom].includes(k))), 'chaque paramètre envoyé par le téléphone existe dans la fonction SQL');
    const tv = await tel.publier(l, {});
    check(tv.ok === false && tv.erreur === 'trop_vite' && tv.semaine.pieces === p.compte.pieces, 'aussitôt une autre : « trop_vite » remonte tel quel, avec ses compteurs');
    const s = await tel.lire('semaine'), r = await tel.lire('records');
    check(s.ok && s.semaine === '2026-11-02' && s.lignes.length === 1 && s.lignes[0].moi && s.lignes[0].enLigne && s.moi.rang === 1 && r.ok && r.lignes[0].record === 450 && r.lignes[0].pseudo === 'Bouquetin 42', `lire('semaine') et lire('records') : ma ligne, en ligne (${JSON.stringify(s.lignes[0])})`);
    await heure(horloge + 300e3);
    const v = await tel.vu(), s2 = await tel.lire('semaine');
    check(v.ok && s2.moi.enLigne === true, 'vu() : en ligne de nouveau, 5 min après');
    await heure(horloge + 125e3);
    const p2 = await tel.publier({ extrait: false, zoneSemaine: false, objets: [], valeur: 0, primes: 0, points: 10, score: 10 }, {});
    check(p2.ok && p2.compte.pieces === 0 && p2.semaine.parties === 2 && p2.semaine.extractions === 1, 'une partie perdue : comptée, 0 pièce');
    const d = await tel.retirer();
    check(d.ok && (await nb()) === 0 && !JSON.parse(store.get('poncin.classement')).id, 'retirer() : plus rien sur le serveur, l’identité oubliée');
    const pi = await C.creer({ config: { supabaseUrl: 'https://banc.supabase.co', supabaseKey: 'k' }, supabase: { createClient: () => ({ rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.poncin_publier' }, status: 404 }) }) } }).publier(l, { pseudo: 'Tom' });
    check(pi.erreur === 'pas-installe', 'les fonctions pas encore collées : « pas-installe »');
  }

  // ─── 9. aucune réponse ne laisse fuir un secret ───
  titre('aucun secret dans les réponses');
  {
    const tout = JSON.stringify(reponses), cles = new Set(); const parcourir = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { cles.add(k); parcourir(v); } }; reponses.forEach(parcourir);
    const interdits = ['id', 'jeton', 'empreinte', 'vu', 'maj', 'cree', 'partie_maj'].filter((k) => cles.has(k));
    check(reponses.length > 100 && !interdits.length && !/[0-9a-f]{64}/.test(tout) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(tout), `${reponses.length} réponses : jamais d'identifiant, de jeton, d'empreinte ni d'heure (clés vues : ${[...cles].sort().join(', ')})`);
  }

  console.log(`\n${oks} ok, ${fails} en échec`);
  await db.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('  FAIL exception : ' + (e && e.stack || e)); process.exit(1); });
