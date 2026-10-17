-- Le Fournil : le chat général (des messages courts, un GIF ou une image, lus par tout le monde, écrits par les joueurs du classement).
-- À coller dans Supabase (SQL Editor → New query → coller → Run), par-dessus le classement (fournil-classement.sql, version 6) ;
-- il se recolle sans casse (les messages restent). Le téléphone n'appelle que ces cinq fonctions :
--   fournil_chat_lire(p_apres, p_limite)          → { ok, messages: [{ n, pseudo, texte, gif, image, cree, moi }], dernier }
--       les messages visibles les plus récents (50 au plus) dont le numéro dépasse p_apres (0 : les 50 derniers), du plus ancien au
--       plus récent ; image : vrai si son image est encore là ; cree : l'heure d'envoi en millisecondes ; dernier : le plus grand
--       numéro visible (0 s'il n'y a rien). Lisible par tous, même sans pseudo. Facultatifs : p_id et p_jeton, pour que « moi »
--       marque ses propres messages (sans eux, ou avec un mauvais jeton, moi est toujours faux, et la lecture marche quand même) ;
--   fournil_chat_image(p_n)                       → { ok, data } : l'image du message (une data URL), null si effacée ou masquée ;
--   fournil_chat_envoyer(p_id, p_jeton, p_texte, p_gif, p_image) → { ok, erreur, n }
--       erreurs : 'jeton' (jeton mal formé ou celui d'un autre), 'inconnu' (pas inscrit au classement), 'banni', 'vide' (ni texte,
--       ni GIF, ni image), 'long' (plus de 300 caractères), 'image' (pas une data URL webp, jpeg, png ou gif en base64, ou plus de
--       480 000 caractères), 'gif' (pas un identifiant GIPHY), 'trop-vite' (moins de 3 s après son message précédent),
--       'quota' (déjà 60 messages dans l'heure) ;
--       le texte est nettoyé : retours à la ligne et tabulations changés en espaces, caractères de contrôle et d'inversion du sens
--       d'écriture retirés, espaces répétés réduits à un seul, espaces du début et de la fin ôtés ;
--       à chaque envoi, le ménage : les images de plus de 7 jours sont effacées (le texte reste), les messages au-delà des
--       2 000 derniers aussi ;
--   fournil_chat_signaler(p_id, p_jeton, p_n)     → { ok, erreur, masque } : un signalement par joueur et par message ; au 3e joueur
--       différent, le message est masqué pour tout le monde. Erreurs : 'jeton', 'inconnu', 'banni', 'soi' (son propre message),
--       'absent' (pas de tel message) ;
--   fournil_chat_effacer(p_id, p_jeton, p_n)      → { ok, erreur } : l'auteur retire son message (masqué, image effacée).
--       Erreurs : 'jeton', 'inconnu', 'pas-a-toi' (le message d'un autre). Un message déjà parti : ok.
-- Les tables sont fermées : personne ne les lit ni ne les écrit depuis le jeu. Un joueur qui quitte le classement (ou que le ménage
-- des 90 jours efface) emporte ses messages, leurs images et ses signalements ; un bannissement, lui, reste.
--
-- Pour le propriétaire, dans le SQL Editor :
--   · voir les signalés (les plus récents d'abord, avec qui les a signalés) :
--       select c.n, c.pseudo, c.texte, c.gif, c.a_image, c.signal, c.masque, c.cree,
--              (select string_agg(j.pseudo, ', ') from public.fournil_chat_signalements s join public.fournil_joueurs j on j.id = s.joueur where s.n = c.n) as par
--       from public.fournil_chat c where c.signal > 0 order by c.n desc limit 50;
--   · voir les derniers messages : select n, pseudo, texte, gif, a_image, masque, signal, cree from public.fournil_chat order by n desc limit 50;
--   · supprimer un message (son image et ses signalements partent avec) : delete from public.fournil_chat where n = 123;
--   · rétablir un message masqué à tort : delete from public.fournil_chat_signalements where n = 123;
--                                        update public.fournil_chat set masque = false, signal = 0 where n = 123;
--   · bannir un pseudo (il ne peut plus écrire ni signaler ; ses messages sont masqués) :
--       insert into public.fournil_chat_bannis (joueur, pseudo, motif)
--       select id, pseudo, 'insultes' from public.fournil_joueurs where pseudo ilike 'Machin'
--       on conflict (joueur) do update set motif = excluded.motif;
--       update public.fournil_chat set masque = true where joueur in (select joueur from public.fournil_chat_bannis);
--     Le bannissement tient par l'identifiant ET par le pseudo : quitter le classement et revenir sous le même pseudo ne suffit pas.
--   · lever un bannissement : delete from public.fournil_chat_bannis where pseudo ilike 'Machin';
--   · voir les bannis : select pseudo, motif, cree from public.fournil_chat_bannis order by cree desc;

begin;

-- ─── 1. Les tables ───
create table if not exists public.fournil_chat (
  n bigserial primary key,
  joueur uuid not null references public.fournil_joueurs (id) on delete cascade,
  pseudo text not null,
  texte text not null default '' check (char_length(texte) <= 300),
  gif text check (gif is null or gif ~ '^[A-Za-z0-9]{5,40}$'),
  a_image boolean not null default false,
  cree timestamptz not null default now(),
  masque boolean not null default false,
  signal integer not null default 0
);
create index if not exists fournil_chat_joueur on public.fournil_chat (joueur, cree);

create table if not exists public.fournil_chat_images (
  n bigint primary key references public.fournil_chat (n) on delete cascade,
  data text not null check (char_length(data) <= 480000),
  cree timestamptz not null default now()
);
create index if not exists fournil_chat_images_cree on public.fournil_chat_images (cree);

create table if not exists public.fournil_chat_signalements (
  n bigint not null references public.fournil_chat (n) on delete cascade,
  joueur uuid not null references public.fournil_joueurs (id) on delete cascade,
  primary key (n, joueur)
);

-- pas de clé étrangère vers fournil_joueurs : le bannissement survit au départ du joueur (sinon quitter le classement l'effacerait)
create table if not exists public.fournil_chat_bannis (
  joueur uuid primary key,
  pseudo text,
  motif text not null default '',
  cree timestamptz not null default now()
);
create index if not exists fournil_chat_bannis_pseudo on public.fournil_chat_bannis (lower(pseudo));

-- fermées : la sécurité ligne par ligne SANS aucune règle (on retire celles ajoutées à la main), aucun droit direct
alter table public.fournil_chat enable row level security;
alter table public.fournil_chat_images enable row level security;
alter table public.fournil_chat_signalements enable row level security;
alter table public.fournil_chat_bannis enable row level security;
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies
            where schemaname = 'public' and tablename in ('fournil_chat', 'fournil_chat_images', 'fournil_chat_signalements', 'fournil_chat_bannis') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;
revoke all on table public.fournil_chat, public.fournil_chat_images, public.fournil_chat_signalements, public.fournil_chat_bannis
  from public, anon, authenticated;
revoke all on sequence public.fournil_chat_n_seq from public, anon, authenticated;

-- ─── 2. Les fonctions internes (le jeu ne peut pas les appeler) ───

-- le joueur est-il bien lui ? null si oui, sinon 'jeton' ou 'inconnu'. Sa ligne est tenue jusqu'à la fin de l'appel : ses envois
-- simultanés passent un à un (les limites de 3 s et de 60 par heure ne se contournent pas en rafale)
create or replace function public.fournil_chat_qui(p_id uuid, p_jeton text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return 'jeton';
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id for update;
  if not found then
    return 'inconnu';
  end if;
  if v_jeton <> public.fournil_empreinte(p_jeton) then
    return 'jeton';
  end if;
  return null;
end
$$;

-- banni ? par son identifiant, ou par son pseudo actuel
create or replace function public.fournil_chat_banni(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.fournil_chat_bannis b
                  where b.joueur = p_id
                     or lower(b.pseudo) = (select lower(j.pseudo) from public.fournil_joueurs j where j.id = p_id))
$$;

-- ─── 3. Les fonctions du jeu ───

create or replace function public.fournil_chat_lire(p_apres bigint default 0, p_limite integer default 50, p_id uuid default null, p_jeton text default null)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_apres  bigint := greatest(coalesce(p_apres, 0), 0);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 50);
  v_moi    uuid;
  v_images timestamptz := public.fournil_maintenant() - interval '7 days';
begin
  -- « moi » seulement avec le bon jeton (sans lui, la lecture marche quand même)
  if p_id is not null and public.fournil_jeton_valable(p_jeton)
     and exists (select 1 from public.fournil_joueurs where id = p_id and jeton = public.fournil_empreinte(p_jeton)) then
    v_moi := p_id;
  end if;
  return json_build_object('ok', true, 'erreur', null,
    'messages', coalesce((
      select json_agg(json_build_object('n', m.n, 'pseudo', m.pseudo, 'texte', m.texte, 'gif', m.gif,
                                        'image', m.image, 'cree', m.cree, 'moi', m.moi) order by m.n)
      from (select c.n, c.pseudo, c.texte, c.gif,
                   exists (select 1 from public.fournil_chat_images i where i.n = c.n and i.cree > v_images) as image,
                   floor(extract(epoch from c.cree) * 1000)::bigint as cree,
                   (v_moi is not null and c.joueur = v_moi) as moi
              from public.fournil_chat c
             where c.n > v_apres and not c.masque
             order by c.n desc
             limit v_limite) m
    ), '[]'::json),
    'dernier', coalesce((select max(c.n) from public.fournil_chat c where not c.masque), 0));
end
$$;

create or replace function public.fournil_chat_image(p_n bigint)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('ok', true, 'erreur', null, 'data', (
    select i.data from public.fournil_chat_images i join public.fournil_chat c on c.n = i.n
     where i.n = p_n and not c.masque and i.cree > public.fournil_maintenant() - interval '7 days'))
$$;

create or replace function public.fournil_chat_envoyer(p_id uuid, p_jeton text, p_texte text, p_gif text, p_image text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text;
  v_texte      text := '';
  v_gif        text := nullif(p_gif, '');
  v_image      text := nullif(p_image, '');
  v_pseudo     text;
  v_n          bigint;
begin
  v_erreur := public.fournil_chat_qui(p_id, p_jeton); -- tient sa ligne : ses envois simultanés passent un à un
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'n', null);
  end if;
  if public.fournil_chat_banni(p_id) then
    return json_build_object('ok', false, 'erreur', 'banni', 'n', null);
  end if;
  -- le texte nettoyé (un texte énorme est refusé avant d'être parcouru)
  if p_texte is not null then
    if char_length(p_texte) > 3000 then
      return json_build_object('ok', false, 'erreur', 'long', 'n', null);
    end if;
    v_texte := regexp_replace(p_texte, '[\t\n\r\u000b\u000c\u0085\u2028\u2029]', ' ', 'g');
    v_texte := regexp_replace(v_texte, '[\u0001-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]', '', 'g');
    v_texte := btrim(regexp_replace(v_texte, ' {2,}', ' ', 'g'));
  end if;
  if v_texte = '' and v_gif is null and v_image is null then
    return json_build_object('ok', false, 'erreur', 'vide', 'n', null);
  end if;
  if char_length(v_texte) > 300 then
    return json_build_object('ok', false, 'erreur', 'long', 'n', null);
  end if;
  if v_image is not null and (char_length(v_image) > 480000 or v_image !~ '^data:image/(webp|jpeg|png|gif);base64,[A-Za-z0-9+/]+={0,2}$') then
    return json_build_object('ok', false, 'erreur', 'image', 'n', null);
  end if;
  if v_gif is not null and v_gif !~ '^[A-Za-z0-9]{5,40}$' then
    return json_build_object('ok', false, 'erreur', 'gif', 'n', null);
  end if;
  -- les limites : un message toutes les 3 s, 60 par heure (effacés et masqués compris)
  if exists (select 1 from public.fournil_chat where joueur = p_id and cree > v_maintenant - interval '3 seconds') then
    return json_build_object('ok', false, 'erreur', 'trop-vite', 'n', null);
  end if;
  if (select count(*) from public.fournil_chat where joueur = p_id and cree > v_maintenant - interval '1 hour') >= 60 then
    return json_build_object('ok', false, 'erreur', 'quota', 'n', null);
  end if;

  select pseudo into v_pseudo from public.fournil_joueurs where id = p_id;
  insert into public.fournil_chat (joueur, pseudo, texte, gif, a_image, cree)
  values (p_id, v_pseudo, v_texte, v_gif, v_image is not null, v_maintenant)
  returning n into v_n;
  if v_image is not null then
    insert into public.fournil_chat_images (n, data, cree) values (v_n, v_image, v_maintenant);
  end if;

  -- le ménage : les images de plus de 7 jours, les messages au-delà des 2 000 derniers (une ligne qu'un autre appel tient en ce
  -- moment est laissée pour le suivant : le ménage n'attend personne)
  delete from public.fournil_chat_images
   where n in (select i.n from public.fournil_chat_images i where i.cree <= v_maintenant - interval '7 days' for update skip locked);
  delete from public.fournil_chat
   where n in (select c.n from public.fournil_chat c
                where c.n <= coalesce((select d.n from public.fournil_chat d order by d.n desc offset 2000 limit 1), 0)
                for update skip locked);

  return json_build_object('ok', true, 'erreur', null, 'n', v_n);
end
$$;

create or replace function public.fournil_chat_signaler(p_id uuid, p_jeton text, p_n bigint)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_chat_qui(p_id, p_jeton);
  v_auteur uuid;
  v_masque boolean;
  v_k      integer;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'masque', null);
  end if;
  if public.fournil_chat_banni(p_id) then
    return json_build_object('ok', false, 'erreur', 'banni', 'masque', null);
  end if;
  select joueur, masque into v_auteur, v_masque from public.fournil_chat where n = p_n for update; -- les signalements simultanés passent un à un
  if not found then
    return json_build_object('ok', false, 'erreur', 'absent', 'masque', null);
  end if;
  if v_auteur = p_id then
    return json_build_object('ok', false, 'erreur', 'soi', 'masque', v_masque);
  end if;
  insert into public.fournil_chat_signalements (n, joueur) values (p_n, p_id) on conflict do nothing;
  get diagnostics v_k = row_count;
  if v_k > 0 then
    update public.fournil_chat
       set signal = (select count(*) from public.fournil_chat_signalements s where s.n = p_n),
           masque = masque or (select count(*) from public.fournil_chat_signalements s where s.n = p_n) >= 3
     where n = p_n
    returning masque into v_masque;
  end if;
  return json_build_object('ok', true, 'erreur', null, 'masque', v_masque);
end
$$;

create or replace function public.fournil_chat_effacer(p_id uuid, p_jeton text, p_n bigint)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_chat_qui(p_id, p_jeton);
  v_auteur uuid;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  select joueur into v_auteur from public.fournil_chat where n = p_n for update;
  if not found then
    return json_build_object('ok', true, 'erreur', null);
  end if;
  if v_auteur <> p_id then
    return json_build_object('ok', false, 'erreur', 'pas-a-toi');
  end if;
  update public.fournil_chat set masque = true where n = p_n;
  delete from public.fournil_chat_images where n = p_n;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── 4. Les droits : les fonctions internes fermées, les cinq du jeu ouvertes ───
revoke all on function public.fournil_chat_qui(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_chat_banni(uuid) from public, anon, authenticated;
revoke all on function public.fournil_chat_lire(bigint, integer, uuid, text) from public;
revoke all on function public.fournil_chat_image(bigint) from public;
revoke all on function public.fournil_chat_envoyer(uuid, text, text, text, text) from public;
revoke all on function public.fournil_chat_signaler(uuid, text, bigint) from public;
revoke all on function public.fournil_chat_effacer(uuid, text, bigint) from public;
grant execute on function public.fournil_chat_lire(bigint, integer, uuid, text) to anon, authenticated;
grant execute on function public.fournil_chat_image(bigint) to anon, authenticated;
grant execute on function public.fournil_chat_envoyer(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.fournil_chat_signaler(uuid, text, bigint) to anon, authenticated;
grant execute on function public.fournil_chat_effacer(uuid, text, bigint) to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';

-- le résultat attendu : une ligne « le chat est prêt », 5 fonctions ouvertes au jeu, 4 tables fermées, et le nombre de messages
select 'le chat est prêt' as etat,
  (select count(*) from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'fournil\_chat\_%' and has_function_privilege('anon', p.oid, 'execute')) as fonctions_ouvertes,
  (select count(*) from pg_catalog.pg_class t
    where t.relnamespace = 'public'::regnamespace and t.relkind = 'r' and t.relname like 'fournil\_chat%' and t.relrowsecurity
      and not has_table_privilege('anon', t.oid, 'select')) as tables_fermees,
  (select count(*) from public.fournil_chat) as messages;
