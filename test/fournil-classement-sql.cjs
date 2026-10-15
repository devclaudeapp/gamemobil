#!/usr/bin/env node
// Le Fournil : le SQL du classement (supabase/fournil-classement.sql) éprouvé POUR DE VRAI dans un Postgres local :
// PGlite, Postgres compilé en WebAssembly (aucun serveur, aucune connexion à Supabase).
// On recrée les rôles de Supabase (anon, authenticated, un propriétaire qui n'est pas superutilisateur, et les droits par défaut
// très larges de Supabase), on colle le fichier tel quel (par-dessus une table de la première version, puis une deuxième fois :
// il doit se recoller sans casse), puis on joue chaque fonction EN TANT QU'ANON, comme le téléphone d'un joueur :
//   · inscription (rien n'est compté : on part de zéro), envois, mauvais jeton, pseudos, valeurs absurdes, trop vite ;
//   · les gains PLAUSIBLES : un saut énorme n'est compté qu'à la borne, l'excès est perdu pour toujours, l'échelle de la borne
//     ne grandit pas avec un saut inventé, ni avec une énorme fortune d'arrivée (plafonnée à 1e20 €), envoyer souvent ne rapporte pas plus qu'envoyer une fois, la réserve plafonne à 24 h,
//     et l'enveloppe SQL est la même que son miroir en JavaScript ;
//   · des joueurs HONNÊTES de test/longevite.js rejoués à leur rythme réel (envois toutes les 5 min ou toutes les minutes) :
//     jamais plafonnés, même avec une enveloppe divisée par 3 ;
//   · les semaines (nuit de dimanche à lundi à Paris, heure d'été / d'hiver), fortune qui baisse, triches sur « Cette semaine » ;
//   · le palmarès (figé une fois, ex æquo, semaine sans joueur, joueur qui a sauté une semaine, semaine où personne n'est venu),
//     les récompenses, la toque du podium dans le classement, le retrait qui efface le palmarès, l'heure du serveur ;
//   · rangs et ex æquo, « moi » hors des 50 premiers, limites d'inscription (communes et par source), ménage (7 et 90 jours),
//     retrait, et l'accès direct aux tables, qui doit être refusé ;
//   · le contrat : le VRAI moteur du téléphone (src/classement.js) branché sur ce Postgres par un petit PostgREST, et les appels
//     de src/classement.js et src/horloge.js comparés aux signatures des fonctions SQL.
// Le temps est simulé : la fonction public.fournil_maintenant() est remplacée par une horloge de test.
//
// Lancement (PGlite n'est pas dans le dépôt) :
//   npm install --prefix /tmp/pglite --no-save @electric-sql/pglite@0.5.8
//   TZ=Europe/Paris node test/fournil-classement-sql.cjs /tmp/pglite          (le dossier où PGlite est installé)
//   ou : NODE_PATH=/tmp/pglite/node_modules node test/fournil-classement-sql.cjs
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CLM = require('../src/classement.js');
const LG_PROFILS = { assidu: '80 min', regulier: '36 min', occasionnel: '17 min' };
const V = 5; // la version du SQL éprouvé (supabase/fournil-classement.sql)

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
const check = (ok, msg) => { const l = (ok ? '  ok   ' : '  FAIL ') + msg; console.log(l); lignes.push(l); if (ok) oks++; else fails++; return ok; };
const titre = (t) => { const l = `── ${t} ──`; console.log(l); lignes.push(l); };
const U = (...cps) => String.fromCodePoint(...cps); // les caractères invisibles ou combinants, écrits sans ambiguïté
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const joueur = () => ({ id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex') });
const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const e = (x) => Number(x).toExponential(2);

// ─── le miroir JavaScript de l'enveloppe (partie 3 du SQL), avec les paliers lus dans le fichier ───
function enveloppe(points) {
  const net = (b) => (Math.abs(b - 1) < 1e-9 ? 1 : Math.abs(b) < 1e-9 ? 0 : b);
  const n = points.length, segs = [{ de: 0, a: Math.pow(10, points[0][0]), b: 0, c: Math.pow(10, points[0][1]) }];
  for (let k = 1; k <= n; k++) {
    const j = Math.min(k, n - 1), b = net((points[j][1] - points[j - 1][1]) / (points[j][0] - points[j - 1][0]));
    segs.push({ de: Math.pow(10, points[k - 1][0]), a: k < n ? Math.pow(10, points[k][0]) : Infinity, b, c: Math.pow(10, points[k - 1][1] - b * points[k - 1][0]) });
  }
  const t1 = (s, x, y) => (s.b === 1 ? Math.log(y / x) / s.c : (Math.pow(y, 1 - s.b) - Math.pow(x, 1 - s.b)) / ((1 - s.b) * s.c));
  const duree = (x, y) => { let t = 0; if (!(y > x)) return 0; for (const s of segs) { if (x >= s.a) continue; if (y <= s.de) break; t += t1(s, Math.max(x, s.de), Math.min(y, s.a)); } return t; };
  const borne = (x, u) => {
    for (const s of segs) {
      if (x >= s.a) continue;
      x = Math.max(x, s.de); const t = s.a === Infinity ? Infinity : t1(s, x, s.a);
      if (u < t) return Math.min(1e30, s.b === 1 ? x * Math.exp(s.c * u) : Math.pow(Math.pow(x, 1 - s.b) + (1 - s.b) * s.c * u, 1 / (1 - s.b)));
      u -= t; x = s.a;
    }
    return x;
  };
  return { duree, borne };
}

// ─── des joueurs honnêtes : les trajectoires de test/longevite.js, et les envois que ferait leur téléphone ───
// au début de chaque session (retour d'absence), puis toutes les « cadence » secondes de jeu ; la fortune envoyée est arrondie
// vers le bas, comme le fait le jeu
function trajectoire(profil, jours, depart, cadence) {
  const G = require('../src/game.js'), LG = require('./longevite.js');
  if (!LG.PROFILS.acharne) LG.PROFILS.acharne = { sessions: [[6, 180], [9.5, 150], [12, 180], [15.5, 150], [18, 180], [21.5, 120]] }; // 16 h par jour
  const T = [], V = [], tick0 = G.tick, absence0 = G.absence;
  G.tick = function (st, dt, now, rnd) { const o = tick0(st, dt, now, rnd); T.push(now); V.push(st.lifetime); return o; };
  G.absence = function (st, now) { const o = absence0(st, now); T.push(now); V.push(st.lifetime); return o; };
  try { LG.simuler(profil, jours, { t0: LG.DEPARTS[depart] }); } finally { G.tick = tick0; G.absence = absence0; }
  const envois = []; let der = -Infinity;
  for (let i = 0; i < T.length; i++) {
    const session = i === 0 || T[i] - T[i - 1] > 2000;
    if ((session || T[i] - der >= cadence * 1000) && T[i] - der >= 10500) { envois.push([T[i], Math.floor(V[i])]); der = T[i]; }
  }
  return envois;
}

// les points de la semaine d'un joueur simulé (test/longevite.js) : au début de chaque session et toutes les « cadence » secondes de jeu ;
// il joue aussi les trois mini-jeux de l'Atelier au score parfait dès sa première session de la semaine (le pire cas pour les plafonds)
function trajectoirePoints(profil, jours, t0, cadence) {
  const G = require('../src/game.js'), LG = require('./longevite.js'), envois = [];
  LG.simuler(profil, jours, { t0, chaqueSeconde: (st, now, s) => {
    if (s === 0) for (const j of G.JEUX_ATELIER) G.marquerAtelier(st, j.id, j.max);
    if (s === 0 || s % cadence === 0) envois.push([now, Math.floor(st.lifetime), G.pointsSemaine(st), G.semaineKey(now)]);
  } });
  return envois;
}

(async () => {
  const { PGlite } = chargerPGlite();
  const db = await PGlite.create();
  const SQL = fs.readFileSync(process.env.FOURNIL_SQL || path.join(__dirname, '..', 'supabase', 'fournil-classement.sql'), 'utf8'); // FOURNIL_SQL : pour éprouver le test lui-même sur un fichier modifié
  const version = (await db.query('select version() as v')).rows[0].v;
  console.log(`Le Fournil — le SQL du classement dans ${version.split(' on ')[0]}`); lignes.push(version.split(' on ')[0]);
  const mPaliers = /'\{(\{[-\d.,{}]+\})\}'::double precision\[\]/.exec(SQL);
  const PALIERS = mPaliers ? JSON.parse('[' + mPaliers[1].replace(/\{/g, '[').replace(/\}/g, ']') + ']') : null;
  const ENV = PALIERS ? enveloppe(PALIERS) : null;

  // ─── les outils : requêtes en superutilisateur (le banc d'essai), ou sous un rôle (anon : le téléphone) ───
  const sup = async (sql, p) => (await db.query(sql, p)).rows;
  const comme = async (role, sql, p) => { await db.exec(`set role ${role}`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  const refus = async (role, sql, p) => { try { await comme(role, sql, p); return 'accepté'; } catch (err) { return err.code || err.message; } };
  const coller = async () => { await db.exec('set role proprio'); try { await db.exec(SQL); } finally { await db.exec('reset role'); } };

  // l'horloge simulée
  let horloge = Date.parse('2026-10-07T10:00:00Z'); // un mercredi, midi à Paris : la semaine du lundi 5 octobre
  const heure = async (quand) => { horloge = typeof quand === 'number' ? quand : Date.parse(quand); await sup('update banc.horloge set t = $1', [new Date(horloge).toISOString()]); };
  const avancer = (s) => heure(horloge + s * 1000);
  const installerHorloge = async () => {
    await sup(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`);
    await heure(horloge);
  };

  // les cinq fonctions du jeu, appelées comme PostgREST le fait (paramètres nommés et typés)
  // pts : { points, lundi } (le téléphone de la version 3), sinon l'appel d'un téléphone de la version 2 (sans points)
  const publier = async (j, pseudo, fortune, role = 'anon', pts) => (pts
    ? await comme(role, 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6) as r', [j.id, j.jeton, pseudo, fortune == null ? null : String(fortune), pts.points == null ? null : String(pts.points), pts.lundi === undefined ? lundiDe(horloge) : pts.lundi])
    : await comme(role, 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4) as r', [j.id, j.jeton, pseudo, fortune == null ? null : String(fortune)]))[0].r;
  const lundiDe = (ms) => CLM.lundiParis(ms); // le lundi de la semaine, comme le calcule le téléphone
  const pts = (points, lundi) => ({ points, lundi }); // des points de la semaine en cours (ou d'une autre semaine)
  const publierP = (j, pseudo, fortune, points, role = 'anon') => publier(j, pseudo, fortune, role, pts(points)); // un téléphone de la version 3
  const classement = async (periode, id = null, limite, role = 'anon') => (await comme(role, limite === undefined ? 'select public.fournil_classement(p_periode => $1, p_id => $2) as r' : 'select public.fournil_classement(p_periode => $1, p_id => $2, p_limite => $3) as r', limite === undefined ? [periode, id] : [periode, id, limite]))[0].r;
  const retirer = async (j, role = 'anon') => (await comme(role, 'select public.fournil_retirer(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r;
  const recompenses = async (j, role = 'anon') => (await comme(role, 'select public.fournil_recompenses(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r;
  const heureServeur = async (role = 'anon') => (await comme(role, 'select public.fournil_heure() as r'))[0].r;
  const ligne = async (id) => (await sup('select pseudo, fortune, sommet, plausible, reserve, total, gain, semaine::text as semaine, jeton, cree, maj, fortune::text as ftexte, points, points_total, points_jour::text as points_jour from public.fournil_joueurs where id = $1', [id]))[0] || null;
  const nb = async () => (await sup('select count(*)::int as n from public.fournil_joueurs'))[0].n;
  const palmares = async (semaine) => (await sup(`select semaine::text as semaine, rang, pseudo, valeur, points, id from public.fournil_palmares ${semaine ? 'where semaine = $1' : ''} order by semaine, rang, lower(pseudo)`, semaine ? [semaine] : undefined));
  const podiumTexte = (rows) => rows.map((x) => `${x.rang} ${x.pseudo} ${x.valeur}`).join(', ');
  const figees = async () => (await sup('select semaine::text as s from public.fournil_semaines order by semaine')).map((x) => x.s);
  const borneSQL = async (L, u) => (await sup('select public.fournil_borne($1, $2) as b', [L, u]))[0].b;
  const dureeSQL = async (x, y) => (await sup('select public.fournil_duree($1, $2) as d', [x, y]))[0].d;
  const vider = () => db.exec('delete from public.fournil_joueurs; delete from public.fournil_portes; delete from public.fournil_palmares; delete from public.fournil_semaines; delete from public.fournil_quartier_podium; delete from public.fournil_evenements; delete from public.fournil_evt_scores; delete from public.fournil_evt_podium');
  // l'en-tête que PostgREST passe à Postgres (request.headers) : ici on le pose à la main, comme le ferait Cloudflare
  const entetes = (h) => sup(`select set_config('request.headers', $1, false)`, [h ? JSON.stringify(h) : '']);
  const semaineDe = async (id) => { const c = await classement('semaine', id); return c.moi ? c.moi.valeur : null; };
  const totalDe = async (id) => { const c = await classement('total', id); return c.moi ? c.moi.valeur : null; };
  const ptsSemaine = async (id) => { const c = await classement('semaine', id); return c.moi ? c.moi.points : null; };
  const ptsTotal = async (id) => { const c = await classement('total', id); return c.moi ? c.moi.points : null; };
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
    -- la table de la toute première version (une base de la semaine), avec un joueur, pour vérifier le passage à cette version
    create table public.fournil_joueurs (id uuid primary key, jeton text not null, pseudo text not null, fortune double precision not null default 0,
      base_semaine double precision not null default 0, semaine date not null, cree timestamptz not null default now(), maj timestamptz not null default now());
    insert into public.fournil_joueurs (id, jeton, pseudo, fortune, base_semaine, semaine) values ('00000000-0000-4000-8000-000000000001', 'x', 'Ancienne', 6e12, 4e12, '2026-09-28');
    reset role;
    -- l'horloge du banc d'essai, lisible par le propriétaire seulement
    create schema banc;
    create table banc.horloge (t timestamptz);
    insert into banc.horloge values (null);
    grant usage on schema banc to proprio;
    grant select on banc.horloge to proprio;
  `);
  // la version 2, telle que collée sur Supabase par le joueur (test/fournil-classement-v2.sql), par-dessus la première ; des joueurs y jouent
  const V2 = fs.readFileSync(path.join(__dirname, 'fournil-classement-v2.sql'), 'utf8');
  try { await db.exec('set role proprio'); await db.exec(V2); await db.exec('reset role'); check(true, 'la version 2 (celle collée sur Supabase) se colle par-dessus la table de la première version'); } catch (err) { await db.exec('reset role'); check(false, 'la version 2 se colle : ' + err.message); process.exit(1); }
  { const a = (await sup(`select fortune, sommet, plausible, reserve, total, gain, semaine::text as semaine from public.fournil_joueurs where pseudo = 'Ancienne'`))[0];
    check(a && a.sommet === 6e12 && a.plausible === 6e12 && a.total === 0 && a.gain === 0 && a.reserve === 86400 && a.semaine === '2026-09-28', `l'ancienne ligne passe à la version 2 : sommet et échelle = sa fortune, « Tous les temps » repart de zéro (${JSON.stringify(a)})`); }
  await installerHorloge();
  const V2J = [joueur(), joueur(), joueur()];
  await heure('2026-10-07T10:00:00Z');
  for (const [k, j] of V2J.entries()) await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4)', [j.id, j.jeton, ['Vieux Paul', 'Vieille Rose', 'Vieux Léon'][k], String(1e9)]);
  await avancer(3600);
  for (const [k, j] of V2J.entries()) await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4)', [j.id, j.jeton, ['Vieux Paul', 'Vieille Rose', 'Vieux Léon'][k], String(1e9 + 1e6 * (3 - k))]);
  await heure('2026-10-12T08:00:00Z'); // lundi : la semaine du 5 est figée par la version 2, à l'argent
  await comme('anon', 'select public.fournil_heure()');
  const photoV2 = async () => JSON.stringify([await sup('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj from public.fournil_joueurs order by id'), await sup('select semaine, rang, id, pseudo, valeur from public.fournil_palmares order by semaine, id'), await sup('select * from public.fournil_semaines order by semaine')]);
  const avantV3 = await photoV2(), palV2 = await sup(`select rang, pseudo, valeur from public.fournil_palmares where semaine = '2026-10-05' order by rang`);
  check(podiumTexte(palV2) === '1 Vieux Paul 3000000, 2 Vieille Rose 2000000, 3 Vieux Léon 1000000', `en version 2 : trois joueurs, un palmarès figé à l'argent (${podiumTexte(palV2)})`);
  // la version 3 par-dessus
  try { await coller(); check(true, 'la version 3 se colle telle quelle par-dessus la version 2 (rôle propriétaire non superutilisateur, droits par défaut de Supabase)'); } catch (err) { check(false, 'la version 3 se colle par-dessus la version 2 : ' + err.message); process.exit(1); }
  await installerHorloge();
  check(await photoV2() === avantV3, 'rien ne se perd : les joueurs (pseudo, jeton, argent compté, semaine), le palmarès et les semaines figées de la version 2 sont intacts');
  { const p = await sup(`select pseudo, points, points_total, points_jour from public.fournil_joueurs order by pseudo`), pal = await palmares('2026-10-05');
    check(p.length === 4 && p.every((x) => x.points === 0 && x.points_total === 0 && x.points_jour === null) && pal.every((x) => x.points === null), `les points partent de zéro ; le palmarès de la version 2 garde ses euros, sans points (${p.length} lignes)`); }
  { const r = await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4) as r', [V2J[0].id, V2J[0].jeton, 'Vieux Paul', String(1e9 + 4e6)]);
    check(r[0].r.ok === true && r[0].r.version === V && r[0].r.compte === 1e6 && r[0].r.points_comptes === 0, `un téléphone encore en version 2 (sans points) continue d'envoyer : accepté, son argent compte, ses points ne bougent pas (${JSON.stringify(r[0].r)})`); }
  { const r = await recompenses(V2J[0]);
    check(r.ok && JSON.stringify(r.podiums) === JSON.stringify([{ semaine: '2026-10-05', rang: 1 }]) && r.derniere && r.derniere.podium.length === 3 && r.derniere.podium[0].points === null, 'ses récompenses de la version 2 sont toujours là (podium d’or du 5 octobre)'); }
  try { await coller(); check(true, 'elle se recolle sans erreur (idempotent)'); } catch (err) { check(false, 'elle se recolle sans erreur : ' + err.message); }
  await installerHorloge();
  await vider();

  // ─── 2. la structure et les droits ───
  const JEU = ['fournil_classement', 'fournil_heure', 'fournil_publier', 'fournil_recompenses', 'fournil_retirer', 'fournil_vu'];
  const INTERNES = ['fournil_borne', 'fournil_duree', 'fournil_empreinte', 'fournil_evt_borne', 'fournil_evt_figer', 'fournil_evts', 'fournil_figer', 'fournil_jeton_valable', 'fournil_jour', 'fournil_lundi', 'fournil_maintenant', 'fournil_paliers', 'fournil_points_plafond', 'fournil_pseudo_propre', 'fournil_quartier_borne', 'fournil_quartier_fenetre', 'fournil_quartier_figer', 'fournil_quartier_table', 'fournil_reponse', 'fournil_segment'];
  const TABLES = ['fournil_joueurs', 'fournil_palmares', 'fournil_semaines', 'fournil_portes', 'fournil_quartier_podium', 'fournil_evenements', 'fournil_evt_scores', 'fournil_evt_podium'];
  async function structure(quand) {
    titre(`structure et droits (${quand})`);
    const cols = await sup(`select column_name as c, data_type as t, is_nullable as n from information_schema.columns where table_schema = 'public' and table_name = 'fournil_joueurs' order by ordinal_position`);
    const attendu = { id: 'uuid', jeton: 'text', pseudo: 'text', fortune: 'double precision', sommet: 'double precision', plausible: 'double precision', reserve: 'double precision', total: 'double precision', gain: 'double precision', semaine: 'date', cree: 'timestamp with time zone', maj: 'timestamp with time zone', points: 'integer', points_total: 'integer', points_jour: 'date', quartier: 'double precision', quartier_maj: 'timestamp with time zone', vu: 'timestamp with time zone' };
    check(cols.length === 18 && cols.every((c) => attendu[c.c] === c.t && c.n === (c.c === 'points_jour' || c.c === 'quartier_maj' || c.c === 'vu' ? 'YES' : 'NO')), `fournil_joueurs a les 18 colonnes du contrat (points de la semaine, depuis l'arrivée, jour du dernier envoi de points, billets du quartier et leur dernier envoi, dernier signe de vie), toutes « not null » sauf points_jour, quartier_maj et vu, sans l'ancienne base de la semaine (${cols.map((c) => c.c).join(', ')})`);
    const colsDe = async (t) => (await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t])).map((c) => c.c).join();
    const colsP = await colsDe('fournil_palmares'), colsS = await colsDe('fournil_semaines'), colsPo = await colsDe('fournil_portes'), colsQ = await colsDe('fournil_quartier_podium'), colsE = await colsDe('fournil_evenements'), colsES = await colsDe('fournil_evt_scores'), colsEP = await colsDe('fournil_evt_podium');
    check(colsP === 'semaine,rang,id,pseudo,valeur,points' && colsS === 'semaine,figee' && colsPo === 'empreinte,quand' && colsQ === 'id,rang,pseudo,valeur' && colsE === 'nom,figee' && colsES === 'evt,id,valeur,maj' && colsEP === 'evt,id,rang,pseudo,valeur', `le palmarès (${colsP}), les semaines figées (${colsS}), les portes : une empreinte et une heure seulement (${colsPo}), le podium du quartier (${colsQ}), les événements figés (${colsE}), les scores des événements (${colsES}) et leurs podiums (${colsEP})`);
    const idx = await sup(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'fournil_joueurs'`);
    check(idx.some((i) => /UNIQUE/.test(i.indexdef) && /lower\(pseudo\)/.test(i.indexdef)) && idx.some((i) => /UNIQUE/.test(i.indexdef) && /\(id\)/.test(i.indexdef)), 'index unique sur lower(pseudo), clé primaire sur id');
    for (const t of TABLES) {
      const rls = (await sup(`select relrowsecurity as r from pg_class where oid = $1::regclass`, ['public.' + t]))[0];
      const pol = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = $1`, [t]))[0].n;
      const droits = await sup(`select r.rolname as role, p.priv from (values ('anon'), ('authenticated'), ('public')) r(rolname), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) where has_table_privilege(r.rolname, $1, p.priv)`, ['public.' + t]);
      check(rls && rls.r === true && pol === 0 && droits.length === 0, `${t} : sécurité ligne par ligne sans aucune règle, aucun droit pour anon, authenticated ni PUBLIC${droits.length ? ' : ' + droits.map((d) => d.role + ' ' + d.priv).join(', ') : ''}`);
    }
    const corps = (await sup(`select prosrc from pg_proc where proname = 'fournil_publier' and pronamespace = 'public'::regnamespace`))[0].prosrc;
    const sansCommentaires = corps.replace(/--[^\n]*/g, '');
    check(/pg_catalog\.pg_advisory_xact_lock\(/.test(corps), 'fournil_publier verrouille les inscriptions une à une (pg_advisory_xact_lock : les plafonds ne se contournent pas en rafale)');
    check(!/x-forwarded-for/i.test(sansCommentaires), 'fournil_publier ne lit jamais x-forwarded-for (le téléphone peut le remplir lui-même)');
    check(/fournil_maintenant\(\)/.test(sansCommentaires) && !/clock_timestamp|statement_timestamp|now\(\)/.test(sansCommentaires), 'fournil_publier ne connaît que l’heure du serveur (fournil_maintenant), jamais une heure venue du téléphone');
    const fns = await sup(`select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, p.provolatile as vol, array_to_string(p.proconfig, ',') as conf, p.proacl is null as acl_defaut,
        has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
        exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pour_public, pg_get_userbyid(p.proowner) as proprio
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil%' order by 1`);
    check(JSON.stringify(fns.map((f) => f.nom)) === JSON.stringify([...JEU, ...INTERNES].sort()), `les fonctions, ni plus ni moins, une seule signature chacune (${fns.map((f) => f.nom.replace('fournil_', '')).join(', ')})`);
    const sig = Object.fromEntries(fns.map((f) => [f.nom, f.args]));
    check(sig.fournil_publier === 'p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision, p_points integer, p_lundi date, p_quartier double precision, p_evt text, p_score double precision' && fns.filter((f) => f.nom === 'fournil_publier').length === 1 &&  sig.fournil_classement === 'p_periode text, p_id uuid, p_limite integer' && sig.fournil_retirer === 'p_id uuid, p_jeton text' && sig.fournil_recompenses === 'p_id uuid, p_jeton text' && sig.fournil_heure === '' && sig.fournil_vu === 'p_id uuid, p_jeton text', 'les signatures du contrat (noms et types des paramètres)');
    for (const f of fns) {
      const jeu = JEU.includes(f.nom);
      check(/search_path=""/.test(f.conf) || /search_path=''/.test(f.conf), `${f.nom} : search_path fixé (${f.conf})`);
      check(!f.acl_defaut && !f.pour_public, `${f.nom} : droits explicites, rien pour PUBLIC`);
      if (jeu) check(f.definer && f.anon && f.auth && f.vol === 'v', `${f.nom} : SECURITY DEFINER, VOLATILE (elle peut figer le palmarès : PostgREST l'appelle en écriture), exécutable par anon et authenticated`);
      else check(!f.definer && !f.anon && !f.auth, `${f.nom} (interne) : ni anon ni authenticated ne peuvent l'appeler`);
      check(f.proprio === 'proprio', `${f.nom} appartient au propriétaire des tables`);
    }
  }
  await structure('premier collage');

  // ─── 3. l'enveloppe : le SQL et son miroir JavaScript ───
  titre('l’enveloppe des gains plausibles');
  check(!!PALIERS && PALIERS.length >= 2 && PALIERS.every((p, k) => k === 0 || (p[0] > PALIERS[k - 1][0] && p[1] >= PALIERS[k - 1][1])), `les paliers sont lus dans le fichier, croissants (${PALIERS ? PALIERS.length : 0} paliers, plancher ${PALIERS ? e(Math.pow(10, PALIERS[0][1])) : '?'} €/s)`);
  if (!ENV) { console.log('  FAIL paliers introuvables : le test ne peut pas continuer'); process.exit(1); }
  { let pire = 0, pireD = 0, n = 0;
    for (const L of [0, 7, 1e3, 1e4, 3.3e4, 1e8, 5e10, 1e11, 3e11, 1e12, 7e14, 1e15, 2e15, 1e16, 3e18, 1e19, 9.5e19, 1e20, 1e21, 1e23, 1e24, 5e24]) for (const u of [0, 1, 10, 300, 3600, 86400, 864000, 1e7, 1e9]) {
      const b = await borneSQL(L, u), j = ENV.borne(L, u); n++;
      pire = Math.max(pire, Math.abs(b - j) / Math.max(1, j));
      if (b < 1e29 && b > L) pireD = Math.max(pireD, Math.abs(await dureeSQL(L, b) - u) / Math.max(1, u));
    }
    check(pire < 1e-9 && pireD < 1e-6, `fournil_borne et fournil_duree = le miroir JavaScript, sur ${n} points de 0 à 5e24 € et de 0 s à 30 ans (écart ${pire.toExponential(1)} ; durée retrouvée à ${pireD.toExponential(1)} près)`); }
  check(await borneSQL(0, 0) === 0 && await borneSQL(1e12, 0) === 1e12 && await dureeSQL(5, 5) === 0 && await dureeSQL(9, 3) === 0, 'sans temps, rien ; une durée à rebours vaut 0');
  check(await borneSQL(1e20, 1e12) === 1e30 && await borneSQL(0, 1e15) === 1e30, 'un temps immense ne déborde jamais : la borne plafonne à 1e30');
  { const b1 = await borneSQL(1e15, 3600), b2 = await borneSQL(await borneSQL(1e15, 1800), 1800);
    check(proche(b1, b2, 1e-9), `une heure d'un coup = deux demi-heures à la suite (${e(b1)} et ${e(b2)}) : la borne ne dépend pas du rythme des envois`); }
  { const r = []; for (const L of [1e3, 1e10, 1e16, 1e19]) r.push(`${e(L)} € → +${e(await borneSQL(L, 300) - L)} en 5 min, ${e(await borneSQL(L, 86400))} en un jour`); check(true, 'repères : ' + r.join(' ; ')); }

  // ─── 4. l'inscription ───
  titre('inscription : on part de zéro');
  await heure('2026-10-07T10:00:00Z');
  const A = joueur();
  let r = garde(await publier(A, 'Marie', 1000));
  check(r.ok === true && r.erreur === null && r.rang_total === 1 && r.rang_semaine === 1 && r.joueurs === 1 && r.joueurs_total === 1 && r.joueurs_semaine === 1 && r.semaine === '2026-10-05' && r.compte === 0 && r.plafonne === false, `premier envoi : inscrite, rien de compté, 1re cette semaine et de tous les temps (${JSON.stringify(r)})`);
  let l = await ligne(A.id);
  check(l && l.pseudo === 'Marie' && l.fortune === 1000 && l.sommet === 1000 && l.plausible === 1000 && l.reserve === 86400 && l.total === 0 && l.gain === 0 && l.semaine === '2026-10-05', 'la ligne : sa fortune sert de sommet et d’échelle, réserve pleine (24 h), 0 € en tout et cette semaine, lundi 5 octobre');
  check(l && l.jeton === sha(A.jeton) && l.jeton !== A.jeton && /^[0-9a-f]{64}$/.test(l.jeton), 'seule l’empreinte sha256 du jeton est gardée, jamais le jeton');
  r = garde(await classement('semaine'));
  check(r.semaine === '2026-10-05' && r.joueurs === 1 && r.lignes.length === 1 && r.lignes[0].valeur === 0 && r.lignes[0].podium === null && r.moi === null, 'classement de la semaine : elle y est avec 0 €, pas de podium, « moi » vide sans identifiant');
  r = garde(await classement('total', A.id));
  check(r.lignes[0].pseudo === 'Marie' && r.lignes[0].valeur === 0 && r.lignes[0].rang === 1 && r.lignes[0].moi === true && r.moi && r.moi.rang === 1 && r.moi.valeur === 0 && r.moi.podium === null, 'tous les temps : 0 € (pas la fortune de sa sauvegarde), marquée « moi »');

  // ─── 5. trop vite ───
  titre('au plus un envoi toutes les 10 secondes');
  const majAvant = (await ligne(A.id)).maj;
  await avancer(5);
  r = garde(await publier(A, 'Marie', 2000));
  l = await ligne(A.id);
  check(r.ok === false && r.erreur === 'trop_vite' && r.rang_total === 1 && r.compte === null && l.fortune === 1000 && l.total === 0 && +l.maj === +majAvant, '5 s après : « trop_vite », rien ne change (ses rangs sont quand même rendus)');
  await avancer(4.999);
  r = await publier(A, 'Marie', 2000);
  check(r.erreur === 'trop_vite', '9,999 s après : encore « trop_vite »');
  await avancer(0.001);
  r = garde(await publier(A, 'Marie', 2000));
  l = await ligne(A.id);
  check(r.ok === true && r.compte === 1000 && r.plafonne === false && l.fortune === 2000 && l.sommet === 2000 && l.plausible === 2000 && l.total === 1000 && l.gain === 1000, '10 s pile : pris en compte, les 1 000 € gagnés comptés en entier');
  r = await classement('semaine');
  check(r.lignes[0].valeur === 1000 && (await totalDe(A.id)) === 1000, 'cette semaine et tous les temps : 1 000 €');
  const B0 = joueur();
  r = await publier(B0, 'Basile', 10);
  check(r.ok === true, 'la limite est par joueur : un autre joueur publie aussitôt');

  // ─── 6. le jeton ───
  titre('le jeton protège chaque joueur');
  await avancer(11);
  const pirate = { id: A.id, jeton: crypto.randomBytes(32).toString('hex') };
  r = garde(await publier(pirate, 'Pirate', 9e20));
  l = await ligne(A.id);
  check(r.ok === false && r.erreur === 'jeton' && r.rang_total === null && r.compte === null && l.pseudo === 'Marie' && l.fortune === 2000 && l.total === 1000, 'le bon identifiant avec un autre jeton : « jeton », rien n’est écrasé');
  r = await publier({ id: A.id, jeton: A.jeton.toUpperCase() }, 'Marie', 3000);
  check(r.erreur === 'jeton', 'le même jeton en majuscules : refusé (comparaison exacte)');
  for (const [nom, j] of [['jeton trop court', { id: A.id, jeton: 'abc123' }], ['jeton absent', { id: A.id, jeton: null }], ['jeton avec des caractères bizarres', { id: A.id, jeton: "' or '1'='1" + 'x'.repeat(40) }], ['jeton trop long', { id: A.id, jeton: 'a'.repeat(129) }], ['identifiant absent', { id: null, jeton: A.jeton }]]) {
    r = await publier(j, 'Marie', 3000);
    check(r.ok === false && r.erreur === 'jeton', `${nom} : « jeton »`);
  }
  check((await ligne(A.id)).fortune === 2000 && await nb() === 2, 'toujours 2 joueurs, Marie intacte');

  // ─── 7. les pseudos ───
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
  check(r.ok === true && r.compte === 100 && (await ligne(A.id)).pseudo === 'Marie-Lou', 'changer de pseudo : Marie devient Marie-Lou (et ses 100 € de plus sont comptés)');
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

  // ─── 8. les valeurs absurdes ───
  titre('valeurs absurdes');
  await avancer(11);
  for (const [v, quoi] of [['NaN', 'NaN'], ['Infinity', 'infini'], ['-Infinity', 'moins l’infini'], ['-1', 'négative'], ['-1e-300', 'à peine négative'], ['1.0000001e24', 'au-dessus de la borne (1e24)'], ['1e300', 'énorme'], [null, 'absente']]) {
    r = await publier(A, 'MARIE-LOU', v);
    check(r.ok === false && r.erreur === 'valeur', `fortune ${quoi} : « valeur »`);
    r = await publier(joueur(), 'Tricheur' + Math.floor(Math.random() * 1e6), v);
    check(r.erreur === 'valeur', `fortune ${quoi} à l’inscription : « valeur »`);
  }
  l = await ligne(A.id);
  check(l.fortune === 2100 && l.total === 1100 && await nb() === 15, 'rien n’a bougé, aucune ligne de tricheur');
  const Bord = joueur();
  r = await publier(Bord, 'Bord', '1e24');
  check(r.ok === true && (await ligne(Bord.id)).fortune === 1e24 && (await totalDe(Bord.id)) === 0, 'exactement 1e24 à l’arrivée : accepté… et rien de compté');
  check((await retirer(Bord)).ok === true, '(retiré)');
  const Zero = joueur();
  r = await publier(Zero, 'Zéro', '-0');
  check(r.ok === true && (await ligne(Zero.id)).ftexte === '0', '« −0 » devient 0');
  check((await retirer(Zero)).ok === true, '(retiré)');

  // ─── 9. le plafond : seuls les gains plausibles comptent ───
  titre('gains plausibles : le plafond');
  await vider();
  await heure('2026-11-04T10:00:00Z'); // un mercredi
  const Tr = joueur();
  await publier(Tr, 'Tricheuse', 1e6);
  await avancer(10);
  r = garde(await publier(Tr, 'Tricheuse', 1e24)); l = await ligne(Tr.id);
  const permis1 = await borneSQL(1e6, 86410) - 1e6;
  check(r.ok === true && r.plafonne === true && proche(r.compte, permis1) && r.compte < 1e20, `10 s après son arrivée à 1e6 €, elle envoie 1e24 € : accepté mais plafonné, ${e(r.compte)} € comptés (24 h de réserve + 10 s d'enveloppe depuis 1e6 €)`);
  check(proche(l.total, permis1) && proche(l.gain, permis1) && l.sommet === 1e24 && proche(l.plausible, 1e6 + permis1) && l.reserve >= 0 && l.reserve < 1, `la ligne : total et semaine = le compte, sommet 1e24, échelle ${e(l.plausible)}, réserve vidée (${l.reserve.toFixed(3)} s)`);
  await avancer(3600);
  r = await publier(Tr, 'Tricheuse', 1e24); l = await ligne(Tr.id);
  check(r.ok === true && r.compte === 0 && r.plafonne === false && proche(l.total, permis1), 'une heure plus tard, 1e24 encore : rien de plus (seul compte ce qui dépasse le sommet) — l’excès plafonné est perdu pour toujours');
  check(Math.abs(l.reserve - 3600) < 1, `la réserve s'est remplie du temps passé (${l.reserve.toFixed(0)} s)`);
  // la fortune d'arrivée n'est prouvée par rien (une sauvegarde bricolée) : comme échelle, elle est plafonnée à 1e20 €
  const Gros = joueur();
  r = await publier(Gros, 'Arrivée bricolée', 7e23); l = await ligne(Gros.id);
  check(r.ok === true && l.sommet === 7e23 && l.plausible === 1e20 && l.total === 0, `arrivée avec 7e23 € (sauvegarde bricolée) : acceptée, rien de compté, sommet 7e23 mais échelle ${e(l.plausible)}`);
  await avancer(10);
  r = garde(await publier(Gros, 'Arrivée bricolée', 1e24));
  const permisGros = await borneSQL(1e20, 86410) - 1e20;
  check(r.plafonne === true && r.compte <= permisGros * (1 + 1e-9) && proche(r.compte, permisGros) && r.compte < 5e19, `10 s plus tard, 1e24 € : ${e(r.compte)} € comptés au plus (borne depuis 1e20 €), pas les 2,9e23 € qu'aurait donnés l'échelle de 7e23 €`);
  // l'échelle de la borne est la fortune plausible, pas le sommet envoyé
  const Sa = joueur();
  await publier(Sa, 'Sauteur', 1e6);
  await avancer(10);
  await publier(Sa, 'Sauteur', 1e22); // plafonné : son sommet passe à 1e22, sa fortune plausible reste bien plus bas
  const lSa = await ligne(Sa.id);
  await avancer(3600);
  r = await publier(Sa, 'Sauteur', 1e24);
  const attenduSa = await borneSQL(lSa.plausible, lSa.reserve + 3600) - lSa.plausible, siSommet = await borneSQL(1e22, 3600) - 1e22;
  check(r.plafonne === true && proche(r.compte, attenduSa) && r.compte < siSommet / 100, `un saut inventé (1e6 → 1e22) ne fait pas grandir la borne : une heure après, ${e(r.compte)} € comptés (depuis son échelle ${e(lSa.plausible)}), pas les ${e(siSommet)} qu'aurait donnés le sommet`);
  // envoyer souvent ne rapporte pas plus qu'envoyer une fois
  await vider();
  await heure('2026-11-04T12:00:00Z');
  const Sv = joueur(), Un = joueur();
  await publier(Sv, 'Souvent', 1e9); await publier(Un, 'Une fois', 1e9);
  for (let k = 1; k <= 360; k++) { await avancer(60); r = await publier(Sv, 'Souvent', 1e22 + k * 1e19); if (!r.ok || !r.plafonne) break; }
  check(r.ok === true && r.plafonne === true, '« Souvent » envoie une fortune inventée toutes les minutes pendant 6 h : chaque envoi est accepté, et plafonné');
  r = await publier(Un, 'Une fois', 1e24);
  const tSv = (await ligne(Sv.id)).total, tUn = (await ligne(Un.id)).total, tAttendu = await borneSQL(1e9, 86400 + 6 * 3600) - 1e9;
  check(proche(tSv, tUn, 1e-6) && proche(tUn, tAttendu, 1e-9), `« Une fois » envoie 1e24 au bout des 6 h : même total que « Souvent » (${e(tSv)} et ${e(tUn)} = 24 h de réserve + 6 h d'enveloppe depuis 1e9 €) — envoyer souvent ne rapporte rien de plus`);
  await avancer(3 * 86400);
  r = await publier(Un, 'Une fois', 1e24); // rien à compter : le temps s'accumule
  check(r.compte === 0 && (await ligne(Un.id)).reserve === 86400, 'trois jours sans rien gagner : la réserve plafonne à 24 h');
  const Ho = joueur();
  await publier(Ho, 'Honnête', 5e12);
  await avancer(300);
  r = await publier(Ho, 'Honnête', 5.4e12);
  check(r.ok === true && r.plafonne === false && r.compte === 4e11 && (await totalDe(Ho.id)) === 4e11, 'à côté, une honnête qui gagne 400 Md en 5 min à 5 000 Md : tout est compté');
  await avancer(8 * 3600);
  r = await publier(Ho, 'Honnête', 5.4e12 + 8 * 3600 * 2e9);
  check(r.ok === true && r.plafonne === false, 'puis 8 h d’absence à 2 Md/s (ses apprentis) : tout est compté');

  // ─── 10. des joueurs honnêtes, rejoués à leur rythme réel ───
  titre('les joueurs honnêtes de test/longevite.js ne sont jamais plafonnés');
  const rejouer = async (nom, envois, quoi) => {
    await vider();
    const J = joueur(); let plaf = 0, refuses = 0, premier = null, dernier = null, pire = null;
    for (const [t, v] of envois) {
      await heure(t);
      const rr = await publier(J, nom, v);
      if (!rr.ok) { refuses++; continue; }
      if (premier === null) premier = v;
      dernier = v;
      if (rr.plafonne && !pire) pire = { jour: ((t - envois[0][0]) / 864e5).toFixed(2), fortune: e(v), compte: e(rr.compte) };
      if (rr.plafonne) plaf++;
    }
    const tot = (await ligne(J.id)).total;
    check(plaf === 0 && refuses === 0 && proche(tot, dernier - premier, 1e-9), `${quoi} : ${envois.length} envois, aucun plafonné, ${e(tot)} € comptés = tout ce qu'il a gagné depuis son arrivée${pire ? ' — premier plafond ' + JSON.stringify(pire) : ''}${refuses ? `, ${refuses} refusés` : ''}`);
  };
  const defPaliers = (await sup(`select pg_get_functiondef('public.fournil_paliers()'::regprocedure) as d`))[0].d;
  const tableau = (pts) => JSON.stringify(pts).replace(/\[/g, '{').replace(/\]/g, '}');
  const diviserEnveloppe = (div) => sup(`create or replace function public.fournil_paliers() returns double precision[] language sql immutable set search_path = '' as $$ select '${tableau(PALIERS.map(([a, b]) => [a, b - Math.log10(div)]))}'::double precision[] $$`);
  {
    let t0 = Date.now();
    const reg = trajectoire('regulier', 30, '5 oct.', 300), ass = trajectoire('assidu', 30, '1er nov.', 300), ach = trajectoire('acharne', 4, '7 juin', 60);
    check(reg.length > 200 && ass.length > 400 && ach.length > 2000, `trajectoires simulées par test/longevite.js en ${((Date.now() - t0) / 1000).toFixed(1)} s : régulier 30 j, assidu 30 j, acharné (16 h par jour) 4 j`);
    t0 = Date.now();
    await rejouer('Régulière', reg, 'régulière (36 min par jour, 30 jours dès le 5 oct.), envois toutes les 5 min');
    await diviserEnveloppe(3);
    check(proche(await borneSQL(1e15, 3600), enveloppe(PALIERS.map(([a, b]) => [a, b - Math.log10(3)])).borne(1e15, 3600), 1e-9), '(l’enveloppe est maintenant divisée par 3)');
    await rejouer('Assidu', ass, 'assidu (80 min par jour, 30 jours dès le 1er nov.), enveloppe DIVISÉE PAR 3, envois toutes les 5 min');
    await rejouer('Acharnée', ach, 'acharnée (16 h par jour, 4 jours dès le 7 juin), enveloppe DIVISÉE PAR 3, envois toutes les minutes');
    await sup(defPaliers);
    check(proche(await borneSQL(1e15, 3600), ENV.borne(1e15, 3600), 1e-12) && (await sup(`select has_function_privilege('anon', 'public.fournil_paliers()', 'execute') as a`))[0].a === false, `(l’enveloppe d’origine est remise ; rejeux en ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }

  // ─── 11. les semaines, heure de Paris ───
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

  // le passage pour de vrai : Sam envoie dimanche soir, puis lundi
  await vider();
  const S = joueur(), T = joueur();
  await heure('2026-10-11T21:00:00Z');
  await publierP(S, 'Sam', 1000, 0); await publierP(T, 'Tom', 500, 0);
  await heure('2026-10-11T21:59:50Z'); // dimanche 23:59:50 à Paris
  r = await publierP(S, 'Sam', 5000, 30);
  check(r.ok && r.semaine === '2026-10-05' && (await ligne(S.id)).gain === 4000, 'dimanche 23:59:50 : encore la semaine du 5 octobre (4 000 € gagnés)');
  await heure('2026-10-11T22:00:00Z'); // lundi 00:00 à Paris
  r = garde(await classement('semaine', S.id));
  check(r.semaine === '2026-10-12' && r.joueurs === 0 && r.lignes.length === 0 && r.moi === null, 'lundi 00:00 à Paris (22:00 UTC) : la nouvelle semaine est vide, personne n’a encore envoyé');
  r = await classement('total');
  check(r.joueurs === 2 && r.lignes[0].pseudo === 'Sam' && r.lignes[0].points === 30 && r.lignes[0].valeur === 4000 && r.lignes[1].points === 0 && r.lignes[1].valeur === 0 && r.lignes[0].podium === 1, 'tous les temps : rien ne change au changement de semaine (Sam 30 points et 4 000 €, Tom 0) ; Sam porte la toque d’or de la semaine finie');
  await avancer(5);
  r = await publier(S, 'Sam', 5600);
  l = await ligne(S.id);
  check(r.ok && r.semaine === '2026-10-12' && r.rang_semaine === 1 && r.joueurs_semaine === 1 && r.joueurs === 2 && l.gain === 600 && l.total === 4600 && l.semaine === '2026-10-12', 'premier envoi de la semaine : le gain repart de zéro (600 € cette semaine, 4 600 € en tout)');
  r = await classement('semaine', S.id);
  check(r.lignes.length === 1 && r.lignes[0].valeur === 600 && r.moi && r.moi.valeur === 600, 'la semaine de Sam : 600 € ; Tom, qui n’a pas joué, n’y est pas');
  await heure('2026-10-25T22:59:00Z');
  r = await publier(S, 'Sam', 7000);
  check(r.ok && r.semaine === '2026-10-19' && (await ligne(S.id)).gain === 1400, 'dimanche 25 oct. 23:59 (heure d’hiver) : semaine du 19 (absent une semaine), 1 400 € gagnés');
  await heure('2026-10-25T23:00:30Z');
  r = await publier(S, 'Sam', 7100);
  l = await ligne(S.id);
  check(r.ok && r.semaine === '2026-10-26' && l.gain === 100 && l.semaine === '2026-10-26', 'lundi 26 oct. 00:00:30 à Paris : nouvelle semaine, 100 € gagnés');
  await heure('2027-03-28T21:59:00Z');
  r = await publier(S, 'Sam', 9000);
  check(r.ok && r.semaine === '2027-03-22' && (await ligne(S.id)).gain === 1900, 'dimanche 28 mars 23:59 (heure d’été) : semaine du 22 mars, absent des mois');
  await heure('2027-03-28T22:00:10Z');
  r = await publier(S, 'Sam', 9050);
  check(r.ok && r.semaine === '2027-03-29' && (await ligne(S.id)).gain === 50, 'lundi 29 mars 00:00:10 à Paris : nouvelle semaine');

  // ─── 12. une fortune qui baisse (sauvegarde effacée, nouveau téléphone) ───
  titre('fortune qui baisse');
  await avancer(11);
  r = await publier(S, 'Sam', 9030); l = await ligne(S.id);
  check(r.ok && r.compte === 0 && l.fortune === 9030 && l.gain === 50, 'un peu moins que son plus haut (9 050 €) : rien de plus');
  await avancer(11);
  r = await publier(S, 'Sam', 200); l = await ligne(S.id);
  check(r.ok && l.fortune === 200 && l.sommet === 9050 && l.gain === 50 && l.total === 8050, 'sauvegarde effacée (200 €) : rien ne se perd ni ne se compte, le plus haut reste 9 050 €');
  check(await semaineDe(S.id) === 50 && await totalDe(S.id) === 8050, 'la semaine : 50 € (jamais en négatif) ; tous les temps : 8 050 €');
  await avancer(11);
  r = await publier(S, 'Sam', 260);
  check(r.compte === 0 && await semaineDe(S.id) === 50, 'puis elle remonte un peu : rien ne compte (en dessous de son plus haut)');
  await avancer(11);
  r = await publier(S, 'Sam', 9030);
  check(r.ok && r.compte === 0 && await semaineDe(S.id) === 50, 'son code rechargé (9 030 €) : pas un euro de plus');
  await avancer(11);
  r = await publier(S, 'Sam', 9100); l = await ligne(S.id);
  check(r.compte === 50 && await semaineDe(S.id) === 100 && l.sommet === 9100, 'et elle continue normalement au-delà : 50 € de plus, nouveau plus haut 9 100 €');
  await avancer(11);
  r = await publier(S, 'Sam', 200);
  await heure('2027-04-05T08:00:00Z'); // la semaine suivante, avec moins que son plus haut
  r = await publier(S, 'Sam', 100); l = await ligne(S.id);
  check(r.ok && l.semaine === '2027-04-05' && l.gain === 0 && l.fortune === 100 && await semaineDe(S.id) === 0, 'nouvelle semaine avec une fortune plus basse : 0 € cette semaine');
  await avancer(11);
  r = await publier(S, 'Sam', 300);
  check(await semaineDe(S.id) === 0, 'regagner ce qu’on avait déjà ne compte pas (pour repartir de zéro : quitter puis rejoindre)');

  // ─── 12 bis. les triches sur « Cette semaine » ───
  titre('« Cette semaine » ne se gonfle pas');
  await vider();
  await heure('2026-10-05T08:00:00Z'); // lundi 5 octobre, 10 h à Paris
  const Ma = joueur(), Tc = joueur();
  await publier(Ma, 'Marie', 1e15); await publier(Tc, 'Tricheur', 1e15);
  await heure('2026-10-06T08:00:00Z'); // mardi
  await publierP(Ma, 'Marie', 1.01e15, 40);
  r = await publier(Tc, 'Tricheur', 0);
  check(r.ok && await semaineDe(Tc.id) === 0, 'le tricheur envoie 0 depuis la console : 0 € cette semaine');
  await avancer(11);
  r = await publier(Tc, 'Tricheur', 1e15);
  r = await classement('semaine');
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.valeur])) === JSON.stringify([[1, 'Marie', 1e13], [2, 'Tricheur', 0]]), `puis sa vraie fortune : 0 € gagnés, Marie reste 1re avec 1e13 € (${JSON.stringify(r.lignes.map((x) => x.pseudo + ' ' + x.valeur))})`);
  await heure('2026-10-11T21:00:00Z'); // dimanche 23 h à Paris
  await publier(Ma, 'Marie', 1.02e15);
  r = await publier(Tc, 'Tricheur', 0);
  await heure('2026-10-11T22:30:00Z'); // lundi 0 h 30 à Paris
  r = await publier(Tc, 'Tricheur', 1e15); l = await ligne(Tc.id);
  check(r.ok && l.semaine === '2026-10-12' && l.gain === 0 && await semaineDe(Tc.id) === 0, 'baisser le dimanche puis remonter le lundi : 0 € gagnés');
  r = await publier(Ma, 'Marie', 1.03e15);
  check(await semaineDe(Ma.id) === 1e13 && (await classement('semaine')).lignes[0].pseudo === 'Marie', 'Marie, honnête : 1e13 € cette semaine, 1re');
  await vider();
  await heure('2026-10-05T07:00:00Z');
  const Ga = joueur(), Hn = joueur();
  await publier(Ga, 'Gaston', 8e9); await publier(Hn, 'Honnête', 8e9);
  await heure('2026-10-06T07:00:00Z'); // mardi
  await publierP(Ga, 'Gaston', 8.2e9, 20); await publierP(Hn, 'Honnête', 8.3e9, 30);
  await heure('2026-10-06T18:00:00Z');
  r = await publier(Ga, 'Gaston', 0); // « Tout effacer » : la partie repart de 0, le classement est resté rejoint
  check(r.ok && await semaineDe(Ga.id) === 2e8, 'Gaston efface sa partie : ses 200 M de la semaine restent acquis, rien en négatif');
  await heure('2026-10-06T18:05:00Z');
  r = await publier(Ga, 'Gaston', 8.2e9); // il recharge son code
  r = await classement('semaine');
  const vu = r.lignes.map((x) => [x.rang, x.pseudo, Math.round(x.valeur / 1e6)]);
  check(JSON.stringify(vu) === JSON.stringify([[1, 'Honnête', 300], [2, 'Gaston', 200]]), `puis recharge son code : Honnête reste 1re (+300 M), Gaston garde ses +200 M et rien de plus (${JSON.stringify(vu)})`);
  r = await publier(Hn, 'Honnête', 8.3e9);
  check(r.rang_semaine === 1 && r.rang_total === 1, 'la réponse de fournil_publier donne les mêmes rangs que le classement');

  // ─── 12 ter. les points de boulanger : ce qui classe ───
  titre('les points de boulanger : le barème, les plafonds, la semaine du serveur');
  {
    const jourSQL = async (iso) => (await sup('select public.fournil_jour($1)::text as d', [iso]))[0].d;
    const plafond = async (n) => (await sup('select public.fournil_points_plafond($1) as p', [n]))[0].p;
    check(await jourSQL('2026-10-11T21:59:59Z') === '2026-10-11' && await jourSQL('2026-10-11T22:00:00Z') === '2026-10-12' && await jourSQL('2026-10-25T22:59:59Z') === '2026-10-25' && await jourSQL('2026-10-25T23:00:00Z') === '2026-10-26', 'le jour se compte à Paris, heure d’été comme d’hiver');
    const pl = []; for (const k of [null, -3, 0, 1, 2, 3, 4, 5, 6, 7, 8, 30]) pl.push(await plafond(k));
    check(JSON.stringify(pl) === JSON.stringify([160, 160, 160, 160, 220, 280, 340, 400, 460, 510, 510, 510]), `plafond du barème : 60 par jour commencé + 100 (défi 30 + Atelier 60 + marge 10), 510 au plus sur une semaine, sans marge : le maximum du jeu (${pl.join(', ')})`);
    await vider();
    await heure('2026-10-12T08:00:00Z'); // lundi 12 octobre, 10 h à Paris
    const Pi = joueur(), Pr = joueur(), Pc = joueur(), Po = joueur(), Ph = joueur(), Pv = joueur();
    let r = garde(await publierP(Pi, 'Pierre', 1e6, 40));
    let l = await ligne(Pi.id);
    check(r.ok && r.version === V && r.points_comptes === 40 && r.points_plafonnes === false && r.points_semaine === 40 && r.points_total === 40 && r.compte === 0 && l.points === 40 && l.points_total === 40 && l.points_jour === '2026-10-12',
      `à l'arrivée, les points de la semaine comptent (l'argent, lui, part de zéro) : 40 points cette semaine et depuis l'arrivée (${JSON.stringify({ comptes: r.points_comptes, semaine: r.points_semaine, total: r.points_total })})`);
    await avancer(11);
    r = await publierP(Pi, 'Pierre', 1e6, 35);
    check(r.ok && r.points_comptes === 0 && r.points_plafonnes === false && (await ligne(Pi.id)).points === 40, 'moins de points qu’avant (vieille sauvegarde, autre téléphone) : rien ne se compte ni ne se perd');
    await avancer(11);
    r = await publierP(Pi, 'Pierre', 1e6, 500);
    l = await ligne(Pi.id);
    check(r.ok && r.points_comptes === 120 && r.points_plafonnes === true && l.points === 160 && l.points_total === 160, `500 points un lundi : plafonnés à 160 (le maximum du barème sur un jour, défi et Atelier compris, + 10) (${l.points})`);
    await heure('2026-10-13T06:00:00Z'); // mardi 8 h
    r = await publierP(Pi, 'Pierre', 1e6, 500);
    check(r.points_comptes === 60 && (await ligne(Pi.id)).points === 220, 'mardi, le même total renvoyé : le plafond a grandi d’un jour (220), le reste se compte au fil des jours');
    await avancer(11);
    r = await publier(Pi, 'Pierre', 1e6 + 500, 'anon', pts(500, '2026-10-05'));
    check(r.ok && r.points_comptes === 0 && r.compte === 500 && (await ligne(Pi.id)).points === 220, 'des points d’une autre semaine (téléphone en retard sur minuit) : ignorés ; son argent compte quand même');
    await avancer(11);
    r = await publier(Pi, 'Pierre', 1e6 + 500, 'anon', pts(500, '2026-10-19'));
    check(r.ok && r.points_comptes === 0 && (await ligne(Pi.id)).points === 220, 'des points de la semaine suivante (téléphone en avance) : ignorés');
    await avancer(11);
    r = await publier(Pi, 'Pierre', 1e6 + 500, 'anon', pts(null, '2026-10-12'));
    check(r.ok && r.points_comptes === 0, 'un lundi sans points : rien');
    await avancer(11);
    r = await publier(Pi, 'Pierre', 1e6 + 500, 'anon', pts(300, null));
    check(r.ok && r.points_comptes === 0, 'des points sans lundi : rien');
    for (const [v, quoi] of [[-1, 'négatifs'], [100001, 'absurdes (100 001)']]) {
      await avancer(11);
      r = await publierP(Pi, 'Pierre', 1e6 + 600, v);
      check(r.ok === false && r.erreur === 'valeur' && (await ligne(Pi.id)).points === 220, `des points ${quoi} : refusés (« valeur »), rien ne change`);
    }
    r = await refus('anon', `select public.fournil_publier(p_id => gen_random_uuid(), p_jeton => repeat('a', 64), p_pseudo => 'Flottant', p_fortune => 1, p_points => 12.5)`);
    check(r === 'accepté' || r === '22P02' || r === '42883', `des points à virgule : arrondis par Postgres ou refusés, jamais une erreur cachée (${r})`);
    await avancer(11);
    r = await publier(Pi, 'Pierre', 1e6 + 700);
    check(r.ok && r.points_comptes === 0 && r.points_semaine === 220 && (await ligne(Pi.id)).points === 220, 'un téléphone de la version 2 (sans points) : ses points restent');
    // seul le plafond depuis lundi borne la croissance : des envois rapprochés n'y ajoutent rien (pas de plafond « par envoi »
    // qui se remettrait à zéro à chaque envoi), et un mardi on ne dépasse jamais 220, quel que soit le nombre d'envois
    await heure('2026-10-12T09:00:00Z');
    await publierP(Pr, 'Prudence', 10, 0);
    await heure('2026-10-13T09:00:00Z'); // mardi
    const vus = []; for (let k = 0; k < 4; k++) { await avancer(11); vus.push((await publierP(Pr, 'Prudence', 10, 400)).points_semaine); }
    check(JSON.stringify(vus) === JSON.stringify([220, 220, 220, 220]), `0 point lundi, 400 mardi envoyés quatre fois de suite : 220 dès le premier envoi, jamais plus ce jour-là (${vus.join(', ')})`);
    await heure('2026-10-16T09:00:00Z'); // vendredi
    r = await publierP(Pr, 'Prudence', 10, 400);
    check(r.points_comptes === 180 && r.points_plafonnes === false && r.points_semaine === 400, `vendredi, le reste se compte (plafond du vendredi : 400) (${r.points_semaine})`);
    // toute une semaine hors ligne : rien n'est perdu
    await heure('2026-10-12T09:30:00Z');
    await publierP(Pc, 'Camille', 10, 5);
    await heure('2026-10-18T21:00:00Z'); // dimanche 23 h
    r = await publierP(Pc, 'Camille', 10, 510);
    check(r.points_comptes === 505 && r.points_plafonnes === false && (await ligne(Pc.id)).points === 510, 'une semaine entière sans réseau, le maximum du barème (510) envoyé dimanche soir : tout compte');
    await avancer(11);
    r = await publierP(Pc, 'Camille', 10, 99999);
    check(r.points_comptes === 0 && r.points_plafonnes === true && (await ligne(Pc.id)).points === 510, 'au-delà : jamais plus de 510 dans la semaine (le maximum du jeu)');
    await heure('2026-10-19T07:00:00Z'); // lundi suivant
    r = await publierP(Pc, 'Camille', 10, 12);
    l = await ligne(Pc.id);
    check(r.ok && l.points === 12 && l.points_total === 522 && l.semaine === '2026-10-19' && r.rang_semaine === 1, 'le lundi suivant : la semaine repart de 12 points, « Tous les temps » en compte 522');
    // arriver en milieu de semaine
    await heure('2026-10-22T10:00:00Z'); // jeudi
    r = await publierP(Po, 'Odile', 5, 300);
    check(r.ok && r.points_comptes === 300 && r.points_total === 300, 'arriver un jeudi avec 300 points de la semaine : comptés (sous le plafond du jeudi, 340), « Tous les temps » compris');
    await avancer(5);
    r = await publier(Ph, 'Hector', 5, 'anon', pts(300, '2026-10-12'));
    check(r.ok && r.points_comptes === 0 && (await ligne(Ph.id)).points === 0, 'arriver avec des points d’une semaine finie : rien');
    // le rang se fait aux points, pas à l'argent
    await vider();
    await heure('2026-10-21T10:00:00Z');
    const Riche = joueur(), Petit = joueur();
    await publierP(Riche, 'Riche', 1e18, 0); await publierP(Petit, 'Petit', 1000, 0);
    await avancer(3600);
    await publierP(Riche, 'Riche', 1.0001e18, 10); r = await publierP(Petit, 'Petit', 1500, 50);
    const sem = await classement('semaine', Petit.id), tot = await classement('total', Petit.id);
    check(r.rang_semaine === 1 && r.rang_total === 1 && sem.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.points} ${x.valeur}`).join(', ') === '1 Petit 50 500, 2 Riche 10 100000000000000' && tot.lignes[0].pseudo === 'Petit' && sem.moi.points === 50 && tot.moi.points === 50,
      `le rang se fait aux points : le petit boulanger (50 points, 500 €) devant le riche (10 points, 1e14 €), cette semaine et de tous les temps (${sem.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.points} pts ${x.valeur} €`).join(', ')})`);
    // un tricheur qui envoie le maximum à chaque instant : jamais plus que le meilleur joueur possible
    await vider();
    await heure('2026-10-26T07:00:00Z'); // lundi 26 octobre, 8 h (heure d'hiver)
    const Tri = joueur(), Max = joueur();
    await publierP(Tri, 'Tricheur', 5, 1e5);
    const suite = [];
    for (let d = 0; d < 7; d++) { for (let k = 0; k < 6; k++) { await heure(Date.parse('2026-10-25T23:00:30Z') + d * 864e5 + k * 4 * 3600e3); r = await publierP(Tri, 'Tricheur', 5, 1e5); } suite.push((await ligne(Tri.id)).points); }
    await heure('2026-11-01T22:00:00Z'); // dimanche 23 h
    await publierP(Max, 'Parfaite', 5, 510);
    const fin = await classement('semaine');
    // le même tricheur, avec une identité neuve, le dimanche soir : pas mieux
    const Tri2 = joueur();
    await heure('2026-11-01T22:00:30Z');
    r = await publierP(Tri2, 'Dimanche', 5, 99999);
    check(r.ok && r.points_semaine === 510 && r.rang_semaine === 1 && (await classement('semaine')).lignes.every((x) => x.rang === 1 && x.points === 510), `inscrit le dimanche soir avec 99 999 points : 510, ex æquo avec la joueuse parfaite, jamais devant (${r.points_semaine})`);
    // des joueurs honnêtes (test/longevite.js), Atelier parfait le lundi matin : jamais plafonnés
    for (const [profil, t0, cadence] of [['assidu', Date.UTC(2026, 9, 11, 22), 300], ['regulier', Date.UTC(2027, 2, 21, 23), 60]]) {
      await vider();
      const Hj = joueur(), envois = trajectoirePoints(profil, 14, t0, cadence);
      let plafonnes = 0, refus = 0, der = -Infinity, attendu = 0, semAvant = null, maxSem = 0, n = 0;
      for (const [t, fortune, points, lundi] of envois) {
        if (t - der < 10500) continue; der = t; n++;
        await heure(t);
        const rr = await publierP(Hj, 'Honnête', fortune, points);
        if (!rr.ok) refus++; else if (rr.points_plafonnes) plafonnes++;
        if (lundi !== semAvant) { semAvant = lundi; } maxSem = Math.max(maxSem, points);
        void lundi; attendu = points;
      }
      const fin = await ligne(Hj.id);
      check(n > 50 && refus === 0 && plafonnes === 0 && fin.points === attendu, `${profil} (${LG_PROFILS[profil]} par jour, 14 jours dès le ${new Date(t0 + 12 * 3600e3).toISOString().slice(0, 10)}), envois toutes les ${cadence / 60} min : ${n} envois, aucun plafonné, ${fin.points_total} points comptés depuis l'arrivée (jusqu'à ${maxSem} dans une semaine)`);
    }
    check(JSON.stringify(suite) === JSON.stringify([160, 220, 280, 340, 400, 460, 510]) && fin.lignes.map((x) => `${x.rang} ${x.points}`).join(', ') === '1 510, 1 510',
      `un tricheur qui envoie 100 000 points toutes les 4 h : ${suite.join(', ')} jour après jour, au mieux ex æquo avec la joueuse parfaite (${fin.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.points}`).join(', ')})`);
  }

  // ─── 13. le palmarès, les récompenses, la toque du podium ───
  titre('le palmarès de la semaine et les récompenses');
  await vider();
  await heure('2027-09-08T10:00:00Z'); // mercredi, semaine du lundi 6 septembre
  const [Au, Ba, Ca, De, Eg] = [joueur(), joueur(), joueur(), joueur(), joueur()];
  const P = [[Au, 'Aurore', 300], [Ba, 'Bastien', 200], [Ca, 'Capucine', 200], [De, 'Désiré', 100], [Eg, 'Églantine', 0]];
  for (const [j, p] of P) await publierP(j, p, 1e9, 0);
  check(JSON.stringify(await figees()) === JSON.stringify(['2027-08-30']) && (await palmares()).length === 0, 'la première requête de la semaine fige la semaine passée, vide (personne n’y jouait)');
  await avancer(60);
  for (const [j, p, g] of P) await publierP(j, p, 1e9 + g, g / 10);
  r = await classement('semaine');
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.points, x.valeur])) === JSON.stringify([[1, 'Aurore', 30, 300], [2, 'Bastien', 20, 200], [2, 'Capucine', 20, 200], [4, 'Désiré', 10, 100], [5, 'Églantine', 0, 0]]), 'la semaine du 6 : Aurore 30 points (300 €), Bastien et Capucine 20 (200 €), Désiré 10 (100 €), Églantine 0');
  check((await palmares()).length === 0, 'tant que la semaine n’est pas finie, rien n’est figé');
  await heure('2027-09-13T08:00:00Z'); // lundi 10 h à Paris
  r = garde(await heureServeur());
  check(r && r.ms === horloge && Object.keys(r).join() === 'ms', `la première requête de la semaine suivante, quelle qu’elle soit (ici fournil_heure : ${JSON.stringify(r)})…`);
  let pal = await palmares('2027-09-06');
  check(podiumTexte(pal) === '1 Aurore 300, 2 Bastien 200, 2 Capucine 200' && pal.map((x) => x.points).join() === '30,20,20', `… fige le palmarès du 6 septembre : les trois premiers en points, ex æquo au même rang, avec leurs points et leurs euros ; Désiré (4e) et Églantine (0 point) n’y sont pas (${podiumTexte(pal)})`);
  check(JSON.stringify(await figees()) === JSON.stringify(['2027-08-30', '2027-09-06']), 'la semaine est marquée figée');
  await sup(`update public.fournil_joueurs set gain = 9999, points = 9999 where id = $1`, [De.id]);
  await classement('total'); await heureServeur(); await recompenses(Au);
  await sup(`update public.fournil_joueurs set gain = 100, points = 10 where id = $1`, [De.id]);
  r = await publier(De, 'Désiré', 1e9 + 100);
  check(podiumTexte(await palmares('2027-09-06')) === '1 Aurore 300, 2 Bastien 200, 2 Capucine 200' && (await ligne(De.id)).gain === 0, 'figé une fois pour toutes : ni une ligne modifiée ensuite, ni d’autres requêtes, ni le premier envoi de la semaine (qui remet le gain à zéro) ne le changent');
  r = garde(await classement('total', Au.id));
  const toques = Object.fromEntries(r.lignes.map((x) => [x.pseudo, x.podium]));
  check(JSON.stringify(toques) === JSON.stringify({ Aurore: 1, Bastien: 2, Capucine: 2, 'Désiré': null, 'Églantine': null }) && r.moi.podium === 1, `chaque ligne porte le podium de la semaine passée : ${JSON.stringify(toques)} ; « moi » aussi`);
  check(r.lignes.every((x) => Object.keys(x).sort().join() === 'en_ligne,moi,podium,points,pseudo,rang,valeur' && r.lignes.every((x) => typeof x.en_ligne === 'boolean')), 'chaque ligne : rang, pseudo, points, valeur, moi, podium, en_ligne (un booléen, jamais l’heure) — rien d’autre');
  r = await classement('semaine', Au.id);
  check(r.lignes.length === 1 && r.lignes[0].pseudo === 'Désiré' && r.lignes[0].podium === null && r.moi === null, 'cette semaine : seul Désiré a envoyé ; Aurore n’y est pas encore');
  r = garde(await recompenses(Au));
  check(r.ok === true && r.erreur === null && JSON.stringify(r.podiums) === JSON.stringify([{ semaine: '2027-09-06', rang: 1 }]) && r.derniere && r.derniere.semaine === '2027-09-06' && JSON.stringify(r.derniere.podium) === JSON.stringify([{ rang: 1, pseudo: 'Aurore', points: 30, valeur: 300 }, { rang: 2, pseudo: 'Bastien', points: 20, valeur: 200 }, { rang: 2, pseudo: 'Capucine', points: 20, valeur: 200 }]), `Aurore : ses podiums, et le podium de la semaine passée (${JSON.stringify(r)})`);
  r = garde(await recompenses(Eg));
  check(r.ok === true && r.podiums.length === 0 && r.derniere && r.derniere.podium.length === 3, 'Églantine : aucun podium, mais le podium de la semaine passée');
  r = garde(await recompenses({ id: Au.id, jeton: Ba.jeton }));
  check(r.ok === false && r.erreur === 'jeton' && r.podiums.length === 0 && r.derniere === null, 'le jeton d’un autre : « jeton », rien');
  r = garde(await recompenses({ id: Au.id, jeton: 'court' }));
  check(r.ok === false && r.erreur === 'jeton', 'un jeton mal formé : « jeton »');
  r = garde(await recompenses({ id: null, jeton: Au.jeton }));
  check(r.ok === false && r.erreur === 'jeton', 'sans identifiant : « jeton »');
  r = garde(await recompenses(joueur()));
  check(r.ok === true && r.podiums.length === 0 && r.derniere && r.derniere.semaine === '2027-09-06', 'un inconnu (jamais inscrit, ou effacé par le ménage) : aucun podium, le podium de la semaine passée');
  // la semaine du 13 : ex æquo à la 3e place ; Églantine ne joue pas
  await avancer(60);
  for (const [j, p, v, n] of [[Au, 'Aurore', 1e9 + 800, 50], [Ba, 'Bastien', 1e9 + 600, 40], [Ca, 'Capucine', 1e9 + 300, 10], [De, 'Désiré', 1e9 + 200, 10]]) await publierP(j, p, v, n);
  // personne ne vient de toute la semaine du 20 ; la requête suivante arrive le mardi 28
  await heure('2027-09-28T09:00:00Z');
  r = garde(await recompenses(Au));
  pal = await palmares('2027-09-13');
  check(podiumTexte(pal) === '1 Aurore 500, 2 Bastien 400, 3 Capucine 100, 3 Désiré 100', `la semaine du 13, figée deux semaines plus tard (personne n’est venu entre-temps) : ex æquo à la 3e place, ils sont quatre (${podiumTexte(pal)})`);
  check(JSON.stringify(await figees()) === JSON.stringify(['2027-08-30', '2027-09-06', '2027-09-13', '2027-09-20']) && (await palmares('2027-09-20')).length === 0, 'la semaine du 20, où personne n’a joué, est figée vide');
  check(r.ok && JSON.stringify(r.podiums) === JSON.stringify([{ semaine: '2027-09-06', rang: 1 }, { semaine: '2027-09-13', rang: 1 }]) && r.derniere === null, `Aurore : deux podiums ; la semaine passée (le 20) n’a pas de podium : derniere = null (${JSON.stringify(r)})`);
  r = await classement('total');
  check(r.lignes.every((x) => x.podium === null), 'personne ne porte de toque cette semaine (la semaine passée était vide)');
  // la semaine du 27 : Bastien la saute
  await avancer(60);
  for (const [j, p, v, n] of [[Au, 'Aurore', 1e9 + 850, 5], [Ca, 'Capucine', 1e9 + 370, 7], [Eg, 'Églantine', 1e9 + 10, 1]]) await publierP(j, p, v, n);
  await heure('2027-10-05T07:00:00Z'); // mardi
  r = await publier(Ba, 'Bastien', 1e9 + 700); // le premier envoi de la semaine du 4 octobre : il fige la semaine du 27
  pal = await palmares('2027-09-27');
  check(podiumTexte(pal) === '1 Capucine 70, 2 Aurore 50, 3 Églantine 10' && r.ok && r.compte === 100, `la semaine du 27 : ${podiumTexte(pal)} ; Bastien, qui l’a sautée, revient (ses 100 € comptent pour la semaine en cours)`);
  r = await classement('total', Ba.id);
  check(r.moi.podium === null && (r.lignes.find((x) => x.pseudo === 'Églantine') || {}).podium === 3, 'Bastien n’a pas de toque cette semaine, Églantine a la toque de bronze');
  r = await recompenses(Ba);
  check(JSON.stringify(r.podiums) === JSON.stringify([{ semaine: '2027-09-06', rang: 2 }, { semaine: '2027-09-13', rang: 2 }]) && r.derniere.semaine === '2027-09-27', 'mais il garde ses deux podiums d’argent');
  r = await recompenses(Eg);
  check(JSON.stringify(r.podiums) === JSON.stringify([{ semaine: '2027-09-27', rang: 3 }]), 'Églantine : un podium de bronze');
  await avancer(11);
  await publier(Ca, 'Capucine B', 1e9 + 400);
  check((await palmares('2027-09-27'))[0].pseudo === 'Capucine' && (await recompenses(Eg)).derniere.podium[0].pseudo === 'Capucine', 'changer de pseudo ne réécrit pas le palmarès (il garde le nom de ce moment-là)');
  r = await retirer(Au);
  check(r.ok === true && (await sup('select count(*)::int as n from public.fournil_palmares where id = $1', [Au.id]))[0].n === 0, 'Aurore quitte le classement : ses trois podiums sont effacés du palmarès');
  r = await recompenses(Eg);
  check(JSON.stringify(r.derniere.podium) === JSON.stringify([{ rang: 1, pseudo: 'Capucine', points: 7, valeur: 70 }, { rang: 3, pseudo: 'Églantine', points: 1, valeur: 10 }]), 'le podium de la semaine passée, sans elle : les autres gardent leur rang');
  r = await recompenses(Au);
  check(r.ok === true && r.podiums.length === 0, 'avec son ancien identifiant : plus aucun podium sur le serveur (ses coupes restent sur son téléphone)');

  // ─── 14. l'heure du serveur ───
  titre('fournil_heure');
  r = garde(await heureServeur());
  check(r.ms === horloge && Number.isInteger(r.ms), `l’heure (simulée) du serveur, en millisecondes : ${r.ms} = ${new Date(r.ms).toISOString()}`);
  await avancer(0.25);
  r = await heureServeur('authenticated');
  check(r.ms === horloge, 'authenticated aussi, à la milliseconde');

  // ─── 15. rangs et ex æquo ───
  titre('rangs et ex æquo');
  await vider();
  await heure('2027-04-07T10:00:00Z');
  const R1 = joueur(), R2 = joueur(), R3 = joueur(), R4 = joueur();
  await publierP(R1, 'Rose', 100, 0); await publierP(R2, 'anatole', 100, 0); await publierP(R4, 'Victor', 300, 0);
  r = await publierP(R3, 'Zélie', 50, 0);
  check(r.rang_total === 1 && r.rang_semaine === 1 && r.joueurs === 4 && r.joueurs_semaine === 4, `à l’arrivée, tout le monde est à 0 € : tous ex æquo, 1ers (${r.rang_total}, ${r.rang_semaine})`);
  await avancer(11);
  await publierP(R4, 'Victor', 600, 30); await publierP(R1, 'Rose', 200, 10); await publierP(R2, 'anatole', 200, 10); await publierP(R3, 'Zélie', 100, 5);
  r = garde(await classement('total', R2.id));
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.points, x.valeur, x.moi])) === JSON.stringify([[1, 'Victor', 30, 300, false], [2, 'anatole', 10, 100, true], [2, 'Rose', 10, 100, false], [4, 'Zélie', 5, 50, false]]), `tous les temps : 1, 2, 2, 4 (ex æquo au même rang, puis par pseudo) — ${JSON.stringify(r.lignes.map((x) => x.rang + ' ' + x.pseudo))}`);
  check(r.moi && r.moi.rang === 2 && r.moi.points === 10 && r.moi.valeur === 100, '« moi » (anatole) : 2e, 10 points, 100 €');
  await avancer(11);
  await publierP(R3, 'Zélie', 130, 8); await publierP(R1, 'Rose', 210, 11); r = await publierP(R2, 'anatole', 210, 11);
  check(r.rang_semaine === 2 && r.rang_total === 2, `anatole : 2e ex æquo cette semaine et de tous les temps (${r.rang_semaine}, ${r.rang_total})`);
  r = await classement('semaine');
  check(JSON.stringify(r.lignes.map((x) => [x.rang, x.pseudo, x.points, x.valeur])) === JSON.stringify([[1, 'Victor', 30, 300], [2, 'anatole', 11, 110], [2, 'Rose', 11, 110], [4, 'Zélie', 8, 80]]), `cette semaine : Victor 30 points, anatole et Rose 11, Zélie 8 (et leurs euros) — ${JSON.stringify(r.lignes.map((x) => x.rang + ' ' + x.pseudo + ' ' + x.points))}`);
  r = await classement('total', crypto.randomUUID());
  check(r.moi === null && r.lignes.every((x) => x.moi === false), 'un identifiant inconnu : « moi » vide, aucune ligne marquée');

  // ─── 16. « moi » hors des 50 premiers, et la limite de lignes ───
  titre('« moi » hors des premiers, nombre de lignes');
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, sommet, plausible, total, gain, semaine, cree, maj, points_total)
             select gen_random_uuid(), md5(k::text), 'Boulanger ' || k, 1e9, 1e9, 1e9, 1e6 + k, 0, '2027-04-05', $1::timestamptz - interval '2 hours', $1::timestamptz - interval '1 hour', 100 + k from generate_series(0, 55) k`, [new Date(horloge).toISOString()]);
  r = garde(await classement('total', R3.id));
  check(r.joueurs === 60 && r.lignes.length === 50 && !r.lignes.some((x) => x.moi) && r.moi && r.moi.rang === 60 && r.moi.points === 8 && r.moi.valeur === 80, `Zélie, dernière : hors des 50 lignes, mais « moi » = 60e, 8 points, 80 € (${JSON.stringify(r.moi)})`);
  check(r.lignes[0].pseudo === 'Boulanger 55' && r.lignes[0].rang === 1 && r.lignes[49].rang === 50, 'les 50 premiers, dans l’ordre');
  r = await classement('semaine', R3.id);
  check(r.joueurs === 60 && r.moi && r.moi.rang === 4 && r.moi.points === 8, `cette semaine, Zélie (8 points) est 4e, devant les 56 boulangers à 0 point (${JSON.stringify(r.moi)})`);
  for (const [lim, attendu] of [[0, 1], [-5, 1], [null, 50], [7, 7], [100, 60], [1000, 60]]) {
    r = await classement('total', null, lim);
    check(r.lignes.length === attendu, `p_limite = ${lim} → ${attendu} ligne(s)`);
  }
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, total, gain, semaine, cree, maj)
             select gen_random_uuid(), md5(k::text), 'masse ' || k, k, k, 0, '2027-04-05', $1::timestamptz - interval '1 day', $1::timestamptz - interval '1 hour' from generate_series(1, 80) k`, [new Date(horloge).toISOString()]);
  r = await classement('total', null, 1000);
  check(r.joueurs === 140 && r.lignes.length === 100, `140 joueurs, p_limite = 1000 → bornée à 100 lignes (${r.lignes.length})`);
  r = await refus('anon', `select public.fournil_classement('mois')`);
  check(r === '22023', `période inconnue : refusée (${r})`);
  r = await refus('anon', `select public.fournil_classement(null)`);
  check(r === '22023', `période absente : refusée (${r})`);

  // ─── 17. les garde-fous contre l'inondation ───
  titre('garde-fous : inscriptions par heure, joueurs au plus');
  await vider();
  await heure('2027-05-05T10:00:00Z');
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, semaine, cree, maj)
             select gen_random_uuid(), md5(k::text), 'récent ' || k, k, '2027-05-03', $1::timestamptz - interval '30 minutes', $1::timestamptz - interval '30 minutes' from generate_series(1, 59) k`, [new Date(horloge).toISOString()]);
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
  await sup(`insert into public.fournil_joueurs (id, jeton, pseudo, fortune, semaine, cree, maj)
             select gen_random_uuid(), md5(k::text), 'plein ' || k, k, '2027-05-03', $1::timestamptz - interval '2 hours', $1::timestamptz - interval '2 hours' from generate_series(1, 2000 - 61) k`, [new Date(horloge).toISOString()]);
  check(await nb() === 2000, '(2 000 joueurs)');
  const Trop = joueur();
  r = await publier(Trop, 'Le deux-millième-et-un', 5);
  r = await publier(Trop, 'Deuxmille1', 5);
  check(r.ok === false && r.erreur === 'complet' && await nb() === 2000, `2 000 joueurs : une nouvelle inscription répond « complet » (${r.erreur})`);
  await avancer(11);
  r = await publier(N60, 'Soixante', 8);
  check(r.ok === true && r.joueurs === 2000, 'un joueur déjà inscrit continue d’envoyer');
  await sup(`delete from public.fournil_joueurs where pseudo like 'plein %' or pseudo like 'récent %'`);

  // ─── 17 bis. les inscriptions par source (l'adresse que Cloudflare met dans cf-connecting-ip) ───
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
  for (let k = 0; k < 12; k++) { r = await publier(joueur(), `sans-en-tete-${k}`, 5); if (!r.ok) break; }
  check(r.ok === true && (await sup('select count(*)::int as n from public.fournil_portes'))[0].n === 0, 'sans en-tête cf-connecting-ip : pas de compte par source (seuls les plafonds communs jouent), rien dans les portes');
  await entetes({ 'x-forwarded-for': '203.0.113.7' });
  r = await publier(joueur(), 'xff-seul', 5);
  check(r.ok === true && (await sup('select count(*)::int as n from public.fournil_portes'))[0].n === 0, 'x-forwarded-for seul : ignoré');
  await entetes(null);

  // ─── 17 ter. le ménage : lignes oubliées depuis 90 jours, inscriptions jamais suivies depuis 7 jours ───
  titre('le ménage des lignes oubliées');
  await vider();
  await heure('2026-10-07T10:00:00Z');
  const Mo = joueur(), Pa = joueur(), Ve = joueur(), Fa = joueur();
  await publier(Mo, 'Marie', 1.01e15); await publier(Pa, 'Paul', 10); await publier(Fa, 'Fantôme', 7);
  await avancer(11);
  await publierP(Mo, 'Marie', 1.02e15, 20); // Marie a envoyé au moins deux fois : seule la règle des 90 jours la concerne
  await publierP(Pa, 'Paul', 11, 1);
  const majMarie = horloge;
  await heure(majMarie + 6 * 86400e3);
  await publier(Pa, 'Paul', 12);
  check(!!(await ligne(Fa.id)), 'une inscription jamais suivie d’un autre envoi : encore là au bout de 6 jours');
  await heure(majMarie + 8 * 86400e3);
  await publier(Pa, 'Paul', 13);
  check(!(await ligne(Fa.id)) && !!(await ligne(Mo.id)), 'au bout de 8 jours, elle est effacée au premier envoi d’un autre joueur ; Marie, qui a déjà envoyé, reste');
  check(podiumTexte(await palmares('2026-10-05')) === '1 Marie 10000000000000, 2 Paul 1', 'entre-temps, la semaine du 5 octobre a été figée : Marie 1re, Paul 2e');
  await heure(majMarie + 89 * 86400e3);
  await publier(Pa, 'Paul', 20);
  check(!!(await ligne(Mo.id)) && (await classement('total')).lignes.some((x) => x.pseudo === 'Marie' && x.points === 20), '89 jours sans nouvelles de Marie : elle reste dans « Tous les temps »');
  await heure(majMarie + 91 * 86400e3);
  r = await publier(Pa, 'Paul', 30);
  check(r.ok && !(await ligne(Mo.id)) && r.joueurs === 1, '91 jours : elle est effacée au premier envoi d’un autre joueur');
  check(!(await palmares()).some((x) => x.id === Mo.id) && (await palmares()).some((x) => x.id === Pa.id), 'son palmarès part avec elle (celui de Paul reste)');
  r = await classement('total');
  check(!r.lignes.some((x) => x.pseudo === 'Marie'), 'sa ligne fantôme a quitté « Tous les temps »');
  await avancer(60);
  r = await publier(Mo, 'Marie', 2e15); l = await ligne(Mo.id);
  check(r.ok === true && l && l.total === 0 && l.sommet === 2e15 && l.plausible === 2e15 && l.jeton === sha(Mo.jeton), 'elle revient avec le même téléphone : réinscrite toute seule, même identité, elle repart de zéro');
  check((await retirer(Mo)).ok === true, '(elle quitte le classement)');
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
  await heure(horloge + 120 * 86400e3);
  const creeVe = await (async () => { await publier(Ve, 'Véronique', 1); await avancer(11); await publier(Ve, 'Véronique', 2); return (await ligne(Ve.id)).cree; })();
  await heure(horloge + 100 * 86400e3);
  r = await publier(Ve, 'Véronique', 50); l = await ligne(Ve.id);
  check(r.ok === true && r.compte === 48 && l && +l.cree === +creeVe && await nb() === 1, 'absente 100 jours, Véronique renvoie la première : elle garde sa ligne (son jeton la protège), les autres oubliés sont effacés');

  // ─── 18. le retrait ───
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
  check(r.ok === true && (await ligne(Q.id)).total === 0, 'revenir plus tard avec le même téléphone : nouvelle inscription, il repart de zéro');

  // ─── 19. l'accès direct, refusé ───
  titre('accès direct refusé');
  for (const role of ['anon', 'authenticated']) {
    const essais = [
      ['select jeton from public.fournil_joueurs', 'lire les empreintes'],
      ['select count(*) from public.fournil_joueurs', 'compter les lignes'],
      [`insert into public.fournil_joueurs (id, jeton, pseudo, semaine) values (gen_random_uuid(), 'x', 'Intrus', current_date)`, 'insérer un joueur'],
      [`update public.fournil_joueurs set total = 1e20`, 'modifier les scores'],
      ['truncate public.fournil_joueurs', 'vider la table'],
      ['alter table public.fournil_joueurs disable row level security', 'désactiver la sécurité'],
      ['create policy tout on public.fournil_joueurs for select using (true)', 'ajouter une règle'],
      [`insert into public.fournil_palmares (semaine, rang, id, pseudo, valeur) values (current_date, 1, gen_random_uuid(), 'Intrus', 1)`, 'se mettre au palmarès'],
    ];
    for (const t of TABLES) essais.push([`select * from public.${t}`, `lire ${t}`], [`delete from public.${t}`, `effacer dans ${t}`]);
    for (const f of ['fournil_maintenant()', 'fournil_lundi(now())', `fournil_pseudo_propre('x')`, `fournil_jeton_valable('x')`, `fournil_empreinte('x')`, 'fournil_paliers()', 'fournil_segment(1)', 'fournil_duree(1, 2)', 'fournil_borne(1, 2)', 'fournil_figer(current_date)', 'fournil_reponse(null, null, current_date, null, null, null, null)', 'fournil_jour(now())', 'fournil_points_plafond(1)'])
      essais.push([`select public.${f}`, `appeler ${f.replace(/\(.*/, '')}`]);
    for (const [sql, quoi] of essais) {
      const err = await refus(role, sql);
      check(err === '42501', `${role} ne peut pas ${quoi} (${err})`);
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

  // ─── 20. authenticated (un joueur connecté à un compte Supabase) ───
  titre('authenticated');
  const Au2 = joueur(); await avancer(1);
  r = await publier(Au2, 'Connecté', 42, 'authenticated');
  await avancer(11);
  const r2 = await publier(Au2, 'Connecté', 84, 'authenticated');
  const ra = await classement('total', Au2.id, 10, 'authenticated');
  const rc = await recompenses(Au2, 'authenticated');
  await avancer(11);
  const rr = await retirer(Au2, 'authenticated');
  check(r.ok === true && r2.compte === 42 && ra.moi && ra.moi.valeur === 42 && rc.ok === true && rr.ok === true, 'authenticated peut publier, lire le classement et ses récompenses, et se retirer');

  // ─── 21. aucune réponse ne laisse fuir un secret ───
  titre('rien ne fuit');
  const tout = JSON.stringify(reponses), empreintes = (await sup('select jeton from public.fournil_joueurs')).map((x) => x.jeton);
  check(!/jeton"\s*:/.test(tout.replace(/"erreur":"jeton"/g, '')) && !/"id"\s*:/.test(tout), 'aucune réponse ne contient de champ « jeton » ni « id »');
  check(![A, B0, S, T, R1, R2, R3, R4, Q, Q2, Lapo, Au, Ba, Ca, De, Eg, Tr].some((j) => tout.includes(j.id) || tout.includes(j.jeton) || tout.includes(sha(j.jeton))) && !empreintes.some((h) => tout.includes(h)), 'ni identifiant, ni jeton, ni empreinte dans les réponses (récompenses comprises)');

  // ─── 22. le recoller, avec des joueurs et un palmarès dedans (et des réglages bricolés à la main entre-temps) ───
  titre('recoller le fichier');
  await sup(`insert into public.fournil_palmares (semaine, rang, id, pseudo, valeur) values ('2027-05-03', 1, $1, 'Quitterie', 400)`, [Q2.id]);
  await sup(`insert into public.fournil_semaines (semaine, figee) values ('2027-05-03', now()) on conflict do nothing`);
  const photo = async () => JSON.stringify([await sup('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj, points, points_total, points_jour from public.fournil_joueurs order by id'), await sup('select * from public.fournil_palmares order by semaine, id'), await sup('select * from public.fournil_semaines order by semaine')]);
  const avant = await photo();
  await sup('create policy tout_le_monde on public.fournil_joueurs for select using (true)');
  await sup('create policy tout_le_monde on public.fournil_palmares for select using (true)');
  await sup('grant select, insert on public.fournil_joueurs, public.fournil_palmares to anon');
  await sup('grant execute on function public.fournil_empreinte(text), public.fournil_borne(double precision, double precision) to anon');
  try { await coller(); check(true, 'recollé sans erreur, avec des joueurs et un palmarès dans les tables'); } catch (err) { check(false, 'recollé sans erreur : ' + err.message); }
  check(await photo() === avant, 'les joueurs, le palmarès et les semaines figées sont tous là, inchangés');
  check((await sup('select public.fournil_maintenant() = now() as v'))[0].v === true, 'l’heure redevient l’heure vraie (l’horloge de test est remplacée)');
  r = await heureServeur();
  check(Math.abs(r.ms - Date.now()) < 5000, `fournil_heure donne alors l’heure vraie (écart ${r.ms - Date.now()} ms)`);
  await structure('après recollage : les règles et les droits ajoutés à la main sont retirés');
  await installerHorloge();
  await avancer(11);
  r = await publier(Lapo, "L'as d'la miche", 50);
  check(r.ok === true && r.compte === 45, 'et tout remarche');

  // ─── 23. le téléphone et le serveur sur le même contrat : le VRAI moteur de src/classement.js, branché sur ce Postgres ───
  titre('le contrat : src/classement.js et src/horloge.js face au SQL');
  {
    const CL = require('../src/classement.js');
    // les fonctions que le téléphone appelle, et avec quels paramètres, lues dans ses sources
    const appels = new Map();
    for (const f of ['../src/classement.js', '../src/horloge.js']) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      for (const m of src.matchAll(/(?:rpc|appeler)\((?:config, )?'(fournil_\w+)', \{([^}]*)\}/g)) {
        const cles = [...m[2].matchAll(/(p_\w+)\s*:/g)].map((x) => x[1]);
        appels.set(m[1] + '(' + cles.join(',') + ')', { nom: m[1], cles });
      }
    }
    const procs = await sup(`select p.proname as nom, coalesce(p.proargnames, '{}') as noms, p.pronargs as n, p.pronargdefaults as defauts,
                                    array(select format_type(t, null) from unnest(p.proargtypes) t) as types
                               from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                              where s.nspname = 'public' and p.proname like 'fournil\\_%' and has_function_privilege('anon', p.oid, 'execute')`);
    const parNom = new Map(procs.map((p) => [p.nom, p]));
    const noms = [...new Set([...appels.values()].map((a) => a.nom))].sort();
    check(JSON.stringify(noms) === JSON.stringify(['fournil_classement', 'fournil_heure', 'fournil_publier', 'fournil_recompenses', 'fournil_retirer', 'fournil_vu']) && JSON.stringify(procs.map((p) => p.nom).sort()) === JSON.stringify(noms),
      `le téléphone appelle exactement les six fonctions ouvertes à anon : ${noms.join(', ')}`);
    const malAppeles = [...appels.values()].filter((a) => { const p = parNom.get(a.nom); if (!p) return true; const obligatoires = p.noms.slice(0, p.n - p.defauts); return a.cles.some((k) => !p.noms.includes(k)) || obligatoires.some((k) => !a.cles.includes(k)); });
    check(appels.size >= 5 && malAppeles.length === 0, `chaque appel du téléphone donne exactement les paramètres de la fonction SQL (${[...appels.keys()].join(' ; ')})${malAppeles.length ? ' — en défaut : ' + malAppeles.map((a) => a.nom).join(', ') : ''}`);

    // un PostgREST minimal : POST /rest/v1/rpc/<fonction>, paramètres nommés et typés, joué en tant qu'anon
    const fauxFetch = async (url, init) => {
      const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url), p = m && parNom.get(m[1]);
      const repondre = (status, corps) => ({ ok: status < 300, status, text: async () => JSON.stringify(corps) });
      if (!p || init.method !== 'POST' || !init.headers || !init.headers.apikey) return repondre(404, { code: 'PGRST202' });
      const corps = JSON.parse(init.body || '{}'), cles = Object.keys(corps);
      if (cles.some((k) => !p.noms.includes(k))) return repondre(404, { code: 'PGRST202' });
      const args = cles.map((k, i) => `${k} => $${i + 1}::${p.types[p.noms.indexOf(k)]}`).join(', ');
      try {
        const r = await comme('anon', `select public.${p.nom}(${args}) as r`, cles.map((k) => (corps[k] == null ? null : typeof corps[k] === 'number' ? String(corps[k]) : corps[k])));
        return repondre(200, r[0].r);
      } catch (err) { return repondre(400, { code: err.code, message: err.message }); }
    };
    const memoire = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
    const config = { supabaseUrl: 'https://banc.supabase.co', supabaseKey: 'sb_publishable_banc' };
    const fortunes = { A: 1e6, B: 5e5 }, points = { A: 0, B: 0 };
    const moteur = (qui, extra) => CL.creerMoteur({ config: () => config, fetch: fauxFetch, stockage: memoire(), maintenant: () => horloge, fortune: () => fortunes[qui], points: () => ({ points: points[qui], lundi: CL.lundiParis(horloge) }), attendre: async (ms) => { await avancer(ms / 1000); }, ...(extra || {}) });
    await vider(); await entetes(null);
    await heure('2027-06-02T10:00:00Z'); // un mercredi
    const A = moteur('A'), B = moteur('B');
    let a = await A.choisirPseudo('Contrat A'), b = await B.choisirPseudo('Contrat B');
    check(a.etat === 'ok' && b.etat === 'ok' && A.etat().rejoint && B.etat().rejoint && a.data.compte === 0 && a.data.version === V && A.version() === V, 'deux téléphones rejoignent par le vrai moteur : acceptés, rien de compté à l’arrivée (réponse lue : compte = 0, version 4)');
    await avancer(600); fortunes.A += 5000; fortunes.B += 200; points.A = 40; points.B = 20;
    a = await A.envoyer('feuille'); b = await B.envoyer('feuille');
    check(a.etat === 'ok' && a.data.compte === 5000 && a.data.plafonne === false && a.data.points_comptes === 40 && a.data.points_plafonnes === false && b.etat === 'ok' && b.data.points_comptes === 20, '10 min plus tard, leurs envois automatiques : 40 points et 5 000 € comptés pour A, 20 points pour B, sans plafond');
    let c = await A.charger('total');
    const lA = c.data && c.data.lignes.find((x) => x.pseudo === 'Contrat A');
    check(c.etat === 'ok' && c.data.version === V && lA && lA.points === 40 && lA.valeur === 5000 && lA.moi === true && lA.podium === null && c.data.moi && c.data.moi.rang === 1 && c.data.moi.points === 40 && c.data.moi.podium === null && c.data.semaine === '2027-05-31',
      `« Tous les temps » lu par le téléphone : A 1er avec 40 points (et 5 000 € gagnés depuis l’arrivée), pas encore de toque, semaine du ${c.data && c.data.semaine}`);
    check(A.resume().semaine && A.resume().semaine.rang === 1 && A.resume().semaine.points === 40 && B.resume().semaine.rang === 2, 'le résumé du téléphone (ce que montre l’icône du classement) : A 1er cette semaine avec 40 points, B 2e');
    // la semaine finit : au lundi, le palmarès est figé ; le téléphone lit ses récompenses, sa tenue, sa coupe, et la toque dans la liste
    await heure('2027-06-07T08:00:00Z');
    const rA = await A.chargerRecompenses({ ecart: 0 }), rB = await B.chargerRecompenses({ ecart: 0 });
    const vA = A.recompenses(), vB = B.recompenses();
    check(rA.etat === 'ok' && JSON.stringify(vA.podiums) === JSON.stringify([{ semaine: '2027-05-31', rang: 1 }]) && vA.portee === 'or' && vA.coupe === 'or' && vA.annonce && vA.lundi === '2027-06-07',
      `lundi : A lit ses récompenses — podium ${JSON.stringify(vA.podiums)}, tenue ${vA.portee} portée d’office, coupe ${vA.coupe} sur le comptoir, un podium à annoncer`);
    check(rB.etat === 'ok' && vB.portee === 'argent' && vB.derniere && vB.derniere.semaine === '2027-05-31' && vB.derniere.podium.map((x) => `${x.rang} ${x.pseudo} ${x.valeur}`).join(', ') === '1 Contrat A 5000, 2 Contrat B 200',
      `B : tenue ${vB.portee} ; le podium de la semaine passée lu par le téléphone : ${vB.derniere && vB.derniere.podium.map((x) => `${x.rang} ${x.pseudo} ${x.points} points (${x.valeur} €)`).join(', ')}`);
    await avancer(60); fortunes.A += 10; fortunes.B += 20; points.A = 10; points.B = 20;
    await A.envoyer('feuille'); await B.envoyer('feuille');
    c = await B.charger('semaine');
    const toques = c.etat === 'ok' ? c.data.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.points} toque ${x.podium}`).join(', ') : JSON.stringify(c);
    check(c.etat === 'ok' && c.data.semaine === '2027-06-07' && toques === '1 Contrat B 20 toque 2, 2 Contrat A 10 toque 1' && c.data.moi && c.data.moi.podium === 2,
      `« Cette semaine », relue par le téléphone : tout le monde est reparti de 0, chacun garde la petite toque de son podium de la semaine passée (${toques}), « moi » aussi`);
    // l'heure du serveur, comme la lit src/horloge.js
    const h = await CL.appeler(CL.lireConfig(config), 'fournil_heure', {}, { fetch: fauxFetch });
    check(h.etat === 'ok' && h.data.ms === horloge, `fournil_heure lue par le téléphone (appeler, comme src/horloge.js) : { ms: ${h.data && h.data.ms} } = l’heure du serveur`);
    // quitter : le palmarès du serveur est effacé, les coupes et tenues restent sur le téléphone
    const q = await A.quitter();
    check(q.etat === 'ok' && !A.etat().rejoint && A.recompenses().podiums.length === 1 && A.recompenses().gagnees.join() === 'or' && (await sup('select count(*)::int as n from public.fournil_palmares where pseudo = $1', ['Contrat A']))[0].n === 0,
      'A quitte le classement : le serveur efface son palmarès, son téléphone garde sa coupe et sa tenue d’or à vie');
    // « en ligne » par le vrai moteur : B bat, sa ligne porte enLigne ; 5 min sans rien, plus en ligne
    await avancer(30); let bv = await B.battre('retour');
    c = await B.charger('total');
    check(bv.etat === 'ok' && bv.data.ok === true && c.etat === 'ok' && c.data.lignes.length === 1 && c.data.lignes[0].enLigne === true && c.data.moi.enLigne === true && c.data.enLigneN === 1, `le battement de B (fournil_vu) arrive, et sa ligne revient avec enLigne (${JSON.stringify(c.data && c.data.lignes)})`);
    await avancer(5 * 60); c = await B.charger('total');
    check(c.etat === 'ok' && c.data.lignes[0].enLigne === false && c.data.enLigneN === 0, '5 minutes sans signe de vie : plus en ligne');
    // les bonbons par le vrai moteur : p_evt et p_score acceptés par la v5 (hors de la fenêtre d'Halloween : rien n'est compté)
    const C = moteur('A', { evenement: () => ({ id: 'hantee', score: 1234 }) });
    const rc = await C.choisirPseudo('Contrat C'), dernierAppel = (await sup(`select count(*)::int as n from public.fournil_evt_scores`))[0].n;
    check(rc.etat === 'ok' && rc.data.version === V && rc.data.evt === 'hantee' && rc.data.evt_score === null && rc.data.evt_plafonne === null && C.version() === V && dernierAppel === 0, `un téléphone de la v5 envoie ses bonbons (p_evt, p_score) : accepté ; hors de la fenêtre d’Halloween, rien n’est compté (${JSON.stringify({ evt: rc.data && rc.data.evt, score: rc.data && rc.data.evt_score })})`);
  }

  // ─── 24. recoller la version 3 alors que la dernière semaine de la version 2 n'est pas encore figée ───
  // (le lundi matin, avant que quiconque ait ouvert le jeu : la semaine finie n'a que de l'argent, aucun point)
  titre('recoller la version 3 avant que la dernière semaine de la version 2 soit figée');
  {
    const db2 = await PGlite.create();
    const s2 = async (sql, p) => (await db2.query(sql, p)).rows;
    const c2 = async (sql, p) => { await db2.exec('set role anon'); try { return (await db2.query(sql, p)).rows[0].r; } finally { await db2.exec('reset role'); } };
    const coller2 = async (texte) => { await db2.exec('set role proprio'); try { await db2.exec(texte); } finally { await db2.exec('reset role'); } };
    await db2.exec(`
      create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
      create role proprio nologin createrole;
      grant usage, create on schema public to proprio;
      grant usage on schema public to anon, authenticated, service_role;
      set role proprio;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      reset role;
      create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
      grant usage on schema banc to proprio; grant select on banc.horloge to proprio;`);
    const horloge2 = async (iso) => { await s2(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`); await s2('update banc.horloge set t = $1', [iso]); };
    const v2 = (j, pseudo, f) => c2('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4) as r', [j.id, j.jeton, pseudo, String(f)]);
    const v3 = (j, pseudo, f, points, lundi) => c2('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundi]);
    const rec = (j) => c2('select public.fournil_recompenses(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]);
    const pal = async (sem) => (await s2('select rang, pseudo, valeur, points from public.fournil_palmares where semaine = $1 order by rang, pseudo', [sem])).map((x) => `${x.rang} ${x.pseudo} ${x.valeur} ${x.points}`).join(', ');
    const [Paul, Rose, Leon] = [joueur(), joueur(), joueur()], noms = ['Vieux Paul', 'Vieille Rose', 'Vieux Léon'];
    await coller2(V2); await horloge2('2026-10-07T10:00:00Z');
    for (const [k, j] of [Paul, Rose, Leon].entries()) await v2(j, noms[k], 1e9);
    await horloge2('2026-10-07T11:00:00Z');
    for (const [k, j] of [Paul, Rose, Leon].entries()) await v2(j, noms[k], 1e9 + 1e6 * (3 - k));
    await horloge2('2026-10-12T05:00:00Z'); // lundi 12, 7 h à Paris : personne n'a encore rien demandé au serveur
    try { await coller2(SQL); check(true, 'la version 3 se colle par-dessus une version 2 dont la semaine finie n’est pas encore figée'); } catch (err) { check(false, 'la version 3 se colle : ' + err.message); }
    await horloge2('2026-10-12T05:00:00Z');
    let r = await v3(Paul, noms[0], 1e9 + 3e6, 10, '2026-10-12');
    check(r.ok === true && r.version === V && r.points_semaine === 10, `puis Paul envoie avec le jeu en version 3 (10 points) : accepté (${JSON.stringify({ ok: r.ok, points: r.points_semaine })})`);
    let p = await pal('2026-10-05');
    check(p === '1 Vieux Paul 3000000 null, 2 Vieille Rose 2000000 null, 3 Vieux Léon 1000000 null', `la semaine du 5 octobre, sans aucun point, est figée à l’argent comme en version 2 : son podium n’est pas perdu (${p || 'vide'})`);
    r = await rec(Paul);
    check(r.ok && JSON.stringify(r.podiums) === JSON.stringify([{ semaine: '2026-10-05', rang: 1 }]) && r.derniere && r.derniere.semaine === '2026-10-05' && r.derniere.podium.length === 3, `Paul garde sa tenue et sa coupe d’or du 5 octobre (${JSON.stringify(r.podiums)})`);
    // une semaine mêlée : Paul (version 3) a des points, Rose (téléphone encore en version 2) seulement de l'argent → classée aux points
    await horloge2('2026-10-13T10:00:00Z'); await v2(Rose, noms[1], 1e9 + 2e6);
    await horloge2('2026-10-13T11:00:00Z'); await v2(Rose, noms[1], 1e9 + 9e6);
    // une semaine où seuls des téléphones de la version 2 jouent : classée à l'argent, comme avant
    await horloge2('2026-10-20T10:00:00Z'); await v2(Rose, noms[1], 1e9 + 9e6); await v2(Leon, noms[2], 1e9 + 1e6);
    await horloge2('2026-10-20T11:00:00Z'); await v2(Rose, noms[1], 1e9 + 10e6); await v2(Leon, noms[2], 1e9 + 3e6);
    await horloge2('2026-10-26T08:00:00Z'); await c2('select public.fournil_heure() as r');
    p = await pal('2026-10-12');
    check(p === '1 Vieux Paul 0 10', `une semaine où un joueur a des points : classée aux points, l’argent seul ne monte pas sur le podium (${p})`);
    p = await pal('2026-10-19');
    check(p === '1 Vieux Léon 2000000 null, 2 Vieille Rose 1000000 null', `une semaine où seuls des téléphones de la version 2 ont joué : classée à l’argent, podium gardé (${p})`);
    await db2.close();
  }


  // ─── 24 bis. la version actuelle par-dessus la version 3 telle que collée sur Supabase (test/fournil-classement-v3.sql) : rien ne se perd ───
  titre('recoller la version actuelle par-dessus la version 3 (joueurs, points, palmarès)');
  {
    const V3 = fs.readFileSync(path.join(__dirname, 'fournil-classement-v3.sql'), 'utf8');
    const db3 = await PGlite.create();
    const s3 = async (sql, p) => (await db3.query(sql, p)).rows;
    const c3 = async (sql, p) => { await db3.exec('set role anon'); try { return (await db3.query(sql, p)).rows[0].r; } finally { await db3.exec('reset role'); } };
    const coller3 = async (texte) => { await db3.exec('set role proprio'); try { await db3.exec(texte); } finally { await db3.exec('reset role'); } };
    await db3.exec(`
      create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
      create role proprio nologin createrole;
      grant usage, create on schema public to proprio;
      grant usage on schema public to anon, authenticated, service_role;
      set role proprio;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      reset role;
      create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
      grant usage on schema banc to proprio; grant select on banc.horloge to proprio;`);
    const horloge3 = async (iso) => { await s3(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`); await s3('update banc.horloge set t = $1', [iso]); };
    const v3 = (j, pseudo, f, points, lundi) => c3('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundi]);
    const v4 = (j, pseudo, f, points, lundi, billets) => c3('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundi, String(billets)]);
    const [Ines, Hugo, Zoe] = [joueur(), joueur(), joueur()], noms = ['Inès', 'Hugo', 'Zoé'];
    try { await coller3(V3); check(true, 'la version 3 (celle collée sur Supabase) s’installe'); } catch (err) { check(false, 'la version 3 s’installe : ' + err.message); }
    await horloge3('2026-10-07T10:00:00Z');
    for (const [k, j] of [Ines, Hugo, Zoe].entries()) await v3(j, noms[k], 1e9, 10, '2026-10-05');
    await horloge3('2026-10-07T11:00:00Z');
    for (const [k, j] of [Ines, Hugo, Zoe].entries()) await v3(j, noms[k], 1e9 + 1e6, 10 + 10 * (3 - k), '2026-10-05');
    await horloge3('2026-10-12T08:00:00Z'); // lundi : la semaine du 5 est figée aux points par la version 3
    await c3('select public.fournil_heure() as r');
    await v3(Ines, noms[0], 1e9 + 2e6, 10, '2026-10-12');
    const photo = async () => JSON.stringify([await s3('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj, points, points_total, points_jour from public.fournil_joueurs order by id'), await s3('select semaine, rang, id, pseudo, valeur, points from public.fournil_palmares order by semaine, id'), await s3('select * from public.fournil_semaines order by semaine')]);
    const avant = await photo(), palAvant = (await s3(`select rang, pseudo, points from public.fournil_palmares where semaine = '2026-10-05' order by rang`)).map((x) => `${x.rang} ${x.pseudo} ${x.points}`).join(', ');
    check(palAvant === '1 Inès 40, 2 Hugo 30, 3 Zoé 20', `en version 3 : trois joueurs, des points, un palmarès figé aux points (${palAvant})`);
    try { await coller3(SQL); check(true, `la version ${V} se colle telle quelle par-dessus la version 3`); } catch (err) { check(false, `la version ${V} se colle par-dessus la version 3 : ` + err.message); }
    await horloge3('2026-10-12T08:00:00Z');
    check(await photo() === avant, 'rien ne se perd : joueurs (pseudo, jeton, argent, points de la semaine et depuis l’arrivée), palmarès et semaines figées de la version 3 intacts');
    const q0 = await s3('select quartier, quartier_maj from public.fournil_joueurs order by id');
    check(q0.length === 3 && q0.every((x) => x.quartier === 0 && x.quartier_maj === null), 'les billets du quartier partent de zéro pour tous');
    const fns = (await s3(`select pg_get_function_identity_arguments(oid) as a from pg_proc where proname = 'fournil_publier' and pronamespace = 'public'::regnamespace`)).map((x) => x.a);
    check(fns.length === 1 && /p_quartier/.test(fns[0]), `une seule fournil_publier (l’ancienne signature de la v3 est retirée : pas d’appel ambigu) (${fns.join(' | ')})`);
    let r = await v3(Hugo, noms[1], 1e9 + 3e6, 20, '2026-10-12');
    check(r.ok === true && r.version === V && r.points_semaine === 20, `un téléphone encore en version 3 (sans p_quartier) continue d’envoyer : accepté (${JSON.stringify({ ok: r.ok, v: r.version, points: r.points_semaine })})`);
    const rec = await c3('select public.fournil_recompenses(p_id => $1, p_jeton => $2) as r', [Ines.id, Ines.jeton]);
    check(rec.ok && JSON.stringify(rec.podiums) === JSON.stringify([{ semaine: '2026-10-05', rang: 1 }]) && rec.quartier === null, `Inès garde son podium d’or du 5 octobre ; pas encore de rang du quartier (${JSON.stringify(rec.podiums)})`);
    await horloge3('2026-10-13T12:00:00Z'); // mardi 13 à 14 h, heure de Paris : l'événement est ouvert
    r = await v4(Zoe, noms[2], 1e9 + 4e6, 10, '2026-10-12', 5e6);
    const cq = await c3('select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['quartier', Zoe.id]);
    check(r.ok === true && cq.moi && cq.moi.rang === 1 && cq.moi.valeur === 5e6, `puis un téléphone en version 4 envoie ses billets : comptés, classement « quartier » (${JSON.stringify(cq.moi)})`);
    const pts = await c3('select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['total', Ines.id]);
    check(pts.moi && pts.moi.points === 50, `les points depuis l’arrivée d’Inès sont toujours là (${pts.moi && pts.moi.points})`);
    try { await coller3(SQL); check(true, `et la version ${V} se recolle encore par-dessus elle-même`); } catch (err) { check(false, `la version ${V} se recolle : ` + err.message); }
    check((await s3('select quartier from public.fournil_joueurs where id = $1', [Zoe.id]))[0].quartier === 5e6, 'les billets restent après un nouveau collage');
    await db3.close();
  }

  // ─── 25. l'événement « Le Quartier » : les billets, l'enveloppe, le classement à part, le podium final ───
  titre('l’événement « Le Quartier » (version 4)');
  {
    const Q = require('../src/quartier.js');
    await vider(); await entetes(null);
    const publierQ = async (j, pseudo, fortune, points, quartier, role = 'anon') => (await comme(role, 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7) as r', [j.id, j.jeton, pseudo, String(fortune), String(points), lundiDe(horloge), quartier == null ? null : String(quartier)]))[0].r;
    const fen = (await sup('select debut, fin from public.fournil_quartier_fenetre()'))[0];
    check(Date.parse(fen.debut) === Q.DEBUT && Date.parse(fen.fin) === Q.FIN, `la fenêtre du serveur est celle du jeu : du ${new Date(Date.parse(fen.debut)).toISOString()} au ${new Date(Date.parse(fen.fin)).toISOString()} (heure d'hiver comprise)`);
    const borne = async (ms) => (await sup('select public.fournil_quartier_borne($1::timestamptz) as b', [new Date(ms).toISOString()]))[0].b;
    const table = (await sup('select public.fournil_quartier_table() as t'))[0].t;
    check(table.length === 15 && (await borne(Q.DEBUT - 1)) === 0 && proche(await borne(Q.DEBUT), Math.pow(10, table[0]), 1e-9) && proche(await borne(Q.DEBUT + 3 * 86400e3), Math.pow(10, table[3]), 1e-9) && proche(await borne(Q.DEBUT + 20 * 86400e3), Math.pow(10, table[14]), 1e-9),
      `l’enveloppe : 0 avant l’ouverture, la table jour par jour (10^${table[0]} à l’ouverture, 10^${table[3]} au 3e jour), constante après le 14e`);
    const b15 = await borne(Q.DEBUT + 1.5 * 86400e3);
    check(b15 > Math.pow(10, table[1]) && b15 < Math.pow(10, table[2]) && proche(Math.log10(b15), (table[1] + table[2]) / 2, 1e-9), 'entre deux jours, le log10 est interpolé');
    // avant l'ouverture : les billets ne comptent pas
    const [Ka, Lo, Ma] = [joueur(), joueur(), joueur()];
    await heure(Q.DEBUT - 3600e3);
    let r = garde(await publierQ(Ka, 'Karim', 1000, 0, 5e6));
    check(r.ok === true && r.version === V && r.quartier === 0 && r.rang_quartier === null && r.quartier_plafonne === null && (await ligne(Ka.id)).points === 0, `une heure avant l’ouverture : Karim s’inscrit, ses 5e6 billets sont ignorés (quartier = 0, pas de rang) (${JSON.stringify({ quartier: r.quartier, rang: r.rang_quartier })})`);
    r = await classement('quartier');
    check(r.version === V && r.periode === 'quartier' && r.joueurs === 0 && r.lignes.length === 0 && r.moi === null, 'le classement « quartier » : personne encore');
    // le premier jour : les billets comptent, sous l'enveloppe du moment
    await heure(Q.DEBUT + 2 * 3600e3);
    r = garde(await publierQ(Ka, 'Karim', 1000, 0, 5e6));
    check(r.ok && r.quartier === 5e6 && r.rang_quartier === 1 && r.quartier_plafonne === false, `deux heures après l’ouverture : 5e6 billets comptés, Karim 1er (${JSON.stringify({ quartier: r.quartier, rang: r.rang_quartier })})`);
    r = await publierQ(Lo, 'Louna', 500, 0, 1e24);
    const bLo = await borne(horloge);
    check(r.ok && r.quartier_plafonne === true && proche(r.quartier, bLo, 1e-9) && r.quartier < 1e13 && r.rang_quartier === 1, `Louna s’inscrit avec 1e24 billets (console) : acceptée, plafonnée à l’enveloppe du moment (${e(r.quartier)}), 1re quand même devant Karim`);
    r = await publier(Ma, 'Mathis', 100); // un téléphone de la v2
    check(r.ok && r.quartier === 0 && r.rang_quartier === null, 'un téléphone sans billets (v2 ou v3) : quartier 0, pas de rang');
    await avancer(11);
    r = await publierQ(Ka, 'Karim', 1000, 0, 2e6);
    check(r.ok && r.quartier === 5e6 && r.quartier_plafonne === false, 'des billets en baisse (vieille sauvegarde) : les 5e6 restent');
    r = await publierQ(Ka, 'Karim', 1000, 0, -1);
    check(r.ok === false && r.erreur === 'valeur', 'des billets négatifs : « valeur »');
    r = await publierQ(Ka, 'Karim', 1000, 0, 'NaN');
    check(r.ok === false && r.erreur === 'valeur', 'des billets « NaN » : « valeur »');
    await avancer(11);
    r = await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6) as r', [Ka.id, Ka.jeton, 'Karim', '1000', '0', lundiDe(horloge)]);
    check(r[0].r.ok && r[0].r.quartier === 5e6, 'un envoi sans p_quartier (téléphone v3) ne touche pas aux billets');
    r = garde(await classement('quartier', Ka.id));
    check(r.joueurs === 2 && r.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.points} ${x.podium}`).join(', ') === `1 Louna null null, 2 Karim null null` && r.lignes[1].valeur === 5e6 && r.moi && r.moi.rang === 2 && r.moi.valeur === 5e6 && r.moi.podium === null,
      `le classement « quartier » : Louna puis Karim, en billets (points : null, podium : null tant que l’événement dure), Mathis absent (0 billet) ; « moi » = ${JSON.stringify(r.moi)}`);
    r = await classement('semaine');
    check(r.lignes.length === 3 && r.lignes.every((x) => x.points === 0), 'les autres classements ne changent pas (les billets ne sont pas des points)');
    // le 10e jour : Karim grimpe ; l'enveloppe a grandi
    await heure(Q.DEBUT + 10 * 86400e3);
    r = await publierQ(Ka, 'Karim', 1e9, 100, 3e15);
    check(r.ok && r.quartier === 3e15 && r.quartier_plafonne === false && r.rang_quartier === 1, '10 jours plus tard, 3e15 billets (un assidu honnête) : comptés, pas plafonnés, Karim 1er');
    await avancer(11);
    r = await publierQ(Lo, 'Louna', 500, 0, 1e24);
    check(r.ok && r.quartier_plafonne === true && proche(r.quartier, await borne(horloge), 1e-9) && r.rang_quartier === 1, `Louna renvoie 1e24 : plafonnée à l’enveloppe du 10e jour (${e(r.quartier)}), ce qui la remet devant`);
    r = await recompenses(Ka);
    check(r.ok && r.quartier === null && r.quartier_podium === null, 'tant que l’événement dure, fournil_recompenses ne rend ni rang ni podium du quartier');
    // la fin : une heure de grâce, puis plus rien ; le podium est figé à la première requête qui suit
    await heure(Q.FIN + 30 * 60e3);
    r = await publierQ(Ka, 'Karim', 1e9, 100, 1e16);
    check(r.ok && r.quartier === 1e16 && r.rang_quartier === 2 && (await sup(`select count(*)::int as n from public.fournil_evenements where nom = 'quartier'`))[0].n === 0, 'une demi-heure après la fin : le dernier envoi compte encore (une heure de grâce), rien n’est figé ; Karim reste 2e derrière Louna');
    await heure(Q.FIN + 2 * 3600e3);
    r = garde(await heureServeur());
    const pod = await sup('select rang, pseudo, valeur from public.fournil_quartier_podium order by rang, lower(pseudo)');
    check(pod.map((x) => `${x.rang} ${x.pseudo}`).join(', ') === '1 Louna, 2 Karim' && pod[1].valeur === 1e16 && (await sup(`select count(*)::int as n from public.fournil_evenements where nom = 'quartier'`))[0].n === 1,
      `deux heures après la fin, la première requête (ici fournil_heure) fige le podium final : ${pod.map((x) => `${x.rang} ${x.pseudo} ${e(x.valeur)}`).join(', ')} (Mathis, sans billets, n’y est pas)`);
    r = await publierQ(Ka, 'Karim', 1e9, 100, 1e20);
    check(r.ok && r.quartier === 1e16 && r.quartier_plafonne === null, 'après la grâce, 1e20 billets : ignorés, les 1e16 restent');
    r = await publierQ(Ma, 'Mathis', 100, 0, 7e15);
    check(r.ok && r.quartier === 0 && pod.length === 2 && (await sup('select count(*)::int as n from public.fournil_quartier_podium'))[0].n === 2, 'Mathis envoie des billets trop tard : rien, et le podium figé ne bouge pas');
    r = garde(await recompenses(Ka));
    check(r.ok && r.quartier === 2 && JSON.stringify(r.quartier_podium) === JSON.stringify([{ rang: 1, pseudo: 'Louna', valeur: pod[0].valeur }, { rang: 2, pseudo: 'Karim', valeur: 1e16 }]), `Karim lit ses récompenses : 2e du quartier, et le podium final (${JSON.stringify(r.quartier_podium)})`);
    r = garde(await recompenses(Ma));
    check(r.ok && r.quartier === null && r.quartier_podium.length === 2, 'Mathis : pas de rang, mais le podium final');
    r = garde(await recompenses(joueur()));
    check(r.ok && r.quartier === null && Array.isArray(r.quartier_podium), 'un inconnu : pas de rang, le podium final');
    r = garde(await recompenses({ id: Ka.id, jeton: Lo.jeton }));
    check(r.ok === false && r.erreur === 'jeton' && r.quartier === null && r.quartier_podium === null, 'le jeton d’un autre : rien');
    r = garde(await classement('quartier', Lo.id));
    check(r.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.podium}`).join(', ') === '1 Louna 1, 2 Karim 2' && r.moi.podium === 1, 'le classement « quartier » porte maintenant le podium final sur chaque ligne');
    await avancer(11);
    await publier(Lo, 'Louna B', 600);
    check((await sup('select pseudo from public.fournil_quartier_podium where rang = 1'))[0].pseudo === 'Louna', 'changer de pseudo ne réécrit pas le podium figé');
    r = await retirer(Lo);
    check(r.ok && (await sup('select count(*)::int as n from public.fournil_quartier_podium'))[0].n === 1 && (await recompenses(Ka)).quartier_podium.length === 1 && (await recompenses(Ka)).quartier === 2, 'Louna quitte le classement : elle sort du podium final (Karim y garde sa 2e place)');
    check(!/"jeton"|"id"/.test(JSON.stringify(r)), 'aucune réponse ne fuit un identifiant');
    // recoller : le podium et les billets restent
    await coller();
    check((await sup('select count(*)::int as n from public.fournil_quartier_podium'))[0].n === 1 && (await ligne(Ka.id)).quartier === undefined || (await sup('select quartier from public.fournil_joueurs where id = $1', [Ka.id]))[0].quartier === 1e16, 'recollé après la fin : le podium figé et les billets restent');
    await installerHorloge();
  }

  // ─── 24 ter. la version 5 par-dessus la version 4 telle que collée sur Supabase (test/fournil-classement-v4.sql) : rien ne se perd ───
  titre('recoller la version 5 par-dessus la version 4 (joueurs, points, palmarès, billets et podium du Quartier)');
  {
    const V4 = fs.readFileSync(path.join(__dirname, 'fournil-classement-v4.sql'), 'utf8');
    const db4 = await PGlite.create();
    const s4 = async (sql, p) => (await db4.query(sql, p)).rows;
    const c4 = async (sql, p) => { await db4.exec('set role anon'); try { return (await db4.query(sql, p)).rows[0].r; } finally { await db4.exec('reset role'); } };
    const coller4 = async (texte) => { await db4.exec('set role proprio'); try { await db4.exec(texte); } finally { await db4.exec('reset role'); } };
    await db4.exec(`
      create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
      create role proprio nologin createrole;
      grant usage, create on schema public to proprio;
      grant usage on schema public to anon, authenticated, service_role;
      set role proprio;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      reset role;
      create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
      grant usage on schema banc to proprio; grant select on banc.horloge to proprio;`);
    const horloge4 = async (iso) => { await s4(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`); await s4('update banc.horloge set t = $1', [iso]); };
    const v4 = (j, pseudo, f, points, lundi, billets) => c4('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundi, String(billets)]);
    const v5 = (j, pseudo, f, points, lundi, billets, evt, score) => c4('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7, p_evt => $8, p_score => $9) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundi, billets == null ? null : String(billets), evt, score == null ? null : String(score)]);
    const [Ali, Bea, Cyr, Dan] = [joueur(), joueur(), joueur(), joueur()], noms = ['Ali', 'Béa', 'Cyril', 'Dany'];
    try { await coller4(V4); check(true, 'la version 4 (celle collée sur Supabase) s’installe'); } catch (err) { check(false, 'la version 4 s’installe : ' + err.message); }
    await horloge4('2026-10-14T10:00:00Z'); // mercredi 14 octobre : le Quartier est ouvert
    for (const [k, j] of [Ali, Bea, Cyr].entries()) await v4(j, noms[k], 1e9, 10, '2026-10-12', 1e6 * (k + 1));
    await horloge4('2026-10-14T11:00:00Z');
    for (const [k, j] of [Ali, Bea, Cyr].entries()) await v4(j, noms[k], 1e9 + 1e6, 10 + 10 * (3 - k), '2026-10-12', 2e7 * (3 - k));
    await horloge4('2026-10-19T08:00:00Z'); // lundi : la semaine du 12 est figée aux points
    await c4('select public.fournil_heure() as r');
    await v4(Ali, noms[0], 1e9 + 2e6, 10, '2026-10-19', 3e8);
    await horloge4('2026-10-27T12:30:00Z'); // mardi 27, 13 h 30 à Paris : le Quartier est fini depuis 1 h 30 (grâce passée), la Maison hantée ouverte depuis 1 h 30
    await c4('select public.fournil_heure() as r'); // le podium final du Quartier est figé
    const photo = async () => JSON.stringify([await s4('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj, points, points_total, points_jour, quartier, quartier_maj from public.fournil_joueurs order by id'), await s4('select semaine, rang, id, pseudo, valeur, points from public.fournil_palmares order by semaine, id'), await s4('select * from public.fournil_semaines order by semaine'), await s4('select * from public.fournil_quartier_podium order by id'), await s4('select * from public.fournil_evenements order by nom')]);
    const avant = await photo(), podQ = (await s4('select rang, pseudo, valeur from public.fournil_quartier_podium order by rang')).map((x) => `${x.rang} ${x.pseudo} ${x.valeur}`).join(', ');
    check(podQ === '1 Ali 300000000, 2 Béa 40000000, 3 Cyril 20000000', `en version 4 : des points, un palmarès, des billets, et le podium final du Quartier figé (${podQ})`);
    try { await coller4(SQL); check(true, 'la version 5 se colle telle quelle par-dessus la version 4'); } catch (err) { check(false, 'la version 5 se colle par-dessus la version 4 : ' + err.message); }
    await horloge4('2026-10-27T12:30:00Z');
    check(await photo() === avant, 'rien ne se perd : joueurs (pseudo, jeton, argent, points, billets du Quartier), palmarès, semaines figées, podium final du Quartier et événements figés intacts');
    const vus = await s4('select vu from public.fournil_joueurs'), sc = await s4('select count(*)::int as n from public.fournil_evt_scores');
    check(vus.length === 3 && vus.every((x) => x.vu === null) && sc[0].n === 0, 'la nouvelle colonne vu est vide (personne en ligne), aucun score d’événement');
    const fns = (await s4(`select pg_get_function_identity_arguments(oid) as a from pg_proc where proname in ('fournil_publier', 'fournil_reponse') and pronamespace = 'public'::regnamespace`)).map((x) => x.a);
    check(fns.length === 2 && fns.some((a) => /p_evt text, p_score double precision$/.test(a)), `une seule fournil_publier et une seule fournil_reponse (les signatures de la v4 sont retirées : pas d’appel ambigu) (${fns.join(' | ')})`);
    let r = await v4(Bea, noms[1], 1e9 + 3e6, 20, '2026-10-26', 5e7);
    check(r.ok === true && r.version === V && r.quartier === 4e7 && r.evt === null && r.rang_evt === null, `un téléphone encore en version 4 (p_quartier, sans p_evt) continue d’envoyer : accepté, ses billets (après la grâce) ne bougent plus (${JSON.stringify({ ok: r.ok, v: r.version, q: r.quartier })})`);
    const cq = await c4('select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['quartier', Ali.id]);
    check(cq.version === V && cq.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.podium}`).join(', ') === '1 Ali 1, 2 Béa 2, 3 Cyril 3' && cq.moi.podium === 1, `le classement du Quartier se lit tel quel, podium final compris (${cq.lignes.map((x) => x.pseudo).join(', ')})`);
    let rec = await c4('select public.fournil_recompenses(p_id => $1, p_jeton => $2) as r', [Ali.id, Ali.jeton]);
    check(rec.ok && rec.quartier === 1 && rec.quartier_podium.length === 3 && JSON.stringify(rec.podiums) === JSON.stringify([{ semaine: '2026-10-12', rang: 1 }, { semaine: '2026-10-19', rang: 1 }]) && JSON.stringify(rec.evenements) === '{}', `Ali garde ses podiums des semaines du 12 et du 19 et sa 1re place au Quartier ; aucun événement générique fini (${JSON.stringify(rec.podiums)})`);
    r = await v5(Cyr, noms[2], 1e9 + 4e6, 30, '2026-10-26', null, 'hantee', 4e6);
    const ch = await c4('select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['hantee', Cyr.id]);
    check(r.ok && r.evt === 'hantee' && r.evt_score === 4e6 && r.rang_evt === 1 && r.evt_plafonne === false && ch.moi && ch.moi.rang === 1 && ch.moi.valeur === 4e6 && ch.moi.en_ligne === true, `puis un téléphone en version 5 envoie ses bonbons : comptés, classement « hantee », en ligne (${JSON.stringify(ch.moi)})`);
    r = await v5(Dan, noms[3], 50, 5, '2026-10-26', null, 'hantee', 9e5);
    check(r.ok && r.evt_score === 9e5 && r.rang_evt === 2, 'un nouveau venu s’inscrit directement avec ses bonbons : comptés dès l’inscription, 2e');
    try { await coller4(SQL); check(true, 'et la version 5 se recolle par-dessus elle-même'); } catch (err) { check(false, 'la version 5 se recolle : ' + err.message); }
    check((await s4(`select count(*)::int as n from public.fournil_evt_scores where valeur > 0`))[0].n === 2 && (await s4('select count(*)::int as n from public.fournil_quartier_podium'))[0].n === 3, 'les bonbons et le podium du Quartier restent après un nouveau collage');
    await db4.close();
  }

  // ─── 26. La Maison hantée : un événement générique (fournil_evts) — bonbons, enveloppe, classement à part, podium final ───
  titre('La Maison hantée (version 5 : événement générique « hantee »)');
  {
    const HT = require('../src/hantee.js');
    await vider(); await entetes(null);
    const publierH = async (j, pseudo, fortune, score, evt = 'hantee', role = 'anon') => (await comme(role, 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_evt => $7, p_score => $8) as r', [j.id, j.jeton, pseudo, String(fortune), '0', lundiDe(horloge), evt, score == null ? null : String(score)]))[0].r;
    const evts = await sup('select nom, debut, fin, pas, tableau from public.fournil_evts()');
    check(evts.length === 1 && evts[0].nom === 'hantee' && Date.parse(evts[0].debut) === HT.DEBUT && Date.parse(evts[0].fin) === HT.FIN, `un seul événement générique, « hantee », à la fenêtre du jeu : du ${new Date(HT.DEBUT).toISOString()} au ${new Date(HT.FIN).toISOString()}`);
    const tab = evts[0].tableau, pas = evts[0].pas * 3600e3;
    const borneJS = (ms) => { if (ms < HT.DEBUT) return 0; const j = Math.min((ms - HT.DEBUT) / pas, tab.length - 1), k = Math.floor(j); return k >= tab.length - 1 ? Math.pow(10, tab[tab.length - 1]) : Math.pow(10, tab[k] + (tab[k + 1] - tab[k]) * (j - k)); };
    const borneH = async (ms, evt = 'hantee') => (await sup('select public.fournil_evt_borne($1, $2::timestamptz) as b', [evt, new Date(ms).toISOString()]))[0].b;
    { let pire = 0; for (const h of [-1, 0, 1, 5.5, 6, 30, 77, 100, 152, 156, 160, 500]) { const ms = HT.DEBUT + h * 3600e3, a = await borneH(ms), b = borneJS(ms); pire = Math.max(pire, Math.abs(a - b) / Math.max(1, b)); }
      check(pire < 1e-9 && await borneH(HT.DEBUT - 1) === 0 && await borneH(HT.DEBUT, 'noel') === 0, `fournil_evt_borne = son miroir JavaScript (écart ${pire.toExponential(1)}) ; 0 avant l’ouverture et pour un événement inconnu`); }
    const [Ka, Lo, Ma, Ni] = [joueur(), joueur(), joueur(), joueur()];
    await heure(HT.DEBUT - 3600e3);
    let r = garde(await publierH(Ka, 'Karim', 100, 5e6));
    check(r.ok === true && r.version === V && r.evt === 'hantee' && r.evt_score === null && r.rang_evt === null && r.evt_plafonne === null, `une heure avant l’ouverture : Karim s’inscrit, ses 5e6 bonbons sont ignorés (${JSON.stringify({ evt: r.evt, score: r.evt_score })})`);
    r = await classement('hantee');
    check(r.version === V && r.periode === 'hantee' && r.joueurs === 0 && r.lignes.length === 0 && r.moi === null && r.en_ligne_n === 0, 'le classement « hantee » : personne encore');
    await heure(HT.DEBUT + 2 * 3600e3);
    r = garde(await publierH(Ka, 'Karim', 200, 5e6));
    check(r.ok && r.evt_score === 5e6 && r.rang_evt === 1 && r.evt_plafonne === false, `deux heures après l’ouverture : 5e6 bonbons comptés, Karim 1er (${JSON.stringify({ s: r.evt_score, rang: r.rang_evt })})`);
    r = garde(await publierH(Lo, 'Louna', 300, 1e24));
    check(r.ok && r.evt_plafonne === true && proche(r.evt_score, await borneH(horloge), 1e-9) && r.evt_score < 1e14 && r.rang_evt === 1, `Louna s’inscrit avec 1e24 bonbons (console) : acceptée, plafonnée à l’enveloppe du moment (${e(r.evt_score)})`);
    r = garde(await publierH(Ma, 'Mathis', 300, 7e3, 'noel'));
    check(r.ok && r.evt === null && r.evt_score === null && r.rang_evt === null && (await sup(`select count(*)::int as n from public.fournil_evt_scores where evt = 'noel'`))[0].n === 0, 'un événement inconnu (« noel ») : ignoré, l’envoi est accepté');
    for (const v of [-1, 'NaN', 'Infinity', 1e25]) { const x = await publierH(Ma, 'Mathis', 300, v); check(x.ok === false && x.erreur === 'valeur', `un score absurde (${v}) : refusé (« valeur »)`); }
    await avancer(11);
    r = garde(await publierH(Ka, 'Karim', 400, 2e6));
    check(r.ok && r.evt_score === 5e6 && r.evt_plafonne === false, 'des bonbons en baisse (vieille sauvegarde) : les 5e6 restent');
    await avancer(11);
    r = (await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7) as r', [Ka.id, Ka.jeton, 'Karim', '500', '0', lundiDe(horloge), '777']))[0].r;
    check(r.ok && r.evt === null && (await sup(`select valeur from public.fournil_evt_scores where id = $1`, [Ka.id]))[0].valeur === 5e6, 'un envoi sans p_evt (téléphone v4) ne touche pas aux bonbons');
    r = garde(await classement('hantee', Ka.id));
    check(r.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.points} ${x.podium} ${x.en_ligne}`).join(', ') === '1 Louna null null true, 2 Karim null null true' && r.moi.rang === 2 && r.joueurs === 2 && r.en_ligne_n === 2,
      `le classement « hantee » : Louna puis Karim, en bonbons (points : null, podium : null tant que l’événement dure), Mathis absent ; tous deux en ligne (${JSON.stringify(r.moi)})`);
    check((await classement('quartier')).joueurs === 0, 'le classement du Quartier ne voit pas les bonbons');
    check(await refus('anon', 'select public.fournil_classement(p_periode => $1) as r', ['noel']) === '22023', 'une période inconnue : refusée');
    await heure(HT.DEBUT + 5 * 864e5); await avancer(5);
    r = garde(await publierH(Ka, 'Karim', 600, 3e15));
    check(r.ok && r.evt_score === 3e15 && r.evt_plafonne === false && r.rang_evt === 1, '5 jours plus tard, 3e15 bonbons (plus qu’un assidu honnête) : comptés, pas plafonnés, Karim 1er');
    await heure(HT.FIN + 30 * 60e3);
    r = garde(await publierH(Ka, 'Karim', 700, 1e16));
    check(r.ok && r.evt_score === 1e16 && (await sup(`select count(*)::int as n from public.fournil_evenements where nom = 'hantee'`))[0].n === 0, 'une demi-heure après la fin : le dernier envoi compte encore (une heure de grâce), rien n’est figé');
    r = garde(await recompenses(Ka));
    check(r.ok && JSON.stringify(r.evenements) === '{}', 'tant que la grâce dure, fournil_recompenses ne rend aucun podium d’événement');
    await heure(HT.FIN + 3600e3 + 1000);
    r = garde(await publierH(Ma, 'Mathis', 800, 5e6));
    const pod = await sup(`select rang, pseudo, valeur from public.fournil_evt_podium where evt = 'hantee' order by rang, lower(pseudo)`);
    check(pod.map((x) => `${x.rang} ${x.pseudo}`).join(', ') === '1 Karim, 2 Louna' && pod[0].valeur === 1e16 && (await sup(`select count(*)::int as n from public.fournil_evenements where nom = 'hantee'`))[0].n === 1,
      `après la grâce, la première requête fige le podium final : ${pod.map((x) => `${x.rang} ${x.pseudo} ${e(x.valeur)}`).join(', ')}`);
    check(r.ok && r.evt_score === null && r.evt_plafonne === null, 'Mathis envoie des bonbons trop tard : rien');
    r = garde(await recompenses(Lo));
    check(r.ok && r.evenements.hantee && r.evenements.hantee.rang === 2 && JSON.stringify(r.evenements.hantee.podium.map((x) => [x.rang, x.pseudo])) === JSON.stringify([[1, 'Karim'], [2, 'Louna']]) && r.quartier === null, `Louna lit ses récompenses : 2e de la Maison hantée, et le podium final (${JSON.stringify(r.evenements)})`);
    r = garde(await recompenses(Ma));
    check(r.ok && r.evenements.hantee.rang === null && r.evenements.hantee.podium.length === 2, 'Mathis : pas de rang, mais le podium final');
    r = await recompenses({ id: Ma.id, jeton: Ka.jeton });
    check(r.ok === false && r.erreur === 'jeton' && JSON.stringify(r.evenements) === '{}', 'le jeton d’un autre : rien');
    r = garde(await classement('hantee', Lo.id));
    check(r.lignes.map((x) => `${x.rang} ${x.pseudo} ${x.podium}`).join(', ') === '1 Karim 1, 2 Louna 2' && r.moi.podium === 2, 'le classement « hantee » porte maintenant le podium final sur chaque ligne');
    await avancer(11); await publierH(Ka, 'Karim B', 900, 1e20);
    check((await sup(`select pseudo from public.fournil_evt_podium where rang = 1`))[0].pseudo === 'Karim' && (await sup(`select valeur from public.fournil_evt_scores where id = $1`, [Ka.id]))[0].valeur === 1e16, 'changer de pseudo ne réécrit pas le podium figé ; 1e20 bonbons après la fin : ignorés');
    r = await retirer(Lo);
    check(r.ok && (await sup(`select count(*)::int as n from public.fournil_evt_podium`))[0].n === 1 && (await sup(`select count(*)::int as n from public.fournil_evt_scores where id = $1`, [Lo.id]))[0].n === 0 && (await recompenses(Ka)).evenements.hantee.rang === 1, 'Louna quitte le classement : ses bonbons et sa place au podium partent (Karim garde la sienne)');
    // le ménage des 90 jours emporte aussi les scores et les places au podium
    await sup(`update public.fournil_joueurs set maj = $1 where id = $2`, [new Date(horloge - 91 * 864e5).toISOString(), Ka.id]);
    await avancer(11); await publierH(Ma, 'Mathis', 1000, null);
    check((await sup(`select count(*)::int as n from public.fournil_evt_scores where id = $1`, [Ka.id]))[0].n === 0 && (await sup(`select count(*)::int as n from public.fournil_evt_podium where id = $1`, [Ka.id]))[0].n === 0, 'un joueur effacé par le ménage (90 jours) : ses bonbons et sa place au podium partent avec lui');
    check(!/"jeton"|"id"/.test(JSON.stringify(reponses.slice(-12))), 'aucune réponse ne fuit un identifiant');
    await sup(`insert into public.fournil_evt_scores (evt, id, valeur, maj) values ('hantee', $1, 42, now())`, [Ma.id]);
    await sup(`insert into public.fournil_evt_podium (evt, id, rang, pseudo, valeur) values ('hantee', $1, 1, 'Mathis', 42)`, [Ma.id]);
    const photoE = async () => JSON.stringify([await sup('select * from public.fournil_evt_scores order by evt, id'), await sup('select * from public.fournil_evt_podium order by evt, id'), await sup(`select * from public.fournil_evenements order by nom`)]);
    const avantE = await photoE();
    await coller();
    check(await photoE() === avantE && (await sup(`select count(*)::int as n from public.fournil_evenements where nom = 'hantee'`))[0].n === 1, 'recollé après la fin : l’événement figé, les scores et le podium restent');
    await installerHorloge();
  }

  // ─── 27. « en ligne » : vu, fournil_vu, en_ligne (4 minutes), jamais l'heure ───
  titre('« en ligne » (version 5 : fournil_vu)');
  {
    await vider(); await entetes(null);
    await heure('2027-07-07T10:00:00Z');
    const vu = async (j, role = 'anon') => (await comme(role, 'select public.fournil_vu(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r;
    const [A1, B1, C1] = [joueur(), joueur(), joueur()];
    for (const [k, j] of [A1, B1, C1].entries()) await publier(j, ['Amandine', 'Basile', 'Capucine'][k], 1000, 'anon', pts(10 * (k + 1)));
    let c = garde(await classement('total', A1.id));
    check(c.version === V && c.en_ligne_n === 3 && c.lignes.every((x) => x.en_ligne === true) && c.moi.en_ligne === true, 'trois inscriptions (un envoi accepté pose vu) : tous en ligne, en_ligne_n = 3');
    check(!/"vu"|\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(c)), 'la réponse ne contient jamais l’heure du dernier signe de vie');
    await avancer(3 * 60);
    const photoA = JSON.stringify(await sup('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj, points, points_total, quartier from public.fournil_joueurs where id = $1', [A1.id]));
    let r = garde(await vu(A1));
    check(r.ok === true && r.erreur === null && JSON.stringify(await sup('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj, points, points_total, quartier from public.fournil_joueurs where id = $1', [A1.id])) === photoA && Date.parse((await sup('select vu from public.fournil_joueurs where id = $1', [A1.id]))[0].vu) === horloge,
      'fournil_vu (Amandine, 3 min plus tard) : ok, vu = l’heure du serveur ; rien d’autre ne bouge (ni maj, ni points, ni argent)');
    await avancer(2 * 60);
    c = garde(await classement('total', B1.id));
    check(c.lignes.map((x) => `${x.pseudo} ${x.en_ligne}`).join(', ') === 'Capucine false, Basile false, Amandine true' && c.en_ligne_n === 1 && c.moi.en_ligne === false, `5 min après leur dernier envoi, Basile et Capucine ne sont plus en ligne ; Amandine (vue il y a 2 min) l’est (${c.lignes.map((x) => `${x.pseudo} ${x.en_ligne}`).join(', ')})`);
    await avancer(4 * 60);
    c = await classement('semaine');
    check(c.en_ligne_n === 0 && c.lignes.every((x) => x.en_ligne === false), '4 minutes sans signe de vie : plus personne en ligne (cette semaine aussi)');
    const vuB = (await sup('select vu from public.fournil_joueurs where id = $1', [B1.id]))[0].vu;
    r = garde(await vu({ id: B1.id, jeton: A1.jeton }));
    check(r.ok === false && r.erreur === 'jeton' && String((await sup('select vu from public.fournil_joueurs where id = $1', [B1.id]))[0].vu) === String(vuB), 'le jeton d’un autre : refusé (« jeton »), vu ne bouge pas');
    r = await vu({ id: B1.id, jeton: 'court' });
    check(r.ok === false && r.erreur === 'jeton', 'un jeton mal formé : refusé');
    r = await vu(joueur());
    check(r.ok === false && r.erreur === 'inconnu' && (await nb()) === 3, 'un identifiant inconnu : « inconnu », personne n’est inscrit');
    r = await vu(B1, 'authenticated');
    c = await classement('total', B1.id);
    check(r.ok === true && c.moi.en_ligne === true && c.en_ligne_n === 1, 'authenticated peut battre aussi ; Basile revient en ligne');
    check(await refus('anon', 'select vu from public.fournil_joueurs') !== 'accepté' && await refus('anon', `update public.fournil_joueurs set vu = now()`) !== 'accepté', 'vu ne se lit ni ne s’écrit directement');
  }

  // ─── le bilan ───
  const bilan = fails ? `${fails} échec(s), ${oks} ok` : `tout est bon (${oks} vérifications)`;
  console.log(`\n${bilan}`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Le Fournil — le SQL du classement (PGlite)\n\n**${bilan}**\n\n<details><summary>le détail</summary>\n\n\`\`\`\n${lignes.join('\n')}\n\`\`\`\n</details>\n\n`); } catch (err) { /* rien */ } }
  await db.close();
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error('  FAIL le test plante :', err && err.stack || err); process.exit(1); });
