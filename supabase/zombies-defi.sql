-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Dernier Rempart — le CLASSEMENT DU DÉFI DU JOUR, version 1
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase : SQL Editor → New query → coller tout → Run.
--  On peut le recoller autant de fois qu'on veut : les joueurs et leurs scores restent ; les fonctions sont remplacées, les droits
--  remis d'aplomb. Il ne touche à rien du Fournil ni de Poncin (tout a le préfixe zombies_ ; il ne dépend de rien d'autre).
--
--  Le défi du jour : chaque jour (heure de Paris), tout le monde joue la même partie (même graine, même arène, même mutateur,
--  sans les bonus du Bunker : src-zombies/jeu.js defiDu). On peut la rejouer autant qu'on veut : c'est le MEILLEUR score du jour
--  qui compte. Après chaque partie de défi, le téléphone publie { jour, score, vague, tues } (src-zombies/classement.js).
--
--  Ce qu'il installe :
--    · public.zombies_joueurs : un joueur = une ligne (pseudo, empreinte du jeton, garde-fous) ;
--    · public.zombies_scores : le meilleur score de chaque joueur pour chaque jour (gardé 60 jours) ;
--    · public.zombies_portes : les inscriptions des dernières 24 h, par source (seulement une empreinte de l'adresse) ;
--    · deux fonctions appelées par le jeu : zombies_publier et zombies_classement.
--  Personne ne lit ni n'écrit les tables directement : tout passe par ces deux fonctions, qui vérifient tout.
--
--  Les classements :
--    · « Aujourd'hui » : le meilleur score de chacun pour le défi du jour ;
--    · « Cette semaine » (du lundi au dimanche, heure de Paris) : la somme des meilleurs scores de chaque jour de la semaine
--      (jouer chaque jour paie).
--
--  Les garde-fous (le téléphone fait autorité sur sa partie : on borne ce qu'il peut prétendre) :
--    · le jour publié est aujourd'hui ou hier (heure de Paris, horloge du SERVEUR : une partie commencée avant minuit) ;
--    · une partie PLAUSIBLE (sinon « valeur ») : vague de 1 à 400, score ≤ zombies_borne_score(vague) (le calcul : partie 2 ;
--      ZDONNEES.DEFI.borneScore fait le même, test/zombies-defi-sql.cjs vérifie qu'ils sont égaux), tués ≤ zombies_borne_tues ;
--    · au plus une partie toutes les 15 secondes par joueur (« trop_vite »), au plus 150 par jour (« quota ») ;
--    · un changement de pseudo seul : un toutes les 10 secondes au plus ;
--    · par source (en-tête cf-connecting-ip ; en IPv6, le bloc /64) : 10 inscriptions par heure et 20 par jour au plus ; pour tout
--      le monde : 60 nouveaux joueurs par heure, 3 000 joueurs en tout ; les inscriptions passent une à une (verrou) ;
--    · le ménage se fait tout seul à chaque envoi : un joueur sans nouvelles depuis 90 jours est effacé (avec ses scores), une
--      inscription sans aucune partie au bout de 7 jours, les scores de plus de 60 jours ;
--    · un pseudo de 2 à 16 caractères (lettres, accents compris, chiffres, espace, - _ ' .), unique sans tenir compte des
--      majuscules ; mêmes règles qu'au Fournil et à Poncin ;
--    · chaque joueur garde sur son téléphone un jeton secret ; ici on ne garde que son empreinte (sha256) ;
--    · les paramètres sont typés, aucun texte n'est jamais assemblé en SQL : pas d'injection possible.
--
--  Supabase (Postgres 15 ou plus récent), aucune extension nécessaire.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Les tables ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.zombies_joueurs (
  id           uuid primary key,                 -- tiré au hasard par le téléphone, jamais affiché
  jeton        text not null,                    -- EMPREINTE sha256 (hexadécimale) du jeton secret, pas le jeton
  pseudo       text not null,
  cree         timestamptz not null,
  maj          timestamptz not null,             -- dernier envoi accepté
  partie_maj   timestamptz,                      -- la dernière partie comptée
  jour         date not null,                    -- le jour (heure de Paris) du compteur du jour
  parties_jour integer not null default 0,       -- les parties publiées ce jour-là (au plus 150)
  parties      integer not null default 0        -- les parties publiées depuis l'arrivée
);
create unique index if not exists zombies_joueurs_pseudo on public.zombies_joueurs (lower(pseudo));

create table if not exists public.zombies_scores (
  joueur  uuid not null references public.zombies_joueurs (id) on delete cascade,
  jour    date not null,                          -- le jour du défi (heure de Paris)
  score   integer not null,                       -- le meilleur score de ce joueur pour ce défi
  vague   integer not null,                       -- la vague de ce meilleur score
  tues    integer not null,
  parties integer not null default 1,             -- ses parties de ce défi
  maj     timestamptz not null,
  primary key (joueur, jour)
);
create index if not exists zombies_scores_jour on public.zombies_scores (jour, score desc);

create table if not exists public.zombies_portes (
  empreinte text not null,
  quand     timestamptz not null
);
create index if not exists zombies_portes_empreinte on public.zombies_portes (empreinte, quand);

comment on table public.zombies_joueurs is 'Dernier Rempart : les joueurs du défi du jour. Accès uniquement par zombies_publier et zombies_classement.';
comment on table public.zombies_scores is 'Dernier Rempart : le meilleur score de chaque joueur pour chaque défi du jour. Accès uniquement par zombies_publier et zombies_classement.';
comment on table public.zombies_portes is 'Dernier Rempart : les inscriptions des dernières 24 h, par source (empreinte seulement). Accès uniquement par zombies_publier.';

-- la sécurité ligne par ligne SANS aucune règle : personne ne voit ni ne touche ces tables par l'API
alter table public.zombies_joueurs enable row level security;
alter table public.zombies_scores enable row level security;
alter table public.zombies_portes enable row level security;
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies
            where schemaname = 'public' and tablename in ('zombies_joueurs', 'zombies_scores', 'zombies_portes') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;
revoke all on table public.zombies_joueurs, public.zombies_scores, public.zombies_portes from public, anon, authenticated;


-- ─── 2. Les petites fonctions internes (le jeu ne peut pas les appeler) ─────────────────────────

-- l'heure du serveur, en un seul endroit (les tests la remplacent ; recoller ce fichier la remet à l'heure vraie)
create or replace function public.zombies_maintenant()
returns timestamptz language sql stable set search_path = ''
as $$ select now() $$;

create or replace function public.zombies_jour(p_quand timestamptz)
returns date language sql stable set search_path = ''
as $$ select (p_quand at time zone 'Europe/Paris')::date $$;

create or replace function public.zombies_lundi(p_jour date)
returns date language sql immutable set search_path = ''
as $$ select date_trunc('week', p_jour::timestamp)::date $$;

-- le pseudo nettoyé, ou null s'il n'est pas valable (les mêmes règles que poncin_pseudo_propre)
create or replace function public.zombies_pseudo_propre(p_pseudo text)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v text;
begin
  if p_pseudo is null or length(p_pseudo) > 64 then
    return null;
  end if;
  v := normalize(p_pseudo, NFC);
  v := translate(v, E'’‘ʼ`´', '''''''''''');
  v := btrim(regexp_replace(v, E'[[:space:]   -     　﻿]+', ' ', 'g'));
  if char_length(v) < 2 or char_length(v) > 16 then
    return null;
  end if;
  if v !~ E'^[0-9A-Za-zÀ-ÖØ-öø-İĴ-ķĹ-ľŁ-ňŊ-ž _''.-]+$' then
    return null;
  end if;
  if v !~ E'[0-9A-Za-zÀ-ÖØ-öø-İĴ-ķĹ-ľŁ-ňŊ-ž]' then
    return null;
  end if;
  return v;
end
$$;

create or replace function public.zombies_jeton_valable(p_jeton text)
returns boolean language sql immutable set search_path = ''
as $$ select p_jeton is not null and p_jeton ~ '^[0-9A-Za-z_-]{32,128}$' $$;

create or replace function public.zombies_empreinte(p_jeton text)
returns text language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex') $$;

-- LES BORNES d'une partie plausible, tirées des règles du jeu (src-zombies/donnees.js) :
--   · le nombre de zombies de la vague n : arrondi(12 + 7n + 0,6n²) (VAGUES.nombre), × 1,5 au plus (le mutateur « Marée ») ;
--   · chaque zombie compté comme le plus payant des ordinaires (le Costaud, 40 points), en série ×4 (SERIE.paliers), avec les
--     points ×2 (le mutateur « Disette ») : 320 points ; plus un boss par vague (600 × 4 × 2 = 4 800) ; plus la prime de fin de
--     vague (20 + 10n, VAGUES.prime) ;
--   · le score d'une partie qui atteint la vague v ne dépasse pas la somme de ces vagues 1 à v ;
--   · les tués : la somme des zombies des vagues 1 à v (× 1,5), plus v.
create or replace function public.zombies_borne_score(p_vague integer)
returns bigint language sql immutable set search_path = ''
as $$
  select coalesce(sum(ceil(round(12 + n * 7 + n * n * 0.6) * 1.5) * 320 + 4800 + 20 + n * 10), 0)::bigint
    from generate_series(1, greatest(0, least(p_vague, 400))) as n
$$;
create or replace function public.zombies_borne_tues(p_vague integer)
returns bigint language sql immutable set search_path = ''
as $$
  select (coalesce(sum(ceil(round(12 + n * 7 + n * n * 0.6) * 1.5)), 0) + greatest(0, p_vague))::bigint
    from generate_series(1, greatest(0, least(p_vague, 400))) as n
$$;

-- la réponse de zombies_publier : ok/erreur, et, pour un joueur connu, son meilleur score du jour, son rang et le nombre de joueurs
create or replace function public.zombies_reponse(p_erreur text, p_id uuid, p_jour date, p_record boolean default null)
returns json language sql stable set search_path = ''
as $$
  select json_build_object(
    'ok', p_erreur is null,
    'erreur', p_erreur,
    'version', 1,
    'jour', to_char(p_jour, 'YYYY-MM-DD'),
    'record', coalesce(p_record, false),
    'meilleur', (select s.score from public.zombies_scores s where s.joueur = p_id and s.jour = p_jour),
    'vague', (select s.vague from public.zombies_scores s where s.joueur = p_id and s.jour = p_jour),
    'parties', (select s.parties from public.zombies_scores s where s.joueur = p_id and s.jour = p_jour),
    'rang', (select (select count(*) from public.zombies_scores a where a.jour = p_jour and a.score > m.score)::int + 1
               from public.zombies_scores m where m.joueur = p_id and m.jour = p_jour),
    'joueurs', (select count(*)::int from public.zombies_scores where jour = p_jour)
  )
$$;


-- ─── 3. zombies_publier : rejoindre le classement, publier une partie de défi ───────────────────
-- p_jour, p_score, p_vague, p_tues : la partie (tous ou aucun ; sans partie : rejoindre ou changer de pseudo).
-- Réponse : { ok, erreur: null | 'jeton' | 'pseudo_invalide' | 'pseudo_pris' | 'jour' | 'valeur' | 'trop_vite' | 'quota' | 'complet',
--             version: 1, jour, record (vrai : meilleur score du jour battu), meilleur, vague, parties, rang, joueurs }
create or replace function public.zombies_publier(p_id uuid, p_jeton text, p_pseudo text,
                                                  p_jour date default null, p_score integer default null,
                                                  p_vague integer default null, p_tues integer default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.zombies_maintenant();
  v_jour       date := public.zombies_jour(v_maintenant);
  v_pseudo     text := public.zombies_pseudo_propre(p_pseudo);
  v_partie     boolean;
  v_record     boolean := false;
  v_empreinte  text;
  v_contrainte text;
  v_ip         text;
  v_porte      text;
  v_inscrit    boolean;
  j            public.zombies_joueurs%rowtype;
begin
  if p_id is null or not public.zombies_jeton_valable(p_jeton) then
    return public.zombies_reponse('jeton', null, v_jour);
  end if;
  if v_pseudo is null then
    return public.zombies_reponse('pseudo_invalide', null, v_jour);
  end if;
  v_partie := p_jour is not null or p_score is not null or p_vague is not null or p_tues is not null;
  if v_partie then
    if p_jour is null or p_score is null or p_vague is null or p_tues is null then
      return public.zombies_reponse('valeur', null, v_jour);
    end if;
    if p_jour < v_jour - 1 or p_jour > v_jour then
      return public.zombies_reponse('jour', null, v_jour);
    end if;
    if p_vague < 1 or p_vague > 400 or p_score < 0 or p_score > public.zombies_borne_score(p_vague)
       or p_tues < 0 or p_tues > public.zombies_borne_tues(p_vague) then
      return public.zombies_reponse('valeur', null, v_jour);
    end if;
  end if;
  v_empreinte := public.zombies_empreinte(p_jeton);

  select * into j from public.zombies_joueurs where id = p_id for update;
  v_inscrit := found;

  -- le ménage (jamais le joueur qui appelle ; une ligne tenue par un autre envoi est laissée de côté : aucun interblocage)
  delete from public.zombies_joueurs
   where id in (select o.id from public.zombies_joueurs o
                 where o.id <> p_id
                   and (o.maj < v_maintenant - interval '90 days' or (o.parties = 0 and o.cree < v_maintenant - interval '7 days'))
                   for update skip locked);
  delete from public.zombies_scores where jour < v_jour - 60;

  if v_inscrit then
    if j.jeton <> v_empreinte then
      return public.zombies_reponse('jeton', null, v_jour);
    end if;
    if (v_partie and j.partie_maj is not null and v_maintenant < j.partie_maj + interval '15 seconds')
       or (not v_partie and v_maintenant < j.maj + interval '10 seconds') then
      return public.zombies_reponse('trop_vite', p_id, coalesce(p_jour, v_jour));
    end if;
    if lower(v_pseudo) <> lower(j.pseudo)
       and exists (select 1 from public.zombies_joueurs where lower(pseudo) = lower(v_pseudo) and id <> p_id) then
      return public.zombies_reponse('pseudo_pris', null, v_jour);
    end if;
    if j.jour <> v_jour then
      j.jour := v_jour; j.parties_jour := 0;
    end if;
    if v_partie and j.parties_jour >= 150 then
      return public.zombies_reponse('quota', p_id, p_jour);
    end if;
    begin
      update public.zombies_joueurs
         set pseudo = v_pseudo, maj = v_maintenant, jour = j.jour,
             parties_jour = j.parties_jour + case when v_partie then 1 else 0 end,
             parties = j.parties + case when v_partie then 1 else 0 end,
             partie_maj = case when v_partie then v_maintenant else j.partie_maj end
       where id = p_id;
    exception when unique_violation then
      return public.zombies_reponse('pseudo_pris', null, v_jour);
    end;
  else
    -- une inscription à la fois (le verrou tient jusqu'à la fin de la transaction)
    perform pg_catalog.pg_advisory_xact_lock(7231003);
    v_ip := nullif(btrim(coalesce(
              (nullif(pg_catalog.current_setting('request.headers', true), '')::json) ->> 'cf-connecting-ip', '')), '');
    delete from public.zombies_portes where quand < v_maintenant - interval '1 day';
    if v_ip is not null then
      begin
        v_ip := case when pg_catalog.family(v_ip::inet) = 6 then pg_catalog.network(pg_catalog.set_masklen(v_ip::inet, 64))::text
                     else pg_catalog.host(v_ip::inet) end;
      exception when others then
        null;
      end;
      v_porte := public.zombies_empreinte('ip:' || v_ip);
      if (select count(*) from public.zombies_portes where empreinte = v_porte and quand > v_maintenant - interval '1 hour') >= 10
         or (select count(*) from public.zombies_portes where empreinte = v_porte) >= 20 then
        return public.zombies_reponse('trop_vite', null, v_jour);
      end if;
    end if;
    if (select count(*) from public.zombies_joueurs) >= 3000 then
      return public.zombies_reponse('complet', null, v_jour);
    end if;
    if (select count(*) from public.zombies_joueurs where cree > v_maintenant - interval '1 hour') >= 60 then
      return public.zombies_reponse('trop_vite', null, v_jour);
    end if;
    if exists (select 1 from public.zombies_joueurs where lower(pseudo) = lower(v_pseudo)) then
      return public.zombies_reponse('pseudo_pris', null, v_jour);
    end if;
    begin
      insert into public.zombies_joueurs (id, jeton, pseudo, cree, maj, partie_maj, jour, parties_jour, parties)
      values (p_id, v_empreinte, v_pseudo, v_maintenant, v_maintenant, case when v_partie then v_maintenant end, v_jour,
              case when v_partie then 1 else 0 end, case when v_partie then 1 else 0 end);
      if v_porte is not null then
        insert into public.zombies_portes (empreinte, quand) values (v_porte, v_maintenant);
      end if;
    exception when unique_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'zombies_joueurs_pseudo' then
        return public.zombies_reponse('pseudo_pris', null, v_jour);
      end if;
      return public.zombies_reponse('trop_vite', null, v_jour);
    end;
  end if;

  if not v_partie then
    return public.zombies_reponse(null, p_id, v_jour);
  end if;
  -- le meilleur score du jour : gardé s'il est battu (à score égal, la vague la plus haute)
  select not exists (select 1 from public.zombies_scores s where s.joueur = p_id and s.jour = p_jour and s.score >= p_score)
    into v_record;
  insert into public.zombies_scores as s (joueur, jour, score, vague, tues, parties, maj)
  values (p_id, p_jour, p_score, p_vague, p_tues, 1, v_maintenant)
  on conflict (joueur, jour) do update
     set parties = s.parties + 1,
         score = greatest(s.score, excluded.score),
         vague = case when excluded.score > s.score then excluded.vague else s.vague end,
         tues = case when excluded.score > s.score then excluded.tues else s.tues end,
         maj = case when excluded.score > s.score then excluded.maj else s.maj end;
  return public.zombies_reponse(null, p_id, p_jour, v_record);
end
$$;


-- ─── 4. zombies_classement : lire le classement ────────────────────────────────────────────────
-- p_periode : 'jour' (le meilleur score de chacun pour le défi de p_jour) ou 'semaine' (la somme des meilleurs scores de chaque
--             jour, du lundi au dimanche de la semaine de p_jour) ; p_jour : le jour voulu (aujourd'hui par défaut, 60 jours en
--             arrière au plus) ; p_id : son propre identifiant (facultatif), pour se retrouver hors des premiers ;
--             p_limite : le nombre de lignes (50 par défaut, 100 au plus).
-- Réponse : { version: 1, periode, jour, lundi, joueurs, lignes: [{ rang, pseudo, score, vague, parties, moi }],
--             moi: { rang, score, vague, parties } | null }
-- vague : la vague du meilleur score ('jour') ou la plus haute de la semaine ; parties : ses parties ('jour') ou ses jours joués.
-- Les ex æquo ont le même rang (puis l'ordre des pseudos) ; jamais d'identifiant ni de jeton dans la réponse.
create or replace function public.zombies_classement(p_periode text, p_jour date default null, p_id uuid default null,
                                                     p_limite integer default 50)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aujourdhui date := public.zombies_jour(public.zombies_maintenant());
  v_jour       date := case when p_jour is null or p_jour > v_aujourdhui or p_jour < v_aujourdhui - 60 then v_aujourdhui else p_jour end;
  v_lundi      date := public.zombies_lundi(v_jour);
  v_limite     integer := greatest(1, least(coalesce(p_limite, 50), 100));
  v_reponse    json;
begin
  if p_periode is null or p_periode not in ('jour', 'semaine') then
    return json_build_object('version', 1, 'erreur', 'periode');
  end if;
  with t as (
    select s.joueur, sum(s.score)::bigint as score, max(s.vague) as vague,
           case when p_periode = 'jour' then sum(s.parties) else count(*) end::int as parties
      from public.zombies_scores s
     where (p_periode = 'jour' and s.jour = v_jour) or (p_periode = 'semaine' and s.jour between v_lundi and v_lundi + 6)
     group by s.joueur
  ), r as (
    select t.*, j.pseudo, (rank() over (order by t.score desc))::int as rang
      from t join public.zombies_joueurs j on j.id = t.joueur
  )
  select json_build_object(
    'version', 1,
    'periode', p_periode,
    'jour', to_char(v_jour, 'YYYY-MM-DD'),
    'lundi', to_char(v_lundi, 'YYYY-MM-DD'),
    'joueurs', (select count(*)::int from r),
    'lignes', coalesce((select json_agg(json_build_object('rang', x.rang, 'pseudo', x.pseudo, 'score', x.score, 'vague', x.vague,
                                                          'parties', x.parties, 'moi', x.joueur = p_id) order by x.rang, lower(x.pseudo))
                          from (select * from r order by rang, lower(pseudo) limit v_limite) x), '[]'::json),
    'moi', (select json_build_object('rang', m.rang, 'score', m.score, 'vague', m.vague, 'parties', m.parties) from r m where m.joueur = p_id)
  ) into v_reponse;
  return v_reponse;
end
$$;


-- ─── 5. Les droits : le jeu (anon) n'appelle que les deux fonctions publiques ──────────────────
revoke all on function public.zombies_maintenant() from public, anon, authenticated;
revoke all on function public.zombies_jour(timestamptz) from public, anon, authenticated;
revoke all on function public.zombies_lundi(date) from public, anon, authenticated;
revoke all on function public.zombies_pseudo_propre(text) from public, anon, authenticated;
revoke all on function public.zombies_jeton_valable(text) from public, anon, authenticated;
revoke all on function public.zombies_empreinte(text) from public, anon, authenticated;
revoke all on function public.zombies_borne_score(integer) from public, anon, authenticated;
revoke all on function public.zombies_borne_tues(integer) from public, anon, authenticated;
revoke all on function public.zombies_reponse(text, uuid, date, boolean) from public, anon, authenticated;
revoke all on function public.zombies_publier(uuid, text, text, date, integer, integer, integer) from public;
revoke all on function public.zombies_classement(text, date, uuid, integer) from public;
grant execute on function public.zombies_publier(uuid, text, text, date, integer, integer, integer) to anon, authenticated;
grant execute on function public.zombies_classement(text, date, uuid, integer) to anon, authenticated;

commit;

-- l'API de Supabase relit la liste des fonctions
notify pgrst, 'reload schema';
