-- Le Fournil : les cadeaux (des euros offerts à un joueur, déposés à la main dans le SQL Editor, reçus par son jeu à l'ouverture).
-- À coller une fois dans Supabase (SQL Editor → New query → coller → Run), par-dessus le classement (fournil-classement.sql) ;
-- il se recolle sans casse. Le téléphone n'appelle que deux fonctions, vérifiées par le jeton du joueur :
--   fournil_mes_cadeaux(p_id, p_jeton)          → { ok, cadeaux: [{ n, montant, motif }] } : ses cadeaux pas encore reçus
--   fournil_cadeau_recu(p_id, p_jeton, p_n)     → { ok } : ce cadeau est arrivé dans sa boutique (il ne revient plus)
-- La table est fermée : personne ne la lit ni ne l'écrit depuis le jeu ; seul le SQL Editor (le propriétaire) y dépose un cadeau :
--   insert into public.fournil_cadeaux (joueur, montant, motif)
--   select id, 3e12, 'Pour l''absence de ce matin' from public.fournil_joueurs where pseudo ilike 'Adolf enYz'
--   returning n, montant, motif;
-- (3e12 = 3 Bn € dans le jeu : k = 1e3, M = 1e6, Md = 1e9, Bn = 1e12)

create table if not exists public.fournil_cadeaux (
  n bigserial primary key,
  joueur uuid not null references public.fournil_joueurs (id) on delete cascade,
  montant double precision not null check (montant > 0 and montant <= 1e30),
  motif text not null default '' check (char_length(motif) <= 120),
  cree timestamptz not null default now(),
  recu timestamptz
);
create index if not exists fournil_cadeaux_joueur on public.fournil_cadeaux (joueur) where recu is null;
alter table public.fournil_cadeaux enable row level security;
revoke all on table public.fournil_cadeaux from public, anon, authenticated;
revoke all on sequence public.fournil_cadeaux_n_seq from public, anon, authenticated;

-- le joueur est-il bien lui ? (même vérification que fournil_vu) : null si oui, sinon l'erreur
create or replace function public.fournil_cadeau_qui(p_id uuid, p_jeton text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return 'jeton';
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id;
  if not found then
    return 'inconnu';
  end if;
  if v_jeton <> public.fournil_empreinte(p_jeton) then
    return 'jeton';
  end if;
  return null;
end
$$;

create or replace function public.fournil_mes_cadeaux(p_id uuid, p_jeton text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.fournil_cadeau_qui(p_id, p_jeton);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'erreur', v_err, 'cadeaux', '[]'::json);
  end if;
  return json_build_object('ok', true, 'erreur', null, 'cadeaux', coalesce((
    select json_agg(json_build_object('n', c.n, 'montant', c.montant, 'motif', c.motif) order by c.n)
    from (select n, montant, motif from public.fournil_cadeaux where joueur = p_id and recu is null order by n limit 20) c
  ), '[]'::json));
end
$$;

create or replace function public.fournil_cadeau_recu(p_id uuid, p_jeton text, p_n bigint)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_err text := public.fournil_cadeau_qui(p_id, p_jeton);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'erreur', v_err);
  end if;
  update public.fournil_cadeaux set recu = now() where n = p_n and joueur = p_id and recu is null;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- les droits : la vérification interne fermée, les deux fonctions du jeu ouvertes
revoke all on function public.fournil_cadeau_qui(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_mes_cadeaux(uuid, text) from public;
revoke all on function public.fournil_cadeau_recu(uuid, text, bigint) from public;
grant execute on function public.fournil_mes_cadeaux(uuid, text) to anon, authenticated;
grant execute on function public.fournil_cadeau_recu(uuid, text, bigint) to anon, authenticated;
