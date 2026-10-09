#!/usr/bin/env node
// Le Fournil : le SQL du classement (supabase/fournil-classement.sql) éprouvé POUR DE VRAI dans un Postgres local :
// PGlite, Postgres compilé en WebAssembly (aucun serveur, aucune connexion à Supabase).
// On recrée les rôles de Supabase (anon, authenticated, un propriétaire qui n'est pas superutilisateur, et les droits par défaut
// très larges de Supabase), on colle le fichier tel quel (deux fois : il doit se recoller sans casse), puis on joue chaque fonction
// EN TANT QU'ANON, comme le téléphone d'un joueur : inscription, envois, mauvais jeton, pseudos, valeurs absurdes, trop vite,
// changements de semaine (nuit de dimanche à lundi à Paris, heure d'été / d'hiver), fortune qui baisse, triches sur « Cette
// semaine » (0 puis sa vraie fortune, partie effacée puis code rechargé), rangs et ex æquo, « moi » hors des 50 premiers,
// limites d'inscription (communes et par source, en-tête cf-connecting-ip simulé), ménage des lignes oubliées (7 et 90 jours),
// pseudos sosies, retrait, et l'accès direct aux tables, qui doit être refusé.
// Le temps est simulé : la fonction public.fournil_maintenant() est remplacée par une horloge de test.
//
// Lancement (PGlite n'est pas dans le dépôt) :
//   npm install --prefix /tmp/pglite --no-save @electric-sql/pglite@0.5.8
//   node test/fournil-classement-sql.cjs /tmp/pglite          (le dossier où PGlite est installé)
//   ou : NODE_PATH=/tmp/pglite/node_modules node test/fournil-classement-sql.cjs
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// ─── PGlite : le chemin donné en argument, sinon NODE_PATH ───
function chargerPGlite() {
  const arg = process.argv[2], essais = [];
  if (arg) { const a = path.resolve(arg); essais.push(path.join(a, 'node_modules', '@electric-sql', 'pglite'), path.join(a, '@electric-sql', 'pglite'), a); }
  essais.push('@electric-sql/pglite');
  for (const e of essais) { try { const m = require(e); if (m && m.PGlite) return m; } catch (err) { /* l'essai suivant */ } }
  console.log('  FAIL PGlite introuvable : installe @electric-sql/pglite (version exacte) hors du dépôt, puis donne son dossier en argument ou par NODE_PATH');
  process.exit(1);
}

let fails = 0, oks = 0; const lignes = [];
const check = (ok, msg) => { const l = (ok ? '  ok   ' : '  FAIL ') + msg; console.log(l); lignes.push(l); if (ok) oks++; else fails++; };
const titre = (t) => { const l = `── ${t} ──`; console.log(l); lignes.push(l); };
const U = (...cps) => String.fromCodePoint(...cps); // les caractères invisibles ou combinants, écrits sans ambiguïté
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const joueur = () => ({ id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex') });

(async () => {
  const { PGlite } = chargerPGlite();
  const db = await PGlite.create();
  const SQL = fs.readFileSync(process.env.FOURNIL_SQL || path.join(__dirname, '..', 'supabase', 'fournil-classement.sql'), 'utf8'); // FOURNIL_SQL : pour éprouver le test lui-même sur un fichier modifié
  const version = (await db.query('select version() as v')).rows[0].v;
  console.log(`Le Fournil — le SQL du classement dans ${version.split(' on ')[0]}`); lignes.push(version.split(' on ')[0]);

  // ─── les outils : requêtes en superutilisateur (le banc d'essai), ou sous un rôle (anon : le téléphone) ───
  const sup = async (sql, p) => (await db.query(sql, p)).rows;
  const comme = async (role, sql, p) => { await db.exec(`set role ${role}`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  const refus = async (role, sql, p) => { try { await comme(role, sql, p); return 'accepté'; } catch (e) { return e.code || e.message; } };
  const coller = async () => { await db.exec('set role proprio'); try { await db.exec(SQL); } finally { await db.exec('reset role'); } };

  // l'horloge simulée
  let horloge = Date.parse('2026-10-07T10:00:00Z'); // un mercredi, midi à Paris : la semaine du lundi 5 octobre
  const heure = async (quand) => { horloge = typeof quand === 'number' ? quand : Date.parse(quand); await sup('update banc.horloge set t = $1', [new Date(horloge).toISOString()]); };
  const avancer = (s) => heure(horloge + s * 1000);
  const installerHorloge = async () => {
    await sup(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`);
    await heure(horloge);
  };

  // les trois fonctions du jeu, appelées comme PostgREST le fait (paramètres nommés et typés)
  const publier = async (j, pseudo, fortune, role = 'anon') => (await comme(role, 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4) as r', [j.id, j.jeton, pseudo, fortune == null ? null : String(fortune)]))[0].r;
  const classement = async (periode, id = null, limite, role = 'anon') => (await comme(role, limite === undefined ? 'select public.fournil_classement(p_periode => $1, p_id => $2) as r' : 'select public.fournil_classement(p_periode => $1, p_id => $2, p_limite => $3) as r', limite === undefined ? [periode, id] : [periode, id, limite]))[0].r;
  const retirer = async (j, role = 'anon') => (await comme(role, 'select public.fournil_retirer(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r;
  const ligne = async (id) => (await sup('select pseudo, fortune, base_semaine, sommet, semaine::text as semaine, jeton, cree, maj, fortune::text as ftexte from public.fournil_joueurs where id = $1', [id]))[0] || null;
  const nb = async () => (await sup('select count(*)::int as n from public.fournil_joueurs'))[0].n;
  const vider = () => db.exec('delete from public.fournil_joueurs; delete from public.fournil_portes');
  // l'en-tête que PostgREST passe à Postgres (request.headers) : ici on le pose à la main, comme le ferait Cloudflare
  const entetes = (h) => sup(`select set_config('request.headers', $1, false)`, [h ? JSON.stringify(h) : '']);
  const semaineDe = async (id) => { const c = await classement('semaine', id); return c.moi ? c.moi.valeur : null; };
  const reponses = []; // toutes les réponses, pour vérifier qu'aucune ne laisse fuir un secret
  const garde = (r) => { reponses.push(r); return r; };

  // ─── 1. un Postgres « comme Supabase » ───
  titre('installation');
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    -- le propriétaire des objets, comme « postgres » chez Supabase : pas superutilisateur, pas de passe-droit sur la sécurité ligne par ligne
    create role proprio nologin createrole;
    grant usage, create on schema public to proprio;
    grant usage on schema public to anon, authenticated, service_role;
    -- les droits par défaut de Supabase : tout ce que le propriétaire crée dans public est ouvert à anon et authenticated
    set role proprio;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    reset role;
    -- l'horloge du banc d'essai, lisible par le propriétaire seulement
    create schema banc;
    create table banc.horloge (t timestamptz);
    insert into banc.horloge values (null);
    grant usage on schema banc to proprio;
    grant select on banc.horloge to proprio;
  `);
  try { await coller(); check(true, 'le fichier se colle tel quel (rôle propriétaire non superutilisateur, droits par défaut de Supabase)'); } catch (e) { check(false, 'le fichier se colle tel quel : ' + e.message); process.exit(1); }
  try { await coller(); check(true, 'il se recolle sans erreur (idempotent)'); } catch (e) { check(false, 'il se recolle sans erreur : ' + e.message); }
  await installerHorloge();

  // ─── 2. la structure et les droits ───
  async function structure(quand) {
    titre(`structure et droits (${quand})`);
    const cols = await sup(`select column_name as c, data_type as t, is_nullable as n from information_schema.columns where table_schema = 'public' and table_name = 'fournil_joueurs' order by ordinal_position`);
    const attendu = { id: 'uuid', jeton: 'text', pseudo: 'text', fortune: 'double precision', base_semaine: 'double precision', semaine: 'date', cree: 'timestamp with time zone', maj: 'timestamp with time zone', sommet: 'double precision' };
    check(cols.length === 9 && cols.every((c) => attendu[c.c] === c.t && c.n === 'NO'), `la table fournil_joueurs a les 9 colonnes du contrat (sommet compris), toutes « not null » (${cols.map((c) => c.c).join(', ')})`);
    const idx = await sup(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'fournil_joueurs'`);
    check(idx.some((i) => /UNIQUE/.test(i.indexdef) && /lower\(pseudo\)/.test(i.indexdef)), 'index unique sur lower(pseudo)');
    check(idx.some((i) => /UNIQUE/.test(i.indexdef) && /\(id\)/.test(i.indexdef)), 'clé primaire sur id');
    const rls = (await sup(`select relrowsecurity as r, relforcerowsecurity as f from pg_class where oid = 'public.fournil_joueurs'::regclass`))[0];
    const pol = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'fournil_joueurs'`))[0].n;
    check(rls.r === true && pol === 0, `sécurité ligne par ligne activée, sans aucune règle (${pol} règle)`);
    const droits = await sup(`select r.rolname as role, p.priv from (values ('anon'), ('authenticated')) r(rolname), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) where has_table_privilege(r.rolname, 'public.fournil_joueurs', p.priv)`);
    check(droits.length === 0, `aucun droit direct sur la table pour anon et authenticated${droits.length ? ' : ' + droits.map((d) => d.role + ' ' + d.priv).join(', ') : ''}`);
    const publicTable = (await sup(`select count(*)::int as n from pg_class c, aclexplode(c.relacl) a where c.oid = 'public.fournil_joueurs'::regclass and a.grantee = 0`))[0].n;
    check(publicTable === 0, 'aucun droit pour PUBLIC sur la table');
    // la table interne des portes (inscriptions par source) : aussi fermée
    const rlsP = (await sup(`select relrowsecurity as r from pg_class where oid = 'public.fournil_portes'::regclass`))[0];
    const polP = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'fournil_portes'`))[0].n;
    const droitsP = await sup(`select r.rolname as role, p.priv from (values ('anon'), ('authenticated'), ('public')) r(rolname), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) where has_table_privilege(r.rolname, 'public.fournil_portes', p.priv)`);
    check(rlsP && rlsP.r === true && polP === 0 && droitsP.length === 0, `fournil_portes : sécurité ligne par ligne sans règle, aucun droit pour anon, authenticated ni PUBLIC${droitsP.length ? ' : ' + droitsP.map((d) => d.role + ' ' + d.priv).join(', ') : ''}`);
    const colsP = await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'fournil_portes' order by ordinal_position`);
    check(colsP.map((c) => c.c).join() === 'empreinte,quand', `fournil_portes ne garde qu'une empreinte et une heure (${colsP.map((c) => c.c).join(', ')})`);
    const corps = (await sup(`select prosrc from pg_proc where proname = 'fournil_publier' and pronamespace = 'public'::regnamespace`))[0].prosrc;
    check(/pg_catalog\.pg_advisory_xact_lock\(/.test(corps), 'fournil_publier verrouille les inscriptions une à une (pg_advisory_xact_lock : les plafonds ne se contournent pas en rafale)');
    check(!/x-forwarded-for/i.test(corps.replace(/--[^\n]*/g, '')), 'fournil_publier ne lit jamais x-forwarded-for (le téléphone peut le remplir lui-même)');
    const fns = await sup(`select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, array_to_string(p.proconfig, ',') as conf, p.proacl is null as acl_defaut,
        has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
        exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pour_public, pg_get_userbyid(p.proowner) as proprio
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil%' order by 1`);
    const JEU = ['fournil_classement', 'fournil_publier', 'fournil_retirer'];
    for (const n of JEU) check(fns.filter((f) => f.nom === n).length === 1, `${n} existe une seule fois (pas de doublon de signature)`);
    const sig = Object.fromEntries(fns.map((f) => [f.nom, f.args]));
    check(sig.fournil_publier === 'p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision' && sig.fournil_classement === 'p_periode text, p_id uuid, p_limite integer' && sig.fournil_retirer === 'p_id uuid, p_jeton text', 'les signatures du contrat (noms et types des paramètres)');
    for (const f of fns) {
      const jeu = JEU.includes(f.nom);
      check(/search_path=""/.test(f.conf) || /search_path=''/.test(f.conf), `${f.nom} : search_path fixé (${f.conf})`);
      check(!f.acl_defaut && !f.pour_public, `${f.nom} : droits explicites, rien pour PUBLIC`);
      if (jeu) check(f.definer && f.anon && f.auth, `${f.nom} : SECURITY DEFINER, exécutable par anon et authenticated`);
      else check(!f.definer && !f.anon && !f.auth, `${f.nom} (interne) : ni anon ni authenticated ne peuvent l'appeler`);
      check(f.proprio === 'proprio', `${f.nom} appartient au propriétaire de la table`);
    }
  }
  await structure('premier collage');

  // ─── 3. l'inscription ───
  titre('inscription et envois');
  const A = joueur();
  let r = garde(await publier(A, 'Marie', 1000));
  check(r.ok === true && r.erreur === null && r.rang_total === 1 && r.rang_semaine === 1 && r.joueurs === 1 && r.joueurs_total === 1 && r.joueurs_semaine === 1 && r.semaine === '2026-10-05', `premier envoi : inscrite, 1re cette semaine et de tous les temps (${JSON.stringify(r)})`);
  let l = await ligne(A.id);
  check(l && l.pseudo === 'Marie' && l.fortune === 1000 && l.base_semaine === 1000 && l.semaine === '2026-10-05', 'la ligne : pseudo, fortune, base de la semaine = fortune, lundi 5 octobre');
  check(l && l.jeton === sha(A.jeton) && l.jeton !== A.jeton && /^[0-9a-f]{64}$/.test(l.jeton), 'seule l’empreinte sha256 du jeton est gardée, jamais le jeton');
  r = garde(await classement('semaine'));
  check(r.semaine === '2026-10-05' && r.joueurs === 1 && r.lignes.length === 1 && r.lignes[0].valeur === 0 && r.moi === null, 'classement de la semaine : elle y est, avec 0 € gagné depuis son inscription, « moi » vide sans identifiant');
  r = garde(await classement('total', A.id));
  check(r.lignes[0].pseudo === 'Marie' && r.lignes[0].valeur === 1000 && r.lignes[0].rang === 1 && r.lignes[0].moi === true && r.moi && r.moi.rang === 1 && r.moi.valeur === 1000, 'classement de tous les temps : 1 000 €, marquée « moi »');

  // ─── 4. trop vite ───
  titre('au plus un envoi toutes les 10 secondes');
  const majAvant = (await ligne(A.id)).maj;
  await avancer(5);
  r = garde(await publier(A, 'Marie', 2000));
  l = await ligne(A.id);
  check(r.ok === false && r.erreur === 'trop_vite' && r.rang_total === 1 && l.fortune === 1000 && +l.maj === +majAvant, '5 s après : « trop_vite », rien ne change (ses rangs sont quand même rendus)');
  await avancer(4.999);
  r = await publier(A, 'Marie', 2000);
  check(r.erreur === 'trop_vite', '9,999 s après : encore « trop_vite »');
  await avancer(0.001);
  r = garde(await publier(A, 'Marie', 2000));
  l = await ligne(A.id);
  check(r.ok === true && l.fortune === 2000 && l.base_semaine === 1000, '10 s pile : pris en compte (2 000 €, la semaine compte 1 000 € gagnés)');
  r = await classement('semaine');
  check(r.lignes[0].valeur === 1000, 'classement de la semaine : 1 000 € (fortune − base de la semaine)');
  const B0 = joueur();
  r = await publier(B0, 'Basile', 10);
  check(r.ok === true, 'la limite est par joueur : un autre joueur publie aussitôt');

  // ─── 5. le jeton ───
  titre('le jeton protège chaque joueur');
  await avancer(11);
  const pirate = { id: A.id, jeton: crypto.randomBytes(32).toString('hex') };
  r = garde(await publier(pirate, 'Pirate', 9e20));
  l = await ligne(A.id);
  check(r.ok === false && r.erreur === 'jeton' && r.rang_total === null && l.pseudo === 'Marie' && l.fortune === 2000, 'le bon identifiant avec un autre jeton : « jeton », rien n’est écrasé');
  r = await publier({ id: A.id, jeton: A.jeton.toUpperCase() }, 'Marie', 3000);
  check(r.erreur === 'jeton', 'le même jeton en majuscules : refusé (comparaison exacte)');
  for (const [nom, j] of [['jeton trop court', { id: A.id, jeton: 'abc123' }], ['jeton absent', { id: A.id, jeton: null }], ['jeton avec des caractères bizarres', { id: A.id, jeton: "' or '1'='1" + 'x'.repeat(40) }], ['jeton trop long', { id: A.id, jeton: 'a'.repeat(129) }], ['identifiant absent', { id: null, jeton: A.jeton }]]) {
    r = await publier(j, 'Marie', 3000);
    check(r.ok === false && r.erreur === 'jeton', `${nom} : « jeton »`);
  }
  check((await ligne(A.id)).fortune === 2000 && await nb() === 2, 'toujours 2 joueurs, Marie intacte');

  // ─── 6. les pseudos ───
  titre('pseudos');
  for (const p of ['marie', 'MARIE', '  Marie ', 'mArIe']) {
    r = await publier(joueur(), p, 5);
    check(r.ok === false && r.erreur === 'pseudo_pris', `« ${p} » : pseudo_pris (sans tenir compte des majuscules ni des espaces autour)`);
  }
  const E = joueur();
  r = await publier(E, 'Éclair', 5);
  check(r.ok === true, '« Éclair » : accepté (accents)');
  r = await publier(joueur(), 'éclair', 5);
  check(r.erreur === 'pseudo_pris', '« éclair » : pseudo_pris (majuscule accentuée comprise)');
  const invalides = [['', 'vide'], ['   ', 'que des espaces'], ['a', '1 caractère'], [' a ', '1 caractère après nettoyage'], ['x'.repeat(17), '17 caractères'], ['<b>Bob</b>', 'balises'], ['Bob;', 'point-virgule'], ['a' + U(0x1F600), 'émoji'], ['...', 'que des points'], ['--', 'que des tirets'], ['Bob' + U(0x200B) + 'x', 'espace de largeur nulle'], ['Bo|b', 'barre verticale'], ['Bob"', 'guillemet'], ['Ana×2', 'signe ×'], [null, 'absent'], ['a'.repeat(65), 'très long'],
    ['Pau' + U(0x1C0), 'sosie de « Paul » (ǀ, U+01C0)'], ['Pau' + U(0x196), 'sosie de « Paul » (Ɩ, U+0196)'], ['Mar' + U(0x131) + 'e', 'sosie de « Marie » (i sans point)'],
    [U(0x1C3) + U(0x1C3), 'clics ǃǃ, faux points d’exclamation'], [U(0x1C2) + ' ' + U(0x1C2), 'ǂ ǂ'], [U(0x250) + 'bc', 'ɐ (latin étendu B)'],
    [U(0x140) + 'a', 'ŀ'], [U(0x17F) + 'a', 'ſ (s long)'], [U(0x149) + 'a', 'ŉ'], [U(0x138) + 'a', 'ĸ'], [U(0x133) + 'a', 'ĳ']];
  for (const [p, quoi] of invalides) {
    r = await publier(joueur(), p, 5);
    check(r.ok === false && r.erreur === 'pseudo_invalide', `pseudo ${quoi} : pseudo_invalide`);
  }
  check(await nb() === 3, 'aucun pseudo refusé n’a créé de ligne');
  const valides = [['Jean ' + U(9) + '  Pierre', 'Jean Pierre', 'blancs repliés'], ['L' + U(0x2019) + 'as du pain', "L'as du pain", 'apostrophe de l’iPhone'], ['Zoe' + U(0x301), 'Zoé', 'accent tapé en deux morceaux (NFC)'], ['é'.repeat(16), 'é'.repeat(16), '16 caractères accentués'], ["O'Brien_2.0-x", "O'Brien_2.0-x", 'ponctuation permise'], ['42', '42', 'que des chiffres'], ['Œuf' + U(0xA0) + 'Ÿ', 'Œuf Ÿ', 'Œ, Ÿ et espace insécable'],
    ['Łukasz', 'Łukasz', 'Ł (latin étendu A)'], ['Şeker', 'Şeker', 'Ş'], ['Œufs Brouillés', 'Œufs Brouillés', 'Œ et é'], ['Ÿvette', 'Ÿvette', 'Ÿ majuscule']];
  for (const [p, attendu, quoi] of valides) {
    const j = joueur(); await avancer(1);
    r = await publier(j, p, 5);
    l = await ligne(j.id);
    check(r.ok === true && l && l.pseudo === attendu, `pseudo ${quoi} : enregistré « ${l ? l.pseudo : '?'} »`);
  }
  r = await publier(joueur(), 'jean   PIERRE', 5);
  check(r.erreur === 'pseudo_pris', '« jean   PIERRE » : pris (« Jean Pierre » existe, après nettoyage)');
  await avancer(11);
  r = await publier(A, 'Marie-Lou', 2100);
  check(r.ok === true && (await ligne(A.id)).pseudo === 'Marie-Lou', 'changer de pseudo : Marie devient Marie-Lou');
  r = await publier(B0, 'marie-lou', 20);
  check(r.erreur === 'pseudo_pris' && (await ligne(B0.id)).pseudo === 'Basile', 'un autre ne peut pas prendre « marie-lou »');
  const M2 = joueur();
  r = await publier(M2, 'Marie', 5);
  check(r.ok === true, '« Marie », libérée, peut être reprise par un nouveau joueur');
  await avancer(11);
  r = await publier(A, 'MARIE-LOU', 2100);
  check(r.ok === true && (await ligne(A.id)).pseudo === 'MARIE-LOU', 'changer seulement les majuscules de son propre pseudo : accepté');
  await avancer(11);
  r = await publier(A, 'Marie', 2100);
  check(r.erreur === 'pseudo_pris' && (await ligne(A.id)).pseudo === 'MARIE-LOU', 'reprendre « Marie », désormais à un autre : pseudo_pris, rien ne change');

  // ─── 7. les valeurs absurdes ───
  titre('valeurs absurdes');
  await avancer(11);
  for (const [v, quoi] of [['NaN', 'NaN'], ['Infinity', 'infini'], ['-Infinity', 'moins l’infini'], ['-1', 'négative'], ['-1e-300', 'à peine négative'], ['1.0000001e24', 'au-dessus de la borne (1e24)'], ['1e300', 'énorme'], [null, 'absente']]) {
    r = await publier(A, 'MARIE-LOU', v);
    check(r.ok === false && r.erreur === 'valeur', `fortune ${quoi} : « valeur »`);
    r = await publier(joueur(), 'Tricheur' + Math.floor(Math.random() * 1e6), v);
    check(r.erreur === 'valeur', `fortune ${quoi} à l’inscription : « valeur »`);
  }
  l = await ligne(A.id);
  check(l.fortune === 2100 && await nb() === 15, 'rien n’a bougé, aucune ligne de tricheur');
  const Bord = joueur();
  r = await publier(Bord, 'Bord', '1e24');
  check(r.ok === true && (await ligne(Bord.id)).fortune === 1e24, 'exactement 1e24 : accepté (la borne est large : un an de jeu assidu ≈ 1e21)');
  check((await retirer(Bord)).ok === true, '(retiré)');
  const Zero = joueur();
  r = await publier(Zero, 'Zéro', '-0');
  check(r.ok === true && (await ligne(Zero.id)).ftexte === '0', '« −0 » devient 0');
  check((await retirer(Zero)).ok === true, '(retiré)');

  // ─── 8. les semaines, heure de Paris ───
  titre('semaines (lundi minuit, heure de Paris)');
  const lundi = async (iso) => (await sup('select public.fournil_lundi($1)::text as d', [iso]))[0].d;
  for (const [iso, attendu, quoi] of [
    ['2026-10-11T21:59:59Z', '2026-10-05', 'dimanche 11 oct. 23:59:59 à Paris (heure d’été)'],
    ['2026-10-11T22:00:00Z', '2026-10-12', 'lundi 12 oct. 00:00 à Paris, encore dimanche en temps universel'],
    ['2026-10-25T22:30:00Z', '2026-10-19', 'dimanche 25 oct. 23:30 à Paris, juste après le passage à l’heure d’hiver'],
    ['2026-10-25T22:59:59Z', '2026-10-19', 'dimanche 25 oct. 23:59:59 à Paris (heure d’hiver)'],
    ['2026-10-25T23:00:00Z', '2026-10-26', 'lundi 26 oct. 00:00 à Paris (heure d’hiver)'],
    ['2027-03-28T21:59:59Z', '2027-03-22', 'dimanche 28 mars 23:59:59 à Paris, le jour du passage à l’heure d’été'],
    ['2027-03-28T22:00:00Z', '2027-03-29', 'lundi 29 mars 00:00 à Paris (heure d’été)'],
    ['2027-03-28T22:30:00Z', '2027-03-29', 'lundi 29 mars 00:30 à Paris (encore dimanche avec l’heure d’hiver)'],
    ['2027-01-03T23:00:00Z', '2027-01-04', 'lundi 4 janvier 2027 00:00 (changement d’année)'],
    ['2027-01-03T22:59:59Z', '2026-12-28', 'dimanche 3 janvier 2027 23:59:59 : semaine du lundi 28 décembre'],
  ]) check(await lundi(iso) === attendu, `${quoi} → semaine du ${attendu}`);

  // le passage pour de vrai : Marie-Lou envoie dimanche soir, puis lundi
  await vider();
  const S = joueur(), T = joueur();
  await heure('2026-10-11T21:00:00Z');
  await publier(S, 'Sam', 1000); await publier(T, 'Tom', 500);
  await heure('2026-10-11T21:59:50Z'); // dimanche 23:59:50 à Paris
  r = await publier(S, 'Sam', 5000);
  check(r.ok && r.semaine === '2026-10-05' && (await ligne(S.id)).base_semaine === 1000, 'dimanche 23:59:50 : encore la semaine du 5 octobre (4 000 € gagnés)');
  await heure('2026-10-11T22:00:00Z'); // lundi 00:00 à Paris
  r = garde(await classement('semaine', S.id));
  check(r.semaine === '2026-10-12' && r.joueurs === 0 && r.lignes.length === 0 && r.moi === null, 'lundi 00:00 à Paris (22:00 UTC) : la nouvelle semaine est vide, personne n’a encore envoyé');
  r = await classement('total');
  check(r.joueurs === 2 && r.lignes[0].pseudo === 'Sam' && r.lignes[0].valeur === 5000, 'tous les temps : rien ne change au changement de semaine');
  await avancer(5);
  r = await publier(S, 'Sam', 5600);
  l = await ligne(S.id);
  check(r.ok && r.semaine === '2026-10-12' && r.rang_semaine === 1 && r.joueurs_semaine === 1 && r.joueurs === 2 && l.base_semaine === 5000 && l.semaine === '2026-10-12', 'premier envoi de la semaine : la base devient la fortune du dernier envoi (5 000 €)');
  r = await classement('semaine', S.id);
  check(r.lignes.length === 1 && r.lignes[0].valeur === 600 && r.moi && r.moi.valeur === 600, 'la semaine de Sam : 600 € ; Tom, qui n’a pas joué, n’y est pas');
  // le passage à l’heure d’hiver
  await heure('2026-10-25T22:59:00Z');
  r = await publier(S, 'Sam', 7000);
  check(r.ok && r.semaine === '2026-10-19' && (await ligne(S.id)).base_semaine === 5600, 'dimanche 25 oct. 23:59 (heure d’hiver) : semaine du 19, base = fortune du 12 (absent une semaine)');
  await heure('2026-10-25T23:00:30Z');
  r = await publier(S, 'Sam', 7100);
  l = await ligne(S.id);
  check(r.ok && r.semaine === '2026-10-26' && l.base_semaine === 7000 && l.semaine === '2026-10-26', 'lundi 26 oct. 00:00:30 à Paris : nouvelle semaine, 100 € gagnés');
  // le passage à l’heure d’été
  await heure('2027-03-28T21:59:00Z');
  r = await publier(S, 'Sam', 9000);
  check(r.ok && r.semaine === '2027-03-22' && (await ligne(S.id)).base_semaine === 7100, 'dimanche 28 mars 23:59 (heure d’été) : semaine du 22 mars, base = la fortune d’octobre (absent des mois)');
  await heure('2027-03-28T22:00:10Z');
  r = await publier(S, 'Sam', 9050);
  check(r.ok && r.semaine === '2027-03-29' && (await ligne(S.id)).base_semaine === 9000, 'lundi 29 mars 00:00:10 à Paris : nouvelle semaine');

  // ─── 9. une fortune qui baisse (sauvegarde effacée, nouveau téléphone) ───
  titre('fortune qui baisse');
  await avancer(11);
  r = await publier(S, 'Sam', 9030); l = await ligne(S.id);
  check(r.ok && l.fortune === 9030 && l.base_semaine === 9000, 'un peu moins mais au-dessus de la base : la semaine compte 30 €');
  await avancer(11);
  r = await publier(S, 'Sam', 200); l = await ligne(S.id);
  check(r.ok && l.fortune === 200 && l.base_semaine === 9000 && l.sommet === 9050, 'sauvegarde effacée (200 €) : fortune 200 €, la base de la semaine ne bouge pas (9 000 €), le plus haut reste 9 050 €');
  r = await classement('semaine', S.id);
  check(r.moi && r.moi.valeur === 0 && (await classement('total', S.id)).moi.valeur === 200, 'la semaine : 0 € (jamais en négatif) ; tous les temps : 200 €');
  await avancer(11);
  r = await publier(S, 'Sam', 260);
  check(await semaineDe(S.id) === 0 && (await classement('total', S.id)).moi.valeur === 260, 'puis elle remonte un peu : toujours 0 € cette semaine (en dessous de la base), 260 € en tout');
  await avancer(11);
  r = await publier(S, 'Sam', 9030);
  check(r.ok && await semaineDe(S.id) === 30, 'son code rechargé (9 030 €) : la semaine retrouve ses 30 €, pas un de plus');
  await avancer(11);
  r = await publier(S, 'Sam', 9100); l = await ligne(S.id);
  check(await semaineDe(S.id) === 100 && l.sommet === 9100, 'et elle continue normalement au-delà : 100 € cette semaine, nouveau plus haut 9 100 €');
  await avancer(11);
  r = await publier(S, 'Sam', 200);
  await heure('2027-04-05T08:00:00Z'); // la semaine suivante, avec moins que son plus haut
  r = await publier(S, 'Sam', 100); l = await ligne(S.id);
  check(r.ok && l.semaine === '2027-04-05' && l.base_semaine === 9100 && l.fortune === 100 && await semaineDe(S.id) === 0, 'nouvelle semaine avec une fortune plus basse : la base devient son plus haut (9 100 €), 0 € cette semaine');
  await avancer(11);
  r = await publier(S, 'Sam', 300);
  check(await semaineDe(S.id) === 0, 'regagner ce qu’on avait déjà ne compte pas pour la semaine (pour repartir de zéro : quitter puis rejoindre)');

  // ─── 9 bis. les triches sur « Cette semaine » ───
  titre('« Cette semaine » ne se gonfle pas');
  await vider();
  await heure('2026-10-05T08:00:00Z'); // lundi 5 octobre, 10 h à Paris
  const Ma = joueur(), Tr = joueur();
  await publier(Ma, 'Marie', 1e15); await publier(Tr, 'Tricheur', 1e15);
  await heure('2026-10-06T08:00:00Z'); // mardi
  await publier(Ma, 'Marie', 1.01e15);
  r = await publier(Tr, 'Tricheur', 0);
  check(r.ok && await semaineDe(Tr.id) === 0, 'le tricheur envoie 0 depuis la console : 0 € cette semaine');
  await avancer(11);
  r = await publier(Tr, 'Tricheur', 1e15);
  r = await classement('semaine');
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.valeur])) === JSON.stringify([[1, 'Marie', 1e13], [2, 'Tricheur', 0]]), `puis sa vraie fortune : 0 € gagnés, Marie reste 1re avec 1e13 € (${JSON.stringify(r.lignes.map((x) => x.pseudo + ' ' + x.valeur))})`);
  // d'une semaine sur l'autre : baisser le dimanche, remonter le lundi
  await heure('2026-10-11T21:00:00Z'); // dimanche 23 h à Paris
  await publier(Ma, 'Marie', 1.02e15);
  r = await publier(Tr, 'Tricheur', 0);
  await heure('2026-10-11T22:30:00Z'); // lundi 0 h 30 à Paris
  r = await publier(Tr, 'Tricheur', 1e15); l = await ligne(Tr.id);
  check(r.ok && l.semaine === '2026-10-12' && l.base_semaine === 1e15 && await semaineDe(Tr.id) === 0, 'baisser le dimanche puis remonter le lundi : la nouvelle semaine part de son plus haut, 0 € gagnés');
  r = await publier(Ma, 'Marie', 1.03e15);
  check(await semaineDe(Ma.id) === 1e13 && (await classement('semaine')).lignes[0].pseudo === 'Marie', 'Marie, honnête : 1e13 € cette semaine, 1re');
  // la partie effacée puis le code rechargé (Gaston et Honnête, 8 Md chacun lundi)
  await vider();
  await heure('2026-10-05T07:00:00Z');
  const Ga = joueur(), Ho = joueur();
  await publier(Ga, 'Gaston', 8e9); await publier(Ho, 'Honnête', 8e9);
  await heure('2026-10-06T07:00:00Z'); // mardi
  await publier(Ga, 'Gaston', 8.2e9); await publier(Ho, 'Honnête', 8.3e9);
  await heure('2026-10-06T18:00:00Z');
  r = await publier(Ga, 'Gaston', 0); // « Tout effacer » : la partie repart de 0, le classement est resté rejoint
  check(r.ok && await semaineDe(Ga.id) === 0, 'Gaston efface sa partie : 0 € cette semaine, jamais en négatif');
  await heure('2026-10-06T18:05:00Z');
  r = await publier(Ga, 'Gaston', 8.2e9); // il recharge son code
  r = await classement('semaine');
  const vu = r.lignes.map((x) => [x.rang, x.pseudo, Math.round(x.valeur / 1e6)]);
  check(JSON.stringify(vu) === JSON.stringify([[1, 'Honnête', 300], [2, 'Gaston', 200]]), `puis recharge son code : Honnête reste 1re (+300 M), Gaston retrouve ses +200 M et rien de plus (${JSON.stringify(vu)})`);
  r = await publier(Ho, 'Honnête', 8.3e9);
  check(r.rang_semaine === 1, 'la réponse de fournil_publier donne le même rang de la semaine que le classement');
  // les rangs de la semaine ne voient jamais de gain négatif (des lignes d’avant cette version, bricolées à la main)
  await sup(`update public.fournil_joueurs set base_semaine = fortune + 5e9 where id = $1`, [Ga.id]);
  r = await classement('semaine', Ga.id);
  check(r.moi && r.moi.valeur === 0 && r.lignes.every((x) => x.valeur >= 0), 'une base au-dessus de la fortune : la semaine affiche 0 €, jamais un gain négatif');

  // ─── 10. rangs et ex æquo ───
  titre('rangs et ex æquo');
  await vider();
  await heure('2027-04-07T10:00:00Z');
  const R1 = joueur(), R2 = joueur(), R3 = joueur(), R4 = joueur();
  await publier(R1, 'Rose', 100); await publier(R2, 'anatole', 100); await publier(R4, 'Victor', 300);
  r = await publier(R3, 'Zélie', 50);
  check(r.rang_total === 4 && r.rang_semaine === 1 && r.joueurs === 4 && r.joueurs_semaine === 4, `Zélie (50 €) : 4e de tous les temps ; cette semaine, tous ex æquo à 0 € (${r.rang_total}, ${r.rang_semaine})`);
  r = garde(await classement('total', R2.id));
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.valeur, x.moi])) === JSON.stringify([[1, 'Victor', 300, false], [2, 'anatole', 100, true], [2, 'Rose', 100, false], [4, 'Zélie', 50, false]]), `tous les temps : 1, 2, 2, 4 (ex æquo au même rang, puis par pseudo) — ${JSON.stringify(r.lignes.map((x) => x.rang + ' ' + x.pseudo))}`);
  check(r.moi && r.moi.rang === 2 && r.moi.valeur === 100, '« moi » (anatole) : 2e, 100 €');
  check(r.lignes.every((x) => Object.keys(x).sort().join() === 'moi,pseudo,rang,valeur'), 'chaque ligne : rang, pseudo, valeur, moi — rien d’autre');
  r = await classement('semaine');
  check(r.lignes.every((x) => x.rang === 1 && x.valeur === 0) && r.joueurs === 4, 'cette semaine : les 4 ex æquo, 1ers à 0 €');
  await avancer(11);
  await publier(R3, 'Zélie', 80); await publier(R1, 'Rose', 110); r = await publier(R2, 'anatole', 110);
  check(r.rang_semaine === 2 && r.rang_total === 2, `anatole : 2e ex æquo cette semaine (10 €) et de tous les temps (110 €) (${r.rang_semaine}, ${r.rang_total})`);
  r = await classement('semaine');
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.valeur])) === JSON.stringify([[1, 'Zélie', 30], [2, 'anatole', 10], [2, 'Rose', 10], [4, 'Victor', 0]]), `cette semaine : Zélie 30 €, anatole et Rose 10 €, Victor 0 € — ${JSON.stringify(r.lignes.map((x) => x.rang + ' ' + x.pseudo + ' ' + x.valeur))}`);
  r = await classement('total', crypto.randomUUID());
  check(r.moi === null && r.lignes.every((x) => x.moi === false), 'un identifiant inconnu : « moi » vide, aucune ligne marquée');

  // ─── 11. « moi » hors des 50 premiers, et la limite de lignes ───
  titre('« moi » hors des premiers, nombre de lignes');
  const foule = [];
  for (let k = 0; k < 56; k++) { await avancer(61); const j = joueur(); foule.push(j); r = await publier(j, `Boulanger ${k}`, 1e6 + k); if (!r.ok) break; }
  check(r.ok === true && await nb() === 60, `56 joueurs de plus, inscrits à une minute d'écart (60 en tout) (${JSON.stringify(r.erreur)})`);
  r = garde(await classement('total', R3.id));
  check(r.joueurs === 60 && r.lignes.length === 50 && !r.lignes.some((x) => x.moi) && r.moi && r.moi.rang === 60 && r.moi.valeur === 80, `Zélie, dernière : hors des 50 lignes, mais « moi » = 60e, 80 € (${JSON.stringify(r.moi)})`);
  check(r.lignes[0].pseudo === 'Boulanger 55' && r.lignes[0].rang === 1 && r.lignes[49].rang === 50, 'les 50 premiers, dans l’ordre');
  r = await classement('semaine', R3.id);
  check(r.joueurs === 60 && r.moi && r.moi.rang === 1 && r.moi.valeur === 30, `cette semaine, Zélie (30 € gagnés) est 1re devant les 56 nouveaux à 0 € (${JSON.stringify(r.moi)})`);
  for (const [lim, attendu] of [[0, 1], [-5, 1], [null, 50], [7, 7], [100, 60], [1000, 60]]) {
    r = await classement('total', null, lim);
    check(r.lignes.length === attendu, `p_limite = ${lim} → ${attendu} ligne(s)`);
  }
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, base_semaine, semaine, cree, maj)
             select gen_random_uuid(), md5(k::text), 'masse ' || k, k, 0, '2027-04-05', '2000-01-01', '2000-01-01' from generate_series(1, 80) k`);
  r = await classement('total', null, 1000);
  check(r.joueurs === 140 && r.lignes.length === 100, `140 joueurs, p_limite = 1000 → bornée à 100 lignes (${r.lignes.length})`);
  r = await refus('anon', `select public.fournil_classement('mois')`);
  check(r === '22023', `période inconnue : refusée (${r})`);
  r = await refus('anon', `select public.fournil_classement(null)`);
  check(r === '22023', `période absente : refusée (${r})`);

  // ─── 12. les garde-fous contre l'inondation ───
  titre('garde-fous : inscriptions par heure, joueurs au plus');
  await vider();
  await heure('2027-05-05T10:00:00Z');
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, base_semaine, semaine, cree, maj)
             select gen_random_uuid(), md5(k::text), 'récent ' || k, k, k, '2027-05-03', $1::timestamptz - interval '30 minutes', $1::timestamptz - interval '30 minutes' from generate_series(1, 59) k`, [new Date(horloge).toISOString()]);
  const N60 = joueur(), N61 = joueur();
  r = await publier(N60, 'Soixante', 5);
  check(r.ok === true, '59 inscriptions dans l’heure : la 60e passe');
  r = await publier(N61, 'Soixante-et-un', 5);
  check(r.ok === false && r.erreur === 'trop_vite' && !(await ligne(N61.id)), 'la 61e dans l’heure : « trop_vite », pas de ligne');
  r = await publier(N60, 'Soixante', 6);
  check(r.erreur === 'trop_vite', '(Soixante, inscrit à l’instant, attend ses 10 s)');
  await avancer(31 * 60);
  r = await publier(N61, 'Soixante-et-un', 5);
  check(r.ok === true, '31 minutes plus tard, les 59 premières ont plus d’une heure : la 61e passe');
  r = await publier(N60, 'Soixante', 7);
  check(r.ok === true, 'les joueurs déjà inscrits ne sont jamais bloqués par cette limite');
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, base_semaine, semaine, cree, maj)
             select gen_random_uuid(), md5(k::text), 'plein ' || k, k, k, '2027-05-03', $1::timestamptz - interval '2 hours', $1::timestamptz - interval '2 hours' from generate_series(1, 2000 - 61) k`, [new Date(horloge).toISOString()]);
  check(await nb() === 2000, '(2 000 joueurs)');
  const Trop = joueur();
  r = await publier(Trop, 'Le deux-millième-et-un', 5);
  r = await publier(Trop, 'Deuxmille1', 5);
  check(r.ok === false && r.erreur === 'complet' && await nb() === 2000, `2 000 joueurs : une nouvelle inscription répond « complet » (${r.erreur})`);
  await avancer(11);
  r = await publier(N60, 'Soixante', 8);
  check(r.ok === true && r.joueurs === 2000, 'un joueur déjà inscrit continue d’envoyer');
  await sup(`delete from public.fournil_joueurs where pseudo like 'plein %' or pseudo like 'récent %'`);

  // ─── 12 bis. les inscriptions par source (l'adresse que Cloudflare met dans cf-connecting-ip) ───
  titre('garde-fous : inscriptions par source');
  await vider();
  await heure('2027-05-20T08:00:00Z');
  const ROBOT = '203.0.113.7', robots = [];
  await entetes({ 'cf-connecting-ip': ROBOT, 'x-forwarded-for': '198.51.100.1' });
  for (let k = 0; k < 10; k++) { const j = joueur(); robots.push(j); r = await publier(j, `robot${k}`, 1e24); if (!r.ok) break; await avancer(1); }
  check(r.ok === true && await nb() === 10, `une même source : 10 inscriptions dans l’heure passent (${JSON.stringify(r.erreur)})`);
  r = await publier(joueur(), 'robot10', 1e24);
  check(r.ok === false && r.erreur === 'trop_vite' && await nb() === 10, 'la 11e de la même source dans l’heure : « trop_vite », pas de ligne');
  const portes = await sup('select empreinte from public.fournil_portes');
  check(portes.length === 10 && portes.every((x) => x.empreinte === sha('ip:' + ROBOT)) && !JSON.stringify(portes).includes(ROBOT), 'les portes ne gardent que l’empreinte de l’adresse, jamais l’adresse');
  await entetes({ 'cf-connecting-ip': ROBOT, 'x-forwarded-for': '192.0.2.' + 99 });
  r = await publier(joueur(), 'robot11', 1e24);
  check(r.erreur === 'trop_vite', 'changer x-forwarded-for (que le téléphone remplit lui-même) ne change rien : seule cf-connecting-ip compte');
  await entetes({ 'cf-connecting-ip': '198.51.100.23' });
  const Ami = joueur();
  r = await publier(Ami, 'Amie', 5);
  check(r.ok === true, 'une amie, depuis une autre source, s’inscrit aussitôt : le robot ne bloque plus les autres');
  await entetes({ 'cf-connecting-ip': ROBOT });
  check((await retirer(robots[0])).ok === true, '(le robot retire un de ses joueurs…)');
  r = await publier(joueur(), 'robot12', 1e24);
  check(r.erreur === 'trop_vite', '… sa place dans le compte de sa source ne se libère pas pour autant');
  await avancer(3600);
  for (let k = 0; k < 10; k++) { r = await publier(joueur(), `robot-b${k}`, 1e24); if (!r.ok) break; await avancer(1); }
  check(r.ok === true, 'une heure plus tard : 10 de plus (20 dans la journée)');
  await avancer(3600);
  r = await publier(joueur(), 'robot-c', 1e24);
  check(r.erreur === 'trop_vite', 'mais pas plus de 20 par source et par jour');
  await avancer(22 * 3600);
  r = await publier(joueur(), 'robot-d', 1e24);
  const resteP = (await sup('select count(*)::int as n from public.fournil_portes'))[0].n;
  check(r.ok === true && resteP === 11, `24 h après la première vague, la source peut de nouveau s’inscrire ; les portes de plus de 24 h sont effacées (restent la 2e vague et celle-ci : ${resteP})`);
  // IPv6 : un bloc /64 entier appartient d'ordinaire à une seule box ou un seul téléphone
  await vider();
  await entetes({ 'cf-connecting-ip': '2001:db8:aa:bb::1' });
  for (let k = 0; k < 10; k++) { r = await publier(joueur(), `v6-${k}`, 1); if (!r.ok) break; }
  check(r.ok === true, 'IPv6 : 10 inscriptions depuis 2001:db8:aa:bb::1');
  await entetes({ 'cf-connecting-ip': '2001:0db8:00aa:00bb:dead:beef:1234:5678' });
  r = await publier(joueur(), 'v6-autre-adresse', 1);
  check(r.erreur === 'trop_vite', 'une autre adresse du même bloc /64 (écrite autrement) : même compte, « trop_vite »');
  check((await sup('select count(distinct empreinte)::int as n, min(empreinte) as e from public.fournil_portes'))[0].e === sha('ip:2001:db8:aa:bb::/64'), 'l’empreinte est celle du bloc /64');
  await entetes({ 'cf-connecting-ip': '2001:db8:aa:cc::1' });
  r = await publier(joueur(), 'v6-voisin', 1);
  check(r.ok === true, 'un autre bloc /64 : compte à part');
  await entetes({ 'cf-connecting-ip': 'pas une adresse' });
  r = await publier(joueur(), 'illisible', 1);
  check(r.ok === true && (await sup('select count(*)::int as n from public.fournil_portes where empreinte = $1', [sha('ip:pas une adresse')]))[0].n === 1, 'une adresse illisible ne casse rien : comptée telle quelle');
  await entetes(null);
  await vider();
  const sans = [];
  for (let k = 0; k < 12; k++) { const j = joueur(); sans.push(j); r = await publier(j, `sans-en-tete-${k}`, 5); if (!r.ok) break; }
  check(r.ok === true && (await sup('select count(*)::int as n from public.fournil_portes'))[0].n === 0, 'sans en-tête cf-connecting-ip : pas de compte par source (seuls les plafonds communs jouent), rien dans les portes');
  await entetes({ 'x-forwarded-for': '203.0.113.7' });
  r = await publier(joueur(), 'xff-seul', 5);
  check(r.ok === true && (await sup('select count(*)::int as n from public.fournil_portes'))[0].n === 0, 'x-forwarded-for seul : ignoré');
  await entetes(null);

  // ─── 12 ter. le ménage : lignes oubliées depuis 90 jours, inscriptions jamais suivies depuis 7 jours ───
  titre('le ménage des lignes oubliées');
  await vider();
  await heure('2026-10-07T10:00:00Z');
  const Mo = joueur(), Pa = joueur(), Ve = joueur(), Fa = joueur();
  await publier(Mo, 'Marie', 1.01e15); await publier(Pa, 'Paul', 10); await publier(Fa, 'Fantôme', 7);
  await avancer(11);
  await publier(Mo, 'Marie', 1.01e15); // Marie a envoyé au moins deux fois : seule la règle des 90 jours la concerne
  await publier(Pa, 'Paul', 11);
  const majMarie = horloge;
  await heure(majMarie + 6 * 86400e3);
  await publier(Pa, 'Paul', 12);
  check(!!(await ligne(Fa.id)), 'une inscription jamais suivie d’un autre envoi : encore là au bout de 6 jours');
  await heure(majMarie + 8 * 86400e3);
  await publier(Pa, 'Paul', 13);
  check(!(await ligne(Fa.id)) && !!(await ligne(Mo.id)), 'au bout de 8 jours, elle est effacée au premier envoi d’un autre joueur ; Marie, qui a déjà envoyé, reste');
  await heure(majMarie + 89 * 86400e3);
  await publier(Pa, 'Paul', 20);
  check(!!(await ligne(Mo.id)) && (await classement('total')).lignes[0].pseudo === 'Marie', '89 jours sans nouvelles de Marie : elle reste dans « Tous les temps »');
  await heure(majMarie + 91 * 86400e3);
  r = await publier(Pa, 'Paul', 30);
  check(r.ok && !(await ligne(Mo.id)) && r.joueurs === 1, '91 jours : elle est effacée au premier envoi d’un autre joueur');
  r = await classement('total');
  check(!r.lignes.some((x) => x.pseudo === 'Marie'), 'sa ligne fantôme a quitté « Tous les temps »');
  await avancer(60);
  r = await publier(Mo, 'Marie', 2e15); l = await ligne(Mo.id);
  check(r.ok === true && l && l.fortune === 2e15 && l.base_semaine === 2e15 && l.jeton === sha(Mo.jeton), 'elle revient avec le même téléphone : réinscrite toute seule, même identité, sa fortune, sa semaine repart de zéro');
  check((await retirer(Mo)).ok === true, '(elle quitte le classement)');
  // son pseudo se libère, et s'il est repris pendant son absence, elle doit en choisir un autre
  await publier(Mo, 'Marie', 2e15);
  await avancer(11); await publier(Mo, 'Marie', 2e15);
  await heure(horloge + 91 * 86400e3);
  const Bea = joueur();
  r = await publier(Bea, 'MARIE', 5);
  check(r.ok === true && r.joueurs === 1, 'le pseudo d’une ligne oubliée se libère : une nouvelle venue le prend, le ménage se faisant dans le même envoi');
  await avancer(11);
  r = await publier(Mo, 'Marie', 3e15);
  check(r.ok === false && r.erreur === 'pseudo_pris' && !(await ligne(Mo.id)), 'Marie revient : « pseudo_pris » (le jeu lui en fait choisir un autre), aucune ligne');
  r = await publier(Mo, 'Marie B', 3e15);
  check(r.ok === true, 'avec un autre pseudo : réinscrite');
  // celui qui envoie n'est jamais effacé par son propre envoi
  await heure(horloge + 120 * 86400e3);
  const creeVe = await (async () => { await publier(Ve, 'Véronique', 1); await avancer(11); await publier(Ve, 'Véronique', 2); return (await ligne(Ve.id)).cree; })();
  await heure(horloge + 100 * 86400e3);
  r = await publier(Ve, 'Véronique', 50); l = await ligne(Ve.id);
  check(r.ok === true && l && +l.cree === +creeVe && l.semaine !== null && await nb() === 1, 'absente 100 jours, Véronique renvoie la première : elle garde sa ligne (son jeton la protège), les autres oubliés sont effacés');

  // ─── 13. le retrait ───
  titre('quitter le classement');
  await vider();
  await heure('2027-05-12T10:00:00Z');
  const Q = joueur(), Q2 = joueur();
  await publier(Q, 'Quentin', 500); await publier(Q2, 'Quitterie', 400);
  r = garde(await retirer({ id: Q.id, jeton: Q2.jeton }));
  check(r.ok === false && r.erreur === 'jeton' && !!(await ligne(Q.id)), 'retirer avec le jeton d’un autre : refusé, la ligne reste');
  r = await retirer({ id: Q.id, jeton: 'court' });
  check(r.ok === false && !!(await ligne(Q.id)), 'retirer avec un jeton mal formé : refusé');
  r = await retirer({ id: null, jeton: Q.jeton });
  check(r.ok === false, 'retirer sans identifiant : refusé');
  r = garde(await retirer(Q));
  check(r.ok === true && !(await ligne(Q.id)), 'retirer avec son jeton : la ligne est effacée');
  r = await classement('total');
  check(r.joueurs === 1 && !r.lignes.some((x) => x.pseudo === 'Quentin'), 'Quentin n’apparaît plus nulle part');
  r = await retirer(Q);
  check(r.ok === true, 'retirer deux fois : ok (déjà parti)');
  r = await publier(joueur(), 'quentin', 5);
  check(r.ok === true, 'son pseudo est libre à nouveau');
  await avancer(11);
  r = await publier(Q, 'Quentin2', 600);
  check(r.ok === true && (await ligne(Q.id)).base_semaine === 600, 'revenir plus tard avec le même téléphone : nouvelle inscription, la semaine repart de 0');

  // ─── 14. l'accès direct, refusé ───
  titre('accès direct refusé');
  for (const role of ['anon', 'authenticated']) {
    for (const [sql, quoi] of [
      ['select * from public.fournil_joueurs', 'lire la table'],
      ['select jeton from public.fournil_joueurs', 'lire les empreintes'],
      ['select count(*) from public.fournil_joueurs', 'compter les lignes'],
      [`insert into public.fournil_joueurs (id, jeton, pseudo, semaine) values (gen_random_uuid(), 'x', 'Intrus', current_date)`, 'insérer'],
      [`update public.fournil_joueurs set fortune = 1e20`, 'modifier'],
      ['delete from public.fournil_joueurs', 'effacer'],
      ['truncate public.fournil_joueurs', 'vider'],
      ['alter table public.fournil_joueurs disable row level security', 'désactiver la sécurité'],
      ['create policy tout on public.fournil_joueurs for select using (true)', 'ajouter une règle'],
      ['select public.fournil_maintenant()', 'appeler fournil_maintenant'],
      ['select public.fournil_lundi(now())', 'appeler fournil_lundi'],
      [`select public.fournil_pseudo_propre('x')`, 'appeler fournil_pseudo_propre'],
      [`select public.fournil_jeton_valable('x')`, 'appeler fournil_jeton_valable'],
      [`select public.fournil_empreinte('x')`, 'appeler fournil_empreinte'],
      [`select public.fournil_reponse(null, null, current_date)`, 'appeler fournil_reponse'],
    ]) {
      const e = await refus(role, sql);
      check(e === '42501', `${role} ne peut pas ${quoi} (${e})`);
    }
  }
  check(await nb() === 3, 'la table est intacte');
  r = await publier(joueur(), 'Robert\'); drop table public.fournil_joueurs;--', 5);
  check(r.erreur === 'pseudo_invalide' && await nb() === 3, 'injection dans le pseudo : simple pseudo invalide');
  const Lapo = joueur(); await avancer(1);
  r = await publier(Lapo, "L'as d'la miche", 5);
  check(r.ok === true && (await ligne(Lapo.id)).pseudo === "L'as d'la miche", 'les apostrophes sont gardées telles quelles');
  r = await refus('anon', `select public.fournil_classement('total''; delete from public.fournil_joueurs; --')`);
  check(r === '22023' && await nb() === 4, `injection dans la période : refusée, rien d’effacé (${r})`);

  // ─── 15. authenticated (un joueur connecté à un compte Supabase) ───
  titre('authenticated');
  const Au = joueur(); await avancer(1);
  r = await publier(Au, 'Connecté', 42, 'authenticated');
  const ra = await classement('total', Au.id, 10, 'authenticated');
  await avancer(11);
  const rr = await retirer(Au, 'authenticated');
  check(r.ok === true && ra.moi && ra.moi.valeur === 42 && rr.ok === true, 'authenticated peut publier, lire le classement et se retirer');

  // ─── 16. aucune réponse ne laisse fuir un secret ───
  titre('rien ne fuit');
  const tout = JSON.stringify(reponses), empreintes = (await sup('select jeton from public.fournil_joueurs')).map((x) => x.jeton);
  check(!/jeton"\s*:/.test(tout.replace(/"erreur":"jeton"/g, '')) && !/"id"\s*:/.test(tout), 'aucune réponse ne contient de champ « jeton » ni « id »');
  check(![A, B0, S, T, R1, R2, R3, R4, Q, Q2, Lapo].some((j) => tout.includes(j.id) || tout.includes(j.jeton) || tout.includes(sha(j.jeton))) && !empreintes.some((h) => tout.includes(h)), 'ni identifiant, ni jeton, ni empreinte dans les réponses');

  // ─── 17. le recoller, avec des joueurs dedans (et des réglages bricolés à la main entre-temps) ───
  titre('recoller le fichier');
  const avant = JSON.stringify(await sup('select id, jeton, pseudo, fortune, base_semaine, sommet, semaine, cree, maj from public.fournil_joueurs order by id'));
  await sup('create policy tout_le_monde on public.fournil_joueurs for select using (true)');
  await sup('grant select, insert on public.fournil_joueurs to anon');
  await sup('grant execute on function public.fournil_empreinte(text) to anon');
  try { await coller(); check(true, 'recollé sans erreur, avec des joueurs dans la table'); } catch (e) { check(false, 'recollé sans erreur : ' + e.message); }
  check(JSON.stringify(await sup('select id, jeton, pseudo, fortune, base_semaine, sommet, semaine, cree, maj from public.fournil_joueurs order by id')) === avant, 'les joueurs sont tous là, inchangés');
  check((await sup('select public.fournil_maintenant() = now() as v'))[0].v === true, 'l’heure redevient l’heure vraie (l’horloge de test est remplacée)');
  await structure('après recollage : la règle et les droits ajoutés à la main sont retirés');
  await installerHorloge();
  await avancer(11);
  r = await publier(Lapo, "L'as d'la miche", 50);
  check(r.ok === true, 'et tout remarche');

  // ─── le bilan ───
  const bilan = fails ? `${fails} échec(s), ${oks} ok` : `tout est bon (${oks} vérifications)`;
  console.log(`\n${bilan}`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Le Fournil — le SQL du classement (PGlite)\n\n**${bilan}**\n\n<details><summary>le détail</summary>\n\n\`\`\`\n${lignes.join('\n')}\n\`\`\`\n</details>\n\n`); } catch (e) { /* rien */ } }
  await db.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', e && e.stack || e); process.exit(1); });
