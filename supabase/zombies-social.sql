-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Dernier Rempart — le SOCIAL : profils et classement mondial, amis (statut en direct, invitations), file pour jouer avec un inconnu
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase (SQL Editor → New query → Run), APRÈS supabase/zombies-defi.sql (il en reprend les joueurs : même
--  identifiant, même jeton secret, même pseudo). On peut le recoller sans rien perdre ; il ne touche ni au Fournil ni à Poncin.
--
--  Ce qu'il installe :
--    · public.zombies_profils : le profil public de chaque joueur (meilleur score et meilleure vague en partie libre, échelon de
--      l'Ascension, points de duel, victoires d'Infection, zombies abattus en tout, le survivant porté) et son statut en direct
--      (« menu », « jeu », ou le code du salon où il attend) ;
--    · public.zombies_amis : qui suit qui (un ami = un pseudo ajouté ; on voit le statut de ceux qu'on a ajoutés) ;
--    · public.zombies_file : la file d'attente pour jouer avec un inconnu (un salon ouvert, son mode, depuis quand) ;
--    · cinq fonctions : zombies_profil_publier, zombies_mondial, zombies_amis_liste, zombies_ami (ajouter / retirer), zombies_file_rejoindre.
--  Personne ne lit ni n'écrit les tables directement.
--
--  Les garde-fous : jeton obligatoire pour tout ce qui écrit ; valeurs bornées (vague ≤ 400, échelon ≤ 100 000, score ≤ la borne du défi
--  pour la vague) ; un profil publié toutes les 10 s au plus ; 100 amis au plus ; le statut et la file s'effacent d'eux-mêmes (4 min,
--  90 s) ; un code de salon : 4 lettres majuscules.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.zombies_profils (
  joueur   uuid primary key references public.zombies_joueurs (id) on delete cascade,
  score    integer not null default 0,
  vague    integer not null default 0,
  echelon  integer not null default 0,
  duel     integer not null default 0,
  infection integer not null default 0,
  tues     bigint not null default 0,
  skin     text not null default 'gardien',
  statut   text not null default 'menu',
  vu       timestamptz,
  maj      timestamptz not null
);
create table if not exists public.zombies_amis (
  joueur uuid not null references public.zombies_joueurs (id) on delete cascade,
  ami    uuid not null references public.zombies_joueurs (id) on delete cascade,
  depuis timestamptz not null,
  primary key (joueur, ami)
);
create table if not exists public.zombies_file (
  joueur uuid primary key references public.zombies_joueurs (id) on delete cascade,
  code   text not null,
  mode   text not null,
  depuis timestamptz not null
);
alter table public.zombies_profils enable row level security;
alter table public.zombies_amis enable row level security;
alter table public.zombies_file enable row level security;
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename in ('zombies_profils', 'zombies_amis', 'zombies_file') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;
revoke all on table public.zombies_profils, public.zombies_amis, public.zombies_file from public, anon, authenticated;

-- le joueur dont le jeton correspond (null sinon)
create or replace function public.zombies_qui(p_id uuid, p_jeton text)
returns uuid language sql stable set search_path = ''
as $$ select j.id from public.zombies_joueurs j where p_id is not null and public.zombies_jeton_valable(p_jeton) and j.id = p_id and j.jeton = public.zombies_empreinte(p_jeton) $$;

-- un statut lisible : « menu », « jeu », ou « salon:ABCD:coop » (coop, cps, duel)
create or replace function public.zombies_statut_propre(p text)
returns text language sql immutable set search_path = ''
as $$ select case when p in ('menu', 'jeu') then p when p ~ '^salon:[A-Z]{4}:(coop|cps|duel)$' then p else 'menu' end $$;

-- ─── publier son profil (et son statut) ; sans valeurs : le statut seul ───
create or replace function public.zombies_profil_publier(p_id uuid, p_jeton text, p_statut text default null,
  p_score integer default null, p_vague integer default null, p_echelon integer default null, p_duel integer default null,
  p_infection integer default null, p_tues bigint default null, p_skin text default null)
returns json language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.zombies_maintenant();
  v_id uuid := public.zombies_qui(p_id, p_jeton);
  p public.zombies_profils%rowtype;
  v_valeurs boolean := p_score is not null or p_vague is not null or p_echelon is not null or p_duel is not null or p_infection is not null or p_tues is not null;
begin
  if v_id is null then return json_build_object('ok', false, 'erreur', 'jeton'); end if;
  if v_valeurs and (coalesce(p_vague, 0) < 0 or coalesce(p_vague, 0) > 400 or coalesce(p_score, 0) < 0 or coalesce(p_score, 0) > public.zombies_borne_score(greatest(1, coalesce(p_vague, 1)))
     or coalesce(p_echelon, 0) < 0 or coalesce(p_echelon, 0) > 100000 or coalesce(p_duel, 0) < 0 or coalesce(p_duel, 0) > 1000000
     or coalesce(p_infection, 0) < 0 or coalesce(p_infection, 0) > 1000000 or coalesce(p_tues, 0) < 0 or coalesce(p_tues, 0) > 100000000) then
    return json_build_object('ok', false, 'erreur', 'valeur');
  end if;
  select * into p from public.zombies_profils where joueur = v_id for update;
  if not found then
    insert into public.zombies_profils (joueur, maj) values (v_id, v_maintenant - interval '1 minute');
    select * into p from public.zombies_profils where joueur = v_id for update;
  end if;
  if v_valeurs and v_maintenant < p.maj + interval '10 seconds' then return json_build_object('ok', false, 'erreur', 'trop_vite'); end if;
  update public.zombies_profils set
    score = greatest(score, coalesce(p_score, 0)), vague = greatest(vague, coalesce(p_vague, 0)), echelon = greatest(echelon, coalesce(p_echelon, 0)),
    duel = coalesce(p_duel, duel), infection = greatest(infection, coalesce(p_infection, 0)), tues = greatest(tues, coalesce(p_tues, 0)),
    skin = case when p_skin ~ '^[a-z]{2,16}$' then p_skin else skin end,
    statut = case when p_statut is null then statut else public.zombies_statut_propre(p_statut) end,
    vu = v_maintenant, maj = case when v_valeurs then v_maintenant else maj end
  where joueur = v_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── le classement mondial (top 1000) : p_critere 'score' | 'vague' | 'echelon' | 'duel' | 'infection' | 'tues' ───
create or replace function public.zombies_mondial(p_critere text, p_id uuid default null, p_limite integer default 100)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare v_limite integer := greatest(1, least(coalesce(p_limite, 100), 1000)); v json;
begin
  if p_critere is null or p_critere not in ('score', 'vague', 'echelon', 'duel', 'infection', 'tues') then return json_build_object('erreur', 'critere'); end if;
  with t as (
    select p.joueur, j.pseudo, p.skin, case p_critere when 'score' then p.score when 'vague' then p.vague when 'echelon' then p.echelon when 'duel' then p.duel when 'infection' then p.infection else p.tues end::bigint as valeur,
           (p.vu is not null and p.vu > public.zombies_maintenant() - interval '4 minutes') as en_ligne
      from public.zombies_profils p join public.zombies_joueurs j on j.id = p.joueur
  ), r as (select t.*, (rank() over (order by valeur desc))::int as rang from t where valeur > 0)
  select json_build_object('version', 1, 'critere', p_critere, 'joueurs', (select count(*)::int from r),
    'lignes', coalesce((select json_agg(json_build_object('rang', x.rang, 'pseudo', x.pseudo, 'valeur', x.valeur, 'skin', x.skin, 'en_ligne', x.en_ligne, 'moi', x.joueur = p_id) order by x.rang, lower(x.pseudo))
                        from (select * from r order by rang, lower(pseudo) limit v_limite) x), '[]'::json),
    'moi', (select json_build_object('rang', m.rang, 'valeur', m.valeur) from r m where m.joueur = p_id)) into v;
  return v;
end
$$;

-- ─── ajouter (ou retirer) un ami par son pseudo ───
create or replace function public.zombies_ami(p_id uuid, p_jeton text, p_pseudo text, p_retirer boolean default false)
returns json language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid := public.zombies_qui(p_id, p_jeton); v_ami uuid;
begin
  if v_id is null then return json_build_object('ok', false, 'erreur', 'jeton'); end if;
  select id into v_ami from public.zombies_joueurs where lower(pseudo) = lower(public.zombies_pseudo_propre(p_pseudo));
  if v_ami is null then return json_build_object('ok', false, 'erreur', 'inconnu'); end if;
  if v_ami = v_id then return json_build_object('ok', false, 'erreur', 'soi'); end if;
  if coalesce(p_retirer, false) then delete from public.zombies_amis where joueur = v_id and ami = v_ami; return json_build_object('ok', true, 'erreur', null); end if;
  if (select count(*) from public.zombies_amis where joueur = v_id) >= 100 then return json_build_object('ok', false, 'erreur', 'complet'); end if;
  insert into public.zombies_amis (joueur, ami, depuis) values (v_id, v_ami, public.zombies_maintenant()) on conflict do nothing;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── ses amis : leur profil, s'ils sont en ligne (vu il y a moins de 4 min), et le salon où ils attendent ───
create or replace function public.zombies_amis_liste(p_id uuid, p_jeton text)
returns json language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid := public.zombies_qui(p_id, p_jeton); v json;
begin
  if v_id is null then return json_build_object('ok', false, 'erreur', 'jeton'); end if;
  select json_build_object('ok', true, 'erreur', null, 'amis', coalesce(json_agg(json_build_object(
      'pseudo', j.pseudo, 'skin', coalesce(p.skin, 'gardien'), 'score', coalesce(p.score, 0), 'vague', coalesce(p.vague, 0), 'echelon', coalesce(p.echelon, 0), 'duel', coalesce(p.duel, 0),
      'en_ligne', coalesce(p.vu > public.zombies_maintenant() - interval '4 minutes', false),
      'statut', case when coalesce(p.vu > public.zombies_maintenant() - interval '4 minutes', false) then coalesce(p.statut, 'menu') else 'absent' end
    ) order by (p.vu is not null and p.vu > public.zombies_maintenant() - interval '4 minutes') desc, lower(j.pseudo)), '[]'::json))
    into v
    from public.zombies_amis a join public.zombies_joueurs j on j.id = a.ami left join public.zombies_profils p on p.joueur = a.ami
   where a.joueur = v_id;
  return v;
end
$$;

-- ─── jouer avec un inconnu : la file d'attente. On propose son salon (p_code) ; s'il y a déjà quelqu'un qui attend dans ce mode
-- (depuis moins de 90 s), on reçoit SON code (et il quitte la file) ; sinon on attend, son code dans la file. p_code null : quitter la file.
create or replace function public.zombies_file_rejoindre(p_id uuid, p_jeton text, p_mode text, p_code text)
returns json language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid := public.zombies_qui(p_id, p_jeton); v_maintenant timestamptz := public.zombies_maintenant(); f public.zombies_file%rowtype;
begin
  if v_id is null then return json_build_object('ok', false, 'erreur', 'jeton'); end if;
  delete from public.zombies_file where depuis < v_maintenant - interval '90 seconds' or joueur = v_id;
  if p_code is null then return json_build_object('ok', true, 'erreur', null, 'code', null); end if;
  if p_mode is null or p_mode not in ('coop', 'cps', 'duel') or p_code !~ '^[A-Z]{4}$' then return json_build_object('ok', false, 'erreur', 'valeur'); end if;
  perform pg_catalog.pg_advisory_xact_lock(7231004);
  select * into f from public.zombies_file where mode = p_mode order by depuis limit 1 for update;
  if found then delete from public.zombies_file where joueur = f.joueur; return json_build_object('ok', true, 'erreur', null, 'code', f.code, 'trouve', true); end if;
  insert into public.zombies_file (joueur, code, mode, depuis) values (v_id, p_code, p_mode, v_maintenant);
  return json_build_object('ok', true, 'erreur', null, 'code', p_code, 'trouve', false);
end
$$;

revoke all on function public.zombies_qui(uuid, text) from public, anon, authenticated;
revoke all on function public.zombies_statut_propre(text) from public, anon, authenticated;
revoke all on function public.zombies_profil_publier(uuid, text, text, integer, integer, integer, integer, integer, bigint, text) from public;
revoke all on function public.zombies_mondial(text, uuid, integer) from public;
revoke all on function public.zombies_ami(uuid, text, text, boolean) from public;
revoke all on function public.zombies_amis_liste(uuid, text) from public;
revoke all on function public.zombies_file_rejoindre(uuid, text, text, text) from public;
grant execute on function public.zombies_profil_publier(uuid, text, text, integer, integer, integer, integer, integer, bigint, text) to anon, authenticated;
grant execute on function public.zombies_mondial(text, uuid, integer) to anon, authenticated;
grant execute on function public.zombies_ami(uuid, text, text, boolean) to anon, authenticated;
grant execute on function public.zombies_amis_liste(uuid, text) to anon, authenticated;
grant execute on function public.zombies_file_rejoindre(uuid, text, text, text) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
