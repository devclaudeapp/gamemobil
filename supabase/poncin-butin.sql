-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Opération Poncin — le CLASSEMENT DU BUTIN entre amis (mode Extraction), version 1
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase : SQL Editor → New query → coller tout → Run.
--  On peut le recoller autant de fois qu'on veut : les joueurs inscrits, leurs pièces de la semaine, leurs records et leurs
--  totaux restent ; les fonctions sont remplacées, les droits remis d'aplomb. Il ne touche à rien du Fournil (toutes ses
--  fonctions et ses tables ont le préfixe poncin_ ; il ne dépend d'aucune fonction du Fournil : il marche aussi sans elles).
--
--  Ce qu'il installe :
--    · public.poncin_joueurs : un joueur = une ligne (pseudo, pièces, parties et extractions de la semaine, record, total depuis
--      son arrivée, de quoi appliquer les garde-fous, et son dernier signe de vie pour « en ligne ») ;
--    · public.poncin_portes : les inscriptions des dernières 24 h, par source (seulement une empreinte de l'adresse) ;
--    · quatre fonctions appelées par le jeu : poncin_publier, poncin_classement, poncin_vu, poncin_retirer.
--  Personne ne lit ni n'écrit les tables directement : tout passe par ces quatre fonctions, qui vérifient tout.
--
--  Ce qui est compté (le téléphone publie, après chaque partie d'Extraction, la LIGNE du joueur : PEXTRACTION.resultat()
--  .extraction.joueurs, voir src-poncin/ARCHITECTURE.md « Extraction », et src-poncin/classement.js) :
--    · les PIÈCES d'une partie, exactement comme PBUTIN.deposer (src-poncin/butin.js) compte le gain : sorti (extrait), la valeur
--      extraite + les primes versées, × 1,25 si la partie se jouait dans la zone de la semaine (BONUS_SEMAINE), arrondi ; pas sorti :
--      0 (tout ce qu'on portait est perdu, les primes ne sont pas versées) ;
--    · « Cette semaine » (du lundi 0 h au dimanche, heure de Paris, à l'horloge du SERVEUR) : la somme de ces pièces, le nombre de
--      parties et d'extractions réussies ; le classement se fait aux pièces ;
--    · « Records » : le meilleur score d'une seule partie (le score de la ligne : valeur extraite + points + primes versées), et le
--      total des pièces depuis l'arrivée au classement (la première partie publiée comprise) ; le classement se fait au record ;
--    · « en ligne » : vu il y a moins de 4 minutes (un envoi accepté de poncin_publier, ou un battement de poncin_vu, qui ne compte
--      rien), comme au Fournil ; jamais l'heure elle-même.
--
--  Les garde-fous (le téléphone fait autorité sur sa partie : on borne ce qu'il peut prétendre) :
--    · une partie PLAUSIBLE (sinon « valeur », rien n'est compté ; les bornes et leur calcul : partie 2, poncin_bornes) :
--        - valeur extraite ≤ 3 040 pièces (un sac de 16 cases plein de l'objet le plus cher par case) ;
--        - primes versées ≤ 5 750 (23 primes de 250 au plus sur la plus longue partie) ;
--        - score ≥ valeur + primes (les points ne sont jamais négatifs) et ≤ 12 770 ;
--        - pas sorti : ni valeur ni primes ;
--        - donc au plus 10 988 pièces comptées pour une partie ((3 040 + 5 750) × 1,25) ;
--    · au plus UNE partie comptée toutes les 120 secondes par joueur (une Extraction dure au moins 5 minutes et sa sortie ne
--      s'ouvre qu'à mi-partie : un joueur honnête n'est jamais gêné) ; les autres répondent « trop_vite » sans rien changer ;
--    · au plus 60 parties comptées par jour (heure de Paris) et par joueur : 60 parties de 5 minutes, salon compris, c'est déjà six
--      heures de jeu d'affilée, plus qu'aucun copain n'en joue en un jour ; la 61e répond « quota » sans rien changer. Un tricheur
--      qui bricole ses lignes depuis la console ne fait donc jamais plus de 60 × 10 988 pièces par jour ;
--    · un changement de pseudo seul (sans partie) : un toutes les 10 secondes au plus ;
--    · par source (l'adresse vue par Cloudflare, en-tête cf-connecting-ip ; en IPv6, tout le bloc /64) : 10 inscriptions par heure
--      et 20 par jour au plus ; pour tout le monde ensemble : 60 nouveaux joueurs par heure au plus, et 2 000 joueurs au plus en
--      tout ; les inscriptions passent une à une (verrou), pour que ces plafonds ne se contournent pas en rafale ;
--    · le ménage se fait tout seul, au premier envoi suivant de n'importe quel joueur : une ligne sans nouvelles depuis 90 jours
--      est effacée (son pseudo et sa place se libèrent), et une inscription qui n'a jamais compté une seule partie l'est au bout de
--      7 jours (les robots qui s'inscrivent et s'en vont). Le joueur revient tout seul à sa prochaine partie (il repart de zéro) ;
--    · chaque joueur a un pseudo (2 à 16 caractères : lettres, accents compris, chiffres, espace, - _ ' .), unique sans tenir
--      compte des majuscules ; mêmes règles qu'au Fournil ;
--    · chaque joueur garde sur son téléphone un jeton secret ; ici on ne garde que son empreinte (sha256), jamais le jeton : sans
--      le jeton, impossible d'écraser la ligne de quelqu'un d'autre, de signer sa présence ni de le retirer ;
--    · les paramètres sont typés, aucun texte n'est jamais assemblé en SQL : pas d'injection possible.
--
--  Supabase (Postgres 15 ou plus récent), aucune extension nécessaire : sha256() est intégré à Postgres.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Les tables ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.poncin_joueurs (
  id                uuid primary key,                    -- tiré au hasard par le téléphone, jamais affiché
  jeton             text not null,                       -- EMPREINTE sha256 (hexadécimale) du jeton secret, pas le jeton
  pseudo            text not null,                       -- le nom affiché dans le classement
  cree              timestamptz not null,                -- inscription (heure du serveur)
  maj               timestamptz not null,                -- dernier envoi accepté (une partie, ou un pseudo seul)
  vu                timestamptz,                         -- dernier signe de vie, pour « en ligne » ; jamais rendu tel quel
  partie_maj        timestamptz,                         -- la dernière partie comptée (null : aucune)
  semaine           date not null,                       -- le lundi (heure de Paris) des compteurs de la semaine
  pieces            bigint not null default 0,           -- « Cette semaine » : les pièces comptées
  parties           integer not null default 0,          -- « Cette semaine » : les parties comptées
  extractions       integer not null default 0,          -- « Cette semaine » : les extractions réussies
  jour              date not null,                       -- le jour (heure de Paris) du compteur du jour
  parties_jour      integer not null default 0,          -- les parties comptées ce jour-là (au plus 60)
  record            integer not null default 0,          -- le meilleur score d'une seule partie
  total             bigint not null default 0,           -- les pièces comptées depuis l'arrivée au classement
  parties_total     integer not null default 0,          -- les parties comptées depuis l'arrivée
  extractions_total integer not null default 0           -- les extractions réussies depuis l'arrivée
);
comment on table public.poncin_joueurs is
  'Opération Poncin : le classement du butin entre amis. Accès uniquement par les fonctions poncin_publier, poncin_classement, poncin_vu et poncin_retirer.';

-- un pseudo ne sert qu'une fois, sans tenir compte des majuscules (« Marie » et « MARIE » sont le même pseudo)
create unique index if not exists poncin_joueurs_pseudo on public.poncin_joueurs (lower(pseudo));

-- les portes : une ligne par inscription réussie, avec l'empreinte de sa source (sha256 de « ip:<adresse> »), gardée 24 h.
-- Elle sert à limiter les inscriptions par source, pour qu'un seul robot ne bloque pas les amis qui arrivent.
create table if not exists public.poncin_portes (
  empreinte text not null,
  quand     timestamptz not null
);
create index if not exists poncin_portes_empreinte on public.poncin_portes (empreinte, quand);
comment on table public.poncin_portes is
  'Opération Poncin : les inscriptions des dernières 24 h au classement du butin, par source (empreinte seulement). Accès uniquement par poncin_publier.';

-- la sécurité ligne par ligne est activée SANS aucune règle : personne ne voit ni ne touche ces tables par l'API.
-- On enlève les règles qui auraient pu être ajoutées à la main, pour que ce soit toujours vrai.
alter table public.poncin_joueurs enable row level security;
alter table public.poncin_portes enable row level security;
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies
            where schemaname = 'public' and tablename in ('poncin_joueurs', 'poncin_portes') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- aucun droit direct sur les tables pour les visiteurs (anon) ni pour les comptes (authenticated) :
-- Supabase en donne par défaut aux nouvelles tables, on les retire explicitement.
revoke all on table public.poncin_joueurs, public.poncin_portes from public, anon, authenticated;


-- ─── 2. Les petites fonctions internes (le jeu ne peut pas les appeler) ─────────────────────────

-- l'heure du serveur, en un seul endroit (les tests la remplacent pour simuler le temps qui passe ;
-- recoller ce fichier la remet à l'heure vraie)
create or replace function public.poncin_maintenant()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now()
$$;

-- le lundi de la semaine, heure de Paris : la semaine change le lundi à minuit à Paris, heure d'été comme d'hiver
create or replace function public.poncin_lundi(p_quand timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', p_quand at time zone 'Europe/Paris')::date
$$;

-- le jour, heure de Paris
create or replace function public.poncin_jour(p_quand timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_quand at time zone 'Europe/Paris')::date
$$;

-- le pseudo nettoyé, ou null s'il n'est pas valable (les mêmes règles que fournil_pseudo_propre, recopiées ici pour que ce
-- script ne dépende pas du Fournil) :
--   · forme Unicode composée (é tapé en deux morceaux devient un seul é) ;
--   · apostrophes typographiques ’ ‘ ʼ ` ´ → ' (le clavier des iPhone les met tout seul) ;
--   · les blancs (espaces, tabulations, espaces insécables…) deviennent une seule espace, rien au début ni à la fin ;
--   · 2 à 16 caractères : lettres A-Z, lettres accentuées (latin et latin étendu A, de À à ž, sans × ni ÷ ni les lettres
--     qui imitent l, i ou la ponctuation : ı Ĳ ĳ ĸ Ŀ ŀ ŉ ſ et tout le latin étendu B, comme ǀ ou ǃ), chiffres, espace, - _ ' . ;
--   · au moins une lettre ou un chiffre (pas de pseudo fait que de points ou de tirets).
create or replace function public.poncin_pseudo_propre(p_pseudo text)
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
  v := translate(v, E'’‘ʼ`´', '''''''''''');
  v := btrim(regexp_replace(v, E'[[:space:]   -     　﻿]+', ' ', 'g'));
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

-- un jeton bien formé : 32 à 128 caractères parmi chiffres, lettres, - et _ (le jeu envoie 64 chiffres hexadécimaux)
create or replace function public.poncin_jeton_valable(p_jeton text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_jeton is not null and p_jeton ~ '^[0-9A-Za-z_-]{32,128}$'
$$;

-- l'empreinte gardée en base : sha256 du jeton, en hexadécimal
create or replace function public.poncin_empreinte(p_jeton text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex')
$$;

-- LES BORNES d'une partie plausible, tirées des règles du jeu (src-poncin/regles.js MODES.extraction, src-poncin/butin.js) ;
-- test/poncin-butin-sql.cjs les recalcule depuis ces fichiers et vérifie qu'elles sont toujours les mêmes :
--   · valeur_max = 3 040 : le sac a au plus 16 cases (PBUTIN.SAC.max ; 8 de base + 6 par l'amélioration « Sac plus grand »,
--     sacVide borne à 16) ; l'objet qui rapporte le plus par case est le Calice en vermeil (380 pièces, 2 cases : 190 la case ;
--     le Lingot d'or 160, le Trésor de la mairie 166,7, la Croix de Savoie 140) : 16 × 190 = 3 040 ; ce qui est extrait, c'est
--     le sac au moment de sortir, rien d'autre ;
--   · primes_max = 5 750 : une prime vaut au plus 250 (prime.max) ; le plus riche n'est révélé qu'une fois toutes les 30 s
--     (prime.periode) à partir de 60 s (prime.premier), et la prime tombe à la première élimination : au plus une prime par
--     révélation ; sur la plus longue partie (720 s, MODES.extraction.durees) : révélations à 60, 90, …, 720 s = 23 primes,
--     23 × 250 = 5 750 ;
--   · points_max = 3 980 : les robots : au plus 24 gardiens (gardiens.plafond) + 2 au largage + 3 renforts du Gardien (le
--     niveau fort) = 29 robots, dont le Gardien (100 points), les autres 10 : 28 × 10 + 100 = 380 ; les joueurs : 25 points
--     par élimination, au plus une toutes les 5 s (relever un équipier prend 4 s, puis 1 s d'invincibilité) sur 720 s :
--     144 × 25 = 3 600 ; 380 + 3 600 = 3 980 ;
--   · score_max = valeur_max + primes_max + points_max = 12 770 (le score = valeur extraite + points + primes versées) ;
--   · gain_max = arrondi((valeur_max + primes_max) × 1,25) = 10 988 : les pièces qu'une partie peut compter au plus ;
--   · ecart = 120 s entre deux parties comptées ; parties_jour = 60 parties comptées par jour au plus (en tête du fichier).
create or replace function public.poncin_bornes(out valeur_max integer, out primes_max integer, out points_max integer,
                                                out score_max integer, out gain_max integer, out ecart integer,
                                                out parties_jour integer)
language sql
immutable
set search_path = ''
as $$
  select 3040, 5750, 3980, 3040 + 5750 + 3980, round((3040 + 5750) * 1.25)::integer, 120, 60
$$;

-- la réponse de poncin_publier : ok/erreur, et, si p_id est donné, les rangs et les compteurs de ce joueur
create or replace function public.poncin_reponse(p_erreur text, p_id uuid, p_lundi date, p_jour date,
                                                 p_pieces bigint default null, p_score integer default null,
                                                 p_record boolean default null)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'ok', p_erreur is null,
    'erreur', p_erreur,
    'version', 1,
    'semaine', to_char(p_lundi, 'YYYY-MM-DD'),
    'compte', case when p_erreur is null and p_pieces is not null
                   then json_build_object('pieces', p_pieces, 'score', p_score, 'record', coalesce(p_record, false)) end,
    'rang_semaine', (
      select (select count(*) from public.poncin_joueurs a where a.semaine = p_lundi and a.parties > 0 and a.pieces > m.pieces)::int + 1
        from public.poncin_joueurs m
       where m.id = p_id and m.semaine = p_lundi and m.parties > 0),
    'rang_records', (
      select (select count(*) from public.poncin_joueurs a
               where a.parties_total > 0 and (a.record > m.record or (a.record = m.record and a.total > m.total)))::int + 1
        from public.poncin_joueurs m
       where m.id = p_id and m.parties_total > 0),
    'joueurs_semaine', (select count(*)::int from public.poncin_joueurs where semaine = p_lundi and parties > 0),
    'joueurs', (select count(*)::int from public.poncin_joueurs where parties_total > 0),
    'pieces', (select m.pieces from public.poncin_joueurs m where m.id = p_id and m.semaine = p_lundi),
    'parties', (select m.parties from public.poncin_joueurs m where m.id = p_id and m.semaine = p_lundi),
    'extractions', (select m.extractions from public.poncin_joueurs m where m.id = p_id and m.semaine = p_lundi),
    'parties_jour', (select case when m.jour = p_jour then m.parties_jour else 0 end from public.poncin_joueurs m where m.id = p_id),
    'record', (select m.record from public.poncin_joueurs m where m.id = p_id),
    'total', (select m.total from public.poncin_joueurs m where m.id = p_id),
    'parties_total', (select m.parties_total from public.poncin_joueurs m where m.id = p_id)
  )
$$;


-- ─── 3. poncin_publier : rejoindre le classement, publier une partie ────────────────────────────
-- La ligne d'une partie (les champs de PEXTRACTION.resultat().extraction.joueurs[i]) :
--   p_valeur (valeur extraite, en pièces), p_primes (primes VERSÉES : seulement si sorti), p_extrait (sorti ?),
--   p_bonus (zoneSemaine : la partie se jouait dans la zone de la semaine, +25 %), p_score (le score de la ligne).
-- Sans aucun de ces cinq paramètres : rejoindre le classement, ou changer de pseudo, sans partie (rien n'est compté).
-- Réponse : { ok, erreur: null | 'jeton' | 'pseudo_invalide' | 'pseudo_pris' | 'valeur' | 'trop_vite' | 'quota' | 'complet',
--             version: 1, semaine: 'AAAA-MM-JJ' (le lundi du serveur),
--             compte: { pieces (comptées par cette partie), score, record (vrai : un nouveau record) } | null,
--             rang_semaine (aux pièces ; null sans partie cette semaine), rang_records (au record ; null sans partie),
--             joueurs_semaine, joueurs (ceux qui ont au moins une partie), pieces, parties, extractions (sa semaine),
--             parties_jour, record, total, parties_total }
-- « trop_vite » et « quota » redonnent ses rangs et ses compteurs (rien n'a changé).
-- Premier envoi d'un identifiant : le joueur est inscrit (dans les plafonds d'inscription) ; sa partie, s'il en publie une, compte.
-- Envois suivants : le jeton doit correspondre ; le pseudo peut changer (s'il est libre).
-- Un identifiant effacé par le ménage repasse simplement par l'inscription.
create or replace function public.poncin_publier(p_id uuid, p_jeton text, p_pseudo text,
                                                 p_valeur integer default null, p_primes integer default null,
                                                 p_extrait boolean default null, p_bonus boolean default null,
                                                 p_score integer default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.poncin_maintenant();
  v_lundi      date := public.poncin_lundi(v_maintenant);
  v_jour       date := public.poncin_jour(v_maintenant);
  v_pseudo     text := public.poncin_pseudo_propre(p_pseudo);
  v_b          record := public.poncin_bornes();
  v_partie     boolean;                                -- une partie est-elle publiée ? (sinon : un pseudo seul)
  v_pieces     bigint;                                 -- les pièces que compte cette partie
  v_record     boolean := false;
  v_empreinte  text;
  v_contrainte text;
  v_ip         text;
  v_porte      text;
  v_inscrit    boolean;
  j            public.poncin_joueurs%rowtype;
begin
  -- 1. l'identité : un identifiant et un jeton bien formés
  if p_id is null or not public.poncin_jeton_valable(p_jeton) then
    return public.poncin_reponse('jeton', null, v_lundi, v_jour);
  end if;
  -- 2. le pseudo
  if v_pseudo is null then
    return public.poncin_reponse('pseudo_invalide', null, v_lundi, v_jour);
  end if;
  -- 3. la partie : tout ou rien, et plausible (les bornes : partie 2)
  v_partie := p_valeur is not null or p_primes is not null or p_extrait is not null or p_bonus is not null or p_score is not null;
  if v_partie then
    if p_valeur is null or p_primes is null or p_extrait is null or p_score is null
       or p_valeur < 0 or p_valeur > v_b.valeur_max
       or p_primes < 0 or p_primes > v_b.primes_max
       or (not p_extrait and (p_valeur > 0 or p_primes > 0))  -- pas sorti : tout est perdu, aucune prime versée
       or p_score < p_valeur + p_primes or p_score > v_b.score_max then
      return public.poncin_reponse('valeur', null, v_lundi, v_jour);
    end if;
    -- les pièces, comme PBUTIN.deposer : (valeur + primes) × 1,25 dans la zone de la semaine, arrondi ; rien si pas sorti
    v_pieces := case when p_extrait then round((p_valeur + p_primes) * case when coalesce(p_bonus, false) then 1.25 else 1 end)::bigint else 0 end;
  end if;
  v_empreinte := public.poncin_empreinte(p_jeton);

  select * into j from public.poncin_joueurs where id = p_id for update;
  v_inscrit := found;

  -- le ménage, à chaque envoi :
  --   · les joueurs sans nouvelles depuis 90 jours sortent du classement : leur pseudo et leur place se libèrent ;
  --   · une inscription qui n'a jamais compté une seule partie sort au bout de 7 jours (les robots qui s'inscrivent et s'en vont).
  -- Le joueur qui appelle n'est jamais effacé ici. Une ligne qu'un autre envoi tient en ce moment est laissée de côté (skip
  -- locked) : le ménage n'attend jamais personne, donc aucun interblocage.
  delete from public.poncin_joueurs
   where id in (select o.id from public.poncin_joueurs o
                 where o.id <> p_id
                   and (greatest(o.maj, coalesce(o.vu, o.maj)) < v_maintenant - interval '90 days'
                        or (o.parties_total = 0 and o.cree < v_maintenant - interval '7 days'))
                   for update skip locked);

  if v_inscrit then
    -- ── un joueur déjà inscrit ──
    if j.jeton <> v_empreinte then
      return public.poncin_reponse('jeton', null, v_lundi, v_jour);
    end if;
    -- une partie toutes les 120 s au plus ; un pseudo seul toutes les 10 s au plus
    if (v_partie and j.partie_maj is not null and v_maintenant < j.partie_maj + make_interval(secs => v_b.ecart))
       or (not v_partie and v_maintenant < j.maj + interval '10 seconds') then
      return public.poncin_reponse('trop_vite', p_id, v_lundi, v_jour); -- rien ne change, mais on redonne ses rangs
    end if;
    if lower(v_pseudo) <> lower(j.pseudo)
       and exists (select 1 from public.poncin_joueurs where lower(pseudo) = lower(v_pseudo) and id <> p_id) then
      return public.poncin_reponse('pseudo_pris', null, v_lundi, v_jour);
    end if;
    -- une nouvelle semaine, un nouveau jour : leurs compteurs repartent de zéro
    if j.semaine <> v_lundi then
      j.semaine := v_lundi; j.pieces := 0; j.parties := 0; j.extractions := 0;
    end if;
    if j.jour <> v_jour then
      j.jour := v_jour; j.parties_jour := 0;
    end if;
    if v_partie then
      if j.parties_jour >= v_b.parties_jour then
        return public.poncin_reponse('quota', p_id, v_lundi, v_jour); -- rien ne change
      end if;
      v_record := p_score > j.record;
      j.pieces := j.pieces + v_pieces;
      j.parties := j.parties + 1;
      j.extractions := j.extractions + case when p_extrait then 1 else 0 end;
      j.parties_jour := j.parties_jour + 1;
      j.record := greatest(j.record, p_score);
      j.total := j.total + v_pieces;
      j.parties_total := j.parties_total + 1;
      j.extractions_total := j.extractions_total + case when p_extrait then 1 else 0 end;
      j.partie_maj := v_maintenant;
    end if;
    begin
      update public.poncin_joueurs
         set pseudo = v_pseudo, maj = v_maintenant, vu = v_maintenant, partie_maj = j.partie_maj,
             semaine = j.semaine, pieces = j.pieces, parties = j.parties, extractions = j.extractions,
             jour = j.jour, parties_jour = j.parties_jour, record = j.record, total = j.total,
             parties_total = j.parties_total, extractions_total = j.extractions_total
       where id = p_id;
    exception when unique_violation then
      return public.poncin_reponse('pseudo_pris', null, v_lundi, v_jour); -- un autre a pris ce pseudo au même instant
    end;
  else
    -- ── une inscription ──
    -- une inscription à la fois : chaque appel est une transaction, le verrou tient jusqu'à sa fin, donc l'inscription
    -- suivante compte la ligne déjà validée (sinon des envois simultanés passent tous sous les plafonds)
    perform pg_catalog.pg_advisory_xact_lock(7231002);
    -- par source d'abord : l'adresse que Cloudflare réécrit à chaque requête (cf-connecting-ip ; jamais x-forwarded-for,
    -- que le téléphone peut remplir lui-même). Sans cet en-tête, seuls les plafonds communs jouent.
    v_ip := nullif(btrim(coalesce(
              (nullif(pg_catalog.current_setting('request.headers', true), '')::json) ->> 'cf-connecting-ip', '')), '');
    delete from public.poncin_portes where quand < v_maintenant - interval '1 day';
    if v_ip is not null then
      -- en IPv6, une même box ou un même téléphone dispose de tout un bloc /64 : on compte le bloc, pas l'adresse
      begin
        v_ip := case when pg_catalog.family(v_ip::inet) = 6 then pg_catalog.network(pg_catalog.set_masklen(v_ip::inet, 64))::text
                     else pg_catalog.host(v_ip::inet) end;
      exception when others then
        null; -- une adresse illisible : on la compte telle quelle
      end;
      v_porte := public.poncin_empreinte('ip:' || v_ip);
      if (select count(*) from public.poncin_portes where empreinte = v_porte and quand > v_maintenant - interval '1 hour') >= 10
         or (select count(*) from public.poncin_portes where empreinte = v_porte) >= 20 then
        return public.poncin_reponse('trop_vite', null, v_lundi, v_jour);
      end if;
    end if;
    -- puis pour tout le monde ensemble
    if (select count(*) from public.poncin_joueurs) >= 2000 then
      return public.poncin_reponse('complet', null, v_lundi, v_jour);
    end if;
    if (select count(*) from public.poncin_joueurs where cree > v_maintenant - interval '1 hour') >= 60 then
      return public.poncin_reponse('trop_vite', null, v_lundi, v_jour);
    end if;
    if exists (select 1 from public.poncin_joueurs where lower(pseudo) = lower(v_pseudo)) then
      return public.poncin_reponse('pseudo_pris', null, v_lundi, v_jour);
    end if;
    begin
      v_record := v_partie and p_score > 0;
      insert into public.poncin_joueurs (id, jeton, pseudo, cree, maj, vu, partie_maj, semaine, pieces, parties, extractions,
                                         jour, parties_jour, record, total, parties_total, extractions_total)
      values (p_id, v_empreinte, v_pseudo, v_maintenant, v_maintenant, v_maintenant,
              case when v_partie then v_maintenant end, v_lundi,
              coalesce(v_pieces, 0), case when v_partie then 1 else 0 end, case when v_partie and p_extrait then 1 else 0 end,
              v_jour, case when v_partie then 1 else 0 end, case when v_partie then p_score else 0 end,
              coalesce(v_pieces, 0), case when v_partie then 1 else 0 end, case when v_partie and p_extrait then 1 else 0 end);
      if v_porte is not null then
        insert into public.poncin_portes (empreinte, quand) values (v_porte, v_maintenant);
      end if;
    exception when unique_violation then
      -- deux envois au même instant : même pseudo pris par un autre, ou le même joueur envoyé deux fois
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'poncin_joueurs_pseudo' then
        return public.poncin_reponse('pseudo_pris', null, v_lundi, v_jour);
      end if;
      return public.poncin_reponse('trop_vite', null, v_lundi, v_jour);
    end;
  end if;

  return public.poncin_reponse(null, p_id, v_lundi, v_jour, v_pieces, case when v_partie then p_score end, v_record);
end
$$;


-- ─── 4. poncin_classement : lire le classement ──────────────────────────────────────────────────
-- p_periode : 'semaine' (depuis lundi 0 h, heure de Paris : ceux qui ont au moins une partie cette semaine, rangés aux pièces)
--             ou 'records' (ceux qui ont au moins une partie depuis leur arrivée, rangés au meilleur score d'une partie, puis au total).
-- p_id : son propre identifiant (facultatif), pour se retrouver même hors des premiers.
-- p_limite : le nombre de lignes (50 par défaut, 100 au plus).
-- Réponse : { version: 1, semaine: 'AAAA-MM-JJ', periode, joueurs, en_ligne_n,
--             lignes: [{ rang, pseudo, pieces, parties, extractions, record, total, moi, en_ligne }],
--             moi: { rang, pieces, parties, extractions, record, total, en_ligne } | null }
-- pieces, parties, extractions : ceux de la semaine ('semaine'), ou depuis l'arrivée ('records' : pieces = total) ;
-- record et total : toujours depuis l'arrivée.
-- en_ligne : vrai si ce joueur a donné signe de vie il y a moins de 4 minutes ; en_ligne_n : combien de joueurs de toute cette
-- liste (pas seulement des lignes rendues) sont en ligne. Jamais l'heure elle-même.
-- Les ex æquo ont le même rang (puis l'ordre des pseudos) ; jamais d'identifiant ni de jeton dans la réponse.
create or replace function public.poncin_classement(p_periode text, p_id uuid default null, p_limite integer default 50)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.poncin_maintenant();
  v_lundi  date := public.poncin_lundi(v_maintenant);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_sem    boolean := p_periode = 'semaine';
  v_res    json;
begin
  if p_periode is null or p_periode not in ('semaine', 'records') then
    raise exception using errcode = '22023', message = 'poncin_classement : période inconnue (« semaine » ou « records »)';
  end if;

  with valeurs as (
    select j.id, j.pseudo, j.record, j.total,
           case when v_sem then j.pieces else j.total end as pieces,
           case when v_sem then j.parties else j.parties_total end as parties,
           case when v_sem then j.extractions else j.extractions_total end as extractions,
           coalesce(j.vu > v_maintenant - interval '4 minutes' and j.vu <= v_maintenant + interval '1 minute', false) as en_ligne
      from public.poncin_joueurs j
     where (v_sem and j.semaine = v_lundi and j.parties > 0) or (not v_sem and j.parties_total > 0)
  ), rangs as (
    select id, pseudo, pieces, parties, extractions, record, total, en_ligne,
           case when v_sem then rank() over (order by pieces desc)
                else rank() over (order by record desc, total desc) end::int as rang,
           case when v_sem then row_number() over (order by pieces desc, extractions desc, lower(pseudo), id)
                else row_number() over (order by record desc, total desc, lower(pseudo), id) end as ordre
      from valeurs
  )
  select json_build_object(
           'version', 1,
           'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
           'periode', p_periode,
           'joueurs', (select count(*)::int from rangs),
           'en_ligne_n', (select count(*)::int from rangs where en_ligne),
           'lignes', coalesce((select json_agg(json_build_object('rang', r.rang, 'pseudo', r.pseudo, 'pieces', r.pieces, 'parties', r.parties,
                                                                 'extractions', r.extractions, 'record', r.record, 'total', r.total,
                                                                 'moi', coalesce(r.id = p_id, false), 'en_ligne', r.en_ligne)
                                               order by r.ordre)
                                 from rangs r where r.ordre <= v_limite), '[]'::json),
           'moi', (select json_build_object('rang', r.rang, 'pieces', r.pieces, 'parties', r.parties, 'extractions', r.extractions,
                                            'record', r.record, 'total', r.total, 'en_ligne', r.en_ligne)
                     from rangs r where r.id = p_id)
         )
    into v_res;
  return v_res;
end
$$;


-- ─── 5. poncin_vu : un signe de vie, pour « en ligne » ─────────────────────────────────────────
-- Le téléphone l'appelle de temps en temps tant que le jeu est ouvert : elle vérifie le jeton et pose vu = l'heure du serveur,
-- rien d'autre (aucun compte, pas de ménage). Le classement en tire en_ligne (vu il y a moins de 4 minutes).
-- Réponse : { ok: true } ou { ok: false, erreur: 'jeton' (identifiant ou jeton mal formé, ou le jeton d'un autre) | 'inconnu'
-- (pas inscrit, ou effacé par le ménage : la prochaine partie publiée le réinscrit) }.
create or replace function public.poncin_vu(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.poncin_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  select jeton into v_jeton from public.poncin_joueurs where id = p_id;
  if not found then
    return json_build_object('ok', false, 'erreur', 'inconnu');
  end if;
  if v_jeton <> public.poncin_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  update public.poncin_joueurs set vu = public.poncin_maintenant() where id = p_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 6. poncin_retirer : quitter le classement ──────────────────────────────────────────────────
-- Réponse : { ok: true } (retiré, ou déjà absent) ou { ok: false, erreur: 'jeton' } (ce n'est pas son jeton).
-- Le coffre personnel (sur le téléphone) n'y perd rien : seule la ligne du classement part.
create or replace function public.poncin_retirer(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.poncin_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  select jeton into v_jeton from public.poncin_joueurs where id = p_id for update;
  if not found then
    return json_build_object('ok', true, 'erreur', null);
  end if;
  if v_jeton <> public.poncin_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  delete from public.poncin_joueurs where id = p_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 7. Les droits : le jeu n'appelle que les quatre fonctions ─────────────────────────────────
-- Postgres et Supabase donnent par défaut le droit d'exécuter les nouvelles fonctions à tout le monde :
-- on le retire partout, puis on le rend seulement pour les quatre fonctions du jeu.
revoke all on function public.poncin_maintenant() from public, anon, authenticated;
revoke all on function public.poncin_lundi(timestamptz) from public, anon, authenticated;
revoke all on function public.poncin_jour(timestamptz) from public, anon, authenticated;
revoke all on function public.poncin_pseudo_propre(text) from public, anon, authenticated;
revoke all on function public.poncin_jeton_valable(text) from public, anon, authenticated;
revoke all on function public.poncin_empreinte(text) from public, anon, authenticated;
revoke all on function public.poncin_bornes() from public, anon, authenticated;
revoke all on function public.poncin_reponse(text, uuid, date, date, bigint, integer, boolean) from public, anon, authenticated;

revoke all on function public.poncin_publier(uuid, text, text, integer, integer, boolean, boolean, integer) from public;
revoke all on function public.poncin_classement(text, uuid, integer) from public;
revoke all on function public.poncin_vu(uuid, text) from public;
revoke all on function public.poncin_retirer(uuid, text) from public;
grant execute on function public.poncin_publier(uuid, text, text, integer, integer, boolean, boolean, integer) to anon, authenticated;
grant execute on function public.poncin_classement(text, uuid, integer) to anon, authenticated;
grant execute on function public.poncin_vu(uuid, text) to anon, authenticated;
grant execute on function public.poncin_retirer(uuid, text) to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';
