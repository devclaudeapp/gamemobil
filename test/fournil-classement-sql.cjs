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
//     de src/classement.js et src/horloge.js comparés aux signatures des fonctions SQL ;
//   · le patch v6.2 (supabase/fournil-classement-v62.sql, la limite des événements élargie) collé deux fois par-dessus la v6, puis
//     le patch v6.3 (supabase/fournil-classement-v63.sql, le Sirop et le Cristal) collé deux fois par-dessus la v6 et la v6.2 :
//     les nouveaux tableaux, des bornes jamais plus basses, un score entre l'ancienne et la nouvelle borne compté, rien d'autre ne bouge.
//   · le chat (supabase/fournil-chat.sql, collé par-dessus la v6) : chaque erreur de l'envoi, 3 s et 60 par heure, le masquage au
//     3e signalement, l'effacement, le bannissement, le ménage (images de 7 jours, au-delà des 2 000), la cascade du retrait, les droits.
//   · les idées, les bugs et les votes (supabase/fournil-retours.sql, collé par-dessus la v6, les cadeaux et le chat) : chaque erreur
//     de l'envoi, 30 s et 5 par jour (heure de Paris), les votes (créer, voter, changer, fini, fermé), l'admin seul lit et crée,
//     les notifications 'retour' et 'vote' dans la file, le ménage (captures de 30 jours, choix de 60 jours), la cascade, les droits.
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
const V = 6; // la version du SQL éprouvé (supabase/fournil-classement.sql)

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
  const vider = () => db.exec('delete from public.fournil_joueurs; delete from public.fournil_portes; delete from public.fournil_palmares; delete from public.fournil_semaines; delete from public.fournil_quartier_podium; delete from public.fournil_evenements; delete from public.fournil_evt_scores; delete from public.fournil_evt_podium; delete from public.fournil_objectif; delete from public.fournil_annonces'); // (version 6 : les photos, pourboires, appareils et notifications partent avec les joueurs)
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
  const JEU5 = ['fournil_classement', 'fournil_heure', 'fournil_publier', 'fournil_recompenses', 'fournil_retirer', 'fournil_vu'];
  const JEU = [...JEU5, 'fournil_abonner', 'fournil_boutique', 'fournil_desabonner', 'fournil_notif_essai', 'fournil_objectif', 'fournil_planifier', 'fournil_pourboire', 'fournil_vu_pourboires']; // version 6 : les copains et les notifications
  const SERVICE = ['fournil_notifs_dues', 'fournil_notifs_faites']; // la fonction d'envoi seulement (service_role)
  const CHAT_JEU = ['fournil_chat_effacer', 'fournil_chat_envoyer', 'fournil_chat_image', 'fournil_chat_lire', 'fournil_chat_signaler']; // le chat (supabase/fournil-chat.sql)
  const RETOURS_JEU = ['fournil_admin_moi', 'fournil_admin_retour_etat', 'fournil_admin_retour_image', 'fournil_admin_retours', 'fournil_admin_vote_creer', 'fournil_admin_vote_fermer',
    'fournil_retour_envoyer', 'fournil_voter', 'fournil_votes_ouverts']; // les idées, les bugs et les votes (supabase/fournil-retours.sql)
  const INTERNES = ['fournil_borne', 'fournil_duree', 'fournil_empreinte', 'fournil_evt_borne', 'fournil_evt_figer', 'fournil_evts', 'fournil_figer', 'fournil_jeton_valable', 'fournil_jour', 'fournil_lundi', 'fournil_maintenant', 'fournil_paliers', 'fournil_points_plafond', 'fournil_pseudo_propre', 'fournil_quartier_borne', 'fournil_quartier_fenetre', 'fournil_quartier_figer', 'fournil_quartier_table', 'fournil_reponse', 'fournil_segment',
    'fournil_annoncer', 'fournil_endpoint_valable', 'fournil_evt_titre', 'fournil_iso', 'fournil_joueur_verifie', 'fournil_notif_mettre', 'fournil_notif_permise', 'fournil_objectif_but', 'fournil_objectif_figer'];
  const TABLES = ['fournil_joueurs', 'fournil_palmares', 'fournil_semaines', 'fournil_portes', 'fournil_quartier_podium', 'fournil_evenements', 'fournil_evt_scores', 'fournil_evt_podium',
    'fournil_photos', 'fournil_pourboires', 'fournil_objectif', 'fournil_objectif_gagnants', 'fournil_abonnements', 'fournil_notif_prefs', 'fournil_notifs', 'fournil_annonces'];
  async function structure(quand) {
    titre(`structure et droits (${quand})`);
    const cols = await sup(`select column_name as c, data_type as t, is_nullable as n from information_schema.columns where table_schema = 'public' and table_name = 'fournil_joueurs' order by ordinal_position`);
    const attendu = { id: 'uuid', jeton: 'text', pseudo: 'text', fortune: 'double precision', sommet: 'double precision', plausible: 'double precision', reserve: 'double precision', total: 'double precision', gain: 'double precision', semaine: 'date', cree: 'timestamp with time zone', maj: 'timestamp with time zone', points: 'integer', points_total: 'integer', points_jour: 'date', quartier: 'double precision', quartier_maj: 'timestamp with time zone', vu: 'timestamp with time zone', points_bonus: 'integer' };
    check(cols.length === 19 && cols.every((c) => attendu[c.c] === c.t && c.n === (c.c === 'points_jour' || c.c === 'quartier_maj' || c.c === 'vu' ? 'YES' : 'NO')), `fournil_joueurs a les 19 colonnes du contrat (points de la semaine, depuis l'arrivée, jour du dernier envoi de points, billets du quartier et leur dernier envoi, dernier signe de vie, points des pourboires donnés), toutes « not null » sauf points_jour, quartier_maj et vu, sans l'ancienne base de la semaine (${cols.map((c) => c.c).join(', ')})`);
    const colsDe = async (t) => (await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t])).map((c) => c.c).join();
    const colsP = await colsDe('fournil_palmares'), colsS = await colsDe('fournil_semaines'), colsPo = await colsDe('fournil_portes'), colsQ = await colsDe('fournil_quartier_podium'), colsE = await colsDe('fournil_evenements'), colsES = await colsDe('fournil_evt_scores'), colsEP = await colsDe('fournil_evt_podium');
    check(colsP === 'semaine,rang,id,pseudo,valeur,points' && colsS === 'semaine,figee' && colsPo === 'empreinte,quand' && colsQ === 'id,rang,pseudo,valeur' && colsE === 'nom,figee' && colsES === 'evt,id,valeur,maj' && colsEP === 'evt,id,rang,pseudo,valeur', `le palmarès (${colsP}), les semaines figées (${colsS}), les portes : une empreinte et une heure seulement (${colsPo}), le podium du quartier (${colsQ}), les événements figés (${colsE}), les scores des événements (${colsES}) et leurs podiums (${colsEP})`);
    { const c6 = {}; for (const t of ['fournil_photos', 'fournil_pourboires', 'fournil_objectif', 'fournil_objectif_gagnants', 'fournil_abonnements', 'fournil_notif_prefs', 'fournil_notifs', 'fournil_annonces']) c6[t] = await colsDe(t);
      check(c6.fournil_photos === 'id,photo,maj' && c6.fournil_pourboires === 'de,a,jour,quand,vu' && c6.fournil_objectif === 'semaine,but,total,joueurs,reussi,fige' && c6.fournil_objectif_gagnants === 'semaine,id,recu'
        && c6.fournil_abonnements === 'endpoint,joueur,p256dh,auth,cree' && c6.fournil_notif_prefs === 'id,pleine,evenements,pourboires,objectif,maj' && c6.fournil_notifs === 'id,joueur,type,titre,texte,url,due,envoyee,cree,prise' && c6.fournil_annonces === 'cle,quand',
      `version 6 : ${Object.entries(c6).map(([t, c]) => `${t.replace('fournil_', '')} (${c})`).join(', ')}`);
      const fk = await sup(`select conrelid::regclass::text as t, confdeltype as d from pg_constraint where contype = 'f' and confrelid = 'public.fournil_joueurs'::regclass order by 1`);
      check(fk.length === 7 && fk.every((x) => x.d === 'c'), `version 6 : chaque ligne des nouvelles tables appartient à un joueur et part avec lui (clés étrangères « on delete cascade » : ${fk.map((x) => x.t.replace('fournil_', '')).join(', ')})`);
      const seq = await sup(`select r.rolname as role from (values ('anon'), ('authenticated'), ('public')) r(rolname) where has_sequence_privilege(r.rolname, 'public.fournil_notifs_id_seq', 'usage') or has_sequence_privilege(r.rolname, 'public.fournil_notifs_id_seq', 'select') or has_sequence_privilege(r.rolname, 'public.fournil_notifs_id_seq', 'update')`);
      check(seq.length === 0, `la séquence de la file : aucun droit pour anon, authenticated ni PUBLIC${seq.length ? ' : ' + seq.map((x) => x.role).join(', ') : ''}`); }
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
      , has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil%' order by 1`);
    check(JSON.stringify(fns.map((f) => f.nom)) === JSON.stringify([...JEU, ...SERVICE, ...INTERNES].sort()), `les fonctions, ni plus ni moins, une seule signature chacune (${fns.map((f) => f.nom.replace('fournil_', '')).join(', ')})`);
    const sig = Object.fromEntries(fns.map((f) => [f.nom, f.args]));
    check(sig.fournil_publier === 'p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision, p_points integer, p_lundi date, p_quartier double precision, p_evt text, p_score double precision, p_photo jsonb' && fns.filter((f) => f.nom === 'fournil_publier').length === 1 &&  sig.fournil_classement === 'p_periode text, p_id uuid, p_limite integer' && sig.fournil_retirer === 'p_id uuid, p_jeton text' && sig.fournil_recompenses === 'p_id uuid, p_jeton text' && sig.fournil_heure === '' && sig.fournil_vu === 'p_id uuid, p_jeton text'
      && sig.fournil_boutique === 'p_pseudo text, p_id uuid, p_jeton text' && sig.fournil_pourboire === 'p_id uuid, p_jeton text, p_pour text' && sig.fournil_vu_pourboires === 'p_id uuid, p_jeton text, p_jusqua timestamp with time zone'
      && sig.fournil_objectif === '' && sig.fournil_abonner === 'p_id uuid, p_jeton text, p_sub jsonb, p_prefs jsonb' && sig.fournil_desabonner === 'p_id uuid, p_jeton text, p_endpoint text'
      && sig.fournil_planifier === 'p_id uuid, p_jeton text, p_pleine_a timestamp with time zone' && sig.fournil_notif_essai === 'p_id uuid, p_jeton text'
      && sig.fournil_notifs_dues === 'p_limite integer' && sig.fournil_notifs_faites === 'p_ids bigint[], p_morts text[]', 'les signatures du contrat (noms et types des paramètres, version 6 comprise)');
    for (const f of fns) {
      const jeu = JEU.includes(f.nom);
      check(/search_path=""/.test(f.conf) || /search_path=''/.test(f.conf), `${f.nom} : search_path fixé (${f.conf})`);
      check(!f.acl_defaut && !f.pour_public, `${f.nom} : droits explicites, rien pour PUBLIC`);
      if (jeu) check(f.definer && f.anon && f.auth && f.vol === 'v', `${f.nom} : SECURITY DEFINER, VOLATILE (elle peut figer le palmarès : PostgREST l'appelle en écriture), exécutable par anon et authenticated`);
      else if (SERVICE.includes(f.nom)) check(f.definer && !f.anon && !f.auth && f.service && f.vol === 'v', `${f.nom} (la fonction d'envoi) : SECURITY DEFINER, exécutable par service_role SEULEMENT (ni anon ni authenticated)`);
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
  { // les cadeaux (supabase/fournil-cadeaux.sql, un fichier à part) font partie du contrat : collés ici, éprouvés plus bas
    await db.exec('set role proprio'); try { await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-cadeaux.sql'), 'utf8')); } finally { await db.exec('reset role'); }
    // le chat (supabase/fournil-chat.sql, un fichier à part) aussi : collé ici par-dessus la v6, éprouvé plus bas
    await db.exec('set role proprio');
    try { await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-chat.sql'), 'utf8')); check(true, 'fournil-chat.sql se colle par-dessus la v6 (et les cadeaux)'); } catch (err) { check(false, 'fournil-chat.sql se colle par-dessus la v6 : ' + err.message); } finally { await db.exec('reset role'); }
    // les idées, les bugs et les votes (supabase/fournil-retours.sql) aussi : collés ici par-dessus le chat, éprouvés plus bas
    await db.exec('set role proprio');
    try { await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-retours.sql'), 'utf8')); check(true, 'fournil-retours.sql se colle par-dessus la v6 (les cadeaux et le chat)'); } catch (err) { check(false, 'fournil-retours.sql se colle par-dessus la v6 : ' + err.message); } finally { await db.exec('reset role'); }
    const CL = require('../src/classement.js');
    // les fonctions que le téléphone appelle, et avec quels paramètres, lues dans ses sources
    const appels = new Map();
    for (const f of ['../src/classement.js', '../src/horloge.js']) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      for (const m of src.matchAll(/(?:rpc|appeler)\((?:config, )?'(fournil_\w+)', \{([^}]*)\}/g)) {
        const cles = [...m[2].matchAll(/(p_\w+)\s*:/g)].map((x) => x[1]);
        appels.set(m[1] + '(' + cles.join(',') + ')', { nom: m[1], cles });
      }
      // les appels dont les paramètres sont construits ailleurs (rpc('fournil_publier', c, o), Object.assign(moi(), …)) : le nom seul ;
      // leurs paramètres sont éprouvés plus bas, par le vrai moteur branché sur ce Postgres
      for (const m of src.matchAll(/(?:rpc|appeler)\((?:config(?:\(\))?, )?'(fournil_\w+)', (?!\{)/g)) if (![...appels.values()].some((a) => a.nom === m[1])) appels.set(m[1] + '(…)', { nom: m[1], cles: null });
    }
    const procs = await sup(`select p.proname as nom, coalesce(p.proargnames, '{}') as noms, p.pronargs as n, p.pronargdefaults as defauts,
                                    array(select format_type(t, null) from unnest(p.proargtypes) t) as types
                               from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                              where s.nspname = 'public' and p.proname like 'fournil\\_%' and has_function_privilege('anon', p.oid, 'execute')`);
    const parNom = new Map(procs.map((p) => [p.nom, p]));
    const noms = [...new Set([...appels.values()].map((a) => a.nom))].sort();
    // (version 6 : le téléphone appelle au moins les six fonctions de la v5, et seulement des fonctions ouvertes à anon ; jamais celles
    //  de la fonction d'envoi)
    check(JEU5.every((n) => noms.includes(n)) && noms.every((n) => parNom.has(n)) && JSON.stringify(procs.map((p) => p.nom).sort()) === JSON.stringify([...JEU, 'fournil_cadeau_recu', 'fournil_mes_cadeaux', ...CHAT_JEU, ...RETOURS_JEU].sort()) && !noms.some((n) => SERVICE.includes(n)),
      `le téléphone n’appelle que des fonctions ouvertes à anon (${noms.join(', ')}) ; anon peut appeler exactement les fonctions du jeu (${JEU.length}, les deux des cadeaux, les ${CHAT_JEU.length} du chat et les ${RETOURS_JEU.length} des retours)`);
    const malAppeles = [...appels.values()].filter((a) => { const p = parNom.get(a.nom); if (!p) return true; if (!a.cles) return false; const obligatoires = p.noms.slice(0, p.n - p.defauts); return a.cles.some((k) => !p.noms.includes(k)) || obligatoires.some((k) => !a.cles.includes(k)); });
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
    check(a.etat === 'ok' && b.etat === 'ok' && A.etat().rejoint && B.etat().rejoint && a.data.compte === 0 && a.data.version === V && A.version() === V, `deux téléphones rejoignent par le vrai moteur : acceptés, rien de compté à l’arrivée (réponse lue : compte = 0, version ${V})`);
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
    try { await coller4(SQL); check(true, `la version ${V} se colle telle quelle par-dessus la version 4`); } catch (err) { check(false, `la version ${V} se colle par-dessus la version 4 : ` + err.message); }
    await horloge4('2026-10-27T12:30:00Z');
    check(await photo() === avant, 'rien ne se perd : joueurs (pseudo, jeton, argent, points, billets du Quartier), palmarès, semaines figées, podium final du Quartier et événements figés intacts');
    const vus = await s4('select vu from public.fournil_joueurs'), sc = await s4('select count(*)::int as n from public.fournil_evt_scores');
    check(vus.length === 3 && vus.every((x) => x.vu === null) && sc[0].n === 0, 'la nouvelle colonne vu est vide (personne en ligne), aucun score d’événement');
    const fns = (await s4(`select pg_get_function_identity_arguments(oid) as a from pg_proc where proname in ('fournil_publier', 'fournil_reponse') and pronamespace = 'public'::regnamespace`)).map((x) => x.a);
    check(fns.length === 2 && fns.some((a) => /p_evt text, p_score double precision(, p_photo jsonb)?$/.test(a)), `une seule fournil_publier et une seule fournil_reponse (les signatures de la v4 sont retirées : pas d’appel ambigu) (${fns.join(' | ')})`);
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
    try { await coller4(SQL); check(true, `et la version ${V} se recolle par-dessus elle-même`); } catch (err) { check(false, `la version ${V} se recolle : ` + err.message); }
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

  // ─── 28. la version 6 par-dessus la version 5 telle que collée sur Supabase (test/fournil-classement-v5.sql) : rien ne se perd ───
  titre('recoller la version 6 par-dessus la version 5 (joueurs, points, palmarès, billets, bonbons, podiums, en ligne)');
  {
    const V5 = fs.readFileSync(path.join(__dirname, 'fournil-classement-v5.sql'), 'utf8');
    const db5 = await PGlite.create();
    const s5 = async (sql, p) => (await db5.query(sql, p)).rows;
    const c5 = async (sql, p, role = 'anon') => { await db5.exec(`set role ${role}`); try { return (await db5.query(sql, p)).rows[0].r; } finally { await db5.exec('reset role'); } };
    const coller5 = async (texte) => { await db5.exec('set role proprio'); try { await db5.exec(texte); } finally { await db5.exec('reset role'); } };
    await db5.exec(`
      create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
      create role proprio nologin createrole;
      grant usage, create on schema public to proprio;
      grant usage on schema public to anon, authenticated, service_role;
      set role proprio;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      reset role;
      create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
      grant usage on schema banc to proprio; grant select on banc.horloge to proprio;`);
    const horloge5 = async (iso) => { await s5(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`); await s5('update banc.horloge set t = $1', [iso]); };
    const v5 = (j, pseudo, f, points, lundi, billets, evt, score) => c5('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7, p_evt => $8, p_score => $9) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundi, billets == null ? null : String(billets), evt, score == null ? null : String(score)]);
    const [Ali, Bea, Cyr] = [joueur(), joueur(), joueur()], noms = ['Ali', 'Béa', 'Cyril'];
    try { await coller5(V5); check(true, 'la version 5 (celle collée sur Supabase) s’installe'); } catch (err) { check(false, 'la version 5 s’installe : ' + err.message); }
    await horloge5('2026-10-14T10:00:00Z');
    for (const [k, j] of [Ali, Bea, Cyr].entries()) await v5(j, noms[k], 1e9, 10, '2026-10-12', 1e6 * (k + 1), null, null);
    await horloge5('2026-10-14T11:00:00Z');
    for (const [k, j] of [Ali, Bea, Cyr].entries()) await v5(j, noms[k], 1e9 + 1e6, 20 + 10 * k, '2026-10-12', 2e7 * (3 - k), null, null);
    await horloge5('2026-10-28T10:00:00Z'); // la Maison hantée est ouverte, le Quartier fini et figé, deux semaines figées
    for (const [k, j] of [Ali, Bea, Cyr].entries()) await v5(j, noms[k], 1e9 + 2e6, 5 * (k + 1), '2026-10-26', null, 'hantee', 1e6 * (k + 1));
    const photo = async () => JSON.stringify([await s5('select id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj, points, points_total, points_jour, quartier, quartier_maj, vu from public.fournil_joueurs order by id'), await s5('select * from public.fournil_palmares order by semaine, id'), await s5('select * from public.fournil_semaines order by semaine'), await s5('select * from public.fournil_quartier_podium order by id'), await s5('select * from public.fournil_evenements order by nom'), await s5('select * from public.fournil_evt_scores order by evt, id'), await s5('select * from public.fournil_evt_podium order by evt, id')]);
    const avant = await photo(), nPal = (await s5('select count(*)::int as n from public.fournil_palmares'))[0].n, nQ = (await s5('select count(*)::int as n from public.fournil_quartier_podium'))[0].n;
    check(nPal >= 3 && nQ === 3 && (await s5('select count(*)::int as n from public.fournil_evt_scores'))[0].n === 3, `en version 5 : des joueurs, un palmarès (${nPal} lignes), le podium du Quartier, des bonbons`);
    try { await coller5(SQL); check(true, 'la version 6 se colle telle quelle par-dessus la version 5'); } catch (err) { check(false, 'la version 6 se colle par-dessus la version 5 : ' + err.message); }
    await horloge5('2026-10-28T10:00:00Z');
    check(await photo() === avant, 'rien ne se perd : joueurs (pseudo, jeton, argent, points, billets, signe de vie), palmarès, semaines figées, podium du Quartier, bonbons et podiums des événements intacts');
    check((await s5('select count(*)::int as n from public.fournil_joueurs where points_bonus <> 0'))[0].n === 0 && (await s5('select count(*)::int as n from public.fournil_photos'))[0].n === 0, 'les nouvelles colonnes et tables partent vides (points_bonus à 0, aucune photo)');
    const fns = (await s5(`select pg_get_function_identity_arguments(oid) as a from pg_proc where proname = 'fournil_publier' and pronamespace = 'public'::regnamespace`)).map((x) => x.a);
    check(fns.length === 1 && /p_photo jsonb$/.test(fns[0]), `une seule fournil_publier (la signature de la v5 est retirée : pas d’appel ambigu) (${fns.join(' | ')})`);
    await horloge5('2026-10-28T10:05:00Z');
    let r = await v5(Bea, noms[1], 1e9 + 3e6, 20, '2026-10-26', null, 'hantee', 5e6);
    check(r.ok === true && r.version === V && r.evt_score === 5e6 && r.points_comptes === 10 && r.photo_maj === null, `un téléphone encore en version 5 (sans p_photo) continue d’envoyer : accepté, ses points et ses bonbons comptent (${JSON.stringify({ ok: r.ok, v: r.version, pts: r.points_comptes, photo_maj: r.photo_maj })})`);
    r = await c5('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_photo => $7::jsonb) as r', [Cyr.id, Cyr.jeton, noms[2], String(1e9 + 3e6), '15', '2026-10-26', JSON.stringify({ nom: 'Chez Cyril', postes: [3, 2] })]);
    check(r.ok === true && r.photo_maj === '2026-10-28T10:05:00.000Z', `un téléphone en version 6 envoie sa photo : gardée (photo_maj ${r.photo_maj})`);
    const rec = await c5('select public.fournil_recompenses(p_id => $1, p_jeton => $2) as r', [Ali.id, Ali.jeton]);
    check(rec.ok && rec.podiums.length >= 1 && rec.quartier === 1 && JSON.stringify(rec.pourboires) === '[]' && rec.objectif === null, `Ali garde ses podiums et sa 1re place au Quartier ; pas de pourboire ni d’objectif (${JSON.stringify(rec.podiums)})`);
    await c5('select public.fournil_pourboire(p_id => $1, p_jeton => $2, p_pour => $3) as r', [Ali.id, Ali.jeton, 'Béa']);
    try { await coller5(SQL); check(true, 'et la version 6 se recolle par-dessus elle-même'); } catch (err) { check(false, 'la version 6 se recolle : ' + err.message); }
    check((await s5('select count(*)::int as n from public.fournil_photos'))[0].n === 1 && (await s5('select count(*)::int as n from public.fournil_pourboires'))[0].n === 1 && (await s5(`select count(*)::int as n from public.fournil_joueurs where points_bonus <> 0`))[0].n === 0, 'la photo et le pourboire restent après un nouveau collage (et le pourboire n’a compté aucun point)');
    await db5.close();
  }

  // ─── 29. les copains (version 6) : la photo, la boutique, le pourboire ───
  titre('les copains (version 6) : photo, boutique, pourboire');
  const CAST = { p_sub: '::jsonb', p_prefs: '::jsonb', p_photo: '::jsonb', p_pleine_a: '::timestamptz', p_jusqua: '::timestamptz', p_ids: '::bigint[]', p_morts: '::text[]', p_limite: '::int' };
  const tableauPG = (a) => (a == null ? null : '{' + a.map((x) => (typeof x === 'number' ? String(x) : '"' + String(x).replace(/["\\]/g, '\\$&') + '"')).join(',') + '}');
  const appelle = async (fn, args = {}, role = 'anon') => {
    const cles = Object.keys(args);
    const sql = `select public.${fn}(${cles.map((k, i) => `${k} => $${i + 1}${CAST[k] || ''}`).join(', ')}) as r`;
    const vals = cles.map((k) => (args[k] == null ? null : Array.isArray(args[k]) && (k === 'p_ids' || k === 'p_morts') ? tableauPG(args[k]) : typeof args[k] === 'object' ? JSON.stringify(args[k]) : String(args[k])));
    return garde((await comme(role, sql, vals))[0].r);
  };
  const publier6 = (j, pseudo, points, photo, fortune = 1000) => appelle('fournil_publier', { p_id: j.id, p_jeton: j.jeton, p_pseudo: pseudo, p_fortune: fortune, p_points: points, p_lundi: lundiDe(horloge), ...(photo === undefined ? {} : { p_photo: photo }) });
  const pourboire = (j, pour) => appelle('fournil_pourboire', { p_id: j.id, p_jeton: j.jeton, p_pour: pour });
  const boutique = (pseudo, j) => appelle('fournil_boutique', j ? { p_pseudo: pseudo, p_id: j.id, p_jeton: j.jeton } : { p_pseudo: pseudo });
  const EP = (k) => `https://fcm.googleapis.com/fcm/send/banc-${k}`;
  const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((c) => [c, v[c]])) : v)); // (jsonb range les clés à sa façon)
  const SUB = (k, autre) => ({ endpoint: EP(k), keys: { p256dh: 'B' + 'Q'.repeat(86), auth: 'a'.repeat(22) }, ...(autre || {}) });
  const abonner = (j, sub, prefs) => appelle('fournil_abonner', { p_id: j.id, p_jeton: j.jeton, p_sub: sub, ...(prefs === undefined ? {} : { p_prefs: prefs }) });
  const file = async (id) => sup(`select type, texte, url, titre, due, envoyee, prise from public.fournil_notifs ${id ? 'where joueur = $1' : ''} order by id`, id ? [id] : undefined);
  const dues = (limite = 100, role = 'service_role') => appelle('fournil_notifs_dues', { p_limite: limite }, role);
  const faites = (ids, morts, role = 'service_role') => appelle('fournil_notifs_faites', { p_ids: ids, p_morts: morts }, role);
  {
    await vider(); await entetes(null);
    await heure('2027-08-04T10:00:00Z'); // un mercredi, midi à Paris
    const [Al, Br, Ch, Da, El] = [joueur(), joueur(), joueur(), joueur(), joueur()];
    const PH = { v: 1, nom: 'Le Fournil d’Aline', quartier: 'gare', saison: 'ete', postes: [{ n: 12, a: 2 }, { n: 4, a: 0 }], tenue: 'or', chat: { pelage: 'roux' } };
    let r = await publier6(Al, 'Aline', 40, PH);
    check(r.ok && r.version === V && r.photo_maj === new Date(horloge).toISOString(), `Aline s’inscrit avec la photo de sa boutique : gardée, photo_maj = ${r.photo_maj}`);
    for (const [j, p, pts] of [[Br, 'Bruno', 30], [Ch, 'Chloé', 20], [Da, 'Dédé', 10], [El, 'Élise', 5]]) await publier6(j, p, pts);
    r = await boutique('aline');
    check(r.ok === true && r.erreur === null && r.pseudo === 'Aline' && canon(r.photo) === canon(PH) && r.maj === new Date(horloge).toISOString() && r.en_ligne === true && r.restants === null && r.deja === null,
      `fournil_boutique('aline') (sans tenir compte des majuscules), lue par n’importe qui : sa photo, telle qu’envoyée, en ligne (${JSON.stringify({ pseudo: r.pseudo, maj: r.maj, en_ligne: r.en_ligne })})`);
    check(!/"id"|"jeton"/.test(JSON.stringify(r)) && !JSON.stringify(r).includes(Al.id), 'la boutique ne rend ni identifiant ni jeton');
    r = await boutique('Bruno');
    check(r.ok && r.photo === null && r.maj === null, 'Bruno n’a pas encore envoyé de photo : photo null');
    r = await boutique('Personne');
    check(r.ok === false && r.erreur === 'inconnu', 'un pseudo inconnu : « inconnu »');
    check((await boutique('x'.repeat(65))).erreur === 'inconnu' && (await refus('anon', 'select public.fournil_boutique(null)')) === 'accepté', 'un pseudo trop long ou absent : « inconnu », sans erreur');
    r = await boutique('Bruno', Al);
    check(r.restants === 3 && r.deja === false, 'avec son jeton, Aline voit qu’elle peut encore laisser 3 pourboires, dont un à Bruno');
    check((await boutique('Bruno', { id: Al.id, jeton: Br.jeton })).restants === null, 'avec le jeton d’un autre : rien de plus');
    // la photo : 10 minutes entre deux, 3 Ko au plus, un objet
    await avancer(60);
    r = await publier6(Al, 'Aline', 40, { ...PH, nom: 'Trop tôt' });
    check(r.ok && (await boutique('Aline')).photo.nom === PH.nom && r.photo_maj === new Date(horloge - 60e3).toISOString(), 'une nouvelle photo une minute plus tard : ignorée (une toutes les 10 min), l’envoi est accepté');
    await avancer(10 * 60);
    r = await publier6(Al, 'Aline', 40, { nom: 'x'.repeat(3100) });
    check(r.ok && (await boutique('Aline')).photo.nom === PH.nom, 'une photo de plus de 3 Ko : ignorée, l’envoi est accepté');
    await avancer(11);
    r = await publier6(Al, 'Aline', 40, [1, 2, 3]);
    check(r.ok && (await boutique('Aline')).photo.nom === PH.nom, 'une photo qui n’est pas un objet : ignorée');
    await avancer(11);
    const deuxKo = { ...PH, deco: 'd'.repeat(1800) };
    check(JSON.stringify(deuxKo).length <= 2048, 'une photo de 2 Ko compacts (la limite du téléphone)…');
    r = await publier6(Al, 'Aline', 40, deuxKo);
    check(r.ok && (await boutique('Aline')).photo.deco === deuxKo.deco && r.photo_maj === new Date(horloge).toISOString(), '… est gardée (le serveur tolère les espaces du texte jsonb)');
    await avancer(11);
    r = await publier(Al, 'Aline', 1000, 'anon', pts(40));
    check(r.ok && r.photo_maj === new Date(horloge - 11e3).toISOString() && (await boutique('Aline')).photo.deco === deuxKo.deco, 'un envoi sans photo (téléphone v5) : la photo reste, photo_maj la rappelle');
    // le pourboire
    const ptsA = async () => (await classement('semaine', Al.id)).moi.points;
    const p0 = await ptsA();
    r = await pourboire(Al, 'bruno');
    check(r.ok === true && r.erreur === null && r.restants === 2 && r.etoile === 1 && r.points_semaine === p0 && await ptsA() === p0, `Aline laisse un pourboire à Bruno : accepté, 2 restants, une étoile dans son jeu et aucun point de classement (${p0} → ${r.points_semaine})`);
    check((await sup('select count(*)::int as n from public.fournil_pourboires p join public.fournil_joueurs a on a.id = p.a where a.pseudo = $1 and p.jour = $2', ['Bruno', '2027-08-04']))[0].n === 1, 'une ligne dans fournil_pourboires, au jour de Paris');
    r = await pourboire(Al, 'Bruno');
    check(r.ok === false && r.erreur === 'deja' && r.restants === 2 && !r.etoile && await ptsA() === p0, 'un second pourboire à Bruno le même jour : « deja », rien de plus (pas d’étoile)');
    check((await boutique('Bruno', Al)).deja === true && (await boutique('Bruno', Al)).restants === 2, 'la boutique de Bruno le dit (deja, 2 restants)');
    r = await pourboire(Al, 'Aline');
    check(r.ok === false && r.erreur === 'soi', 'à soi-même : « soi »');
    r = await pourboire(Al, 'Nobody');
    check(r.ok === false && r.erreur === 'inconnu' && r.restants === 2, 'à un pseudo inconnu : « inconnu »');
    r = await pourboire({ id: Al.id, jeton: Br.jeton }, 'Chloé');
    check(r.ok === false && r.erreur === 'jeton' && r.restants === null, 'avec le jeton d’un autre : « jeton »');
    r = await pourboire(joueur(), 'Chloé');
    check(r.ok === false && r.erreur === 'inconnu', 'un donneur pas inscrit : « inconnu »');
    r = await pourboire({ id: Al.id, jeton: 'court' }, 'Chloé');
    check(r.erreur === 'jeton', 'un jeton mal formé : « jeton »');
    r = await pourboire(Al, 'Chloé'); const r2 = await pourboire(Al, 'Dédé'), r3 = await pourboire(Al, 'Élise');
    check(r.ok && r.restants === 1 && r2.ok && r2.restants === 0 && r3.ok === false && r3.erreur === 'quota' && r3.restants === 0 && !r3.etoile && await ptsA() === p0, 'trois pourboires dans la journée (trois étoiles), puis « quota » ; aucun point de classement');
    // l'envoi suivant de son téléphone compte ses points comme avant
    await avancer(11);
    r = await publier6(Al, 'Aline', 50);
    check(r.ok && r.points_comptes === 10 && r.points_semaine === 50 && await ptsA() === 50, `puis son téléphone envoie 50 points (il en avait 40) : 10 comptés, 50 en tout (${r.points_comptes} comptés, ${r.points_semaine})`);
    // minuit à Paris : un nouveau jour
    await heure('2027-08-04T22:00:01Z');
    r = await pourboire(Al, 'Bruno');
    check(r.ok && r.restants === 2, 'minuit passé à Paris : un nouveau jour, Aline peut de nouveau en laisser un à Bruno');
    // le receveur les trouve dans ses récompenses, une fois
    r = await recompenses(Br);
    check(r.ok && r.pourboires.length === 2 && r.pourboires.every((x) => x.de === 'Aline' && typeof x.quand === 'string') && Date.parse(r.pourboires[0].quand) < Date.parse(r.pourboires[1].quand) && r.objectif === null,
      `Bruno lit ses récompenses : ses deux pourboires d’Aline, du plus ancien au plus récent (${JSON.stringify(r.pourboires)})`);
    r = await recompenses(Br);
    check(r.ok && r.pourboires.length === 0, 'une seconde lecture : plus rien (la lecture les marque vus)');
    r = await recompenses({ id: Ch.id, jeton: Br.jeton });
    check(r.ok === false && JSON.stringify(r.pourboires) === '[]' && r.objectif === null, 'le jeton d’un autre : rien');
    r = await appelle('fournil_vu_pourboires', { p_id: Ch.id, p_jeton: Ch.jeton, p_jusqua: new Date(horloge).toISOString() });
    check(r.ok === true && (await recompenses(Ch)).pourboires.length === 0, 'Chloé accuse elle-même ses pourboires (fournil_vu_pourboires) : sa lecture suivante est vide');
    check((await appelle('fournil_vu_pourboires', { p_id: Ch.id, p_jeton: Br.jeton })).erreur === 'jeton', 'fournil_vu_pourboires vérifie le jeton');
    // une nouvelle semaine : un pourboire ne compte toujours aucun point
    await heure('2027-08-09T08:00:00Z'); // lundi
    r = await pourboire(Al, 'Chloé');
    const la = (await sup('select points, points_bonus from public.fournil_joueurs where id = $1', [Al.id]))[0];
    check(r.ok && r.etoile === 1 && r.points_semaine === 0 && la.points_bonus === 0, `lundi : un pourboire, une étoile, 0 point de la semaine (points_bonus ${la.points_bonus})`);
    const pal = await palmares('2027-08-02');
    check(pal.length && pal[0].pseudo === 'Aline' && pal[0].points === 50, `le palmarès de la semaine finie : ses seuls points de jeu (${podiumTexte(pal)} ; ${pal[0] && pal[0].points} points)`);
    await avancer(11);
    r = await publier6(Al, 'Aline', 7);
    check(r.ok && r.points_comptes === 7 && r.points_semaine === 7, 'puis son téléphone envoie ses 7 premiers points de la semaine : 7 en tout');
    // le ménage : les pourboires de plus de 30 jours ; et ceux d'un joueur qui part
    await heure('2027-09-06T09:00:00Z');
    await dues();
    check((await sup('select count(*)::int as n from public.fournil_pourboires'))[0].n === 1, 'le ménage de la fonction d’envoi : les pourboires de plus de 30 jours sont effacés (reste celui du 9 août)');
    await sup(`update public.fournil_joueurs set maj = now(), vu = null`); // (le ménage des 90 jours n'emporte personne ici)
    r = await retirer(Al);
    check(r.ok && (await sup('select count(*)::int as n from public.fournil_pourboires'))[0].n === 0 && (await sup('select count(*)::int as n from public.fournil_photos'))[0].n === 0 && (await boutique('Aline')).erreur === 'inconnu', 'Aline quitte le classement : sa photo et ses pourboires partent avec elle');
  }

  // ─── 30. l'objectif commun de la semaine (version 6) ───
  titre('l’objectif commun de la semaine (version 6)');
  {
    await vider(); await entetes(null);
    await heure('2027-09-15T10:00:00Z'); // un mercredi
    const objectif = (role = 'anon') => appelle('fournil_objectif', {}, role);
    let o = await objectif();
    check(o.semaine === '2027-09-13' && o.but === 300 && o.total === 0 && o.joueurs === 0 && o.reussi === false && o.pourcent === 0 && o.precedente && o.precedente.reussi === false,
      `personne : but 300 (le plancher), 0 croissant, 0 % (${JSON.stringify(o)})`);
    const [Ma, Ni, Ol, Pa] = [joueur(), joueur(), joueur(), joueur()];
    for (const [j, p, pts] of [[Ma, 'Marius', 160], [Ni, 'Nina', 130], [Ol, 'Olga', 20]]) await publier6(j, p, pts);
    await abonner(Ma, SUB('ma')); await abonner(Ol, SUB('ol'));
    o = await objectif();
    check(o.total === 310 && o.joueurs === 3 && o.but === 300 && o.reussi === true && o.pourcent === 100, `trois joueurs : ${o.total} / ${o.but} croissants, réussi (${o.pourcent} %) ; le but est fixé pour la semaine`);
    await publier6(Pa, 'Paco', 0);
    check((await objectif()).but === 300 && (await objectif('authenticated')).total === 310, 'un nouveau venu ne change pas le but de la semaine ; authenticated lit aussi l’objectif');
    await sup(`update public.fournil_joueurs set maj = now(), vu = null`);
    // lundi : la semaine se fige avec le palmarès
    await heure('2027-09-20T06:00:00Z');
    o = await objectif();
    check(o.semaine === '2027-09-20' && o.total === 0 && o.but === 450 && o.precedente && o.precedente.semaine === '2027-09-13' && o.precedente.reussi === true && o.precedente.total === 310 && o.precedente.but === 300,
      `lundi : la semaine passée est figée réussie (${JSON.stringify(o.precedente)}) ; le nouveau but : 150 × 3 joueurs actifs = ${o.but}`);
    const g = await sup(`select j.pseudo from public.fournil_objectif_gagnants g join public.fournil_joueurs j on j.id = g.id order by 1`);
    check(g.map((x) => x.pseudo).join() === 'Marius,Nina', `les gagnants : ceux qui y ont mis 30 points ou plus (${g.map((x) => x.pseudo).join(', ')}) ; pas Olga (20), ni Paco (0)`);
    const fm = await file(Ma.id), fo = await file(Ol.id), fn = await file(Ni.id);
    check(fm.length === 1 && fm[0].type === 'objectif' && fm[0].texte === 'Objectif commun réussi ! Une récompense t’attend.'.replace('’', '\'') && fo.length === 0 && fn.length === 0,
      `une notification « objectif » pour Marius (abonné) ; aucune pour Olga (pas gagnante) ni Nina (pas abonnée) (${fm.map((x) => x.texte).join(' | ')})`);
    let r = await recompenses(Ma);
    check(r.ok && r.objectif && r.objectif.semaine === '2027-09-13' && r.objectif.reussi === true && r.objectif.recompense === true, `Marius lit ses récompenses : ${JSON.stringify(r.objectif)}`);
    r = await recompenses(Ma);
    check(r.ok && r.objectif === null, 'une seule fois');
    check((await recompenses(Ol)).objectif === null && (await recompenses(Pa)).objectif === null, 'Olga et Paco : rien');
    check((await sup(`select count(*)::int as n from public.fournil_objectif where semaine = '2027-09-13' and fige is not null`))[0].n === 1, 'la semaine est figée une fois (fournil_objectif)');
    // une semaine ratée
    await publier6(Ma, 'Marius', 100);
    await heure('2027-09-27T06:00:00Z');
    o = await objectif();
    check(o.precedente.reussi === false && o.precedente.total === 100 && o.but === 300 && (await sup(`select count(*)::int as n from public.fournil_objectif_gagnants where semaine = '2027-09-20'`))[0].n === 0 && (await recompenses(Ma)).objectif === null,
      `la semaine suivante, ratée (100 / 450) : aucune récompense ; le but suivant redescend à 300 (un seul joueur actif)`);
    // les bornes du but
    await sup(`insert into public.fournil_objectif (semaine, but, total, joueurs, reussi, fige) values ('2030-01-07', 300, 0, 100, false, now()), ('2030-02-04', 300, 0, 0, false, now())`);
    const butDe = async (s) => (await sup('select public.fournil_objectif_but($1::date) as b', [s]))[0].b;
    check(await butDe('2030-01-14') === 6000 && await butDe('2030-02-11') === 300 && await butDe('2030-01-14') === 6000, 'le but : 6 000 au plus (100 joueurs actifs), 300 au moins (aucun), fixé une fois');
    check(await refus('anon', `select public.fournil_objectif_but('2030-03-04')`) === '42501' && await refus('anon', 'select * from public.fournil_objectif') === '42501', 'anon ne touche ni à la table ni aux fonctions internes de l’objectif');
  }

  // ─── 31. les notifications (version 6) : abonnements, préférences, file, fonction d'envoi ───
  titre('les notifications (version 6) : abonner, planifier, essai, la file');
  {
    await vider(); await entetes(null);
    await heure('2027-10-06T10:00:00Z');
    const [Qu, Ra, Si] = [joueur(), joueur(), joueur()];
    for (const [j, p] of [[Qu, 'Quentin'], [Ra, 'Rachel'], [Si, 'Simon']]) await publier6(j, p, 10);
    // s'abonner
    let r = await abonner({ id: Qu.id, jeton: Ra.jeton }, SUB('q1'));
    check(r.ok === false && r.erreur === 'jeton', 'le jeton d’un autre : « jeton »');
    r = await abonner(joueur(), SUB('x'));
    check(r.ok === false && r.erreur === 'inconnu', 'pas inscrit : « inconnu »');
    for (const [sub, quoi] of [[{ endpoint: 'http://fcm.googleapis.com/fcm/send/x', keys: SUB('x').keys }, 'en http'], [{ endpoint: 'https://pirate.example.com/push', keys: SUB('x').keys }, 'chez un autre site que les services de notifications'],
      [{ endpoint: 'https://fcm.googleapis.com.pirate.example/x', keys: SUB('x').keys }, 'déguisée (fcm.googleapis.com.pirate…)'], [{ endpoint: 'https://fcm.googleapis.com/' + 'x'.repeat(1000), keys: SUB('x').keys }, 'de plus de 1 000 caractères'],
      [{ endpoint: EP('x'), keys: { p256dh: 'court', auth: 'a'.repeat(22) } }, 'une clé p256dh absurde'], [{ endpoint: EP('x'), keys: { p256dh: 'B' + 'Q'.repeat(86) } }, 'sans auth'], [{ endpoint: EP('x') }, 'sans clés'],
      [{ endpoint: EP('x'), keys: SUB('x').keys, bourrage: 'z'.repeat(2100) }, 'de plus de 2 Ko'], ['"une chaîne"', 'qui n’est pas un objet']]) {
      r = await abonner(Qu, sub);
      check(r.ok === false && r.erreur === 'abonnement', `un abonnement ${quoi} : « abonnement »`);
    }
    r = await abonner(Qu, SUB('q1'), [true]);
    check(r.ok === false && r.erreur === 'preferences', 'des préférences qui ne sont pas un objet : « preferences »');
    for (const host of ['https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QGx', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://fcm.googleapis.com/fcm/send/q1'])
      check((await sup('select public.fournil_endpoint_valable($1) as v', [host]))[0].v === true, `accepté : ${host.slice(8, 40)}…`);
    r = await abonner(Qu, SUB('q1'));
    check(r.ok === true && r.erreur === null && JSON.stringify(r.prefs) === '{"pleine":true,"evenements":true,"pourboires":true,"objectif":true}' && r.appareils === 1, `Quentin abonne son téléphone : tout est coché (${JSON.stringify(r.prefs)})`);
    r = await abonner(Qu, SUB('q2'), { pourboires: false, objectif: 'oui' });
    check(r.ok && r.prefs.pourboires === false && r.prefs.objectif === true && r.prefs.pleine === true && r.appareils === 2, 'un second appareil, les pourboires décochés (une valeur qui n’est pas un booléen ne change rien) : préférences gardées par joueur, 2 appareils');
    for (let k = 3; k <= 7; k++) { await avancer(1); r = await abonner(Qu, SUB('q' + k), {}); }
    const eps = (await sup('select endpoint from public.fournil_abonnements where joueur = $1 order by cree', [Qu.id])).map((x) => x.endpoint.replace(/.*banc-/, ''));
    check(r.appareils === 5 && eps.join() === 'q3,q4,q5,q6,q7', `7 appareils : les 5 plus récents restent, les plus anciens sont remplacés (${eps.join(', ')})`);
    r = await abonner(Ra, SUB('q7'));
    check(r.ok && r.appareils === 1 && (await sup('select joueur from public.fournil_abonnements where endpoint = $1', [EP('q7')]))[0].joueur === Ra.id, 'un appareil abonné par Quentin, repris par Rachel (même navigateur) : il passe à Rachel');
    r = await appelle('fournil_desabonner', { p_id: Ra.id, p_jeton: Ra.jeton, p_endpoint: EP('q6') });
    check(r.ok && r.retires === 0, 'Rachel ne peut pas désabonner un appareil de Quentin');
    r = await appelle('fournil_desabonner', { p_id: Qu.id, p_jeton: Qu.jeton, p_endpoint: EP('q6') });
    check(r.ok && r.retires === 1, 'Quentin désabonne un de ses appareils');
    check((await appelle('fournil_desabonner', { p_id: Qu.id, p_jeton: Ra.jeton, p_endpoint: null })).erreur === 'jeton', 'fournil_desabonner vérifie le jeton');
    // planifier « Ta boulangerie déborde »
    const planifier = (j, ms) => appelle('fournil_planifier', { p_id: j.id, p_jeton: j.jeton, p_pleine_a: ms == null ? null : new Date(horloge + ms).toISOString() });
    const pleines = async (j) => (await file(j.id)).filter((x) => x.type === 'pleine' && !x.envoyee);
    r = await planifier(Qu, 5 * 60e3);
    check(r.ok && r.planifiee === false && (await pleines(Qu)).length === 0, 'dans 5 min : ignorée (moins de 10 min)');
    r = await planifier(Qu, 25 * 3600e3);
    check(r.ok && r.planifiee === false && (await pleines(Qu)).length === 0, 'dans 25 h : ignorée (plus de 24 h)');
    r = await planifier(Qu, 8 * 3600e3);
    let pl = await pleines(Qu);
    check(r.ok && r.planifiee === true && pl.length === 1 && Date.parse(pl[0].due) === horloge + 8 * 3600e3 && pl[0].texte === 'Ta boulangerie déborde ! Tes apprentis t\'attendent.' && pl[0].url === './' && pl[0].titre === 'Le Fournil', `dans 8 h : planifiée (« ${pl[0] && pl[0].texte} »)`);
    r = await planifier(Qu, 15 * 3600e3);
    pl = await pleines(Qu);
    check(r.planifiee && pl.length === 1 && Date.parse(pl[0].due) === horloge + 15 * 3600e3, 'une nouvelle heure (15 h : talents et mobilier) remplace la précédente : une seule en attente');
    r = await planifier(Qu, null);
    check(r.ok && r.planifiee === false && (await pleines(Qu)).length === 0, 'null (il est revenu) : annulée');
    r = await planifier(Si, 8 * 3600e3);
    check(r.ok && r.planifiee === false && (await file(Si.id)).length === 0, 'Simon n’est pas abonné : rien dans la file');
    check((await planifier({ id: Qu.id, jeton: Si.jeton }, 8 * 3600e3)).erreur === 'jeton', 'fournil_planifier vérifie le jeton');
    // l'essai
    const essai = (j) => appelle('fournil_notif_essai', { p_id: j.id, p_jeton: j.jeton });
    r = await essai(Si);
    check(r.ok === false && r.erreur === 'abonnement', 'un essai sans appareil abonné : « abonnement »');
    r = await essai(Qu);
    check(r.ok === true && (await file(Qu.id)).filter((x) => x.type === 'essai').length === 1, 'un essai : une notification « essai » due tout de suite');
    await avancer(60);
    r = await essai(Qu);
    check(r.ok === false && r.erreur === 'trop_vite', 'un second essai une minute plus tard : « trop_vite »');
    check((await essai({ id: Qu.id, jeton: Si.jeton })).erreur === 'jeton', 'fournil_notif_essai vérifie le jeton');
    // la fonction d'envoi : réservée au rôle de service
    for (const role of ['anon', 'authenticated']) {
      check(await refus(role, 'select public.fournil_notifs_dues(10)') === '42501' && await refus(role, `select public.fournil_notifs_faites('{1}'::bigint[], '{}'::text[])`) === '42501', `${role} ne peut appeler ni fournil_notifs_dues ni fournil_notifs_faites`);
      check(await refus(role, 'select * from public.fournil_notifs') === '42501' && await refus(role, 'select * from public.fournil_abonnements') === '42501' && await refus(role, `select nextval('public.fournil_notifs_id_seq')`) === '42501', `${role} ne lit ni la file ni les abonnements, ni la séquence`);
    }
    let d = await dues();
    check(Array.isArray(d) && d.length === 1 && d[0].type === 'essai' && Number.isInteger(d[0].notif_id) && d[0].titre === 'Le Fournil' && d[0].url === './' && d[0].subs.length === 3 && d[0].subs.every((s) => s.endpoint.startsWith('https://fcm.googleapis.com/') && s.p256dh && s.auth),
      `service_role : fournil_notifs_dues rend l’essai avec les 3 appareils de Quentin (${JSON.stringify(d.map((x) => ({ type: x.type, texte: x.texte, subs: x.subs.length })))})`);
    check(Object.keys(d[0]).sort().join() === 'notif_id,subs,texte,titre,type,url' && Object.keys(d[0].subs[0]).sort().join() === 'auth,endpoint,p256dh', 'le format du contrat : { notif_id, type, titre, texte, url, subs: [{ endpoint, p256dh, auth }] }');
    check((await dues()).length === 0, 'une seconde tournée aussitôt : rien (la notification est prise)');
    await avancer(3 * 60);
    const d2 = await dues();
    check(d2.length === 1 && d2[0].notif_id === d[0].notif_id, 'pas accusée en 2 min (la fonction a planté) : elle repart');
    r = await faites([d[0].notif_id], [EP('q3'), 'https://fcm.googleapis.com/fcm/send/inconnu']);
    check(r.ok && r.faites === 1 && r.retires === 1 && (await file(Qu.id)).find((x) => x.type === 'essai').envoyee && (await sup('select count(*)::int as n from public.fournil_abonnements where joueur = $1', [Qu.id]))[0].n === 2,
      `fournil_notifs_faites : envoyée, l’appareil mort (410) retiré (${JSON.stringify(r)})`);
    check((await dues()).length === 0 && (await faites([d[0].notif_id], [])).faites === 0, 'envoyée : elle ne repart plus, et l’accuser deux fois ne change rien');
    // la « pleine » arrive à son heure ; les préférences filtrent
    await planifier(Qu, 8 * 3600e3);
    check((await dues()).length === 0, 'la « pleine » prévue dans 8 h n’est pas encore due');
    await avancer(8 * 3600 + 30);
    d = await dues();
    check(d.length === 1 && d[0].type === 'pleine', '8 h plus tard : elle est due');
    await faites(d.map((x) => x.notif_id), []);
    await pourboire(Ra, 'Quentin'); // Quentin a décoché les pourboires
    check((await file(Qu.id)).filter((x) => x.type === 'pourboire').length === 0, 'un pourboire pour Quentin, qui a décoché les pourboires : pas de notification');
    await abonner(Qu, SUB('q4'), { pourboires: true });
    await pourboire(Si, 'Quentin');
    const fq = (await file(Qu.id)).filter((x) => x.type === 'pourboire');
    check(fq.length === 1 && fq[0].texte === 'Simon t\'a laissé un pourboire 🥐', `recoché : « ${fq[0] && fq[0].texte} »`);
    await abonner(Qu, SUB('q4'), { pourboires: false });
    d = await dues();
    check(d.length === 0 && (await file(Qu.id)).filter((x) => x.type === 'pourboire').length === 0, 'décoché avant l’envoi : la notification est retirée de la file sans partir');
    await planifier(Qu, 3600e3);
    await sup(`update public.fournil_notifs set due = $1 where type = 'pleine' and envoyee is null`, [new Date(horloge - 7 * 3600e3).toISOString()]);
    check((await dues()).length === 0 && (await pleines(Qu)).length === 0, 'une notification restée 6 h sans partir (fonction d’envoi en panne) : retirée, trop tard');
    // les événements : ouverture et fin, une fois, aux abonnés qui les veulent
    await abonner(Ra, SUB('r1'), { evenements: false });
    await heure('2026-10-27T11:10:00Z'); // le mardi 27 octobre 2026, 12 h 10 à Paris : fin du Quartier, ouverture de la Maison hantée
    await sup(`update public.fournil_joueurs set maj = $1`, [new Date(horloge).toISOString()]);
    d = await dues();
    const ev = d.filter((x) => x.type === 'evenement').map((x) => x.texte).sort();
    check(ev.length === 2 && ev.includes('C\'est fini pour le Quartier : viens voir le podium !') && ev.includes('La Maison hantée ouvre ses portes ! Viens jouer.') && d.every((x) => x.subs.every((s) => !s.endpoint.endsWith('r1'))),
      `12 h 10 le 27 octobre : deux annonces pour Quentin (« ${ev.join(' » ; « ')} »), aucune pour Rachel (événements décochés)`);
    check((await sup(`select cle from public.fournil_annonces order by cle`)).map((x) => x.cle).join() === 'hantee:ouverture,quartier:fin', 'les annonces sont notées (fournil_annonces)');
    await faites(d.map((x) => x.notif_id), []);
    await avancer(5 * 60);
    check((await dues()).length === 0, 'cinq minutes plus tard : pas une seconde fois');
    await heure('2026-11-02T21:00:00Z'); // 22 h à Paris : la Maison hantée a fermé à 20 h, il y a 2 h
    check((await dues()).length === 0, 'deux heures après la fin (la fonction n’a pas tourné) : trop tard, pas d’annonce');
    await sup(`delete from public.fournil_annonces where cle = 'hantee:fin'`);
    await heure('2026-11-02T19:30:00Z');
    d = await dues();
    check(d.length === 1 && d[0].texte === 'C\'est fini pour la Maison hantée : viens voir le podium !', `une demi-heure après la fin : « ${d[0] && d[0].texte} »`);
    // le ménage de la file : 7 jours
    await faites(d.map((x) => x.notif_id), []);
    await heure('2026-11-10T12:00:00Z');
    await sup(`update public.fournil_joueurs set maj = $1`, [new Date(horloge).toISOString()]);
    await dues();
    check((await sup('select count(*)::int as n from public.fournil_notifs where cree < $1', [new Date(horloge - 7 * 864e5).toISOString()]))[0].n === 0, 'les notifications de plus de 7 jours sont effacées');
    // un joueur qui part emporte tout
    await essai(Qu);
    r = await retirer(Qu);
    check(r.ok && (await sup('select ((select count(*) from public.fournil_abonnements where joueur = $1) + (select count(*) from public.fournil_notifs where joueur = $1) + (select count(*) from public.fournil_notif_prefs where id = $1))::int as n', [Qu.id]))[0].n === 0,
      'Quentin quitte le classement : ses appareils, ses préférences et ses notifications partent avec lui');
    check(!reponses.some((x) => JSON.stringify(x).includes(Qu.jeton) || JSON.stringify(x).includes(sha(Qu.jeton))) && !reponses.filter((x) => !Array.isArray(x)).some((x) => /"id"\s*:|"jeton"\s*:/.test(JSON.stringify(x))), 'aucune réponse des fonctions du jeu ne contient d’identifiant ni de jeton');
  }

  // ─── 32. le réveil (supabase/fournil-notifs-cron.sql), avec pg_cron et pg_net imités ───
  titre('le réveil des notifications : supabase/fournil-notifs-cron.sql');
  {
    const CRON = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-notifs-cron.sql'), 'utf8');
    check(CRON.includes("'COLLE-ICI-TON-CRON_SECRET'") && !/sb_secret_|service_role|eyJ[A-Za-z0-9_-]{10,}/.test(CRON), 'le fichier ne contient aucun secret : seulement la valeur à remplacer, clairement marquée');
    check(/https:\/\/jklbitrlkfrktmnarejc\.supabase\.co\/functions\/v1\/notifier/.test(CRON) && /'\*\/5 \* \* \* \*'/.test(CRON), 'il appelle la fonction notifier du projet du jeu, toutes les 5 minutes');
    const dbc = await PGlite.create();
    await dbc.exec(`
      create schema cron; create table cron.job (jobname text primary key, schedule text, command text);
      create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ insert into cron.job values (job_name, schedule, command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; select 1::bigint $$;
      create schema net; create table net.appels (url text, body jsonb, headers jsonb, timeout int);
      create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.appels values (url, body, headers, timeout_milliseconds); select 1::bigint $$;`);
    const sansExtensions = CRON.replace(/^create extension[^\n]*\n/gm, '');
    let err = null; try { await dbc.exec(sansExtensions); } catch (e2) { err = e2.message; }
    check(err && /Remplace d'abord COLLE-ICI-TON-CRON_SECRET/.test(err) && (await dbc.query('select count(*)::int as n from cron.job')).rows[0].n === 0, `collé sans remplacer la valeur : il s’arrête avec un message clair, sans rien planifier (${err && err.slice(0, 60)}…)`);
    err = null; try { await dbc.exec(sansExtensions.replace("'COLLE-ICI-TON-CRON_SECRET'", "'trop-court'")); } catch (e2) { err = e2.message; }
    check(err && /au moins 24 caractères/.test(err), 'un secret trop court : refusé');
    const SECRET = crypto.randomBytes(24).toString('base64url');
    await dbc.exec(sansExtensions.replace("'COLLE-ICI-TON-CRON_SECRET'", `'${SECRET}'`));
    await dbc.exec(sansExtensions.replace("'COLLE-ICI-TON-CRON_SECRET'", `'  ${SECRET}  '`)); // recollé (avec des espaces copiés en trop) : remplacé, pas doublé
    const jobs = (await dbc.query('select jobname, schedule, command from cron.job order by 1')).rows;
    check(jobs.length === 2 && jobs[0].jobname === 'fournil-notifier' && jobs[0].schedule === '*/5 * * * *' && jobs[1].jobname === 'fournil-notifier-menage', `deux tâches, une seule fois chacune même recollé (${jobs.map((x) => `${x.jobname} ${x.schedule}`).join(' ; ')})`);
    await dbc.exec(jobs[0].command);
    const ap = (await dbc.query('select url, body, headers, timeout from net.appels')).rows;
    check(ap.length === 1 && ap[0].url === 'https://jklbitrlkfrktmnarejc.supabase.co/functions/v1/notifier' && ap[0].headers.Authorization === 'Bearer ' + SECRET && ap[0].headers['Content-Type'] === 'application/json' && JSON.stringify(ap[0].body) === '{}' && ap[0].timeout === 20000,
      'la commande de la tâche est du SQL valide : net.http_post vers la fonction, avec « Authorization: Bearer <CRON_SECRET> »');
    await dbc.close();
  }

  // ─── les cadeaux (supabase/fournil-cadeaux.sql), collés par-dessus, deux fois ───
  titre('les cadeaux');
  {
    const CAD = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-cadeaux.sql'), 'utf8');
    const collerCad = async () => { await db.exec('set role proprio'); try { await db.exec(CAD); } finally { await db.exec('reset role'); } };
    const V1 = fs.readFileSync(path.join(__dirname, 'fournil-cadeaux-v1.sql'), 'utf8'); // la version 1, collée sur Supabase le 16 oct. (une copie : la CI n'a qu'un commit, pas l'historique)
    try { await db.exec('drop table if exists public.fournil_cadeaux cascade'); await db.exec('set role proprio'); await db.exec(V1); await db.exec('reset role'); } catch (err) { await db.exec('reset role'); check(false, 'la version 1 se colle : ' + err.message); }
    const Gv1 = joueur(); await avancer(3600); await publierP(Gv1, 'Ancien', 1e6, 10);
    await comme('proprio', `insert into public.fournil_cadeaux (joueur, montant, motif) values ('${Gv1.id}', 3e12, 'v1')`);
    try { await collerCad(); await collerCad(); check(true, 'fournil-cadeaux.sql (version 2) se colle par-dessus la version 1, et se recolle sans casse'); } catch (err) { check(false, 'fournil-cadeaux.sql se colle : ' + err.message); }
    const v1 = await comme('anon', 'select public.fournil_mes_cadeaux(p_id => $1, p_jeton => $2) as r', [Gv1.id, Gv1.jeton]);
    check(v1[0].r.cadeaux.length === 1 && v1[0].r.cadeaux[0].montant === 3e12 && v1[0].r.cadeaux[0].etoiles === 0, 'le cadeau en attente de la version 1 est toujours là (0 étoile)');
    await avancer(3600);
    const G1 = joueur(), G2 = joueur();
    const r1 = await publierP(G1, 'Gâté', 1e6, 10), r2 = await publierP(G2, 'Voisin', 1e6, 10);
    check(r1.ok === true && r2.ok === true, 'deux joueurs inscrits');
    // le SQL Editor (le propriétaire) dépose un cadeau, comme le joueur le fera
    await comme('proprio', `insert into public.fournil_cadeaux (joueur, montant, motif) select id, 3e12, 'Pour l''absence de ce matin' from public.fournil_joueurs where pseudo ilike 'gâté'`);
    const mes = async (j, role = 'anon') => (await comme(role, 'select public.fournil_mes_cadeaux(p_id => $1, p_jeton => $2) as r', [j.id, j.jeton]))[0].r;
    const recu = async (j, n, role = 'anon') => (await comme(role, 'select public.fournil_cadeau_recu(p_id => $1, p_jeton => $2, p_n => $3) as r', [j.id, j.jeton, n]))[0].r;
    let m = await mes(G1);
    check(m.ok === true && m.cadeaux.length === 1 && m.cadeaux[0].montant === 3e12 && m.cadeaux[0].motif === 'Pour l’absence de ce matin'.replace('’', "'") && Object.keys(m.cadeaux[0]).sort().join() === 'etoiles,montant,motif,n' && m.cadeaux[0].etoiles === 0, `fournil_mes_cadeaux : son cadeau de 3e12 (${JSON.stringify(m.cadeaux)})`);
    const n = m.cadeaux[0].n;
    check((await mes(G2)).cadeaux.length === 0, 'l’autre joueur ne le voit pas');
    check((await mes({ id: G1.id, jeton: G2.jeton })).ok === false && (await mes({ id: G1.id, jeton: 'court' })).erreur === 'jeton' && (await mes(joueur())).erreur === 'inconnu', 'mauvais jeton, jeton mal formé, identifiant inconnu : rien');
    check((await mes(G1, 'authenticated')).cadeaux.length === 1, 'authenticated aussi');
    let rr = await recu(G2, n);
    check(rr.ok === true && (await mes(G1)).cadeaux.length === 1, 'l’autre joueur ne peut pas le marquer reçu');
    rr = await recu({ id: G1.id, jeton: G2.jeton }, n);
    check(rr.ok === false && rr.erreur === 'jeton' && (await mes(G1)).cadeaux.length === 1, 'avec le jeton d’un autre : refusé');
    rr = await recu(G1, n);
    check(rr.ok === true && (await mes(G1)).cadeaux.length === 0 && (await recu(G1, n)).ok === true, 'fournil_cadeau_recu : il quitte la boîte (et le redire ne casse rien)');
    check(await refus('anon', 'select * from public.fournil_cadeaux') !== 'accepté' && await refus('anon', `insert into public.fournil_cadeaux (joueur, montant) values ('${G2.id}', 1e15)`) !== 'accepté' && await refus('anon', `update public.fournil_cadeaux set recu = null`) !== 'accepté' && await refus('authenticated', 'select * from public.fournil_cadeaux') !== 'accepté', 'la table ne se lit ni ne s’écrit depuis le jeu');
    check(await refus('anon', `select nextval('public.fournil_cadeaux_n_seq')`) !== 'accepté' && await refus('anon', 'select public.fournil_cadeau_qui($1, $2)', [G1.id, G1.jeton]) !== 'accepté', 'la séquence et la vérification interne sont fermées');
    check(await refus('proprio', `insert into public.fournil_cadeaux (joueur, montant) values ('${G2.id}', -5)`) !== 'accepté', 'un montant négatif est refusé');
    // version 2 : des étoiles, seules ou avec des euros
    check(await refus('proprio', `insert into public.fournil_cadeaux (joueur, montant, etoiles) values ('${G2.id}', 0, 0)`) !== 'accepté' && await refus('proprio', `insert into public.fournil_cadeaux (joueur, montant, etoiles) values ('${G2.id}', 0, 5000)`) !== 'accepté', 'ni euros ni étoiles, ou 5 000 étoiles : refusé');
    await comme('proprio', `insert into public.fournil_cadeaux (joueur, montant, etoiles, motif) select id, 0, 80, 'Pour le retard' from public.fournil_joueurs where pseudo = 'Gâté'`);
    m = await mes(G1);
    check(m.ok && m.cadeaux.length === 1 && m.cadeaux[0].etoiles === 80 && m.cadeaux[0].montant === 0, `un cadeau de 80 étoiles seules (${JSON.stringify(m.cadeaux)})`);
    check((await recu(G1, m.cadeaux[0].n)).ok && (await mes(G1)).cadeaux.length === 0, 'reçu, il quitte la boîte');
    await comme('proprio', `insert into public.fournil_cadeaux (joueur, montant) values ('${G2.id}', 5)`);
    await retirer(G2);
    check((await sup('select count(*)::int as c from public.fournil_cadeaux where joueur = $1', [G2.id]))[0].c === 0, 'quitter le classement efface ses cadeaux');
  }

  // ─── les patchs de la limite des événements, collés par-dessus la v6 : la 6.2 (supabase/fournil-classement-v62.sql), puis la 6.3
  // (supabase/fournil-classement-v63.sql, le Sirop et le Cristal en vraies recettes). Pour chacun, un Postgres neuf : la v6 telle
  // qu'elle est sur Supabase (le fichier actuel, ses deux tableaux remis aux valeurs d'avant la 6.2), les patchs précédents, des
  // joueurs, puis le patch, deux fois. Les tableaux changent, rien d'autre : ni les données, ni la liste des fonctions, ni leurs droits.
  {
    const Q = require('../src/quartier.js'), HT = require('../src/hantee.js');
    const P62 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-classement-v62.sql'), 'utf8');
    const P63 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-classement-v63.sql'), 'utf8');
    // les deux tableaux de la v6 (et 6.1) collée sur Supabase, avant la 6.2
    const Q6 = [12.5, 14.4, 16.1, 16.5, 16.7, 16.85, 16.95, 17.05, 17.15, 17.2, 17.3, 17.35, 17.4, 17.45, 17.5];
    const H6 = [11.65, 13.8, 15.25, 15.8, 16.05, 16.2, 16.35, 16.45, 16.55, 16.65, 16.75, 16.8, 16.9, 16.95, 17, 17, 17.05, 17.1, 17.15, 17.15, 17.2, 17.2, 17.25, 17.25, 17.3, 17.3, 17.3];
    // les tableaux écrits dans un texte SQL : le littéral de fournil_quartier_table() et celui de la ligne 'hantee' de fournil_evts()
    const lireTables = (texte) => {
      const q = /function public\.fournil_quartier_table\(\)[^;]*?'(\{[-\d.,]+\})'::double precision\[\]/.exec(texte);
      const h = /function public\.fournil_evts\(\)[\s\S]*?'hantee'::text[^;]*?'(\{[-\d.,]+\})'::double precision\[\]/.exec(texte);
      const tab = (m) => (m ? m[1].slice(1, -1).split(',').map(Number) : null);
      return { q: tab(q), h: tab(h), qBrut: q && q[1], hBrut: h && h[1] };
    };
    const T62 = lireTables(P62), T63 = lireTables(P63), TF = lireTables(SQL);
    const memes = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => x === b[k]);
    const SQL6 = TF.qBrut && TF.hBrut ? SQL.split(`'${TF.qBrut}'`).join(`'{${Q6.join(',')}}'`).split(`'${TF.hBrut}'`).join(`'{${H6.join(',')}}'`) : SQL;
    const JOUR = 86400e3, PAS_H = 6 * 3600e3;
    // la borne d'une table de log10 à pas fixe (le miroir de fournil_quartier_borne et de fournil_evt_borne)
    const borneJS = (tab, debut, pasMs, ms) => { if (ms < debut) return 0; const j = Math.min((ms - debut) / pasMs, tab.length - 1), k = Math.floor(j); return k >= tab.length - 1 ? Math.pow(10, tab[tab.length - 1]) : Math.pow(10, tab[k] + (tab[k + 1] - tab[k]) * (j - k)); };

    // un patch : v (« 6.2 »), son texte, ses tableaux, ceux d'avant (vieux, nommés vNom), les patchs déjà collés avant lui
    const patchLimite = async ({ v, texte, T, vieux, vNom, avant }) => {
      titre(`la version ${v} : la limite des événements, collée par-dessus la ${vNom}`);
      check(T.q && T.q.length === 15 && T.h && T.h.length === 27, `le patch v${v} porte les deux tableaux : 15 valeurs pour le Quartier, 27 pour la Maison hantée`);
      check(T.q && T.h && T.q.every((x, k) => x >= vieux.q[k] && (k === 0 || x >= T.q[k - 1])) && T.h.every((x, k) => x >= vieux.h[k] && (k === 0 || x >= T.h[k - 1])),
        `chaque valeur de la v${v} est ≥ à celle de la ${vNom}, au même pas, et les tableaux sont croissants (Quartier : jusqu’à +${T.q ? Math.max(...T.q.map((x, k) => x - vieux.q[k])).toFixed(2) : '?'} en log10 ; Maison hantée : jusqu’à +${T.h ? Math.max(...T.h.map((x, k) => x - vieux.h[k])).toFixed(2) : '?'})`);
      check(!/\b(insert|update|delete|truncate|drop|alter|grant)\b/i.test(texte.replace(/--[^\n]*/g, '')) && (texte.match(/create or replace function/gi) || []).length === 2 && !/create\s+(table|index|schema|role|trigger|policy)/i.test(texte),
        'le patch ne touche que deux fonctions : ni table, ni donnée, ni droit accordé, rien de supprimé');
      const db62 = await PGlite.create();
      const s62 = async (sql, p) => (await db62.query(sql, p)).rows;
      const c62 = async (sql, p, role = 'anon') => { await db62.exec(`set role ${role}`); try { return (await db62.query(sql, p)).rows[0].r; } finally { await db62.exec('reset role'); } };
      const refus62 = async (role, sql) => { try { await c62(sql, [], role); return false; } catch (err) { return true; } };
      const coller62 = async (t) => { await db62.exec('set role proprio'); try { return await db62.exec(t); } finally { await db62.exec('reset role'); } };
      await db62.exec(`
        create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
        create role proprio nologin createrole;
        grant usage, create on schema public to proprio;
        grant usage on schema public to anon, authenticated, service_role;
        set role proprio;
        alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
        alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
        reset role;
        create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
        grant usage on schema banc to proprio; grant select on banc.horloge to proprio;`);
      let h62 = 0;
      const horloge62 = async (ms) => { h62 = ms; await s62(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`); await s62('update banc.horloge set t = $1', [new Date(ms).toISOString()]); };
      const pub = (j, pseudo, f, points, billets, evt, score) => c62('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_quartier => $7, p_evt => $8, p_score => $9) as r', [j.id, j.jeton, pseudo, String(f), String(points), lundiDe(h62), billets == null ? null : String(billets), evt || null, score == null ? null : String(score)]);
      const borneQ = async (ms) => (await s62('select public.fournil_quartier_borne($1::timestamptz) as b', [new Date(ms).toISOString()]))[0].b;
      const borneH = async (ms) => (await s62(`select public.fournil_evt_borne('hantee', $1::timestamptz) as b`, [new Date(ms).toISOString()]))[0].b;
      const NQ = T.q || vieux.q, NH = T.h || vieux.h;
      // le pas où le patch laisse le plus de place de plus qu'avant (on se met en son milieu) : un score entre les deux bornes
      const ecart = (vx, nf, k) => nf[k] + nf[k + 1] - vx[k] - vx[k + 1];
      const ecartMax = (vx, nf, de, a) => { let m = de; for (let k = de; k <= a; k++) if (ecart(vx, nf, k) > ecart(vx, nf, m)) m = k; return m; };
      const mQ = ecartMax(vieux.q, NQ, 6, 13), kQ = mQ + 0.5, TQ = Q.DEBUT + kQ * JOUR; // après le premier lundi de l'événement : une semaine figée au palmarès
      const mH = ecartMax(vieux.h, NH, 1, 24), kH = mH + 0.5, TH = HT.DEBUT + kH * PAS_H;
      const plusQ = ecart(vieux.q, NQ, mQ) > 1e-9, plusH = ecart(vieux.h, NH, mH) > 1e-9; // la nouvelle borne dépasse-t-elle l'ancienne quelque part ?
      try { await coller62(SQL6); check(true, 'la version 6 telle que collée sur Supabase (tableaux d’avant la 6.2) s’installe'); } catch (err) { check(false, 'la version 6 s’installe : ' + err.message); }
      for (const [nom, t] of avant) { try { await coller62(t); check(true, `puis le patch v${nom}, comme sur Supabase`); } catch (err) { check(false, `le patch v${nom} se colle : ` + err.message); } }
      // des joueurs : inscrits le 2e jour du Quartier (des points, des billets), puis une semaine figée, une photo, un pourboire
      const [Ali, Bea, Cyr] = [joueur(), joueur(), joueur()], noms = ['Ali', 'Béa', 'Cyril'];
      await horloge62(Q.DEBUT + JOUR);
      for (const [k, j] of [Ali, Bea, Cyr].entries()) await pub(j, noms[k], 1e9, 10 * (k + 1), 1e8 * (k + 1));
      await horloge62(TQ - 3600e3);
      for (const [k, j] of [Ali, Bea, Cyr].entries()) await pub(j, noms[k], 1e9 + 1e6, 5 * (k + 1), 1e12 * (k + 1));
      await horloge62(TQ - 1800e3);
      await c62('select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_photo => $7::jsonb) as r', [Bea.id, Bea.jeton, noms[1], String(1e9 + 2e6), '10', lundiDe(h62), JSON.stringify({ nom: 'Chez Béa' })]);
      await c62('select public.fournil_pourboire(p_id => $1, p_jeton => $2, p_pour => $3) as r', [Ali.id, Ali.jeton, 'Béa']);
      // avant le patch : un score entre l'ancienne et la nouvelle borne est plafonné à l'ancienne
      await horloge62(TQ);
      const vieuxQ = borneJS(vieux.q, Q.DEBUT, JOUR, TQ), neufQ = borneJS(NQ, Q.DEBUT, JOUR, TQ), X = plusQ ? Math.sqrt(vieuxQ * neufQ) : vieuxQ / 2;
      let r = await pub(Ali, noms[0], 1e9 + 3e6, 15, X);
      if (plusQ) check(r.ok === true && r.quartier_plafonne === true && proche(r.quartier, vieuxQ, 1e-9), `en ${vNom}, au jour ${kQ} du Quartier : Ali envoie ${e(X)} billets (entre l’ancienne borne ${e(vieuxQ)} et la nouvelle ${e(neufQ)}) : plafonné à l’ancienne (${e(r.quartier)})`);
      else check(r.ok === true && proche(r.quartier, X, 1e-9), `en ${vNom}, au jour ${kQ} du Quartier : la v${v} ne change pas la borne des jours 6 à 14 (${e(vieuxQ)}) : Ali envoie ${e(X)} billets, comptés`);
      const photo = async () => { const o = {}; for (const t of TABLES) o[t] = (await s62(`select coalesce(json_agg(x order by x::text), '[]')::text as j from public.${t} x`))[0].j; return JSON.stringify(o); };
      const contrat = async () => JSON.stringify(await s62(`select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as rend, l.lanname as langage, p.provolatile as vol, p.prosecdef as definer,
          array_to_string(p.proconfig, ',') as conf, p.proacl::text as acl, pg_get_userbyid(p.proowner) as proprio, has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as service
        from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil%' order by 1, 2`));
      const ouvertes = async () => (await s62(`select string_agg(p.proname, ',' order by p.proname) as l from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil%' and has_function_privilege('anon', p.oid, 'execute')`))[0].l;
      const fenetres = async () => JSON.stringify(await s62('select nom, debut, fin, pas from public.fournil_evts() order by nom'));
      const corps = async () => JSON.stringify(await s62(`select proname, md5(prosrc) as m from pg_proc where pronamespace = 'public'::regnamespace and proname like 'fournil%' and proname not in ('fournil_quartier_table', 'fournil_evts') order by 1`));
      const compte = async (t) => (await s62(`select count(*)::int as n from public.${t}`))[0].n;
      const nPal = await compte('fournil_palmares'), nPho = await compte('fournil_photos'), nPb = await compte('fournil_pourboires'), nJ = await compte('fournil_joueurs');
      check(nJ === 3 && nPal >= 1 && nPho === 1 && nPb === 1, `en ${vNom} : trois joueurs avec des points et des billets, une semaine au palmarès (${nPal} lignes), une photo, un pourboire`);
      const [dAvant, cAvant, aAvant, fAvant, bAvant] = [await photo(), await contrat(), await ouvertes(), await fenetres(), await corps()];
      // le patch, deux fois
      let res = null;
      try { res = await coller62(texte); res = await coller62(texte); check(true, `le patch v${v} se colle par-dessus la ${vNom}, puis se recolle sans casse (rôle propriétaire, droits par défaut de Supabase)`); } catch (err) { check(false, `le patch v${v} se colle : ` + err.message); }
      check(await photo() === dAvant, `rien ne bouge dans les données : les ${TABLES.length} tables sont identiques (joueurs, points, billets, palmarès, photos, pourboires…)`);
      check(await contrat() === cAvant, 'le contrat des fonctions est inchangé : la même liste, les mêmes signatures et types rendus, langage, volatilité, search_path, propriétaire et droits (anon, authenticated, service_role)');
      check(await ouvertes() === aAvant, `anon appelle toujours les mêmes fonctions, ni plus ni moins (${aAvant.split(',').length} : ${aAvant.replace(/fournil_/g, '')})`);
      check(await corps() === bAvant && await fenetres() === fAvant, 'les autres fonctions gardent leur code, la Maison hantée sa fenêtre et son pas de 6 h');
      check(await refus62('anon', 'select public.fournil_quartier_table() as r') && await refus62('anon', 'select count(*) as r from public.fournil_evts()') && await refus62('authenticated', 'select public.fournil_quartier_table() as r'), 'fournil_quartier_table et fournil_evts restent fermées à anon et authenticated');
      // les tableaux et les bornes
      const tq = (await s62('select public.fournil_quartier_table() as t'))[0].t, th = (await s62(`select tableau as t from public.fournil_evts() where nom = 'hantee'`))[0].t;
      check(memes(tq, NQ) && memes(th, NH), `les tableaux installés sont ceux de la v${v} (Quartier : ${tq.join(' ')} ; Maison hantée : ${th.join(' ')})`);
      { let ok = true, eg = true; const d = [];
        for (let k = 0; k <= 14; k++) { const ms = Q.DEBUT + k * JOUR, b = await borneQ(ms), bm = await borneQ(ms + JOUR / 2); if (!(b >= Math.pow(10, vieux.q[k]) * (1 - 1e-12) && bm >= borneJS(vieux.q, Q.DEBUT, JOUR, ms + JOUR / 2) * (1 - 1e-12))) { ok = false; d.push(k); } if (!proche(b, Math.pow(10, NQ[k]), 1e-9) || !proche(bm, borneJS(NQ, Q.DEBUT, JOUR, ms + JOUR / 2), 1e-9)) eg = false; }
        check(ok && eg && (await borneQ(Q.DEBUT - 1)) === 0 && proche(await borneQ(Q.DEBUT + 20 * JOUR), Math.pow(10, NQ[14]), 1e-9), `la borne du Quartier, jours 0 à 14 (et au milieu de chaque jour) : ≥ à celle de la ${vNom}, = 10^(la v${v}) ; 0 avant l’ouverture, constante après${d.length ? ' — en dessous aux jours ' + d.join(', ') : ''}`); }
      { let ok = true, eg = true; const d = [];
        for (let k = 0; k <= 26; k++) { const ms = HT.DEBUT + k * PAS_H, b = await borneH(ms), bm = k < 26 ? await borneH(ms + PAS_H / 2) : b; if (!(b >= Math.pow(10, vieux.h[k]) * (1 - 1e-12) && (k === 26 || bm >= borneJS(vieux.h, HT.DEBUT, PAS_H, ms + PAS_H / 2) * (1 - 1e-12)))) { ok = false; d.push(k); } if (!proche(b, Math.pow(10, NH[k]), 1e-9) || (k < 26 && !proche(bm, borneJS(NH, HT.DEBUT, PAS_H, ms + PAS_H / 2), 1e-9))) eg = false; }
        check(ok && eg && (await borneH(HT.DEBUT - 1)) === 0, `la borne de la Maison hantée, à chacun des 27 pas de 6 h (et au milieu de chaque pas) : ≥ à celle de la ${vNom}, = 10^(la v${v}) ; 0 avant l’ouverture${d.length ? ' — en dessous aux pas ' + d.join(', ') : ''}`); }
      // la requête de contrôle, au bas du patch
      { const ctl = res && res[res.length - 1], l = ctl && ctl.rows && ctl.rows[0];
        check(!!l && ctl.rows.length === 1 && Object.keys(l).join() === 'quartier,hantee,borne_quartier,borne_quartier_log10' && memes(l.quartier, NQ) && memes(l.hantee, NH) && proche(l.borne_quartier, (await s62('select public.fournil_quartier_borne(now()) as b'))[0].b, 1e-3) && (l.borne_quartier === 0 || Math.abs(Number(l.borne_quartier_log10) - Math.log10(l.borne_quartier)) <= 0.005), // (now() : l'heure vraie, quelques millisecondes plus tard)
          `la requête de contrôle rend une ligne : les deux tableaux et la borne du Quartier maintenant (${l ? `${e(l.borne_quartier)}, log10 ${l.borne_quartier_log10}` : '?'})`); }
      // la publication : au-dessus de l'ancienne borne, sous la nouvelle, c'est compté
      await horloge62(TQ + 60e3);
      const vieuxQ2 = borneJS(vieux.q, Q.DEBUT, JOUR, h62), neufQ2 = borneJS(NQ, Q.DEBUT, JOUR, h62);
      r = await pub(Ali, noms[0], 1e9 + 4e6, 15, X);
      if (plusQ) check(X > vieuxQ2 * (1 + 1e-9) && X < neufQ2 && r.ok === true && r.quartier_plafonne === false && r.quartier === X && r.rang_quartier === 1,
        `en v${v}, une minute plus tard : les mêmes ${e(X)} billets (au-dessus de l’ancienne borne ${e(vieuxQ2)}, sous la nouvelle ${e(neufQ2)}) sont comptés, sans plafond ; Ali 1er (${JSON.stringify({ q: r.quartier, plaf: r.quartier_plafonne, rang: r.rang_quartier })})`);
      r = await pub(Bea, noms[1], 1e9 + 4e6, 10, 1e24);
      check(r.ok === true && r.quartier_plafonne === true && proche(r.quartier, await borneQ(h62), 1e-9) && proche(r.quartier, neufQ2, 1e-9), `1e24 billets (console) : plafonnés à la nouvelle borne (${e(r.quartier)}), pas au-delà`);
      // la Maison hantée : de même, un score entre les deux bornes est compté
      await horloge62(TH);
      const vieuxH = borneJS(vieux.h, HT.DEBUT, PAS_H, TH), neufH = borneJS(NH, HT.DEBUT, PAS_H, TH), Y = plusH ? Math.sqrt(vieuxH * neufH) : vieuxH / 2;
      r = await pub(Cyr, noms[2], 1e9 + 5e6, 5, null, 'hantee', Y);
      if (plusH) check(Y > vieuxH * (1 + 1e-9) && Y < neufH && r.ok === true && r.evt === 'hantee' && r.evt_plafonne === false && r.evt_score === Y,
        `Maison hantée, au pas ${kH} : ${e(Y)} bonbons (au-dessus de l’ancienne borne ${e(vieuxH)}, sous la nouvelle ${e(neufH)}) sont comptés, sans plafond (${JSON.stringify({ s: r.evt_score, plaf: r.evt_plafonne })})`);
      else check(r.ok === true && r.evt_plafonne === false && r.evt_score === Y, `Maison hantée : la v${v} ne change pas la borne des pas 1 à 25 (${e(vieuxH)}) : ${e(Y)} bonbons comptés`);
      r = await pub(Ali, noms[0], 1e9 + 6e6, 5, null, 'hantee', 1e24);
      check(r.ok === true && r.evt_plafonne === true && proche(r.evt_score, neufH, 1e-6), `1e24 bonbons : plafonnés à la nouvelle borne (${e(r.evt_score)})`);
      await db62.close();
    };

    await patchLimite({ v: '6.2', texte: P62, T: T62, vieux: { q: Q6, h: H6 }, vNom: 'v6', avant: [] });
    await patchLimite({ v: '6.3', texte: P63, T: T63, vieux: { q: T62.q || Q6, h: T62.h || H6 }, vNom: 'v6.2', avant: [['6.2', P62]] });
    check(memes(TF.q, T63.q) && memes(TF.h, T63.h), 'supabase/fournil-classement.sql et le patch v6.3 portent les mêmes tableaux (recoller le fichier complet ne revient pas en arrière)');
  }

  // ─── le chat (supabase/fournil-chat.sql), collé par-dessus la v6, deux fois ───
  titre('le chat');
  {
    const CHAT = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-chat.sql'), 'utf8');
    const collerChat = async () => { await db.exec('set role proprio'); try { await db.exec(CHAT); } finally { await db.exec('reset role'); } };
    try { await collerChat(); await collerChat(); check(true, 'fournil-chat.sql se colle par-dessus la v6, et se recolle sans casse'); } catch (err) { check(false, 'fournil-chat.sql se colle : ' + err.message); }
    const TABLES_CHAT = ['fournil_chat', 'fournil_chat_images', 'fournil_chat_signalements', 'fournil_chat_bannis'];
    const nbChat = async (t = 'fournil_chat', ou = '', p) => (await sup(`select count(*)::int as c from public.${t} ${ou}`, p))[0].c;
    // les appels, comme PostgREST les fait (paramètres nommés)
    const lire = async (o = {}, role = 'anon') => {
      const noms = [], vals = [];
      for (const [k, v] of [['p_apres', o.apres], ['p_limite', o.limite], ['p_id', o.j && o.j.id], ['p_jeton', o.j && o.j.jeton]]) if (v !== undefined) { noms.push(k); vals.push(v); }
      return garde((await comme(role, `select public.fournil_chat_lire(${noms.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, vals))[0].r);
    };
    const image = async (n, role = 'anon') => garde((await comme(role, 'select public.fournil_chat_image(p_n => $1) as r', [n]))[0].r);
    const envoyer = async (j, texte, gif = null, img = null, role = 'anon') => garde((await comme(role, 'select public.fournil_chat_envoyer(p_id => $1, p_jeton => $2, p_texte => $3, p_gif => $4, p_image => $5) as r', [j.id, j.jeton, texte, gif, img]))[0].r);
    const signaler = async (j, n) => garde((await comme('anon', 'select public.fournil_chat_signaler(p_id => $1, p_jeton => $2, p_n => $3) as r', [j.id, j.jeton, n]))[0].r);
    const effacer = async (j, n) => garde((await comme('anon', 'select public.fournil_chat_effacer(p_id => $1, p_jeton => $2, p_n => $3) as r', [j.id, j.jeton, n]))[0].r);
    // un joueur du classement : inscrit puis un deuxième envoi (une inscription jamais suivie d'un envoi part au ménage des 7 jours)
    const inscrire = async (j, pseudo) => { await avancer(1); const a = await publierP(j, pseudo, 1e6, 10); await avancer(11); const b = await publierP(j, pseudo, 1e6 + 10, 10); return a.ok === true && b.ok === true; };
    const IMG = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'; // une image WebP d'un pixel

    // la structure et les droits
    const colsDe = async (t) => (await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t])).map((c) => c.c).join();
    const cc = {}; for (const t of TABLES_CHAT) cc[t] = await colsDe(t);
    check(cc.fournil_chat === 'n,joueur,pseudo,texte,gif,a_image,cree,masque,signal' && cc.fournil_chat_images === 'n,data,cree' && cc.fournil_chat_signalements === 'n,joueur' && cc.fournil_chat_bannis === 'joueur,pseudo,motif,cree',
      `les tables du contrat : ${Object.entries(cc).map(([t, c]) => `${t.replace('fournil_', '')} (${c})`).join(', ')}`);
    const fkc = await sup(`select conrelid::regclass::text as t, confrelid::regclass::text as vers, confdeltype as d from pg_constraint where contype = 'f' and conrelid::regclass::text like 'fournil_chat%' order by 1, 2`);
    check(fkc.map((x) => `${x.t}>${x.vers}:${x.d}`).join() === 'fournil_chat>fournil_joueurs:c,fournil_chat_images>fournil_chat:c,fournil_chat_signalements>fournil_chat:c,fournil_chat_signalements>fournil_joueurs:c',
      `clés étrangères « on delete cascade » : un message part avec son joueur, son image et ses signalements avec lui ; les bannis n’en ont pas (le bannissement survit au départ) (${fkc.map((x) => x.t.replace('fournil_', '') + '→' + x.vers.replace('fournil_', '')).join(', ')})`);
    const droitsChat = async () => {
      let tout = true;
      for (const t of TABLES_CHAT) {
        const rls = (await sup(`select relrowsecurity as r from pg_class where oid = $1::regclass`, ['public.' + t]))[0];
        const pol = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = $1`, [t]))[0].n;
        const droits = await sup(`select r.rolname as role, p.priv from (values ('anon'), ('authenticated'), ('public')) r(rolname), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) where has_table_privilege(r.rolname, $1, p.priv)`, ['public.' + t]);
        tout = check(rls && rls.r === true && pol === 0 && droits.length === 0, `${t} : sécurité ligne par ligne sans aucune règle, aucun droit pour anon, authenticated ni PUBLIC${droits.length ? ' : ' + droits.map((d) => d.role + ' ' + d.priv).join(', ') : ''}`) && tout;
      }
      const seq = await sup(`select r.rolname as role from (values ('anon'), ('authenticated'), ('public')) r(rolname) where has_sequence_privilege(r.rolname, 'public.fournil_chat_n_seq', 'usage') or has_sequence_privilege(r.rolname, 'public.fournil_chat_n_seq', 'select') or has_sequence_privilege(r.rolname, 'public.fournil_chat_n_seq', 'update')`);
      check(seq.length === 0, `la séquence des messages : aucun droit pour anon, authenticated ni PUBLIC${seq.length ? ' : ' + seq.map((x) => x.role).join(', ') : ''}`);
      const fns = await sup(`select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, array_to_string(p.proconfig, ',') as conf,
          has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
          p.proacl is null as acl_defaut, exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pour_public, pg_get_userbyid(p.proowner) as proprio
        from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil\\_chat%' order by 1`);
      const sig = Object.fromEntries(fns.map((f) => [f.nom, f.args]));
      check(fns.length === 7 && sig.fournil_chat_lire === 'p_apres bigint, p_limite integer, p_id uuid, p_jeton text' && sig.fournil_chat_image === 'p_n bigint'
        && sig.fournil_chat_envoyer === 'p_id uuid, p_jeton text, p_texte text, p_gif text, p_image text' && sig.fournil_chat_signaler === 'p_id uuid, p_jeton text, p_n bigint'
        && sig.fournil_chat_effacer === 'p_id uuid, p_jeton text, p_n bigint' && sig.fournil_chat_qui === 'p_id uuid, p_jeton text' && sig.fournil_chat_banni === 'p_id uuid',
        `les fonctions du chat, une seule signature chacune (${fns.map((f) => `${f.nom.replace('fournil_', '')}(${f.args})`).join(' ; ')})`);
      const ouvertes = fns.filter((f) => f.anon).map((f) => f.nom);
      check(JSON.stringify(ouvertes) === JSON.stringify(CHAT_JEU) && fns.every((f) => f.anon === f.auth), `anon (et authenticated) n’appellent que les cinq du contrat (${ouvertes.map((n) => n.replace('fournil_', '')).join(', ')}) ; fournil_chat_qui et fournil_chat_banni sont fermées`);
      check(fns.every((f) => f.definer && /search_path=(""|'')/.test(f.conf) && !f.acl_defaut && !f.pour_public && f.proprio === 'proprio'), 'chacune : SECURITY DEFINER, search_path fixé, droits explicites (rien pour PUBLIC), au propriétaire des tables');
      return tout;
    };
    await droitsChat();

    // des joueurs du classement, et un visiteur sans pseudo
    await avancer(3600);
    const [Ba, Le, S1, S2, S3, Pi] = [joueur(), joueur(), joueur(), joueur(), joueur(), joueur()];
    let ins = true; for (const [j, p] of [[Ba, 'Bavard'], [Le, 'Lectrice'], [S1, 'Sig Un'], [S2, 'Sig Deux'], [S3, 'Sig Trois'], [Pi, 'Pipelette']]) ins = (await inscrire(j, p)) && ins;
    check(ins, 'six joueurs inscrits au classement');
    let l = await lire();
    check(l.ok === true && Array.isArray(l.messages) && l.messages.length === 0 && l.dernier === 0, `fournil_chat_lire sans pseudo, chat vide : ${JSON.stringify(l)}`);

    // envoyer : les erreurs
    let r = await envoyer({ id: Ba.id, jeton: 'court' }, 'salut');
    const r2 = await envoyer({ id: Ba.id, jeton: Le.jeton }, 'salut'), r3 = await envoyer({ id: null, jeton: Ba.jeton }, 'salut');
    check(r.ok === false && r.erreur === 'jeton' && r.n === null && r2.erreur === 'jeton' && r3.erreur === 'jeton', 'jeton mal formé, jeton d’un autre, identifiant absent : « jeton »');
    r = await envoyer(joueur(), 'salut');
    check(r.ok === false && r.erreur === 'inconnu', 'un téléphone sans pseudo (pas inscrit au classement) : « inconnu »');
    r = await envoyer(Ba, '   '); const rv2 = await envoyer(Ba, null, '', ''), rv3 = await envoyer(Ba, '\u0007\u202e \n\t');
    check(r.erreur === 'vide' && rv2.erreur === 'vide' && rv3.erreur === 'vide', 'des espaces, rien du tout, des caractères de contrôle seuls : « vide »');
    r = await envoyer(Ba, 'x'.repeat(301)); const rl2 = await envoyer(Ba, 'x'.repeat(100000));
    check(r.erreur === 'long' && rl2.erreur === 'long', '301 caractères, 100 000 caractères : « long »');
    let gifs = []; for (const g of ['abc', 'abc-defgh', '../../etc', 'a'.repeat(41), 'abcd e', '<img src=x>']) gifs.push((await envoyer(Ba, '', g)).erreur);
    check(gifs.every((x) => x === 'gif'), `des GIF qui ne sont pas un identifiant GIPHY (trop court, tiret, chemin, 41 caractères, espace, balise) : « gif » (${gifs.join(', ')})`);
    let imgs = []; for (const im of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PGI+', 'javascript:alert(1)', 'https://exemple.fr/a.png', 'data:image/png;base64,abc"onerror=x', 'data:image/jpeg;base64,' + 'A'.repeat(480001 - 23), 'DATA:IMAGE/PNG;BASE64,AAAA'])
      imgs.push((await envoyer(Ba, 'regarde', null, im)).erreur);
    check(imgs.every((x) => x === 'image'), `des images refusées (SVG, HTML, javascript:, une adresse, des guillemets, 480 001 caractères, en majuscules) : « image » (${imgs.join(', ')})`);
    check(await nbChat() === 0, 'aucun de ces envois n’a rien écrit');

    // envoyer : accepté
    await avancer(5);
    r = await envoyer(Ba, '  Bon\njour\u0007 à\u202e tous\t ! ');
    const n1 = r.n, t1 = horloge;
    check(r.ok === true && r.erreur === null && Number.isInteger(n1), `un texte accepté (n ${n1})`);
    l = await lire();
    check(l.messages.length === 1 && l.messages[0].texte === 'Bon jour à tous !' && l.messages[0].pseudo === 'Bavard' && l.messages[0].gif === null && l.messages[0].image === false && l.messages[0].cree === t1 && l.messages[0].moi === false && l.dernier === n1,
      `relu par un visiteur : texte nettoyé (retour à la ligne et tabulation en espaces, contrôle et inversion du sens retirés, espaces répétés réduits, bords ôtés), pseudo copié, heure en ms (${JSON.stringify(l.messages[0])})`);
    check(Object.keys(l.messages[0]).sort().join() === 'cree,gif,image,moi,n,pseudo,texte' && Object.keys(l).sort().join() === 'dernier,erreur,messages,ok', `les champs du contrat, ni plus ni moins (${Object.keys(l.messages[0]).join(', ')})`);
    // les limites : 3 s
    await avancer(1);
    r = await envoyer(Ba, 'encore');
    check(r.ok === false && r.erreur === 'trop-vite' && r.n === null, '1 s après : « trop-vite »');
    await avancer(1.9);
    check((await envoyer(Ba, 'encore')).erreur === 'trop-vite', '2,9 s après : « trop-vite »');
    await avancer(0.1);
    r = await envoyer(Ba, 'x'.repeat(300), 'xT9IgDEI1iZyb2wqo8');
    const n2 = r.n;
    check(r.ok === true && n2 > n1, '3 s après : accepté (300 caractères tout juste, et un GIF)');
    await avancer(3);
    r = await envoyer(Ba, '', null, IMG); const n3 = r.n;
    check(r.ok === true, 'une image WebP seule, sans texte : acceptée');
    await avancer(3);
    const grande = 'data:image/jpeg;base64,' + 'A'.repeat(480000 - 23);
    r = await envoyer(Le, `Robert'); delete from public.fournil_chat; --`, null, grande); const n4 = r.n;
    check(r.ok === true && await nbChat() === 4, 'une image JPEG de 480 000 caractères tout juste, et une injection dans le texte : simple texte, rien d’effacé');
    l = await lire({ j: Le });
    check(l.messages.map((m) => m.n).join() === [n1, n2, n3, n4].join() && l.messages.map((m) => m.moi).join() === 'false,false,false,true' && l.messages[3].texte === `Robert'); delete from public.fournil_chat; --`
      && l.messages[1].gif === 'xT9IgDEI1iZyb2wqo8' && l.messages[1].texte.length === 300 && l.messages[2].image === true && l.messages[2].texte === '' && l.dernier === n4,
      'relu avec son jeton : dans l’ordre, « moi » sur son message seulement, le GIF, l’image, dernier = le plus récent');
    l = await lire({ j: { id: Le.id, jeton: Ba.jeton } });
    check(l.ok === true && l.messages.every((m) => m.moi === false), 'avec le jeton d’un autre : la lecture marche, mais « moi » est toujours faux');
    check((await lire({ j: { id: Le.id, jeton: 'court' } })).messages.length === 4 && (await lire({}, 'authenticated')).messages.length === 4, 'jeton mal formé : lu quand même ; authenticated lit aussi');
    let im = await image(n3);
    check(im.ok === true && im.data === IMG && (await image(n4)).data === grande, 'fournil_chat_image : les images telles qu’envoyées');
    check((await image(n1)).data === null && (await image(999999)).data === null && (await image(null)).data === null, 'un message sans image, un numéro inconnu, rien : data null');
    // lire : p_apres, p_limite
    l = await lire({ apres: n2 });
    check(l.messages.map((m) => m.n).join() === [n3, n4].join() && l.dernier === n4, `p_apres = ${n2} : les deux suivants`);
    l = await lire({ apres: 0, limite: 2 });
    check(l.messages.map((m) => m.n).join() === [n3, n4].join(), 'p_limite = 2 : les deux plus récents, du plus ancien au plus récent');
    l = await lire({ apres: n4 });
    check(l.messages.length === 0 && l.dernier === n4, 'p_apres = le dernier : rien de neuf, dernier inchangé');
    check((await lire({ apres: -5, limite: 0 })).messages.length === 1 && (await lire({ apres: null, limite: null })).messages.length === 4, 'p_apres négatif, p_limite nulle : ramenés aux bornes (1 message) ; null : les valeurs par défaut');

    // le quota : 60 messages dans l'heure (Pipelette, toutes les 3 s)
    await avancer(3600);
    let acceptes = 0; const debut = horloge;
    for (let k = 0; k < 60; k++) { if ((await envoyer(Pi, 'bla ' + k)).ok) acceptes++; await avancer(3); }
    r = await envoyer(Pi, 'un de trop');
    check(acceptes === 60 && r.ok === false && r.erreur === 'quota', `60 messages en 3 minutes acceptés, le 61e : « ${r.erreur} »`);
    await heure(debut + 3600 * 1000 - 1000);
    check((await envoyer(Pi, 'toujours trop')).erreur === 'quota', 'presque une heure après le premier : toujours « quota »');
    await heure(debut + 3600 * 1000 + 1000);
    check((await envoyer(Pi, 'ça repart')).ok === true, 'une heure après le premier (il sort de la fenêtre glissante) : accepté');

    // signaler : au 3e joueur différent, masqué
    await avancer(60);
    r = await envoyer(Ba, 'un message pénible'); const nS = r.n;
    await avancer(3);
    r = await envoyer(Ba, 'avec une image', null, IMG); const nSi = r.n;
    let s = await signaler(Ba, nS);
    check(s.ok === false && s.erreur === 'soi', 'signaler son propre message : « soi »');
    s = await signaler(S1, 999999);
    check(s.ok === false && s.erreur === 'absent', 'signaler un message qui n’existe pas : « absent »');
    s = await signaler({ id: S1.id, jeton: S2.jeton }, nS);
    check(s.ok === false && s.erreur === 'jeton' && (await signaler(joueur(), nS)).erreur === 'inconnu', 'le jeton d’un autre : « jeton » ; sans pseudo : « inconnu »');
    s = await signaler(S1, nS);
    const s1b = await signaler(S1, nS), s1c = await signaler(S1, nS);
    check(s.ok === true && s.masque === false && s1b.ok === true && s1b.masque === false && s1c.masque === false && (await sup('select signal from public.fournil_chat where n = $1', [nS]))[0].signal === 1,
      'un joueur qui signale trois fois : un seul signalement, pas masqué');
    s = await signaler(S2, nS);
    check(s.ok === true && s.masque === false && (await lire()).messages.some((m) => m.n === nS), '2e joueur : toujours visible');
    s = await signaler(S3, nS);
    l = await lire();
    check(s.ok === true && s.masque === true && !l.messages.some((m) => m.n === nS) && (await sup('select signal, masque from public.fournil_chat where n = $1', [nS]))[0].signal === 3,
      '3e joueur différent : masqué, il disparaît de la lecture (3 signalements en base)');
    s = await signaler(Le, nS);
    check(s.ok === true && s.masque === true, 'le signaler encore après : ok, toujours masqué');
    for (const j of [S1, S2, S3]) await signaler(j, nSi);
    check((await image(nSi)).data === null && !(await lire()).messages.some((m) => m.n === nSi), 'l’image d’un message masqué ne se lit plus');
    // le propriétaire le rétablit (la requête du commentaire), et le voit dans « les signalés »
    const signales = await comme('proprio', `select c.n, c.pseudo, c.signal, c.masque, (select string_agg(j.pseudo, ', ' order by j.pseudo) from public.fournil_chat_signalements s join public.fournil_joueurs j on j.id = s.joueur where s.n = c.n) as par from public.fournil_chat c where c.signal > 0 order by c.n desc limit 50`);
    check(signales.length === 2 && signales.some((x) => x.n === nS && x.par === 'Lectrice, Sig Deux, Sig Trois, Sig Un'), `« voir les signalés » (requête du propriétaire) : ${signales.map((x) => `${x.n} ${x.pseudo} ${x.signal} par ${x.par}`).join(' ; ')}`);
    await comme('proprio', `delete from public.fournil_chat_signalements where n = ${nS}`); await comme('proprio', `update public.fournil_chat set masque = false, signal = 0 where n = ${nS}`);
    check((await lire()).messages.some((m) => m.n === nS), '« rétablir un message masqué à tort » : il revient');
    await comme('proprio', `delete from public.fournil_chat where n = ${nSi}`);
    check(await nbChat('fournil_chat', 'where n = $1', [nSi]) === 0 && await nbChat('fournil_chat_images', 'where n = $1', [nSi]) === 0 && await nbChat('fournil_chat_signalements', 'where n = $1', [nSi]) === 0, '« supprimer un message » : son image et ses signalements partent avec');

    // effacer le sien
    const masqueDe = async (n) => (await sup('select masque from public.fournil_chat where n = $1', [n]))[0].masque;
    r = await effacer(Le, n3);
    check(r.ok === false && r.erreur === 'pas-a-toi' && await masqueDe(n3) === false && await nbChat('fournil_chat_images', 'where n = $1', [n3]) === 1, 'effacer le message d’un autre : « pas-a-toi », il reste');
    check((await effacer({ id: Ba.id, jeton: Le.jeton }, n3)).erreur === 'jeton', 'avec le jeton d’un autre : « jeton »');
    r = await effacer(Ba, n3);
    check(r.ok === true && await masqueDe(n3) === true && !(await lire({ apres: n3 - 1, limite: 50 })).messages.some((m) => m.n === n3) && await nbChat('fournil_chat_images', 'where n = $1', [n3]) === 0 && (await image(n3)).data === null, 'l’auteur efface le sien : masqué, image effacée');
    check((await effacer(Ba, n3)).ok === true && (await effacer(Ba, 999999)).ok === true, 'l’effacer encore, ou un message parti : ok');

    // bannir (les requêtes du propriétaire)
    await comme('proprio', `insert into public.fournil_chat_bannis (joueur, pseudo, motif) select id, pseudo, 'insultes' from public.fournil_joueurs where pseudo ilike 'bavard' on conflict (joueur) do update set motif = excluded.motif`);
    await comme('proprio', `insert into public.fournil_chat_bannis (joueur, pseudo, motif) select id, pseudo, 'insultes' from public.fournil_joueurs where pseudo ilike 'bavard' on conflict (joueur) do update set motif = excluded.motif`);
    await comme('proprio', `update public.fournil_chat set masque = true where joueur in (select joueur from public.fournil_chat_bannis)`);
    await avancer(60);
    r = await envoyer(Ba, 'je reviens');
    check(r.ok === false && r.erreur === 'banni' && (await signaler(Ba, n4)).erreur === 'banni', 'banni : « banni » à l’envoi et au signalement');
    check(!(await lire()).messages.some((m) => m.pseudo === 'Bavard') && await nbChat('fournil_chat', 'where joueur = $1 and not masque', [Ba.id]) === 0, 'ses messages sont masqués (la requête du propriétaire)');
    await avancer(11); await retirer(Ba);
    const Ba2 = joueur(); await inscrire(Ba2, 'BAVARD');
    r = await envoyer(Ba2, 'nouveau moi');
    check(r.ok === false && r.erreur === 'banni' && await nbChat('fournil_chat_bannis') === 1, 'il quitte le classement et revient sous le même pseudo (autre identifiant) : toujours « banni » (le bannissement survit au départ)');
    await comme('proprio', `delete from public.fournil_chat_bannis where pseudo ilike 'Bavard'`);
    check((await envoyer(Ba2, 'merci')).ok === true, 'le bannissement levé : il réécrit');

    // le ménage : les images de plus de 7 jours (le texte reste), puis au-delà des 2 000 derniers
    await avancer(60);
    r = await envoyer(Le, 'ma boutique', null, IMG); const nV = r.n;
    await sup(`update public.fournil_chat_images set cree = cree - interval '7 days' + interval '2 seconds' where n = $1`, [nV]);
    check((await image(nV)).data === IMG, 'une image de 7 jours moins 2 s : encore là');
    await sup(`update public.fournil_chat_images set cree = cree - interval '3 seconds' where n = $1`, [nV]);
    l = await lire();
    const mv = l.messages.find((m) => m.n === nV);
    check(mv && mv.image === false && mv.texte === 'ma boutique' && (await image(nV)).data === null && await nbChat('fournil_chat_images', 'where n = $1', [nV]) === 1, 'à 7 jours et 1 s : plus d’image à la lecture, même avant le ménage ; le texte reste');
    await avancer(3);
    r = await envoyer(Le, 'ménage');
    check(r.ok === true && await nbChat('fournil_chat_images', 'where n = $1', [nV]) === 0 && await nbChat('fournil_chat', 'where n = $1', [nV]) === 1 && await nbChat('fournil_chat_images', 'where n = $1', [n4]) === 1,
      'l’envoi suivant fait le ménage : l’image vieille de 7 jours est effacée, son message reste ; l’image récente reste');
    await sup(`insert into public.fournil_chat (joueur, pseudo, texte, cree) select $1, 'Lectrice', 'vieux ' || g, now() - interval '2 hours' from generate_series(1, 2100) g`, [Le.id]);
    const avantM = await nbChat(), plusVieux = (await sup('select min(n)::int as n from public.fournil_chat'))[0].n;
    l = await lire();
    check(l.messages.length === 50 && l.messages[49].n === l.dernier && l.messages.every((m, i) => i === 0 || m.n > l.messages[i - 1].n), `${avantM} messages : la lecture en rend les 50 derniers, dans l’ordre`);
    await avancer(3);
    r = await envoyer(S1, 'le 2 000e');
    const apresM = await nbChat(), garde2000 = (await sup('select min(n)::int as mn, max(n)::int as mx from public.fournil_chat'))[0];
    check(r.ok === true && apresM === 2000 && garde2000.mx === r.n && garde2000.mn > plusVieux && await nbChat('fournil_chat', 'where n = $1', [n1]) === 0, `au-delà des 2 000 derniers, effacés à l’envoi (${avantM + 1} → ${apresM}, le plus récent gardé)`);
    check(await nbChat('fournil_chat_images', 'where n not in (select n from public.fournil_chat)') === 0 && await nbChat('fournil_chat_signalements', 'where n not in (select n from public.fournil_chat)') === 0, 'aucune image ni aucun signalement orphelin');

    // quitter le classement emporte ses messages, leurs images et ses signalements
    await avancer(3);
    r = await envoyer(S2, 'avant de partir', null, IMG); const nP = r.n;
    await avancer(3); const nL = (await envoyer(Le, 'à signaler')).n;
    await signaler(S2, nL);
    check(await nbChat('fournil_chat', 'where joueur = $1', [S2.id]) > 0 && await nbChat('fournil_chat_signalements', 'where joueur = $1', [S2.id]) > 0, 'S2 a des messages, une image et un signalement');
    await avancer(11);
    const rt = await retirer(S2);
    check(rt.ok === true && await nbChat('fournil_chat', 'where joueur = $1', [S2.id]) === 0 && await nbChat('fournil_chat_images', 'where n = $1', [nP]) === 0 && await nbChat('fournil_chat_signalements', 'where joueur = $1', [S2.id]) === 0,
      'fournil_retirer : ses messages, son image et ses signalements partent avec lui');

    // recoller la v6 puis le chat : rien ne se perd ; les règles et droits ajoutés à la main sont retirés
    const photoChat = async () => JSON.stringify([await sup('select * from public.fournil_chat order by n'), await sup('select n, length(data) as l, cree from public.fournil_chat_images order by n'), await sup('select * from public.fournil_chat_signalements order by n, joueur'), await sup('select * from public.fournil_chat_bannis order by joueur')]);
    await comme('proprio', `insert into public.fournil_chat_bannis (joueur, pseudo, motif) values ('${joueur().id}', 'Parti', 'test')`);
    const avantC = await photoChat();
    try { await coller(); check(true, 'la v6 se recolle par-dessus le chat'); } catch (err) { check(false, 'la v6 se recolle par-dessus le chat : ' + err.message); }
    await installerHorloge();
    check(await photoChat() === avantC && (await lire()).messages.length === 50, 'les messages, images, signalements et bannis sont intacts, le chat se lit toujours');
    await sup('create policy tout_le_monde on public.fournil_chat for select using (true)');
    await sup('grant select, insert on public.fournil_chat, public.fournil_chat_images to anon');
    await sup('grant usage on sequence public.fournil_chat_n_seq to anon');
    await sup('grant execute on function public.fournil_chat_qui(uuid, text) to anon');
    try { await collerChat(); check(true, 'le chat se recolle encore, avec des messages dedans'); } catch (err) { check(false, 'le chat se recolle : ' + err.message); }
    check(await photoChat() === avantC, 'rien ne se perd au recollage');
    check(await droitsChat(), 'après recollage : les règles et les droits ajoutés à la main sont retirés');

    // l'accès direct refusé
    const essais = [];
    for (const t of TABLES_CHAT) { const c = t === 'fournil_chat_bannis' ? 'joueur' : 'n'; essais.push([`select * from public.${t}`, `lire ${t}`], [`delete from public.${t}`, `effacer dans ${t}`], [`update public.${t} set ${c} = ${c}`, `modifier ${t}`]); }
    essais.push([`insert into public.fournil_chat (joueur, pseudo, texte) values ('${Le.id}', 'Intrus', 'x')`, 'écrire un message sans passer par la fonction'],
      [`insert into public.fournil_chat_bannis (joueur) values ('${Le.id}')`, 'bannir quelqu’un'], [`delete from public.fournil_chat_bannis`, 'lever les bannissements'],
      [`select nextval('public.fournil_chat_n_seq')`, 'avancer la séquence'], [`select public.fournil_chat_qui('${Le.id}', '${Le.jeton}')`, 'appeler fournil_chat_qui'], [`select public.fournil_chat_banni('${Le.id}')`, 'appeler fournil_chat_banni'],
      ['alter table public.fournil_chat disable row level security', 'désactiver la sécurité'], ['create policy tout on public.fournil_chat for select using (true)', 'ajouter une règle']);
    for (const role of ['anon', 'authenticated']) {
      const refuses = []; for (const [q, quoi] of essais) { const e2 = await refus(role, q); if (e2 !== '42501') refuses.push(`${quoi} (${e2})`); }
      check(refuses.length === 0, `${role} ne peut ni lire, ni écrire, ni effacer dans les tables du chat, ni appeler ses fonctions internes (${essais.length} essais)${refuses.length ? ' — en défaut : ' + refuses.join(', ') : ''}`);
    }
    check((await envoyer(S3, 'connecté', null, null, 'authenticated')).ok === true, 'authenticated peut écrire aussi');

    // rien ne fuit
    const toutChat = JSON.stringify(reponses.slice(-400)), joueursChat = [Ba, Ba2, Le, S1, S2, S3, Pi];
    check(!joueursChat.some((j) => toutChat.includes(j.id) || toutChat.includes(j.jeton) || toutChat.includes(sha(j.jeton))) && !/"(joueur|id|jeton)"\s*:/.test(toutChat), 'ni identifiant, ni jeton, ni empreinte dans les réponses du chat');
  }

  titre('les idées et les bugs');
  {
    const RET = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-retours.sql'), 'utf8');
    const collerRet = async () => { await db.exec('set role proprio'); try { return await db.exec(RET); } finally { await db.exec('reset role'); } };
    let controle = null;
    try { await collerRet(); const res = await collerRet(); controle = res[res.length - 1].rows[0]; check(true, 'fournil-retours.sql se colle par-dessus la v6, les cadeaux et le chat, et se recolle sans casse'); } catch (err) { check(false, 'fournil-retours.sql se colle : ' + err.message); }
    check(controle && controle.etat === 'les retours sont prêts' && Number(controle.fonctions_ouvertes) === 9 && Number(controle.tables_fermees) === 4 && Number(controle.admins) === 0,
      `la requête de contrôle, à la fin du script : ${controle && [controle.etat, controle.fonctions_ouvertes, controle.tables_fermees, controle.admins].join(' · ')} (attendu : les retours sont prêts · 9 · 4 · 0)`);
    const TABLES_RET = ['fournil_admins', 'fournil_retours', 'fournil_votes', 'fournil_votes_choix'];
    const nbRet = async (t, ou = '', p) => (await sup(`select count(*)::int as c from public.${t} ${ou}`, p))[0].c;
    Object.assign(CAST, { p_infos: '::jsonb', p_options: '::jsonb' });
    // les appels, comme PostgREST les fait (paramètres nommés)
    const qui = (j) => ({ p_id: j.id, p_jeton: j.jeton });
    const envoyer = (j, type, texte, image = null, infos = null, role = 'anon') => appelle('fournil_retour_envoyer', { ...qui(j), p_type: type, p_texte: texte, p_image: image, p_infos: infos }, role);
    const ouverts = (j) => appelle('fournil_votes_ouverts', j ? qui(j) : {});
    const voter = (j, n, option) => appelle('fournil_voter', { ...qui(j), p_n: n, p_option: option });
    const adminMoi = (j) => appelle('fournil_admin_moi', qui(j));
    const adminRetours = (j, filtre, avant) => appelle('fournil_admin_retours', { ...qui(j), p_filtre: filtre, ...(avant === undefined ? {} : { p_avant: avant }) });
    const adminImage = (j, n) => appelle('fournil_admin_retour_image', { ...qui(j), p_n: n });
    const adminEtat = (j, n, etat, note) => appelle('fournil_admin_retour_etat', { ...qui(j), p_n: n, p_etat: etat, ...(note === undefined ? {} : { p_note: note }) });
    const creer = (j, question, options, heures) => appelle('fournil_admin_vote_creer', { ...qui(j), p_question: question, p_options: options, p_heures: heures });
    const fermer = (j, n) => appelle('fournil_admin_vote_fermer', { ...qui(j), p_n: n });
    const inscrire = async (j, pseudo) => { await avancer(1); const a = await publierP(j, pseudo, 1e6, 10); await avancer(11); const b = await publierP(j, pseudo, 1e6 + 10, 10); return a.ok === true && b.ok === true; };
    const IMG = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'; // une image WebP d'un pixel

    // la structure et les droits
    const colsDe = async (t) => (await sup(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t])).map((c) => c.c).join();
    const cr = {}; for (const t of TABLES_RET) cr[t] = await colsDe(t);
    check(cr.fournil_admins === 'joueur,pseudo,cree' && cr.fournil_retours === 'n,joueur,pseudo,type,texte,image,infos,cree,etat,note,maj' && cr.fournil_votes === 'n,question,options,debut,fin,cree_par,ferme' && cr.fournil_votes_choix === 'n,joueur,option,quand',
      `les tables du contrat : ${Object.entries(cr).map(([t, c]) => `${t.replace('fournil_', '')} (${c})`).join(', ')}`);
    const fkr = await sup(`select conrelid::regclass::text as t, confrelid::regclass::text as vers, confdeltype as d from pg_constraint where contype = 'f' and conrelid::regclass::text in ('fournil_admins', 'fournil_retours', 'fournil_votes', 'fournil_votes_choix') order by 1, 2`);
    check(fkr.map((x) => `${x.t}>${x.vers}:${x.d}`).join() === 'fournil_admins>fournil_joueurs:c,fournil_retours>fournil_joueurs:c,fournil_votes>fournil_joueurs:n,fournil_votes_choix>fournil_joueurs:c,fournil_votes_choix>fournil_votes:c',
      `clés étrangères : la place d’admin, les retours et les choix partent avec leur joueur (cascade), un vote garde sa question quand son auteur part (set null), les choix partent avec leur vote (${fkr.map((x) => `${x.t.replace('fournil_', '')}→${x.vers.replace('fournil_', '')} ${x.d}`).join(', ')})`);
    const droitsRet = async () => {
      let tout = true;
      for (const t of TABLES_RET) {
        const rls = (await sup(`select relrowsecurity as r from pg_class where oid = $1::regclass`, ['public.' + t]))[0];
        const pol = (await sup(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = $1`, [t]))[0].n;
        const droits = await sup(`select r.rolname as role, p.priv from (values ('anon'), ('authenticated'), ('public')) r(rolname), unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) where has_table_privilege(r.rolname, $1, p.priv)`, ['public.' + t]);
        tout = check(rls && rls.r === true && pol === 0 && droits.length === 0, `${t} : sécurité ligne par ligne sans aucune règle, aucun droit pour anon, authenticated ni PUBLIC${droits.length ? ' : ' + droits.map((d) => d.role + ' ' + d.priv).join(', ') : ''}`) && tout;
      }
      for (const s of ['fournil_retours_n_seq', 'fournil_votes_n_seq']) {
        const seq = await sup(`select r.rolname as role from (values ('anon'), ('authenticated'), ('public')) r(rolname) where has_sequence_privilege(r.rolname, $1, 'usage') or has_sequence_privilege(r.rolname, $1, 'select') or has_sequence_privilege(r.rolname, $1, 'update')`, ['public.' + s]);
        tout = check(seq.length === 0, `la séquence ${s} : aucun droit pour anon, authenticated ni PUBLIC${seq.length ? ' : ' + seq.map((x) => x.role).join(', ') : ''}`) && tout;
      }
      const fns = await sup(`select p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer, array_to_string(p.proconfig, ',') as conf,
          has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
          p.proacl is null as acl_defaut, exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pour_public, pg_get_userbyid(p.proowner) as proprio
        from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname ~ '^fournil_(retour|vote|admin)' or p.proname = 'fournil_notif_permise') order by 1`);
      const sig = Object.fromEntries(fns.map((f) => [f.nom, f.args]));
      tout = check(fns.length === 15 && sig.fournil_retour_envoyer === 'p_id uuid, p_jeton text, p_type text, p_texte text, p_image text, p_infos jsonb' && sig.fournil_votes_ouverts === 'p_id uuid, p_jeton text'
        && sig.fournil_voter === 'p_id uuid, p_jeton text, p_n bigint, p_option integer' && sig.fournil_admin_moi === 'p_id uuid, p_jeton text'
        && sig.fournil_admin_retours === 'p_id uuid, p_jeton text, p_filtre text, p_avant bigint' && sig.fournil_admin_retour_image === 'p_id uuid, p_jeton text, p_n bigint'
        && sig.fournil_admin_retour_etat === 'p_id uuid, p_jeton text, p_n bigint, p_etat text, p_note text' && sig.fournil_admin_vote_creer === 'p_id uuid, p_jeton text, p_question text, p_options jsonb, p_heures integer'
        && sig.fournil_admin_vote_fermer === 'p_id uuid, p_jeton text, p_n bigint' && sig.fournil_notif_permise === 'p_joueur uuid, p_type text',
        `les fonctions des retours et des votes, une seule signature chacune (${fns.map((f) => `${f.nom.replace('fournil_', '')}(${f.args})`).join(' ; ')})`) && tout;
      const ouvertes = fns.filter((f) => f.anon).map((f) => f.nom);
      tout = check(JSON.stringify(ouvertes) === JSON.stringify(RETOURS_JEU) && fns.every((f) => f.anon === f.auth), `anon (et authenticated) n’appellent que les neuf du contrat (${ouvertes.map((n) => n.replace('fournil_', '')).join(', ')}) ; les fonctions internes sont fermées`) && tout;
      tout = check(fns.every((f) => (f.definer || f.nom === 'fournil_retours_ligne' || f.nom === 'fournil_notif_permise') && /search_path=(""|'')/.test(f.conf) && !f.acl_defaut && !f.pour_public && f.proprio === 'proprio'), 'chacune : SECURITY DEFINER (sauf deux petites fonctions internes sans table à lire pour elles-mêmes), search_path fixé, droits explicites (rien pour PUBLIC), au propriétaire des tables') && tout;
      return tout;
    };
    await droitsRet();
    const typesFile = (await sup(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'fournil_notifs_type_check'`))[0];
    check(typesFile && /'retour'/.test(typesFile.d) && /'vote'/.test(typesFile.d) && /'pleine'/.test(typesFile.d) && /'essai'/.test(typesFile.d), `la file des notifications accepte les deux nouveaux types, et garde les anciens (${typesFile && typesFile.d})`);

    // des joueurs du classement : l'admin (le propriétaire), des joueurs, des abonnés
    await heure('2028-03-08T10:00:00Z'); // un mercredi, 11 h à Paris
    const [Ad, Jo, Pa, Ab, Nb, Ci] = [joueur(), joueur(), joueur(), joueur(), joueur(), joueur()];
    let ins = true; for (const [j, p] of [[Ad, 'lebigt69'], [Jo, 'Joueuse'], [Pa, 'Passant'], [Ab, 'Abonnée'], [Nb, 'Sans Événements'], [Ci, 'ci-banc01']]) ins = (await inscrire(j, p)) && ins;
    check(ins, 'six joueurs inscrits au classement (dont le propriétaire, lebigt69, et un joueur de test « ci-… »)');
    let r = await adminMoi(Ad);
    check(r.ok === true && r.admin === false, `avant la ligne « me rendre admin » : fournil_admin_moi répond faux (${JSON.stringify(r)})`);
    const ligneAdmin = /insert into public\.fournil_admins [^\n]*/.exec(RET);
    check(ligneAdmin && /pseudo ilike 'lebigt69'/.test(ligneAdmin[0]), `la ligne « me rendre admin » du script vise le pseudo lebigt69 (${ligneAdmin && ligneAdmin[0]})`);
    await comme('proprio', ligneAdmin[0]); await comme('proprio', ligneAdmin[0]);
    r = await adminMoi(Ad);
    check(r.ok === true && r.admin === true && await nbRet('fournil_admins') === 1, 'la ligne collée (deux fois : sans casse) : il est admin');
    check((await adminMoi(Jo)).admin === false && (await adminMoi({ id: Ad.id, jeton: Jo.jeton })).erreur === 'jeton' && (await adminMoi(joueur())).erreur === 'inconnu' && (await adminMoi({ id: Ad.id, jeton: 'court' })).admin === false,
      'un joueur ordinaire : faux ; le jeton d’un autre : « jeton » ; sans pseudo : « inconnu » (admin faux, toujours)');
    for (const [j, nom] of [[Ad, 'ad'], [Ab, 'ab'], [Jo, 'jo']]) await abonner(j, SUB('ret-' + nom));
    await abonner(Nb, SUB('ret-nb'), { evenements: false });

    // envoyer : les erreurs
    const nRet = () => nbRet('fournil_retours');
    r = await envoyer({ id: Jo.id, jeton: 'court' }, 'idee', 'une idée');
    const rj2 = await envoyer({ id: Jo.id, jeton: Pa.jeton }, 'idee', 'une idée'), rj3 = await envoyer({ id: null, jeton: Jo.jeton }, 'idee', 'une idée');
    check(r.ok === false && r.erreur === 'jeton' && r.n === null && rj2.erreur === 'jeton' && rj3.erreur === 'jeton', 'jeton mal formé, jeton d’un autre, identifiant absent : « jeton »');
    check((await envoyer(joueur(), 'idee', 'une idée')).erreur === 'inconnu', 'un téléphone sans pseudo : « inconnu »');
    let vides = []; for (const t of ['   ', null, '', '\u0007‮ \n\t\r\n']) vides.push((await envoyer(Jo, 'bug', t, IMG)).erreur);
    check(vides.every((x) => x === 'vide'), `des espaces, rien, une chaîne vide, des caractères de contrôle seuls (même avec une capture) : « vide » (${vides.join(', ')})`);
    check((await envoyer(Jo, 'idee', 'x'.repeat(1001))).erreur === 'long' && (await envoyer(Jo, 'idee', 'x'.repeat(100000))).erreur === 'long', '1 001 caractères, 100 000 caractères : « long »');
    let imgs = []; for (const im of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'data:text/html;base64,PGI+', 'javascript:alert(1)', 'https://exemple.fr/a.png', 'data:image/png;base64,abc"onerror=x', 'data:image/jpeg;base64,' + 'A'.repeat(480001 - 23), 'DATA:IMAGE/PNG;BASE64,AAAA'])
      imgs.push((await envoyer(Jo, 'bug', 'regarde', im)).erreur);
    check(imgs.every((x) => x === 'image'), `des captures refusées (SVG, GIF, HTML, javascript:, une adresse, des guillemets, 480 001 caractères, en majuscules) : « image » (${imgs.join(', ')})`);
    let types = []; for (const t of ['autre', null, 'IDEE', 'idée', '']) types.push((await envoyer(Jo, t, 'une idée')).erreur);
    check(types.every((x) => x === 'type'), `un type qui n’est ni « idee » ni « bug » : « type » (${types.join(', ')})`);
    // banni du chat : refusé ; sans la table du chat (le chat pas installé), la vérification est sautée
    await comme('proprio', `insert into public.fournil_chat_bannis (joueur, pseudo, motif) select id, pseudo, 'test' from public.fournil_joueurs where pseudo ilike 'passant'`);
    check((await envoyer(Pa, 'idee', 'je reviens')).erreur === 'banni', 'banni du chat : « banni »');
    await comme('proprio', `update public.fournil_chat_bannis set joueur = '${joueur().id}' where pseudo ilike 'passant'`);
    check((await envoyer(Pa, 'idee', 'je reviens')).erreur === 'banni', 'banni par son pseudo seulement (il a quitté le classement et il est revenu) : « banni »');
    check(await nRet() === 0, 'aucun de ces envois n’a rien écrit');
    await sup('alter table public.fournil_chat_bannis rename to fournil_chat_bannis_cache');
    r = await envoyer(Pa, 'idee', 'sans chat');
    await sup('alter table public.fournil_chat_bannis_cache rename to fournil_chat_bannis');
    check(r.ok === true && Number.isInteger(r.n), `sans la table des bannis (le chat pas collé) : la vérification est sautée, le retour passe (n ${r.n})`);
    let f = await file(Ad.id);
    check(f.length === 1 && f[0].type === 'retour' && f[0].texte === 'Nouvelle idée de Passant' && f[0].titre === 'Le Fournil' && f[0].envoyee === null, `l’admin abonné est prévenu : ${JSON.stringify(f.map((x) => [x.type, x.texte]))}`);
    await comme('proprio', `delete from public.fournil_chat_bannis where pseudo ilike 'passant'`);

    // envoyer : accepté
    const INFOS = { version: '2028.03.1', appareil: 'iPhone Safari', ecran: '390x844', quartier: 'gare', journal: ['vente 12 €', 'four 3', 'ouvert'] };
    r = await envoyer(Jo, 'idee', '  Bonjour\r\n\r\n\r\n\r\nla  suite‮\t!  \n ', null, INFOS);
    const n1 = r.n, t1 = horloge;
    check(r.ok === true && r.erreur === null && Number.isInteger(n1) && Object.keys(r).sort().join() === 'erreur,n,ok', `une idée acceptée (n ${n1}) : ${JSON.stringify(r)}`);
    const l1 = (await sup('select pseudo, type, texte, image, infos, etat, note, cree from public.fournil_retours where n = $1', [n1]))[0];
    check(l1.texte === 'Bonjour\n\nla suite !' && l1.pseudo === 'Joueuse' && l1.type === 'idee' && l1.image === null && canon(l1.infos) === canon(INFOS) && l1.etat === 'nouveau' && l1.note === '' && l1.cree.getTime() === t1,
      `en base : le texte nettoyé (retours à la ligne gardés, au plus une ligne vide, tabulation en espace, inversion du sens retirée, espaces réduits, bords ôtés : ${JSON.stringify(l1.texte)}), les infos telles quelles, « nouveau »`);
    f = await file(Ad.id);
    check(f.length === 2 && f[1].type === 'retour' && f[1].texte === 'Nouvelle idée de Joueuse', `une idée : « ${f[1] && f[1].texte} »`);
    check((await file(Ab.id)).length === 0 && (await file(Jo.id)).length === 0, 'les autres joueurs abonnés (et l’auteur) ne le sont pas : les retours sont privés');
    // 30 s
    await avancer(1);
    check((await envoyer(Jo, 'bug', 'encore')).erreur === 'trop-vite', '1 s après : « trop-vite »');
    await avancer(28.9);
    check((await envoyer(Jo, 'bug', 'encore')).erreur === 'trop-vite', '29,9 s après : « trop-vite »');
    await avancer(0.1);
    const grande = 'data:image/jpeg;base64,' + 'A'.repeat(480000 - 23);
    r = await envoyer(Jo, 'bug', 'x'.repeat(1000), grande, ['pas', 'un', 'objet']); const n2 = r.n;
    check(r.ok === true && n2 > n1, '30 s après : accepté (un bug de 1 000 caractères tout juste, une capture JPEG de 480 000 caractères tout juste)');
    check((await sup('select infos from public.fournil_retours where n = $1', [n2]))[0].infos === null, 'des infos qui ne sont pas un objet : ignorées, le retour part quand même');
    f = await file(Ad.id);
    check(f.length === 3 && f[2].type === 'retour' && f[2].texte === 'Bug signalé par Joueuse', `un bug : « ${f[2] && f[2].texte} »`);
    // la file : la fonction d'envoi reçoit les notifications 'retour' (fournil_notif_permise les connaît)
    const d = await dues();
    const dRet = d.filter((x) => x.type === 'retour');
    check(dRet.length === 3 && d.length === 3 && dRet.every((x) => x.subs.length === 1 && x.subs[0].endpoint === EP('ret-ad')), `fournil_notifs_dues rend les 3 notifications 'retour', avec l’appareil de l’admin seulement (${JSON.stringify(dRet.map((x) => x.texte))})`);
    await faites(d.map((x) => x.notif_id), []);
    await avancer(30);
    r = await envoyer(Jo, 'idee', `Robert'); delete from public.fournil_retours; --`, IMG, { journal: 'z'.repeat(3000) }); const n3 = r.n;
    check(r.ok === true && await nRet() === 4 && canon((await sup('select infos from public.fournil_retours where n = $1', [n3]))[0].infos) === '{"trop_long":true}',
      'une capture WebP, une injection dans le texte (simple texte, rien d’effacé), des infos de plus de 2 Ko (remplacées par { trop_long: true })');
    // le quota : 5 par jour, heure de Paris (minuit à Paris : 23 h UTC en hiver)
    await avancer(30); r = await envoyer(Jo, 'idee', 'quatrième');
    await avancer(30); const r5 = await envoyer(Jo, 'idee', 'cinquième');
    await avancer(30); const r6 = await envoyer(Jo, 'idee', 'sixième');
    check(r.ok === true && r5.ok === true && r6.ok === false && r6.erreur === 'quota', `5 retours dans la journée acceptés, le 6e : « ${r6.erreur} »`);
    await heure('2028-03-08T22:59:50Z');
    check((await envoyer(Jo, 'idee', 'à 23 h 59 à Paris')).erreur === 'quota', '23 h 59 à Paris (22 h 59 UTC) : toujours « quota »');
    await heure('2028-03-08T23:00:05Z');
    r = await envoyer(Jo, 'idee', 'minuit passé à Paris');
    check(r.ok === true, 'minuit passé à Paris (mais pas encore à Greenwich) : la journée est neuve, accepté');
    // ni l'admin pour lui-même, ni les joueurs de test du workflow ne réveillent l'admin
    const avantF = (await file(Ad.id)).length;
    r = await envoyer(Ad, 'idee', 'une idée de moi');
    const rc = await envoyer(Ci, 'bug', 'essai automatique');
    check(r.ok === true && rc.ok === true && avantF === 7 && (await file(Ad.id)).length === avantF, 'les retours de l’admin lui-même et d’un joueur de test « ci-… » : enregistrés, sans notification');

    // un non-admin refusé partout
    let refusAdmin = [];
    for (const [nom, args] of [['fournil_admin_retours', { p_filtre: 'tout' }], ['fournil_admin_retour_image', { p_n: n3 }], ['fournil_admin_retour_etat', { p_n: n1, p_etat: 'fait', p_note: 'non' }],
      ['fournil_admin_vote_creer', { p_question: 'Pirate ?', p_options: ['oui', 'non'], p_heures: 1 }], ['fournil_admin_vote_fermer', { p_n: 1 }]]) {
      const a = await appelle(nom, { ...qui(Jo), ...args }), b = await appelle(nom, { p_id: Ad.id, p_jeton: Jo.jeton, ...args }), c = await appelle(nom, { ...qui(joueur()), ...args });
      refusAdmin.push(`${nom.replace('fournil_admin_', '')} ${a.erreur}/${b.erreur}/${c.erreur}`);
      check(a.ok === false && a.erreur === 'pas-admin' && b.erreur === 'jeton' && c.erreur === 'inconnu' && !('retours' in a && a.retours.length) && !(a.data), `${nom} : « pas-admin » pour un joueur ordinaire, « jeton » avec le jeton d’un autre, « inconnu » sans pseudo`);
    }
    check((await sup('select etat, note from public.fournil_retours where n = $1', [n1]))[0].etat === 'nouveau' && await nbRet('fournil_votes') === 0, 'rien n’a bougé : le retour est toujours « nouveau », aucun vote créé');

    // l'admin lit les retours
    let a = await adminRetours(Ad, 'nouveau');
    check(a.ok === true && a.erreur === null && a.retours.length === 9 && a.nouveaux === 9 && a.retours.every((x, i) => i === 0 || x.n < a.retours[i - 1].n),
      `fournil_admin_retours (nouveaux) : les 9 retours, du plus récent au plus ancien, nouveaux = ${a.nouveaux}`);
    const x1 = a.retours.find((x) => x.n === n1), x2 = a.retours.find((x) => x.n === n2), x3 = a.retours.find((x) => x.n === n3);
    check(x1 && Object.keys(x1).sort().join() === 'a_image,cree,etat,infos,n,note,pseudo,texte,type' && Object.keys(a).sort().join() === 'erreur,nouveaux,ok,retours', `les champs du contrat, ni plus ni moins (${x1 && Object.keys(x1).join(', ')} ; ${Object.keys(a).join(', ')})`);
    check(x1.texte === 'Bonjour\n\nla suite !' && x1.pseudo === 'Joueuse' && x1.type === 'idee' && x1.a_image === false && canon(x1.infos) === canon(INFOS) && x1.cree === t1 && x1.etat === 'nouveau' && x1.note === ''
      && x2.a_image === true && x2.type === 'bug' && x3.a_image === true && x3.texte === `Robert'); delete from public.fournil_retours; --`, 'chaque retour : texte, pseudo, type, capture ou non, infos, heure en ms, état, note');
    check((await adminImage(Ad, n3)).data === IMG && (await adminImage(Ad, n2)).data === grande && (await adminImage(Ad, n1)).data === null && (await adminImage(Ad, 999999)).data === null && (await adminImage(Ad, null)).ok === true,
      'fournil_admin_retour_image : les captures telles qu’envoyées ; sans capture, numéro inconnu, rien : data null');
    // les états
    check((await adminEtat(Ad, n1, 'fini')).erreur === 'etat' && (await adminEtat(Ad, n1, null)).erreur === 'etat' && (await adminEtat(Ad, 999999, 'vu')).erreur === 'absent' && (await adminEtat(Ad, n1, 'fait', 'n'.repeat(301))).erreur === 'long',
      'un état inconnu ou absent : « etat » ; un retour qui n’existe pas : « absent » ; une note de 301 caractères : « long »');
    r = await adminEtat(Ad, n1, 'fait', '  Dans la\nprochaine   version ');
    a = await adminRetours(Ad, 'nouveau');
    const t1b = await adminRetours(Ad, 'tout');
    const y1 = t1b.retours.find((x) => x.n === n1);
    check(r.ok === true && !a.retours.some((x) => x.n === n1) && a.nouveaux === 8 && y1 && y1.etat === 'fait' && y1.note === 'Dans la prochaine version' && t1b.retours.length === 9,
      `« fait », avec une note (nettoyée : ${JSON.stringify(y1 && y1.note)}) : il quitte les nouveaux (8), « tout » le montre`);
    await adminEtat(Ad, n1, 'vu');
    check((await sup('select etat, note from public.fournil_retours where n = $1', [n1]))[0].note === 'Dans la prochaine version', 'un autre état sans note : la note reste');
    await adminEtat(Ad, n1, 'refuse', '');
    check(JSON.stringify(await sup('select etat, note from public.fournil_retours where n = $1', [n1])) === '[{"etat":"refuse","note":""}]', '« refuse » avec une note vide : la note est effacée');
    // 30 par page
    await sup(`insert into public.fournil_retours (joueur, pseudo, type, texte, cree) select $1, 'Passant', 'idee', 'idée ' || g, now() - interval '1 day' from generate_series(1, 35) g`, [Pa.id]);
    const p1 = await adminRetours(Ad, 'tout');
    const p2 = await adminRetours(Ad, 'tout', p1.retours[29].n);
    const ns = [...p1.retours, ...p2.retours].map((x) => x.n);
    check(p1.retours.length === 30 && p2.retours.length === 14 && new Set(ns).size === 44 && ns.every((n, i) => i === 0 || n < ns[i - 1]) && p1.nouveaux === 43,
      `30 par page : la page suivante commence après le dernier numéro (p_avant), sans doublon (${p1.retours.length} + ${p2.retours.length}, nouveaux = ${p1.nouveaux})`);
    check((await adminRetours(Ad, 'nouveau', ns[ns.length - 1])).retours.length === 0 && (await adminRetours(Ad, null)).retours.every((x) => x.etat === 'nouveau'), 'après le plus ancien : rien ; sans filtre : les nouveaux');

    // les votes : créer (l'admin)
    await avancer(60);
    let vc = [];
    for (const [q, o, h, quoi] of [['', ['a', 'b'], 1, 'question'], ['  \n ', ['a', 'b'], 1, 'question'], ['q'.repeat(201), ['a', 'b'], 1, 'question'], [null, ['a', 'b'], 1, 'question'],
      ['Q ?', ['a'], 1, 'options'], ['Q ?', ['a', 'b', 'c', 'd', 'e'], 1, 'options'], ['Q ?', { a: 1 }, 1, 'options'], ['Q ?', ['a', 2], 1, 'options'], ['Q ?', ['a', ' '], 1, 'options'], ['Q ?', ['a', 'o'.repeat(61)], 1, 'options'], ['Q ?', ['Oui', ' oui '], 1, 'options'], ['Q ?', null, 1, 'options'],
      ['Q ?', ['a', 'b'], 0, 'duree'], ['Q ?', ['a', 'b'], 169, 'duree'], ['Q ?', ['a', 'b'], null, 'duree']]) {
      const x = await creer(Ad, q, o, h); vc.push(x.erreur); if (x.erreur !== quoi) check(false, `créer ${JSON.stringify([q, o, h])} : attendu « ${quoi} », reçu ${JSON.stringify(x)}`);
    }
    check(vc.join() === 'question,question,question,question,options,options,options,options,options,options,options,options,duree,duree,duree' && await nbRet('fournil_votes') === 0,
      `les erreurs de la création : question vide, blanche, de 201 caractères, absente ; 1 option, 5 options, pas un tableau, une option qui n’est pas un texte, vide, de 61 caractères, deux fois la même ; 0 h, 169 h, sans durée`);
    const tV1 = horloge;
    r = await creer(Ad, '  Quel  prochain\névénement ? ', [' Noël ', 'Pâques', 'Carnaval'], 48); const v1 = r.n;
    check(r.ok === true && Number.isInteger(v1) && Object.keys(r).sort().join() === 'erreur,n,ok', `un vote créé pour 48 h (n ${v1})`);
    // les notifications 'vote' : les abonnés qui veulent les événements
    const fv = async (j) => (await file(j.id)).filter((x) => x.type === 'vote').map((x) => x.texte);
    check(JSON.stringify(await fv(Ab)) === '["Nouveau vote : Quel prochain événement ?"]' && (await fv(Ad)).length === 1 && (await fv(Jo)).length === 1 && (await fv(Nb)).length === 0 && (await fv(Pa)).length === 0,
      `les abonnés qui veulent les événements sont prévenus (« ${(await fv(Ab))[0]} ») ; pas celui qui a décoché les événements, ni les joueurs sans appareil`);
    const dv = (await dues()).filter((x) => x.type === 'vote');
    check(dv.length === 3 && dv.every((x) => x.subs.length === 1), `fournil_notifs_dues rend les 3 notifications 'vote' (fournil_notif_permise les connaît)`);
    await faites(dv.map((x) => x.notif_id), []);
    // lire les votes
    let o = await ouverts();
    const vo = o.votes[0];
    check(o.ok === true && o.votes.length === 1 && o.finis.length === 0 && Object.keys(o).sort().join() === 'erreur,finis,ok,votes' && Object.keys(vo).sort().join() === 'fin,moi,n,options,question,total,voix',
      `fournil_votes_ouverts sans pseudo : un vote, aucun fini ; les champs du contrat (${Object.keys(vo).join(', ')})`);
    check(vo.n === v1 && vo.question === 'Quel prochain événement ?' && JSON.stringify(vo.options) === '["Noël","Pâques","Carnaval"]' && vo.fin === tV1 + 48 * 3600e3 && JSON.stringify(vo.voix) === '[0,0,0]' && vo.total === 0 && vo.moi === null,
      `la question et les options nettoyées, la fin en ms (48 h), aucune voix (${JSON.stringify(vo)})`);
    // voter
    check((await voter({ id: Jo.id, jeton: Pa.jeton }, v1, 0)).erreur === 'jeton' && (await voter(joueur(), v1, 0)).erreur === 'inconnu' && (await voter(Jo, 999999, 0)).erreur === 'absent',
      'voter : le jeton d’un autre, « jeton » ; sans pseudo, « inconnu » ; un vote qui n’existe pas, « absent »');
    let vos = []; for (const op of [3, -1, null, 99]) vos.push(await voter(Jo, v1, op));
    check(vos.every((x) => x.ok === false && x.erreur === 'option' && JSON.stringify(x.voix) === '[0,0,0]' && x.total === 0), `une option hors du vote (3, -1, rien, 99) : « option », avec les voix (${vos.map((x) => x.erreur).join(', ')})`);
    r = await voter(Jo, v1, 1);
    check(r.ok === true && r.erreur === null && JSON.stringify(r.voix) === '[0,1,0]' && r.total === 1 && Object.keys(r).sort().join() === 'erreur,ok,total,voix', `Joueuse vote « Pâques » : ${JSON.stringify(r)}`);
    check((await ouverts(Jo)).votes[0].moi === 1 && (await ouverts()).votes[0].moi === null && (await ouverts(Pa)).votes[0].moi === null && (await ouverts({ id: Jo.id, jeton: Pa.jeton })).votes[0].moi === null && (await ouverts({ id: Jo.id, jeton: 'court' })).ok === true,
      'relu avec son jeton : moi = 1 ; sans pseudo, par un autre, avec un mauvais jeton : moi null (la lecture marche quand même)');
    r = await voter(Jo, v1, 2);
    check(r.ok === true && JSON.stringify(r.voix) === '[0,0,1]' && r.total === 1 && (await ouverts(Jo)).votes[0].moi === 2, 'elle change son vote (« Carnaval ») : toujours une seule voix');
    await voter(Pa, v1, 2); r = await voter(Ad, v1, 0);
    check(JSON.stringify(r.voix) === '[1,0,2]' && r.total === 3, `trois joueurs : ${JSON.stringify(r.voix)}`);
    r = await appelle('fournil_voter', { ...qui(Ci), p_n: v1, p_option: 1 }, 'authenticated');
    check(r.ok === true && r.total === 4, 'authenticated vote aussi');
    // fini
    await heure(tV1 + 48 * 3600e3 - 1000);
    check((await voter(Jo, v1, 0)).ok === true, '1 s avant la fin : on vote encore (elle change d’avis)');
    await heure(tV1 + 48 * 3600e3);
    r = await voter(Jo, v1, 1);
    o = await ouverts(Jo);
    check(r.ok === false && r.erreur === 'fini' && JSON.stringify(r.voix) === '[2,1,1]' && o.votes.length === 0 && o.finis.length === 1 && o.finis[0].n === v1 && o.finis[0].moi === 0 && JSON.stringify(o.finis[0].voix) === '[2,1,1]',
      `à la fin : « fini » (avec les voix ${JSON.stringify(r.voix)}), le vote passe dans « finis », son choix reste`);
    // fermé par l'admin
    await avancer(60);
    const v2 = (await creer(Ad, 'Deuxième ?', ['oui', 'non'], 1)).n;
    await voter(Jo, v2, 0);
    check((await fermer(Ad, 999999)).erreur === 'absent', 'fermer un vote qui n’existe pas : « absent »');
    r = await fermer(Ad, v2);
    o = await ouverts();
    check(r.ok === true && (await voter(Jo, v2, 1)).erreur === 'fini' && o.votes.length === 0 && o.finis.map((x) => x.n).join() === [v2, v1].join() && o.finis[0].fin === horloge,
      'fermé par l’admin : « fini » aussitôt, il passe en tête des finis (fin = l’heure de la fermeture)');
    check((await fermer(Ad, v2)).ok === true && (await fermer(Ad, v1)).ok === true && (await ouverts()).finis[1].fin === tV1 + 48 * 3600e3, 'le refermer, ou fermer un vote déjà fini : ok, sa fin ne bouge pas');
    // les 5 derniers finis, depuis 7 jours
    for (let k = 0; k < 6; k++) { await avancer(60); const n = (await creer(Ad, 'Vite ' + k, ['a', 'b'], 1)).n; await fermer(Ad, n); }
    o = await ouverts();
    check(o.finis.length === 5 && o.finis.every((x) => /^Vite /.test(x.question)) && o.finis[0].question === 'Vite 5', `les 5 derniers finis seulement, le plus récent d’abord (${o.finis.map((x) => x.question).join(', ')})`);
    await sup(`delete from public.fournil_votes where question like 'Vite %'`);
    await heure(tV1 + 48 * 3600e3 + 7 * 86400e3 - 1000);
    check((await ouverts()).finis.some((x) => x.n === v1), '7 jours moins 1 s après sa fin : encore dans les finis');
    await heure(tV1 + 48 * 3600e3 + 7 * 86400e3 + 1000);
    check(!(await ouverts()).finis.some((x) => x.n === v1), '7 jours après sa fin : il n’est plus montré');
    // plusieurs votes ouverts, le plus récent d'abord
    const v3 = (await creer(Ad, 'Trois ?', ['a', 'b'], 24)).n, v4 = (await creer(Ad, 'Quatre ?', ['a', 'b', 'c', 'd'], 168)).n;
    o = await ouverts();
    check(o.votes.map((x) => x.n).join() === [v4, v3].join() && JSON.stringify(o.votes[0].voix) === '[0,0,0,0]', 'deux votes ouverts : le plus récent d’abord ; quatre options, quatre compteurs');

    // le ménage : les captures de 30 jours, les choix des votes finis depuis 60 jours
    await sup(`update public.fournil_retours set cree = $2::timestamptz - interval '30 days' + interval '2 seconds' where n = $1`, [n3, new Date(horloge).toISOString()]);
    const aImg = async (n) => { let avant; const tout = []; for (;;) { const p = await adminRetours(Ad, 'tout', avant); tout.push(...p.retours); if (p.retours.length < 30) break; avant = p.retours[29].n; } return tout.find((x) => x.n === n); };
    check((await aImg(n3)).a_image === true && (await adminImage(Ad, n3)).data === IMG, 'une capture de 30 jours moins 2 s : encore là');
    await sup(`update public.fournil_retours set cree = cree - interval '3 seconds' where n = $1`, [n3]);
    check((await aImg(n3)).a_image === false && (await adminImage(Ad, n3)).data === null && (await sup('select image is not null as i from public.fournil_retours where n = $1', [n3]))[0].i === true,
      'à 30 jours et 1 s : plus de capture à la lecture, même avant le ménage');
    await sup(`update public.fournil_votes set fin = $2::timestamptz - interval '60 days' - interval '1 second' where n = $1`, [v1, new Date(horloge).toISOString()]);
    await sup(`update public.fournil_votes set fin = $2::timestamptz - interval '59 days' where n = $1`, [v2, new Date(horloge).toISOString()]);
    check(await nbRet('fournil_votes_choix', 'where n = $1', [v1]) === 4 && await nbRet('fournil_votes_choix', 'where n = $1', [v2]) === 1, 'avant le ménage : les choix des deux votes finis sont là');
    r = await voter(Jo, v3, 1);
    check(r.ok === true && await nbRet('fournil_votes_choix', 'where n = $1', [v1]) === 0 && await nbRet('fournil_votes_choix', 'where n = $1', [v2]) === 1 && await nbRet('fournil_votes', 'where n = $1', [v1]) === 1,
      'un vote fait le ménage : les choix du vote fini depuis plus de 60 jours sont effacés (la question reste) ; ceux du vote fini depuis 59 jours restent');
    await avancer(31);
    r = await envoyer(Pa, 'bug', 'ménage');
    const m3 = (await sup('select image, texte from public.fournil_retours where n = $1', [n3]))[0];
    check(r.ok === true && m3.image === null && m3.texte.startsWith('Robert') && (await sup('select image is not null as i from public.fournil_retours where n = $1', [n2]))[0].i === true,
      'un retour fait le ménage : la capture de plus de 30 jours est effacée, son texte reste ; une capture de 9 jours reste');

    // recoller la v6 puis les retours : rien ne se perd ; les règles et droits ajoutés à la main sont retirés
    const photoRet = async () => JSON.stringify([await sup('select * from public.fournil_admins order by joueur'), await sup('select n, joueur, pseudo, type, texte, length(image) as l, infos, cree, etat, note, maj from public.fournil_retours order by n'), await sup('select * from public.fournil_votes order by n'), await sup('select * from public.fournil_votes_choix order by n, joueur')]);
    const avantR = await photoRet();
    try { await coller(); check(true, 'la v6 se recolle par-dessus les retours'); } catch (err) { check(false, 'la v6 se recolle par-dessus les retours : ' + err.message); }
    await installerHorloge();
    check(await photoRet() === avantR && (await adminMoi(Ad)).admin === true && (await ouverts()).votes.length === 2, 'les admins, retours, votes et choix sont intacts, tout se lit toujours');
    const pm = (await sup(`select public.fournil_notif_permise($1, 'retour') as a, public.fournil_notif_permise($1, 'vote') as b, public.fournil_notif_permise($2, 'vote') as c, public.fournil_notif_permise($3, 'retour') as d`, [Ad.id, Nb.id, Pa.id]))[0];
    check(pm.a === true && pm.b === true && pm.c === false && pm.d === false,
      'la v6 recollée connaît aussi les types « retour » et « vote » (fournil_notif_permise, la même dans les deux fichiers) : les notifications ne se perdent pas');
    await sup('create policy tout_le_monde on public.fournil_retours for select using (true)');
    await sup('grant select, insert on public.fournil_retours, public.fournil_admins to anon');
    await sup('grant usage on sequence public.fournil_votes_n_seq to anon');
    await sup('grant execute on function public.fournil_admin_qui(uuid, text) to anon');
    try { await collerRet(); check(true, 'les retours se recollent encore, avec des données dedans'); } catch (err) { check(false, 'les retours se recollent : ' + err.message); }
    check(await photoRet() === avantR, 'rien ne se perd au recollage');
    check(await droitsRet(), 'après recollage : les règles et les droits ajoutés à la main sont retirés');

    // l'accès direct refusé
    const essais = [];
    for (const t of TABLES_RET) { const c = t === 'fournil_admins' ? 'joueur' : 'n'; essais.push([`select * from public.${t}`, `lire ${t}`], [`delete from public.${t}`, `effacer dans ${t}`], [`update public.${t} set ${c} = ${c}`, `modifier ${t}`]); }
    essais.push([`insert into public.fournil_admins (joueur, pseudo) values ('${Jo.id}', 'Joueuse')`, 'se rendre admin'], [`insert into public.fournil_retours (joueur, pseudo, type, texte) values ('${Jo.id}', 'Intrus', 'idee', 'x')`, 'écrire un retour sans passer par la fonction'],
      [`insert into public.fournil_votes_choix (n, joueur, option) values (${v3}, '${Jo.id}', 0)`, 'voter sans passer par la fonction'], [`update public.fournil_votes set ferme = true`, 'fermer les votes'],
      [`select nextval('public.fournil_retours_n_seq')`, 'avancer la séquence des retours'], [`select nextval('public.fournil_votes_n_seq')`, 'avancer la séquence des votes'],
      [`select public.fournil_retours_qui('${Jo.id}', '${Jo.jeton}')`, 'appeler fournil_retours_qui'], [`select public.fournil_admin_qui('${Ad.id}', '${Ad.jeton}')`, 'appeler fournil_admin_qui'],
      [`select public.fournil_vote_json(${v3}, '${Jo.id}')`, 'appeler fournil_vote_json'], [`select public.fournil_retours_menage(now())`, 'appeler fournil_retours_menage'], [`select public.fournil_retours_ligne('x')`, 'appeler fournil_retours_ligne'],
      [`select public.fournil_notif_permise('${Ad.id}', 'retour')`, 'appeler fournil_notif_permise'], ['alter table public.fournil_retours disable row level security', 'désactiver la sécurité'], ['create policy tout on public.fournil_admins for select using (true)', 'ajouter une règle']);
    for (const role of ['anon', 'authenticated']) {
      const refuses = []; for (const [q, quoi] of essais) { const e2 = await refus(role, q); if (e2 !== '42501') refuses.push(`${quoi} (${e2})`); }
      check(refuses.length === 0, `${role} ne peut ni lire, ni écrire, ni effacer dans les tables des retours et des votes, ni se rendre admin, ni appeler leurs fonctions internes (${essais.length} essais)${refuses.length ? ' — en défaut : ' + refuses.join(', ') : ''}`);
    }
    await avancer(31);
    check((await envoyer(Ab, 'idee', 'connectée', null, null, 'authenticated')).ok === true && (await appelle('fournil_admin_moi', qui(Ad), 'authenticated')).admin === true, 'authenticated peut écrire et lire aussi');

    // quitter le classement : ses retours, ses choix, sa place d'admin partent avec lui ; ses votes créés restent
    check(await nbRet('fournil_retours', 'where joueur = $1', [Jo.id]) > 0 && await nbRet('fournil_votes_choix', 'where joueur = $1', [Jo.id]) > 0, 'Joueuse a des retours et des choix');
    await avancer(11);
    r = await retirer(Jo);
    check(r.ok === true && await nbRet('fournil_retours', 'where joueur = $1', [Jo.id]) === 0 && await nbRet('fournil_votes_choix', 'where joueur = $1', [Jo.id]) === 0 && JSON.stringify((await ouverts()).votes.find((x) => x.n === v3).voix) === '[0,0]',
      'fournil_retirer : ses retours (et leurs captures) et ses choix partent avec elle, les voix sont recomptées');
    await avancer(11);
    r = await retirer(Ad);
    check(r.ok === true && await nbRet('fournil_admins') === 0 && await nbRet('fournil_votes', 'where cree_par is not null') === 0 && (await ouverts()).votes.length === 2,
      'l’admin quitte le classement : sa place d’admin part avec lui, ses votes restent (sans auteur)');
    // la requête « retirer un admin » du script
    await comme('proprio', `insert into public.fournil_admins (joueur, pseudo) select id, pseudo from public.fournil_joueurs where pseudo ilike 'Abonnée' on conflict do nothing`);
    const ligneRetirer = /delete from public\.fournil_admins [^\n]*/.exec(RET);
    await comme('proprio', ligneRetirer[0].replace(/Machin/g, 'abonnée'));
    check(ligneRetirer && await nbRet('fournil_admins') === 0 && (await adminMoi(Ab)).admin === false, `« retirer un admin » (la requête du script) : ${ligneRetirer && ligneRetirer[0]}`);
    // toutes les requêtes du propriétaire, en tête du script, se jouent sans erreur
    const tete = RET.slice(RET.indexOf('-- Pour le propriétaire'), RET.indexOf('\nbegin;')).split('\n').map((x) => x.replace(/^--\s*(·[^:]*:\s*)?/, '')).join('\n');
    const requetes = [...tete.matchAll(/\b(?:select|update|insert into|delete from) [^;]*;/g)].map((m) => m[0]);
    let mauvaises = [];
    for (const q of requetes) { try { await comme('proprio', q); } catch (err) { mauvaises.push(q.slice(0, 60) + ' : ' + err.message); } }
    check(requetes.length === 8 && mauvaises.length === 0, `les ${requetes.length} requêtes du propriétaire, en tête du script, se jouent sans erreur${mauvaises.length ? ' — ' + mauvaises.join(' ; ') : ''}`);

    // rien ne fuit
    const toutRet = JSON.stringify(reponses.slice(-600)), joueursRet = [Ad, Jo, Pa, Ab, Nb, Ci];
    check(!joueursRet.some((j) => toutRet.includes(j.id) || toutRet.includes(j.jeton) || toutRet.includes(sha(j.jeton))) && !/"(joueur|id|jeton|cree_par)"\s*:/.test(toutRet.replace(/"notif_id"/g, '')), 'ni identifiant, ni jeton, ni empreinte dans les réponses des retours et des votes');
  }

  // ─── le bilan ───
  const bilan = fails ? `${fails} échec(s), ${oks} ok` : `tout est bon (${oks} vérifications)`;
  console.log(`\n${bilan}`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Le Fournil — le SQL du classement (PGlite)\n\n**${bilan}**\n\n<details><summary>le détail</summary>\n\n\`\`\`\n${lignes.join('\n')}\n\`\`\`\n</details>\n\n`); } catch (err) { /* rien */ } }
  await db.close();
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error('  FAIL le test plante :', err && err.stack || err); process.exit(1); });
