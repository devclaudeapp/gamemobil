#!/usr/bin/env node
// Le patch v7.0 du classement (supabase/fournil-classement-v70.sql : le Marché de Noël) essayé POUR DE VRAI dans un Postgres local, PGlite
// (Postgres en WebAssembly : aucune connexion à Supabase), comme outils/marche/sql-v69.cjs l'a fait pour la v6.9 (docs/noel-contrat.md § 5) :
//   · un Postgres « comme Supabase » (anon, authenticated, un propriétaire non superutilisateur, les droits par défaut très larges) ;
//   · le fichier complet supabase/fournil-classement.sql (la v6.9 en ligne), des joueurs, la Maison hantée et le Marché d'automne joués
//     et figés ;
//   · le patch, DEUX fois : aucune donnée ne bouge, aucune autre fonction ne change (leur définition comparée), les lignes 'hantee' et
//     'marche' sont identiques, la ligne 'noel' porte la table de outils/noel/rythme-resultats.json, les droits restent internes, la
//     requête de contrôle ;
//   · le Marché de Noël joué en tant qu'anon : avant midi le 18, rien n'est compté ; pendant, un score sous la borne compté tel quel, un
//     score énorme ramené à la borne ; la borne SQL = son miroir JavaScript ; le marathon du prototype (outils/noel/proto.js) jamais
//     plafonné, même envoyé toutes les 10 minutes ; le classement 'noel' à part ; le podium figé une heure après la fin (le 25 à 21 h),
//     jusqu'au 15e (17 joueurs, des ex æquo), evenements.noel dans fournil_recompenses, joueurs ; les podiums de la Maison hantée et du
//     Marché d'automne inchangés ; le titre des notifications.
// Lancer (PGlite n'est pas dans le dépôt ; la version exacte) :
//   npm install --prefix /chemin/pglite --no-save --no-package-lock @electric-sql/pglite@0.5.8
//   TZ=Europe/Paris node outils/noel/sql-v70.cjs /chemin/pglite
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const RACINE = path.join(__dirname, '..', '..');
function chargerPGlite() {
  const arg = process.argv[2], essais = [];
  if (arg) { const a = path.resolve(arg); essais.push(path.join(a, 'node_modules', '@electric-sql', 'pglite'), path.join(a, '@electric-sql', 'pglite'), a); }
  essais.push('@electric-sql/pglite');
  for (const e of essais) { try { const m = require(e); if (m && m.PGlite) return m; } catch (err) { /* l'essai suivant */ } }
  console.log('  FAIL PGlite introuvable : npm install --prefix /chemin/pglite --no-save --no-package-lock @electric-sql/pglite@0.5.8, puis donne ce dossier en argument');
  process.exit(1);
}
let fails = 0, oks = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else fails++; return ok; };
const titre = (t) => console.log(`── ${t} ──`);
const joueur = () => ({ id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex') });
const parisIso = (j, h, m = 0) => new Date(Date.UTC(2026, 10, j, h - 1, m)).toISOString(); // novembre 2026 : heure d'hiver (UTC+1)
const decIso = (j, h, m = 0) => new Date(Date.UTC(2026, 11, j, h - 1, m)).toISOString(); // décembre 2026 : heure d'hiver (UTC+1)

(async () => {
  const { PGlite } = chargerPGlite();
  const db = await PGlite.create();
  const SQL = fs.readFileSync(path.join(RACINE, 'supabase', 'fournil-classement.sql'), 'utf8');
  const P70 = fs.readFileSync(path.join(RACINE, 'supabase', 'fournil-classement-v70.sql'), 'utf8');
  const RY = JSON.parse(fs.readFileSync(path.join(__dirname, 'rythme-resultats.json'), 'utf8'));
  const MARCHE69 = [11.65, 16.05, 16.05, 16.3, 16.5, 16.65, 16.75, 16.85, 16.95, 17, 17.05, 17.1, 17.15, 17.2, 17.2, 17.3, 17.35, 17.4, 17.5, 17.55, 17.65, 17.75, 17.8, 17.85, 17.95, 18, 18.05, 18.1, 18.15, 18.15, 18.2];
  console.log(`Le patch v7.0 dans ${(await db.query('select version() as v')).rows[0].v.split(' on ')[0]}`);
  const sup = async (sql, p) => (await db.query(sql, p)).rows;
  const comme = async (role, sql, p) => { await db.exec(`set role ${role}`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  const refus = async (role, sql, p) => { try { await comme(role, sql, p); return 'accepté'; } catch (err) { return err.code || err.message; } };
  const coller = async (texte) => { await db.exec('set role proprio'); try { return await db.exec(texte); } finally { await db.exec('reset role'); } };
  const heure = async (iso) => sup('update banc.horloge set t = $1', [iso]);
  const horloge = () => sup(`create or replace function public.fournil_maintenant() returns timestamptz language sql stable set search_path = '' as $$ select coalesce((select t from banc.horloge limit 1), now()) $$`);

  titre('un Postgres comme Supabase, la v6.9 en ligne (le fichier complet)');
  await db.exec(`
    create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
    create role proprio nologin createrole;
    grant usage, create on schema public to proprio; grant usage on schema public to anon, authenticated, service_role;
    set role proprio;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    reset role;
    create schema banc; create table banc.horloge (t timestamptz); insert into banc.horloge values (null);
    grant usage on schema banc to proprio; grant select on banc.horloge to proprio;`);
  try { await coller(SQL); check(/Version 6\.9/.test(SQL) && !/'noel'/.test(SQL), 'supabase/fournil-classement.sql (v6.9, sans le Marché de Noël) se colle'); } catch (err) { check(false, 'le fichier complet se colle : ' + err.message); process.exit(1); }
  await horloge();
  const publier = async (j, pseudo, score, evt) => (await comme('anon', 'select public.fournil_publier(p_id => $1, p_jeton => $2, p_pseudo => $3, p_fortune => $4, p_points => $5, p_lundi => $6, p_evt => $7, p_score => $8) as r',
    [j.id, j.jeton, pseudo, String(1e9), '0', null, evt, score == null ? null : String(score)]))[0].r;
  const borneSQL = async (evt, iso) => (await sup('select public.fournil_evt_borne($1, $2::timestamptz) as b', [evt, iso]))[0].b;
  // la Maison hantée jouée (seize joueurs), puis figée (le 2 nov. à 21 h) : comme sur Supabase avant le patch
  const H = Array.from({ length: 16 }, () => joueur());
  await heure(parisIso(1, 18)); // (novembre : le 1er à 18 h, pendant la Maison hantée)
  for (const [k, j] of H.entries()) { const r = await publier(j, `Hantée ${k + 1}`, 1e9 * (k + 1), 'hantee'); if (k === 0) check(r.ok && r.evt === 'hantee', `un joueur envoie ses bonbons pendant la Maison hantée (${JSON.stringify({ ok: r.ok, evt: r.evt })})`); }
  await heure(parisIso(3, 9)); await comme('anon', 'select public.fournil_classement(p_periode => $1) as r', ['hantee']); // une lecture fige le podium (fournil_evt_figer, appelée par fournil_classement)
  await sup('select public.fournil_evt_figer(public.fournil_maintenant())');
  const podiumH = await sup(`select evt, rang, pseudo, valeur from public.fournil_evt_podium where evt = 'hantee' order by rang, pseudo`);
  check(podiumH.length === 15 && podiumH[0].pseudo === 'Hantée 16', `la Maison hantée figée : ses quinze premiers (${podiumH.length})`);
  // le Marché d'automne joué (seize joueurs), puis figé (le 20 nov. à 21 h) : comme sur Supabase avant le patch ; et 'noel' encore inconnu
  const MA = Array.from({ length: 16 }, () => joueur());
  await heure(parisIso(15, 18)); for (const [k, j] of MA.entries()) await publier(j, `Marché ${k + 1}`, 1e12 * (k + 1), 'marche');
  await heure(parisIso(15, 18, 1)); for (const [k, j] of MA.entries()) await publier(j, `Marché ${k + 1}`, 1e12 * (k + 1) + 1, 'marche');
  await heure(parisIso(21, 9)); await comme('anon', 'select public.fournil_classement(p_periode => $1) as r', ['marche']); await sup('select public.fournil_evt_figer(public.fournil_maintenant())');
  const podiumM = await sup(`select evt, rang, pseudo, valeur from public.fournil_evt_podium where evt = 'marche' order by rang, pseudo`);
  const Avant = joueur(); await heure(decIso(18, 13)); const rAvant = await publier(Avant, 'Avant', 1e6, 'noel');
  check(podiumM.length === 15 && podiumM[0].pseudo === 'Marché 16' && rAvant.ok === true && rAvant.evt === null, `sous la v6.9 : le Marché d'automne figé (ses quinze premiers), et le 18 déc. à 13 h des sucres d'orge envoyés sont ignorés (evt ${JSON.stringify(rAvant.evt)}) : rien ne casse`);
  await heure(decIso(18, 9));

  // ─── l'instantané : les données, les fonctions (sauf les deux que le patch remplace), les droits ───
  const TABLES = (await sup(`select tablename from pg_tables where schemaname = 'public' order by tablename`)).map((x) => x.tablename);
  const donnees = async () => { const o = {}; for (const t of TABLES) o[t] = await sup(`select * from public.${t} order by 1`); return JSON.stringify(o); };
  const fonctions = async () => JSON.stringify(await sup(`select p.proname, pg_get_function_identity_arguments(p.oid) as a, pg_get_functiondef(p.oid) as d, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname not in ('fournil_evts', 'fournil_evt_titre', 'fournil_maintenant') order by 1, 2`));
  const droits = async () => JSON.stringify(await sup(`select p.proname, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('fournil_evts', 'fournil_evt_titre') order by 1`));
  const evts = async () => sup(`select nom, debut, fin, pas, tableau from public.fournil_evts() order by debut`);
  const [d0, f0, a0, e0] = [await donnees(), await fonctions(), await droits(), await evts()];

  titre('le patch v7.0, collé deux fois');
  for (const fois of ['une', 'deux']) {
    let sortie = null;
    try { sortie = await coller(P70); check(true, `il se colle (${fois} fois)`); } catch (err) { check(false, `il se colle (${fois} fois) : ${err.message}`); continue; }
    await horloge();
    const ctrl = sortie[sortie.length - 1] && sortie[sortie.length - 1].rows && sortie[sortie.length - 1].rows[0];
    if (fois === 'une') { check(!!ctrl && ctrl.evenements === 'hantee, marche, noel' && ctrl.noel_valeurs === 31 && Number(ctrl.borne_noel) === 0 && Number(ctrl.borne_noel_fin_log10) === 18.17 && ctrl.titre === 'le Marché de Noël', `la requête de contrôle (le 18 déc. à 9 h) : ${JSON.stringify(ctrl && { evenements: ctrl.evenements, valeurs: ctrl.noel_valeurs, borne: ctrl.borne_noel, fin: ctrl.borne_noel_fin_log10, titre: ctrl.titre })}`); }
    check(await donnees() === d0, 'aucune donnée ne bouge (joueurs, scores, podiums, annonces…)');
    check(await fonctions() === f0, 'aucune autre fonction ne change (définitions et droits comparés)');
    check(await droits() === a0, 'fournil_evts et fournil_evt_titre gardent leurs droits (internes)');
  }
  const e1 = await evts();
  check(e0.length === 2 && e1.length === 3 && JSON.stringify(e1[0]) === JSON.stringify(e0[0]) && JSON.stringify(e1[1]) === JSON.stringify(e0[1]) && JSON.stringify(e1[1].tableau) === JSON.stringify(MARCHE69), 'les lignes « hantee » et « marche » sont identiques à celles de la v6.9 ; une seule ligne de plus');
  const m = e1.find((x) => x.nom === 'noel');
  check(m && new Date(m.debut).toISOString() === decIso(18, 12) && new Date(m.fin).toISOString() === decIso(25, 20) && m.pas === 6, `la fenêtre du Marché de Noël : ${m && new Date(m.debut).toISOString()} → ${m && new Date(m.fin).toISOString()}, un pas de 6 h (le vendredi 18 à midi au vendredi 25 à 20 h, heure de Paris)`);
  check(m && JSON.stringify(m.tableau) === JSON.stringify(RY.enveloppe.table) && m.tableau.every((v, k) => !k || v >= m.tableau[k - 1]) && m.tableau.every((v, k) => v >= MARCHE69[k]), `sa table est celle de la simulation (outils/noel/rythme-resultats.json), croissante, jamais sous celle du Marché d'automne : {${m && m.tableau.join(',')}}`);
  for (const r of ['anon', 'authenticated']) check(await refus(r, 'select * from public.fournil_evts()') === '42501' && await refus(r, `select public.fournil_evt_titre('noel')`) === '42501', `${r} ne peut appeler ni fournil_evts ni fournil_evt_titre (internes)`);
  check((await sup(`select public.fournil_evt_titre('noel') as t`))[0].t === 'le Marché de Noël' && (await sup(`select public.fournil_evt_titre('marche') as t`))[0].t === "le Marché d'automne" && (await sup(`select public.fournil_evt_titre('hantee') as t`))[0].t === 'la Maison hantée', 'le titre des notifications : « le Marché de Noël » (la Maison hantée et le Marché d\'automne inchangés)');

  titre('le Marché de Noël joué, en tant qu’anon');
  const tab = RY.enveloppe.table, miroir = (h) => { const j = Math.min(h / 6, tab.length - 1), k = Math.floor(j); return Math.pow(10, k >= tab.length - 1 ? tab[tab.length - 1] : tab[k] + (tab[k + 1] - tab[k]) * (j - k)); };
  check(await borneSQL('noel', decIso(18, 11, 59)) === 0, 'avant le vendredi 18 à midi : la borne vaut 0');
  let ecart = 0; for (const h of [0, 1, 5.5, 6, 13, 24, 47.3, 100, 143.9, 175.9, 176, 190]) { const t = new Date(Date.parse(decIso(18, 12)) + h * 3600e3).toISOString(); const b = await borneSQL('noel', t); ecart = Math.max(ecart, Math.abs(b / miroir(h) - 1)); }
  check(ecart < 1e-9, `la borne SQL est son miroir JavaScript (interpolation du log10), de l'ouverture à après la fin (écart ${ecart.toExponential(1)})`);
  check(await borneSQL('marche', decIso(18, 12)) === await borneSQL('marche', parisIso(30, 12)) && await borneSQL('hantee', decIso(18, 12)) > 0, 'les bornes de la Maison hantée et du Marché d’automne, après leur fin : constantes, inchangées');
  await sup(`select public.fournil_annoncer($1::timestamptz)`, [decIso(18, 12, 5)]);
  const J = joueur();
  await heure(decIso(18, 11, 50));
  const lireM = async () => JSON.stringify((await comme('anon', 'select public.fournil_classement(p_periode => $1) as r', ['marche']))[0].r.lignes);
  const mn0 = await lireM();
  let r = await publier(J, 'Sucre d’orge', 1e6, 'noel');
  check(r.ok && r.evt === 'noel' && !(r.evt_score > 0), `avant l'ouverture : accepté, rien n'est compté (${JSON.stringify({ evt: r.evt, score: r.evt_score })})`);
  await heure(decIso(18, 18)); r = await publier(J, 'Sucre d’orge', 3e12, 'noel');
  check(r.ok && r.evt_score === 3e12 && !r.evt_plafonne, `le 18 à 18 h, 3e12 sucres d'orge (sous la borne ${(await borneSQL('noel', decIso(18, 18))).toExponential(2)}) : comptés tels quels`);
  await heure(decIso(18, 18, 1)); r = await publier(J, 'Sucre d’orge', 1e19, 'noel');
  const b18 = await borneSQL('noel', decIso(18, 18, 1));
  check(r.ok && r.evt_plafonne === true && Math.abs(r.evt_score / b18 - 1) < 1e-9, `1e19 une minute plus tard : ramené à la borne (${r.evt_score && r.evt_score.toExponential(2)}, plafonné)`);
  const mn = await comme('anon', 'select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['marche', J.id]);
  check(!mn[0].r.moi && mn[0].r.lignes.every((x) => /^Marché /.test(x.pseudo)) && mn0 === JSON.stringify(mn[0].r.lignes), `le classement du Marché d'automne ne voit pas le Marché de Noël (${mn[0].r.lignes.length} lignes, toutes du Marché d'automne, inchangées)`);

  titre('le marathon du prototype, envoyé toutes les 10 minutes : jamais plafonné');
  { const N = require('./proto.js').charger(), s = N.simuler('marathon', 8, { graine: 7, offertes: true }), K = joueur(); let plafonne = 0, n = 0, prochain = 0;
    for (const { t, total: v } of s.trace) { const ms = N.DEBUT + t * 864e5; if (ms < prochain || !(v > 0)) continue; prochain = ms + 600e3; await heure(new Date(ms + 11e3).toISOString()); const x = await publier(K, 'Marathon', Math.floor(v), 'noel'); n++; if (x.evt_plafonne) plafonne++; }
    check(plafonne === 0 && n > 1000, `${n} envois (graine 7, Astuces offertes, ${N.fmt(s.total)} à la fin) : ${plafonne} plafonné`); }

  titre('la fin : le podium jusqu’au 15e, les récompenses, la Maison hantée et le Marché d’automne intacts');
  { const L = Array.from({ length: 17 }, () => joueur()); await heure(decIso(25, 19)); // (la borne : 1,5e18 ; le marathon du prototype, 6,6e17, et Sucre d'orge restent 18e et 19e)
    const scores = [1.2e18, 1.1e18, 1.1e18, 1.05e18, 1e18, 9.8e17, 9.6e17, 9.4e17, 9.2e17, 9e17, 8.8e17, 8.6e17, 8.4e17, 8.2e17, 8e17, 8e17, 7e17]; // des ex æquo au 2e et au 15e
    for (const [k, j] of L.entries()) await publier(j, `Noël ${k + 1}`, scores[k], 'noel');
    await heure(decIso(25, 20, 30)); await comme('anon', 'select public.fournil_classement(p_periode => $1) as r', ['noel']);
    check((await sup(`select count(*)::int as n from public.fournil_evenements where nom = 'noel'`))[0].n === 0, 'à 20 h 30 (dans l’heure de grâce) : pas encore figé');
    await heure(decIso(25, 21, 1)); const c = (await comme('anon', 'select public.fournil_classement(p_periode => $1, p_id => $2) as r', ['noel', L[1].id]))[0].r;
    const pod = await sup(`select rang, pseudo from public.fournil_evt_podium where evt = 'noel' order by rang, pseudo`), fe = (await sup(`select joueurs from public.fournil_evenements where nom = 'noel'`))[0];
    check(pod.length === 16 && pod.filter((x) => x.rang === 2).length === 2 && pod.filter((x) => x.rang === 15).length === 2 && fe && fe.joueurs === 19, `à 21 h : figé, les quinze premiers ex æquo compris (${pod.length} lignes, deux 2e, deux 15e), ${fe && fe.joueurs} joueurs classés (les 17, Sucre d'orge et le marathon)`);
    check(c.moi && c.moi.podium === 2 && c.lignes[0].podium === 1, 'le classement du Marché de Noël montre la médaille du podium final');
    const rec = (await comme('anon', 'select public.fournil_recompenses(p_id => $1, p_jeton => $2) as r', [L[13].id, L[13].jeton]))[0].r;
    check(rec.ok && rec.evenements && rec.evenements.noel && rec.evenements.noel.rang === 14 && rec.evenements.noel.joueurs === 19 && rec.evenements.noel.podium.length === 3, `fournil_recompenses : evenements.noel = ${JSON.stringify(rec.evenements && rec.evenements.noel && { rang: rec.evenements.noel.rang, joueurs: rec.evenements.noel.joueurs, podium: rec.evenements.noel.podium.length })} (le 14e reçoit sa place ; le podium rendu à trois)`);
    check(rec.evenements && (!rec.evenements.marche || rec.evenements.marche.rang == null) && (!rec.evenements.hantee || rec.evenements.hantee.rang == null), 'il n’était ni à la Maison hantée ni au Marché d’automne : pas de place pour eux');
    const podH2 = await sup(`select evt, rang, pseudo, valeur from public.fournil_evt_podium where evt = 'hantee' order by rang, pseudo`), podM2 = await sup(`select evt, rang, pseudo, valeur from public.fournil_evt_podium where evt = 'marche' order by rang, pseudo`);
    const hJ = (await sup(`select count(*)::int as n from public.fournil_joueurs where pseudo like 'Hantée %'`))[0].n;
    check(JSON.stringify(podM2) === JSON.stringify(podiumM) && (JSON.stringify(podH2) === JSON.stringify(podiumH) || (podH2.length === 0 && hJ === 0)),
      `le podium du Marché d’automne n’a pas bougé (${podM2.length} lignes) ; celui de la Maison hantée ${podH2.length ? 'non plus' : 'est parti avec ses joueurs, inactifs depuis le 1er nov. (le ménage habituel des comptes oubliés, déjà là en v6.9 : rien à voir avec le patch)'}`);
    await sup(`select public.fournil_annoncer($1::timestamptz)`, [decIso(25, 20, 10)]);
    const an = (await sup(`select cle from public.fournil_annonces where cle like 'noel:%' order by cle`)).map((x) => x.cle);
    check(an.join() === 'noel:fin,noel:ouverture', `les annonces du Marché de Noël : son ouverture (le 18 à midi) et sa fin (le 25 à 20 h) : ${an.join(', ')}`); }

  console.log(fails ? `\n${fails} échec(s), ${oks} ok` : `\nTout passe (${oks} vérifications).`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
