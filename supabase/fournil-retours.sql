-- Le Fournil : les idées et les bugs (envoyés par les joueurs du classement, lus par l'admin seulement) et les votes (créés par
-- l'admin, ouverts à tous, votés par les joueurs du classement).
-- À coller dans Supabase (SQL Editor → New query → coller → Run), par-dessus le classement (fournil-classement.sql, version 6) et,
-- s'il est là, le chat (fournil-chat.sql) ; il se recolle sans casse (retours, votes et admins restent).
-- Le téléphone n'appelle que ces neuf fonctions (les dates sont en millisecondes, les options numérotées à partir de 0) :
--   fournil_retour_envoyer(p_id, p_jeton, p_type, p_texte, p_image, p_infos) → { ok, erreur, n }
--       p_type : 'idee' ou 'bug' ; p_texte : 1 000 caractères au plus (les retours à la ligne restent ; tabulations en espaces,
--       caractères de contrôle et d'inversion du sens d'écriture retirés, espaces répétés réduits, plus de deux lignes vides de
--       suite réduites, bords ôtés) ; p_image : null, ou une data URL webp, jpeg ou png en base64 de 480 000 caractères au plus ;
--       p_infos : un objet JSON (version du jeu, appareil, extrait du journal), 2 Ko au plus (plus gros : remplacé par
--       { "trop_long": true } ; pas un objet : ignoré ; le retour part quand même).
--       Erreurs : 'jeton' (jeton mal formé ou celui d'un autre), 'inconnu' (pas inscrit au classement), 'banni' (banni du chat),
--       'vide' (pas de texte), 'long' (plus de 1 000 caractères), 'image', 'type', 'trop-vite' (moins de 30 s après son retour
--       précédent), 'quota' (déjà 5 retours aujourd'hui, heure de Paris).
--       Chaque admin abonné aux notifications est prévenu (« Nouvelle idée de X » / « Bug signalé par X »), sauf l'auteur lui-même
--       et sauf pour les joueurs de test du workflow (pseudo « ci-… » ou « test-ci-… »).
--   fournil_votes_ouverts(p_id, p_jeton)          → { ok, votes: [vote], finis: [vote] }
--       vote : { n, question, options: [textes], fin, voix: [un nombre par option], total, moi: l'option choisie | null } ;
--       votes : les votes en cours (10 au plus, le plus récent d'abord) ; finis : les 5 derniers finis (ou fermés) depuis 7 jours.
--       Lisible par tous, même sans pseudo ; p_id et p_jeton (facultatifs) ne servent qu'à remplir « moi ».
--   fournil_voter(p_id, p_jeton, p_n, p_option)  → { ok, erreur, voix, total }
--       un choix par joueur et par vote ; voter à nouveau change son choix, tant que le vote n'est pas fini.
--       Erreurs : 'jeton', 'inconnu', 'absent' (pas de tel vote), 'fini' (fini ou fermé), 'option' (pas une option du vote) ;
--       voix et total sont rendus dès que le vote existe (même 'fini' ou 'option'), null sinon.
-- Celles de l'admin (ouvertes à anon, mais refusées avec l'erreur 'pas-admin' si le joueur n'est pas dans fournil_admins ;
-- 'jeton' et 'inconnu' d'abord, comme ailleurs) :
--   fournil_admin_moi(p_id, p_jeton)              → { ok, erreur, admin } (admin : vrai ou faux ; un joueur ordinaire : ok, faux)
--   fournil_admin_retours(p_id, p_jeton, p_filtre, p_avant) → { ok, erreur, retours: [{ n, pseudo, type, texte, a_image, infos,
--       cree, etat, note }], nouveaux } : 30 retours par page, du plus récent au plus ancien ; p_filtre 'nouveau' (les retours
--       « nouveau » seulement) ou 'tout' ; p_avant : le numéro du dernier retour de la page précédente (null : la première page) ;
--       nouveaux : le nombre de retours « nouveau » en tout (la pastille).
--   fournil_admin_retour_image(p_id, p_jeton, p_n) → { ok, erreur, data } : la data URL de la capture, null si aucune (ou effacée)
--   fournil_admin_retour_etat(p_id, p_jeton, p_n, p_etat, p_note) → { ok, erreur } : p_etat 'nouveau', 'vu', 'fait' ou 'refuse' ;
--       p_note : 300 caractères au plus (null : la note ne change pas). Erreurs en plus : 'absent', 'etat', 'long'.
--   fournil_admin_vote_creer(p_id, p_jeton, p_question, p_options, p_heures) → { ok, erreur, n } : question de 1 à 200
--       caractères, 2 à 4 options (des textes de 1 à 60 caractères, tous différents), ouvert p_heures heures (1 à 168).
--       Erreurs en plus : 'question', 'options', 'duree'. Chaque joueur abonné aux notifications d'événements est prévenu
--       (« Nouveau vote : … »).
--   fournil_admin_vote_fermer(p_id, p_jeton, p_n) → { ok, erreur } : le vote finit tout de suite. Erreur en plus : 'absent'.
-- Le ménage, à chaque envoi de retour, vote ou création de vote : les captures de plus de 30 jours sont effacées (le texte
-- reste) ; les choix des votes finis depuis plus de 60 jours aussi.
-- Les tables sont fermées : personne ne les lit ni ne les écrit depuis le jeu. Un joueur qui quitte le classement (ou que le ménage
-- des 90 jours efface) emporte ses retours, ses choix et sa place d'admin ; ses votes créés restent.
-- Les notifications passent par la file de la v6 (fournil_notifs) avec deux nouveaux types, 'retour' et 'vote' : ce script élargit
-- la liste des types de la file et fournil_notif_permise ('vote' suit la case « événements »).
--
-- Pour le propriétaire, dans le SQL Editor :
--   · me rendre admin (le joueur du classement au pseudo lebigt69) :
--       insert into public.fournil_admins (joueur, pseudo) select id, pseudo from public.fournil_joueurs where pseudo ilike 'lebigt69' on conflict do nothing;
--   · retirer un admin :
--       delete from public.fournil_admins where pseudo ilike 'Machin' or joueur in (select id from public.fournil_joueurs where pseudo ilike 'Machin');
--   · voir les admins : select pseudo, cree from public.fournil_admins order by cree;
--   · lire les retours à la main (les plus récents d'abord) :
--       select n, pseudo, type, etat, texte, infos, image is not null as capture, note, cree from public.fournil_retours order by n desc limit 50;
--   · une capture (la data URL, à coller dans la barre d'adresse d'un navigateur) : select image from public.fournil_retours where n = 123;
--   · marquer un retour : update public.fournil_retours set etat = 'fait', note = 'Dans la prochaine version', maj = now() where n = 123;
--   · voir les votes et leurs voix :
--       select v.n, v.question, v.options, v.fin, v.ferme,
--              (select json_object_agg(c.option, c.k order by c.option) from (select option, count(*) as k from public.fournil_votes_choix where n = v.n group by option) c) as voix
--       from public.fournil_votes v order by v.n desc limit 20;
--   · fermer un vote : update public.fournil_votes set ferme = true, fin = least(fin, now()) where n = 3;

begin;

-- ─── 1. Les tables ───
create table if not exists public.fournil_admins (
  joueur uuid primary key references public.fournil_joueurs (id) on delete cascade,
  pseudo text,
  cree timestamptz not null default now()
);

create table if not exists public.fournil_retours (
  n bigserial primary key,
  joueur uuid not null references public.fournil_joueurs (id) on delete cascade,
  pseudo text not null,
  type text not null check (type in ('idee', 'bug')),
  texte text not null check (char_length(texte) between 1 and 1000),
  image text check (image is null or (char_length(image) <= 480000 and image ~ '^data:image/(webp|jpeg|png);base64,')),
  infos jsonb check (infos is null or (jsonb_typeof(infos) = 'object' and octet_length(infos::text) <= 2048)),
  cree timestamptz not null default now(),
  etat text not null default 'nouveau' check (etat in ('nouveau', 'vu', 'fait', 'refuse')),
  note text not null default '' check (char_length(note) <= 300),
  maj timestamptz not null default now()
);
create index if not exists fournil_retours_joueur on public.fournil_retours (joueur, cree);
create index if not exists fournil_retours_nouveaux on public.fournil_retours (n) where etat = 'nouveau';
create index if not exists fournil_retours_images on public.fournil_retours (cree) where image is not null;

-- cree_par : l'admin qui l'a créé ; s'il quitte le classement, le vote reste (sans auteur)
create table if not exists public.fournil_votes (
  n bigserial primary key,
  question text not null check (char_length(question) between 1 and 200),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  debut timestamptz not null default now(),
  fin timestamptz not null,
  cree_par uuid references public.fournil_joueurs (id) on delete set null,
  ferme boolean not null default false
);
create index if not exists fournil_votes_fin on public.fournil_votes (fin);

create table if not exists public.fournil_votes_choix (
  n bigint not null references public.fournil_votes (n) on delete cascade,
  joueur uuid not null references public.fournil_joueurs (id) on delete cascade,
  option integer not null check (option between 0 and 3),
  quand timestamptz not null default now(),
  primary key (n, joueur)
);
create index if not exists fournil_votes_choix_joueur on public.fournil_votes_choix (joueur);

-- fermées : la sécurité ligne par ligne SANS aucune règle (on retire celles ajoutées à la main), aucun droit direct
alter table public.fournil_admins enable row level security;
alter table public.fournil_retours enable row level security;
alter table public.fournil_votes enable row level security;
alter table public.fournil_votes_choix enable row level security;
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies
            where schemaname = 'public' and tablename in ('fournil_admins', 'fournil_retours', 'fournil_votes', 'fournil_votes_choix') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;
revoke all on table public.fournil_admins, public.fournil_retours, public.fournil_votes, public.fournil_votes_choix
  from public, anon, authenticated;
revoke all on sequence public.fournil_retours_n_seq, public.fournil_votes_n_seq from public, anon, authenticated;

-- la file des notifications de la v6 : deux types de plus, 'retour' (pour l'admin) et 'vote'
alter table public.fournil_notifs drop constraint if exists fournil_notifs_type_check;
alter table public.fournil_notifs add constraint fournil_notifs_type_check
  check (type in ('pleine', 'pourboire', 'evenement', 'objectif', 'essai', 'retour', 'vote'));

-- ─── 2. Les fonctions internes (le jeu ne peut pas les appeler) ───

-- ce joueur veut-il ce type de notification ? (la même que dans fournil-classement.sql, qui connaît aussi ces deux types :
-- recoller l'un ou l'autre ne perd rien). 'vote' suit la case « événements » ; 'retour' (réservé aux admins) : un appareil suffit
create or replace function public.fournil_notif_permise(p_joueur uuid, p_type text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.fournil_abonnements a where a.joueur = p_joueur)
     and (p_type in ('essai', 'retour') or coalesce((select case p_type when 'pleine' then p.pleine when 'pourboire' then p.pourboires
                                                           when 'evenement' then p.evenements when 'vote' then p.evenements
                                                           when 'objectif' then p.objectif else false end
                                          from public.fournil_notif_prefs p where p.id = p_joueur), false))
$$;

-- le joueur est-il bien lui ? null si oui, sinon 'jeton' ou 'inconnu'. Sa ligne est tenue jusqu'à la fin de l'appel : ses envois
-- simultanés passent un à un (les limites de 30 s et de 5 par jour ne se contournent pas en rafale)
create or replace function public.fournil_retours_qui(p_id uuid, p_jeton text)
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

-- est-ce bien un admin ? null si oui, sinon 'jeton', 'inconnu' ou 'pas-admin' (sans tenir la ligne : les lectures restent en lecture)
create or replace function public.fournil_admin_qui(p_id uuid, p_jeton text)
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
  if not exists (select 1 from public.fournil_admins where joueur = p_id) then
    return 'pas-admin';
  end if;
  return null;
end
$$;

-- un texte d'une ligne nettoyé (question, option, note) : retours à la ligne et tabulations en espaces, caractères de contrôle et
-- d'inversion du sens d'écriture retirés, espaces répétés réduits, bords ôtés
create or replace function public.fournil_retours_ligne(p_texte text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_texte, ''),
    '[\t\n\r\u000b\u000c\u0085  ]', ' ', 'g'),
    '[\u0001-\u001f\u007f-\u009f‪-‮⁦-⁩]', '', 'g'),
    ' {2,}', ' ', 'g'))
$$;

-- un vote, tel que le téléphone le lit (p_moi : le joueur dont on veut le choix, ou null)
create or replace function public.fournil_vote_json(p_n bigint, p_moi uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('n', v.n, 'question', v.question, 'options', v.options,
    'fin', floor(extract(epoch from v.fin) * 1000)::bigint,
    'voix', (select json_agg(coalesce(c.k, 0) order by i.i)
               from generate_series(0, jsonb_array_length(v.options) - 1) i(i)
               left join (select x.option, count(*)::int as k from public.fournil_votes_choix x where x.n = v.n group by x.option) c on c.option = i.i),
    'total', (select count(*)::int from public.fournil_votes_choix x where x.n = v.n),
    'moi', (select x.option from public.fournil_votes_choix x where x.n = v.n and x.joueur = p_moi))
  from public.fournil_votes v where v.n = p_n
$$;

-- le ménage : les captures de plus de 30 jours (le texte reste), les choix des votes finis depuis plus de 60 jours (une ligne
-- qu'un autre appel tient en ce moment est laissée pour le suivant : le ménage n'attend personne)
create or replace function public.fournil_retours_menage(p_maintenant timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.fournil_retours set image = null
   where n in (select r.n from public.fournil_retours r
                where r.image is not null and r.cree <= p_maintenant - interval '30 days' for update skip locked);
  delete from public.fournil_votes_choix
   where (n, joueur) in (select c.n, c.joueur from public.fournil_votes_choix c join public.fournil_votes v on v.n = c.n
                          where v.fin <= p_maintenant - interval '60 days' for update of c skip locked);
end
$$;

-- ─── 3. Les fonctions du jeu ───

create or replace function public.fournil_retour_envoyer(p_id uuid, p_jeton text, p_type text, p_texte text, p_image text, p_infos jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text;
  v_banni      boolean := false;
  v_pseudo     text;
  v_texte      text := '';
  v_image      text := nullif(p_image, '');
  v_infos      jsonb := p_infos;
  v_n          bigint;
  a            record;
begin
  v_erreur := public.fournil_retours_qui(p_id, p_jeton); -- tient sa ligne : ses envois simultanés passent un à un
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'n', null);
  end if;
  select pseudo into v_pseudo from public.fournil_joueurs where id = p_id;
  -- banni du chat (s'il est installé) : par son identifiant, ou par son pseudo actuel
  if to_regclass('public.fournil_chat_bannis') is not null then
    execute 'select exists (select 1 from public.fournil_chat_bannis b where b.joueur = $1 or lower(b.pseudo) = lower($2))'
      into v_banni using p_id, v_pseudo;
  end if;
  if v_banni then
    return json_build_object('ok', false, 'erreur', 'banni', 'n', null);
  end if;
  -- le texte nettoyé, retours à la ligne gardés (un texte énorme est refusé avant d'être parcouru)
  if p_texte is not null then
    if char_length(p_texte) > 10000 then
      return json_build_object('ok', false, 'erreur', 'long', 'n', null);
    end if;
    v_texte := regexp_replace(p_texte, '\r\n?|[\u000b\u000c\u0085  ]', E'\n', 'g');
    v_texte := replace(v_texte, E'\t', ' ');
    v_texte := regexp_replace(v_texte, '[\u0001-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]', '', 'g');
    v_texte := regexp_replace(v_texte, ' {2,}', ' ', 'g');
    v_texte := regexp_replace(v_texte, ' ?\n ?', E'\n', 'g');
    v_texte := regexp_replace(v_texte, '\n{3,}', E'\n\n', 'g');
    v_texte := btrim(v_texte, E' \n');
  end if;
  if v_texte = '' then
    return json_build_object('ok', false, 'erreur', 'vide', 'n', null);
  end if;
  if char_length(v_texte) > 1000 then
    return json_build_object('ok', false, 'erreur', 'long', 'n', null);
  end if;
  if v_image is not null and (char_length(v_image) > 480000 or v_image !~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$') then
    return json_build_object('ok', false, 'erreur', 'image', 'n', null);
  end if;
  if p_type is null or p_type not in ('idee', 'bug') then
    return json_build_object('ok', false, 'erreur', 'type', 'n', null);
  end if;
  -- les limites : un retour toutes les 30 s, 5 par jour (heure de Paris)
  if exists (select 1 from public.fournil_retours where joueur = p_id and cree > v_maintenant - interval '30 seconds') then
    return json_build_object('ok', false, 'erreur', 'trop-vite', 'n', null);
  end if;
  if (select count(*) from public.fournil_retours
       where joueur = p_id and cree >= (date_trunc('day', v_maintenant at time zone 'Europe/Paris') at time zone 'Europe/Paris')) >= 5 then
    return json_build_object('ok', false, 'erreur', 'quota', 'n', null);
  end if;
  -- les infos : un objet de 2 Ko au plus (sinon une trace, et le retour part quand même)
  if v_infos is not null and jsonb_typeof(v_infos) <> 'object' then
    v_infos := null;
  elsif v_infos is not null and octet_length(v_infos::text) > 2048 then
    v_infos := jsonb_build_object('trop_long', true);
  end if;

  insert into public.fournil_retours (joueur, pseudo, type, texte, image, infos, cree, maj)
  values (p_id, v_pseudo, p_type, v_texte, v_image, v_infos, v_maintenant, v_maintenant)
  returning n into v_n;

  -- prévenir les admins (pas l'auteur, pas les joueurs de test du workflow)
  if v_pseudo !~* '^(test-)?ci-' then
    for a in select f.joueur from public.fournil_admins f where f.joueur <> p_id loop
      perform public.fournil_notif_mettre(a.joueur, 'retour',
        case when p_type = 'idee' then 'Nouvelle idée de ' else 'Bug signalé par ' end || v_pseudo, v_maintenant);
    end loop;
  end if;

  perform public.fournil_retours_menage(v_maintenant);
  return json_build_object('ok', true, 'erreur', null, 'n', v_n);
end
$$;

create or replace function public.fournil_votes_ouverts(p_id uuid default null, p_jeton text default null)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_moi        uuid;
begin
  -- « moi » seulement avec le bon jeton (sans lui, la lecture marche quand même)
  if p_id is not null and public.fournil_jeton_valable(p_jeton)
     and exists (select 1 from public.fournil_joueurs where id = p_id and jeton = public.fournil_empreinte(p_jeton)) then
    v_moi := p_id;
  end if;
  return json_build_object('ok', true, 'erreur', null,
    'votes', coalesce((
      select json_agg(public.fournil_vote_json(v.n, v_moi) order by v.n desc)
      from (select n from public.fournil_votes
             where not ferme and debut <= v_maintenant and fin > v_maintenant
             order by n desc limit 10) v
    ), '[]'::json),
    'finis', coalesce((
      select json_agg(public.fournil_vote_json(v.n, v_moi) order by v.fin desc, v.n desc)
      from (select n, fin from public.fournil_votes
             where (ferme or fin <= v_maintenant) and fin > v_maintenant - interval '7 days'
             order by fin desc, n desc limit 5) v
    ), '[]'::json));
end
$$;

create or replace function public.fournil_voter(p_id uuid, p_jeton text, p_n bigint, p_option integer)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_retours_qui(p_id, p_jeton);
  v            record;
  r            json;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'voix', null, 'total', null);
  end if;
  select n, options, debut, fin, ferme into v from public.fournil_votes where n = p_n for share; -- pas fermé pendant qu'on vote
  if not found then
    return json_build_object('ok', false, 'erreur', 'absent', 'voix', null, 'total', null);
  end if;
  if v.ferme or v.fin <= v_maintenant or v.debut > v_maintenant then
    v_erreur := 'fini';
  elsif p_option is null or p_option < 0 or p_option >= jsonb_array_length(v.options) then
    v_erreur := 'option';
  else
    insert into public.fournil_votes_choix (n, joueur, option, quand) values (p_n, p_id, p_option, v_maintenant)
    on conflict (n, joueur) do update set option = excluded.option, quand = excluded.quand;
    perform public.fournil_retours_menage(v_maintenant);
  end if;
  r := public.fournil_vote_json(p_n, p_id);
  return json_build_object('ok', v_erreur is null, 'erreur', v_erreur, 'voix', r -> 'voix', 'total', r -> 'total');
end
$$;

-- ─── 4. Les fonctions de l'admin ───

create or replace function public.fournil_admin_moi(p_id uuid, p_jeton text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_admin_qui(p_id, p_jeton);
begin
  if v_erreur is not null and v_erreur <> 'pas-admin' then
    return json_build_object('ok', false, 'erreur', v_erreur, 'admin', false);
  end if;
  return json_build_object('ok', true, 'erreur', null, 'admin', v_erreur is null);
end
$$;

create or replace function public.fournil_admin_retours(p_id uuid, p_jeton text, p_filtre text default 'nouveau', p_avant bigint default null)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_admin_qui(p_id, p_jeton);
  v_images timestamptz := public.fournil_maintenant() - interval '30 days';
  v_tout   boolean := coalesce(p_filtre, 'nouveau') = 'tout';
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'retours', '[]'::json, 'nouveaux', null);
  end if;
  return json_build_object('ok', true, 'erreur', null,
    'retours', coalesce((
      select json_agg(json_build_object('n', r.n, 'pseudo', r.pseudo, 'type', r.type, 'texte', r.texte,
                                        'a_image', r.a_image and r.cree > v_images, 'infos', r.infos,
                                        'cree', floor(extract(epoch from r.cree) * 1000)::bigint, 'etat', r.etat, 'note', r.note) order by r.n desc)
      from (select x.n, x.pseudo, x.type, x.texte, x.image is not null as a_image, x.infos, x.cree, x.etat, x.note
              from public.fournil_retours x
             where (v_tout or x.etat = 'nouveau') and (p_avant is null or x.n < p_avant)
             order by x.n desc limit 30) r
    ), '[]'::json),
    'nouveaux', (select count(*)::int from public.fournil_retours where etat = 'nouveau'));
end
$$;

create or replace function public.fournil_admin_retour_image(p_id uuid, p_jeton text, p_n bigint)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_admin_qui(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'data', null);
  end if;
  return json_build_object('ok', true, 'erreur', null, 'data', (
    select r.image from public.fournil_retours r where r.n = p_n and r.cree > public.fournil_maintenant() - interval '30 days'));
end
$$;

create or replace function public.fournil_admin_retour_etat(p_id uuid, p_jeton text, p_n bigint, p_etat text, p_note text default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_admin_qui(p_id, p_jeton);
  v_note   text;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  if p_etat is null or p_etat not in ('nouveau', 'vu', 'fait', 'refuse') then
    return json_build_object('ok', false, 'erreur', 'etat');
  end if;
  if p_note is not null then
    if char_length(p_note) > 3000 then
      return json_build_object('ok', false, 'erreur', 'long');
    end if;
    v_note := public.fournil_retours_ligne(p_note);
    if char_length(v_note) > 300 then
      return json_build_object('ok', false, 'erreur', 'long');
    end if;
  end if;
  update public.fournil_retours set etat = p_etat, note = coalesce(v_note, note), maj = public.fournil_maintenant() where n = p_n;
  if not found then
    return json_build_object('ok', false, 'erreur', 'absent');
  end if;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

create or replace function public.fournil_admin_vote_creer(p_id uuid, p_jeton text, p_question text, p_options jsonb, p_heures integer)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_admin_qui(p_id, p_jeton);
  v_question   text;
  v_options    jsonb := '[]'::jsonb;
  v_o          text;
  v_n          bigint;
  j            record;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'n', null);
  end if;
  if p_question is null or char_length(p_question) > 2000 then
    return json_build_object('ok', false, 'erreur', 'question', 'n', null);
  end if;
  v_question := public.fournil_retours_ligne(p_question);
  if char_length(v_question) not between 1 and 200 then
    return json_build_object('ok', false, 'erreur', 'question', 'n', null);
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 4 then
    return json_build_object('ok', false, 'erreur', 'options', 'n', null);
  end if;
  for j in select e.value from jsonb_array_elements(p_options) e loop
    if jsonb_typeof(j.value) <> 'string' or char_length(j.value #>> '{}') > 600 then
      return json_build_object('ok', false, 'erreur', 'options', 'n', null);
    end if;
    v_o := public.fournil_retours_ligne(j.value #>> '{}');
    if char_length(v_o) not between 1 and 60
       or exists (select 1 from jsonb_array_elements_text(v_options) d where lower(d) = lower(v_o)) then
      return json_build_object('ok', false, 'erreur', 'options', 'n', null);
    end if;
    v_options := v_options || jsonb_build_array(v_o);
  end loop;
  if p_heures is null or p_heures not between 1 and 168 then
    return json_build_object('ok', false, 'erreur', 'duree', 'n', null);
  end if;

  insert into public.fournil_votes (question, options, debut, fin, cree_par)
  values (v_question, v_options, v_maintenant, v_maintenant + make_interval(hours => p_heures), p_id)
  returning n into v_n;

  -- prévenir les joueurs qui veulent les événements (fournil_notif_mettre vérifie leur case)
  for j in select distinct a.joueur from public.fournil_abonnements a loop
    perform public.fournil_notif_mettre(j.joueur, 'vote', 'Nouveau vote : ' || v_question, v_maintenant);
  end loop;

  perform public.fournil_retours_menage(v_maintenant);
  return json_build_object('ok', true, 'erreur', null, 'n', v_n);
end
$$;

create or replace function public.fournil_admin_vote_fermer(p_id uuid, p_jeton text, p_n bigint)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_admin_qui(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  update public.fournil_votes set ferme = true, fin = least(fin, v_maintenant) where n = p_n;
  if not found then
    return json_build_object('ok', false, 'erreur', 'absent');
  end if;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── 5. Les droits : les fonctions internes fermées, les neuf du jeu ouvertes ───
revoke all on function public.fournil_notif_permise(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_retours_qui(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_admin_qui(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_retours_ligne(text) from public, anon, authenticated;
revoke all on function public.fournil_vote_json(bigint, uuid) from public, anon, authenticated;
revoke all on function public.fournil_retours_menage(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_retour_envoyer(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.fournil_votes_ouverts(uuid, text) from public;
revoke all on function public.fournil_voter(uuid, text, bigint, integer) from public;
revoke all on function public.fournil_admin_moi(uuid, text) from public;
revoke all on function public.fournil_admin_retours(uuid, text, text, bigint) from public;
revoke all on function public.fournil_admin_retour_image(uuid, text, bigint) from public;
revoke all on function public.fournil_admin_retour_etat(uuid, text, bigint, text, text) from public;
revoke all on function public.fournil_admin_vote_creer(uuid, text, text, jsonb, integer) from public;
revoke all on function public.fournil_admin_vote_fermer(uuid, text, bigint) from public;
grant execute on function public.fournil_retour_envoyer(uuid, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.fournil_votes_ouverts(uuid, text) to anon, authenticated;
grant execute on function public.fournil_voter(uuid, text, bigint, integer) to anon, authenticated;
grant execute on function public.fournil_admin_moi(uuid, text) to anon, authenticated;
grant execute on function public.fournil_admin_retours(uuid, text, text, bigint) to anon, authenticated;
grant execute on function public.fournil_admin_retour_image(uuid, text, bigint) to anon, authenticated;
grant execute on function public.fournil_admin_retour_etat(uuid, text, bigint, text, text) to anon, authenticated;
grant execute on function public.fournil_admin_vote_creer(uuid, text, text, jsonb, integer) to anon, authenticated;
grant execute on function public.fournil_admin_vote_fermer(uuid, text, bigint) to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';

-- le résultat attendu : une ligne « les retours sont prêts », 9 fonctions ouvertes au jeu, 4 tables fermées, et le nombre d'admins
-- (0 avant la ligne « me rendre admin », 1 après)
select 'les retours sont prêts' as etat,
  (select count(*) from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('fournil_retour_envoyer', 'fournil_votes_ouverts', 'fournil_voter',
            'fournil_admin_moi', 'fournil_admin_retours', 'fournil_admin_retour_image', 'fournil_admin_retour_etat', 'fournil_admin_vote_creer', 'fournil_admin_vote_fermer')
      and has_function_privilege('anon', p.oid, 'execute')) as fonctions_ouvertes,
  (select count(*) from pg_catalog.pg_class t
    where t.relnamespace = 'public'::regnamespace and t.relkind = 'r' and t.relname in ('fournil_admins', 'fournil_retours', 'fournil_votes', 'fournil_votes_choix')
      and t.relrowsecurity and not has_table_privilege('anon', t.oid, 'select')) as tables_fermees,
  (select count(*) from public.fournil_admins) as admins;
