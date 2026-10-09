-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement en ligne entre amis
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase : SQL Editor → New query → coller tout → Run.
--  On peut le recoller autant de fois qu'on veut : les joueurs déjà inscrits restent, les fonctions
--  sont remplacées par la nouvelle version, les droits sont remis d'aplomb.
--
--  Ce qu'il installe :
--    · une table public.fournil_joueurs (un joueur = une ligne : son pseudo, sa fortune totale et sa base de la semaine) ;
--    · trois fonctions appelées par le jeu : fournil_publier, fournil_classement, fournil_retirer.
--  Personne ne lit ni n'écrit la table directement : tout passe par ces trois fonctions, qui vérifient tout.
--
--  Les règles du jeu :
--    · le classement porte sur la FORTUNE TOTALE (tout l'argent gagné depuis le début, toutes boutiques confondues) ;
--    · « Cette semaine » = la fortune gagnée depuis lundi minuit, heure de Paris ; « Tous les temps » = la fortune totale ;
--    · chaque joueur a un pseudo (2 à 16 caractères : lettres, accents compris, chiffres, espace, - _ ' .), unique sans
--      tenir compte des majuscules ;
--    · chaque joueur garde sur son téléphone un jeton secret ; ici on ne garde que son empreinte (sha256), jamais le jeton :
--      sans le jeton, impossible d'écraser le score de quelqu'un d'autre ni de le retirer.
--
--  Les garde-fous (pour qu'un petit malin ne puisse ni tricher grossièrement ni tout remplir) :
--    · une fortune doit être un vrai nombre, positif, et sous 1e24 € : un joueur très assidu atteint ~1e19 € en deux mois
--      et ~1e21 € en un an (test/longevite.js) ; au-delà, c'est une valeur bricolée ;
--    · un envoi pris en compte toutes les 10 secondes au plus par joueur (les autres répondent « trop_vite » sans rien changer) ;
--    · 60 nouveaux joueurs par heure au plus, et 2 000 joueurs au plus en tout (largement de quoi inviter des amis) ;
--    · les paramètres sont typés, aucun texte n'est jamais assemblé en SQL : pas d'injection possible.
--
--  Supabase (Postgres 15 ou plus récent), aucune extension nécessaire : sha256() est intégré à Postgres.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. La table des joueurs ────────────────────────────────────────────────────────────────────
create table if not exists public.fournil_joueurs (
  id           uuid primary key,                          -- tiré au hasard par le téléphone, jamais affiché
  jeton        text not null,                             -- EMPREINTE sha256 (hexadécimale) du jeton secret, pas le jeton
  pseudo       text not null,                             -- le nom affiché dans le classement
  fortune      double precision not null default 0,       -- la fortune totale au dernier envoi
  base_semaine double precision not null default 0,       -- la fortune au début de la semaine : gain de la semaine = fortune − base_semaine
  semaine      date not null,                             -- le lundi (heure de Paris) de la semaine de base_semaine
  cree         timestamptz not null default now(),        -- inscription
  maj          timestamptz not null default now()         -- dernier envoi pris en compte
);

comment on table public.fournil_joueurs is
  'Le Fournil : le classement entre amis. Accès uniquement par les fonctions fournil_publier, fournil_classement et fournil_retirer.';

-- un pseudo ne sert qu'une fois, sans tenir compte des majuscules (« Marie » et « MARIE » sont le même pseudo)
create unique index if not exists fournil_joueurs_pseudo on public.fournil_joueurs (lower(pseudo));

-- la sécurité ligne par ligne est activée SANS aucune règle : personne ne voit ni ne touche la table par l'API.
-- On enlève les règles qui auraient pu être ajoutées à la main, pour que ce soit toujours vrai.
alter table public.fournil_joueurs enable row level security;
do $$
declare
  r record;
begin
  for r in select policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'fournil_joueurs' loop
    execute format('drop policy if exists %I on public.fournil_joueurs', r.policyname);
  end loop;
end
$$;

-- aucun droit direct sur la table pour les visiteurs (anon) ni pour les comptes (authenticated) :
-- Supabase en donne par défaut aux nouvelles tables, on les retire explicitement.
revoke all on table public.fournil_joueurs from public;
revoke all on table public.fournil_joueurs from anon;
revoke all on table public.fournil_joueurs from authenticated;


-- ─── 2. Les petites fonctions internes (le jeu ne peut pas les appeler) ─────────────────────────

-- l'heure du serveur, en un seul endroit (les tests la remplacent pour simuler le temps qui passe ;
-- recoller ce fichier la remet à l'heure vraie)
create or replace function public.fournil_maintenant()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now()
$$;

-- le lundi de la semaine, heure de Paris : la semaine change le lundi à minuit à Paris, heure d'été comme d'hiver
create or replace function public.fournil_lundi(p_quand timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', p_quand at time zone 'Europe/Paris')::date
$$;

-- le pseudo nettoyé, ou null s'il n'est pas valable :
--   · forme Unicode composée (é tapé en deux morceaux devient un seul é) ;
--   · apostrophes typographiques ’ ‘ → ' (le clavier des iPhone les met tout seul) ;
--   · les blancs (espaces, tabulations, espaces insécables) deviennent une seule espace, rien au début ni à la fin ;
--   · 2 à 16 caractères : lettres A-Z, lettres accentuées (latin étendu, de À à ɏ, sans × ni ÷), chiffres, espace, - _ ' . ;
--   · au moins une lettre ou un chiffre (pas de pseudo fait que de points ou de tirets).
create or replace function public.fournil_pseudo_propre(p_pseudo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_pseudo is null or length(p_pseudo) > 64 then
    return null;
  end if;
  v := normalize(p_pseudo, NFC);
  v := translate(v, E'’‘', '''''');
  v := btrim(regexp_replace(v, E'[[:space:]    ]+', ' ', 'g'));
  if char_length(v) < 2 or char_length(v) > 16 then
    return null;
  end if;
  if v !~ E'^[0-9A-Za-zÀ-ÖØ-öø-ɏ _''.-]+$' then
    return null;
  end if;
  if v !~ E'[0-9A-Za-zÀ-ÖØ-öø-ɏ]' then
    return null;
  end if;
  return v;
end
$$;

-- un jeton bien formé : 32 à 128 caractères parmi chiffres, lettres, - et _ (le jeu envoie 64 chiffres hexadécimaux)
create or replace function public.fournil_jeton_valable(p_jeton text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_jeton is not null and p_jeton ~ '^[0-9A-Za-z_-]{32,128}$'
$$;

-- l'empreinte gardée en base : sha256 du jeton, en hexadécimal
create or replace function public.fournil_empreinte(p_jeton text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex')
$$;

-- la réponse de fournil_publier : ok/erreur, et, si p_id est donné, les rangs de ce joueur
create or replace function public.fournil_reponse(p_erreur text, p_id uuid, p_lundi date)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'ok', p_erreur is null,
    'erreur', p_erreur,
    'rang_semaine', (
      select (select count(*) from public.fournil_joueurs a
               where a.semaine = p_lundi and a.fortune - a.base_semaine > m.fortune - m.base_semaine)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id and m.semaine = p_lundi),
    'rang_total', (
      select (select count(*) from public.fournil_joueurs a where a.fortune > m.fortune)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id),
    'joueurs', (select count(*)::int from public.fournil_joueurs),
    'joueurs_semaine', (select count(*)::int from public.fournil_joueurs where semaine = p_lundi),
    'semaine', to_char(p_lundi, 'YYYY-MM-DD')
  )
$$;


-- ─── 3. fournil_publier : rejoindre le classement, puis envoyer sa fortune ──────────────────────
-- Réponse : { ok, erreur: null | 'pseudo_pris' | 'pseudo_invalide' | 'jeton' | 'valeur' | 'trop_vite' | 'complet',
--             rang_semaine, rang_total, joueurs (tous les temps), joueurs_semaine, semaine: 'AAAA-MM-JJ' }
-- Premier envoi d'un identifiant : le joueur est inscrit (sa semaine part de zéro).
-- Envois suivants : le jeton doit correspondre ; le pseudo peut changer (s'il est libre).
create or replace function public.fournil_publier(p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi      date := public.fournil_lundi(v_maintenant);
  v_pseudo     text := public.fournil_pseudo_propre(p_pseudo);
  v_fortune    double precision;
  v_empreinte  text;
  v_contrainte text;
  j            public.fournil_joueurs%rowtype;
begin
  -- 1. l'identité : un identifiant et un jeton bien formés
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return public.fournil_reponse('jeton', null, v_lundi);
  end if;
  -- 2. le pseudo
  if v_pseudo is null then
    return public.fournil_reponse('pseudo_invalide', null, v_lundi);
  end if;
  -- 3. la fortune : un vrai nombre (ni NaN ni infini), positif, sous la borne (NaN échoue aussi à la comparaison)
  if p_fortune is null or not (p_fortune >= 0 and p_fortune <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi);
  end if;
  v_fortune := p_fortune + 0; -- un éventuel « −0 » devient 0
  v_empreinte := public.fournil_empreinte(p_jeton);

  select * into j from public.fournil_joueurs where id = p_id for update;

  if found then
    -- ── un joueur déjà inscrit ──
    if j.jeton <> v_empreinte then
      return public.fournil_reponse('jeton', null, v_lundi);
    end if;
    if v_maintenant < j.maj + interval '10 seconds' then
      return public.fournil_reponse('trop_vite', p_id, v_lundi); -- rien ne change, mais on redonne ses rangs
    end if;
    if lower(v_pseudo) <> lower(j.pseudo)
       and exists (select 1 from public.fournil_joueurs where lower(pseudo) = lower(v_pseudo) and id <> p_id) then
      return public.fournil_reponse('pseudo_pris', null, v_lundi);
    end if;
    -- une nouvelle semaine : sa base devient la fortune qu'il avait au dernier envoi
    if j.semaine <> v_lundi then
      j.base_semaine := j.fortune;
      j.semaine := v_lundi;
    end if;
    -- une fortune qui baisse (sauvegarde effacée, nouveau téléphone) : la semaine repart de là, jamais en négatif
    j.base_semaine := least(j.base_semaine, v_fortune);
    begin
      update public.fournil_joueurs
         set pseudo = v_pseudo, fortune = v_fortune, base_semaine = j.base_semaine, semaine = j.semaine, maj = v_maintenant
       where id = p_id;
    exception when unique_violation then
      return public.fournil_reponse('pseudo_pris', null, v_lundi); -- un autre a pris ce pseudo au même instant
    end;
  else
    -- ── une inscription ──
    if (select count(*) from public.fournil_joueurs) >= 2000 then
      return public.fournil_reponse('complet', null, v_lundi);
    end if;
    if (select count(*) from public.fournil_joueurs where cree > v_maintenant - interval '1 hour') >= 60 then
      return public.fournil_reponse('trop_vite', null, v_lundi);
    end if;
    if exists (select 1 from public.fournil_joueurs where lower(pseudo) = lower(v_pseudo)) then
      return public.fournil_reponse('pseudo_pris', null, v_lundi);
    end if;
    begin
      insert into public.fournil_joueurs (id, jeton, pseudo, fortune, base_semaine, semaine, cree, maj)
      values (p_id, v_empreinte, v_pseudo, v_fortune, v_fortune, v_lundi, v_maintenant, v_maintenant);
    exception when unique_violation then
      -- deux envois au même instant : même pseudo pris par un autre, ou le même joueur envoyé deux fois
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'fournil_joueurs_pseudo' then
        return public.fournil_reponse('pseudo_pris', null, v_lundi);
      end if;
      return public.fournil_reponse('trop_vite', null, v_lundi);
    end;
  end if;

  return public.fournil_reponse(null, p_id, v_lundi);
end
$$;


-- ─── 4. fournil_classement : lire le classement ─────────────────────────────────────────────────
-- p_periode : 'semaine' (la fortune gagnée depuis lundi, seulement ceux qui ont joué cette semaine) ou 'total'.
-- p_id : son propre identifiant (facultatif), pour se retrouver même hors des premiers.
-- p_limite : le nombre de lignes (50 par défaut, 100 au plus).
-- Réponse : { semaine: 'AAAA-MM-JJ', periode, joueurs, lignes: [{ rang, pseudo, valeur, moi }], moi: { rang, valeur } | null }
-- Les ex æquo ont le même rang ; jamais d'identifiant ni de jeton dans la réponse.
create or replace function public.fournil_classement(p_periode text, p_id uuid default null, p_limite integer default 50)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lundi  date := public.fournil_lundi(public.fournil_maintenant());
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_res    json;
begin
  if p_periode is null or p_periode not in ('semaine', 'total') then
    raise exception using errcode = '22023', message = 'fournil_classement : période inconnue (« semaine » ou « total »)';
  end if;

  with valeurs as (
    select id, pseudo,
           case when p_periode = 'semaine' then fortune - base_semaine else fortune end as valeur
      from public.fournil_joueurs
     where p_periode = 'total' or semaine = v_lundi
  ), rangs as (
    select id, pseudo, valeur,
           rank() over (order by valeur desc)::int as rang,
           row_number() over (order by valeur desc, lower(pseudo)) as ordre
      from valeurs
  )
  select json_build_object(
           'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
           'periode', p_periode,
           'joueurs', (select count(*)::int from rangs),
           'lignes', coalesce((select json_agg(json_build_object('rang', r.rang, 'pseudo', r.pseudo, 'valeur', r.valeur,
                                                                 'moi', coalesce(r.id = p_id, false)) order by r.ordre)
                                 from rangs r where r.ordre <= v_limite), '[]'::json),
           'moi', (select json_build_object('rang', r.rang, 'valeur', r.valeur) from rangs r where r.id = p_id)
         )
    into v_res;
  return v_res;
end
$$;


-- ─── 5. fournil_retirer : quitter le classement ─────────────────────────────────────────────────
-- Réponse : { ok: true } (retiré, ou déjà absent) ou { ok: false, erreur: 'jeton' } (ce n'est pas son jeton).
create or replace function public.fournil_retirer(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id for update;
  if not found then
    return json_build_object('ok', true, 'erreur', null);
  end if;
  if v_jeton <> public.fournil_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  delete from public.fournil_joueurs where id = p_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 6. Les droits : le jeu n'appelle que les trois fonctions ───────────────────────────────────
-- Postgres et Supabase donnent par défaut le droit d'exécuter les nouvelles fonctions à tout le monde :
-- on le retire partout, puis on le rend seulement pour les trois fonctions du jeu.
revoke all on function public.fournil_maintenant() from public, anon, authenticated;
revoke all on function public.fournil_lundi(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_pseudo_propre(text) from public, anon, authenticated;
revoke all on function public.fournil_jeton_valable(text) from public, anon, authenticated;
revoke all on function public.fournil_empreinte(text) from public, anon, authenticated;
revoke all on function public.fournil_reponse(text, uuid, date) from public, anon, authenticated;

revoke all on function public.fournil_publier(uuid, text, text, double precision) from public;
revoke all on function public.fournil_classement(text, uuid, integer) from public;
revoke all on function public.fournil_retirer(uuid, text) from public;
grant execute on function public.fournil_publier(uuid, text, text, double precision) to anon, authenticated;
grant execute on function public.fournil_classement(text, uuid, integer) to anon, authenticated;
grant execute on function public.fournil_retirer(uuid, text) to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';
