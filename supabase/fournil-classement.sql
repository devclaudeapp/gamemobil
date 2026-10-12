-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement en ligne entre amis, en POINTS DE BOULANGER (version 3)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase : SQL Editor → New query → coller tout → Run.
--  On peut le recoller autant de fois qu'on veut, et par-dessus la version 2 : les joueurs déjà inscrits et le palmarès
--  restent, les fonctions sont remplacées par la nouvelle version, les droits sont remis d'aplomb.
--
--  Version 3 (12 oct. 2026) : on classe en POINTS DE BOULANGER, indépendants du niveau (voir « Les points » plus bas) ;
--  la fortune reste comptée comme avant, pour information. Collée par-dessus la v2 : chacun garde sa ligne, son pseudo et son
--  palmarès ; les points partent de zéro au collage et arrivent avec la nouvelle version du jeu (un téléphone encore en v2
--  continue d'envoyer sa fortune, sans points).
--
--  Ce qu'il installe :
--    · public.fournil_joueurs : un joueur = une ligne (pseudo, points de la semaine et depuis son arrivée, argent gagné depuis
--      son arrivée et cette semaine, et de quoi juger si ses gains sont plausibles) ;
--    · public.fournil_palmares : les trois premiers de chaque semaine finie, en points (ex æquo compris), figés une fois pour toutes ;
--    · public.fournil_semaines : les semaines déjà figées (même celles où personne n'a joué) ;
--    · public.fournil_portes : les inscriptions des dernières 24 h, par source (seulement une empreinte de l'adresse) ;
--    · cinq fonctions appelées par le jeu : fournil_publier, fournil_classement, fournil_retirer, fournil_recompenses,
--      fournil_heure.
--  Personne ne lit ni n'écrit les tables directement : tout passe par ces cinq fonctions, qui vérifient tout.
--
--  Les points (ce qui classe) :
--    · le jeu compte ses points de boulanger (src/game.js), du lundi au dimanche, heure de Paris : journée complète (les trois
--      objectifs du jour) 10 ; défi de la semaine 30 ; événement réussi (pétrissage, commande livrée, four réparé, bonne
--      critique, pourboire du client mystère) 2, au plus 20 par jour ; Atelier : le meilleur score de la semaine de chaque
--      mini-jeu, de 0 à 20 points ; améliorations : 1 point par tranche d'achats valant 10 minutes de SES PROPRES gains,
--      + 5 par palier ×2 franchi, au plus 30 par jour. Au plus 60 points par jour, 510 par semaine (7 × 60 + 30 + 3 × 20) ;
--    · le téléphone envoie ses points de la semaine (p_points) avec le lundi de cette semaine (p_lundi) : seule la semaine du
--      serveur compte (un téléphone en retard ou en avance de quelques minutes sur minuit ne mélange pas deux semaines) ;
--    · le serveur ne compte que ce qui DÉPASSE les points déjà comptés cette semaine, et pas au-delà des plafonds :
--        - depuis lundi : 60 × (jours de la semaine commencés, heure de Paris) + 100 (le défi et l'Atelier, 90, peuvent tomber
--          dès le premier jour), et 510 au plus (le barème d'une semaine entière : le jeu lui-même ne compte jamais plus) ;
--          c'est ce plafond qui borne la croissance par le temps réel (l'horloge du serveur) : 160 le lundi, 220 le mardi… ;
--      l'envoi est accepté, le compte plafonné ; comme le téléphone renvoie chaque fois son total de la semaine, ce qui dépasse
--      se compte plus tard, quand le plafond a grandi (un joueur honnête n'y perd rien : test/fournil-classement-sql.cjs
--      rejoue ceux de test/longevite.js, jamais plafonnés). Un tricheur qui bricole ses points depuis la console ne fait donc
--      jamais mieux que le meilleur joueur possible : au plus 510, ex æquo avec lui ;
--    · « Cette semaine » = les points depuis lundi (le podium, la tenue et la coupe se jouent là-dessus) ;
--    · « Tous les temps » = tous les points comptés depuis l'arrivée au classement (la semaine d'arrivée comprise) ;
--    · un ancien téléphone (sans p_points) est toujours accepté : sa fortune compte, ses points ne bougent pas.
--
--  La fortune (affichée en petit, pour information) :
--    · le téléphone envoie sa FORTUNE TOTALE (tout l'argent gagné depuis le début de la partie) ; le serveur n'en compte que
--      ce qui est PLAUSIBLE : entre deux envois, le gain compté est plafonné par ce que le temps réel écoulé (l'horloge du
--      serveur, pas celle du téléphone) permet de gagner. L'excès est perdu pour toujours (l'envoi est accepté, le compte
--      plafonné). Avancer l'heure du téléphone, bricoler sa sauvegarde ou envoyer 1e24 depuis la console ne rapporte donc
--      au plus que ce qu'un boulanger hors norme aurait pu gagner pendant ce temps-là (l'enveloppe, partie 3) ;
--    · l'argent de « Tous les temps » = gagné DEPUIS L'ARRIVÉE AU CLASSEMENT (la toute première publication ne compte rien :
--      on part de zéro, quelle que soit la fortune de la sauvegarde) ;
--    · l'argent de « Cette semaine » = gagné depuis lundi minuit, heure de Paris (même règle de plausibilité) ;
--    · seul compte ce qui DÉPASSE la plus haute fortune déjà envoyée (colonne sommet) : une fortune qui baisse (partie
--      effacée, vieux code de sauvegarde, onglet en retard) puis remonte ne compte jamais deux fois. Pour repartir vraiment
--      de zéro après une partie effacée exprès, on quitte le classement puis on le rejoint ;
--
--  Le palmarès et le reste :
--    · le palmarès : à la première requête d'une nouvelle semaine (quelle qu'elle soit), les trois premiers de la semaine
--      finie, EN POINTS (points > 0, ex æquo au même rang), sont figés une fois pour toutes. Ils gagnent la tenue et la coupe du podium
--      (or, argent, bronze), portées la semaine suivante puis gardées à vie sur le téléphone. Une semaine où personne n'a de
--      points (la dernière de la v2, quand on recolle la v3 le lundi avant qu'elle soit figée ; ou une semaine où seuls des
--      téléphones de la v2 ont joué) est classée à l'argent, comme en v2 : son podium n'est pas perdu ;
--    · chaque joueur a un pseudo (2 à 16 caractères : lettres, accents compris, chiffres, espace, - _ ' .), unique sans
--      tenir compte des majuscules ;
--    · chaque joueur garde sur son téléphone un jeton secret ; ici on ne garde que son empreinte (sha256), jamais le jeton :
--      sans le jeton, impossible d'écraser le score de quelqu'un d'autre, de lire ses récompenses ni de le retirer.
--
--  Les garde-fous (pour qu'un petit malin ne puisse ni tricher ni tout remplir) :
--    · une fortune doit être un vrai nombre, positif, et sous 1e24 € ; ce qui en est compté est plafonné (ci-dessus) ;
--    · un envoi pris en compte toutes les 10 secondes au plus par joueur (les autres répondent « trop_vite » sans rien changer) ;
--    · par source (l'adresse vue par Cloudflare, en-tête cf-connecting-ip ; en IPv6, tout le bloc /64) : 10 inscriptions par
--      heure et 20 par jour au plus ;
--    · pour tout le monde ensemble : 60 nouveaux joueurs par heure au plus, et 2 000 joueurs au plus en tout ;
--      les inscriptions passent une à une (verrou), pour que ces plafonds ne se contournent pas en rafale ;
--    · le ménage se fait tout seul, au premier envoi suivant de n'importe quel joueur : une ligne sans nouvelles depuis
--      90 jours est effacée (son pseudo et sa place se libèrent, son palmarès part avec elle), et une ligne jamais mise à
--      jour depuis son inscription l'est au bout de 7 jours. Le boulanger revient tout seul à son prochain envoi, comme une
--      nouvelle inscription (il repart de zéro) ;
--    · les paramètres sont typés, aucun texte n'est jamais assemblé en SQL : pas d'injection possible.
--
--  Supabase (Postgres 15 ou plus récent), aucune extension nécessaire : sha256() est intégré à Postgres.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Les tables ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.fournil_joueurs (
  id        uuid primary key,                          -- tiré au hasard par le téléphone, jamais affiché
  jeton     text not null,                             -- EMPREINTE sha256 (hexadécimale) du jeton secret, pas le jeton
  pseudo    text not null,                             -- le nom affiché dans le classement
  fortune   double precision not null default 0,       -- la fortune envoyée au dernier envoi (pour mémoire)
  sommet    double precision not null default 0,       -- la plus haute fortune envoyée : seul ce qui la dépasse peut compter
  plausible double precision not null default 0,       -- la fortune d'arrivée + tout ce qui a été compté : l'échelle de la borne
  reserve   double precision not null default 86400,   -- le temps d'enveloppe pas encore utilisé, en secondes (24 h au plus)
  total     double precision not null default 0,       -- « Tous les temps » : gagné depuis l'arrivée au classement
  gain      double precision not null default 0,       -- « Cette semaine » : gagné pendant la semaine de la colonne semaine
  semaine   date not null,                             -- le lundi (heure de Paris) de la semaine du gain et des points
  cree      timestamptz not null default now(),        -- inscription
  maj       timestamptz not null default now(),        -- dernier envoi pris en compte (heure du serveur)
  points    integer not null default 0,                -- « Cette semaine » : les points comptés pendant la semaine de la colonne semaine
  points_total integer not null default 0,             -- « Tous les temps » : les points comptés depuis l'arrivée au classement
  points_jour date                                     -- le jour (heure de Paris) du dernier envoi de points (null : jamais)
);
-- recoller ce fichier par-dessus une version plus ancienne : les colonnes manquantes sont ajoutées (chacun repart de zéro
-- pour « Tous les temps » et pour la semaine, avec sa plus haute fortune comme échelle), l'ancienne base de la semaine disparaît
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'fournil_joueurs' and column_name = 'sommet') then
    alter table public.fournil_joueurs add column sommet double precision not null default 0;
    update public.fournil_joueurs set sommet = fortune;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'fournil_joueurs' and column_name = 'plausible') then
    alter table public.fournil_joueurs add column plausible double precision not null default 0;
    update public.fournil_joueurs set plausible = least(greatest(sommet, fortune), 1e20); -- l'échelle d'arrivée plafonnée (partie 3)
  end if;
end
$$;
alter table public.fournil_joueurs add column if not exists reserve double precision not null default 86400;
alter table public.fournil_joueurs add column if not exists total   double precision not null default 0;
alter table public.fournil_joueurs add column if not exists gain    double precision not null default 0;
alter table public.fournil_joueurs drop column if exists base_semaine;
-- version 3 : les points (une ligne de la v2 garde tout le reste, ses points partent de zéro)
alter table public.fournil_joueurs add column if not exists points       integer not null default 0;
alter table public.fournil_joueurs add column if not exists points_total integer not null default 0;
alter table public.fournil_joueurs add column if not exists points_jour  date;

comment on table public.fournil_joueurs is
  'Le Fournil : le classement entre amis. Accès uniquement par les fonctions fournil_publier, fournil_classement, fournil_retirer et fournil_recompenses.';

-- un pseudo ne sert qu'une fois, sans tenir compte des majuscules (« Marie » et « MARIE » sont le même pseudo)
create unique index if not exists fournil_joueurs_pseudo on public.fournil_joueurs (lower(pseudo));

-- le palmarès : les trois premiers (ex æquo compris) de chaque semaine finie, avec le pseudo, les points et le gain de ce moment-là
create table if not exists public.fournil_palmares (
  semaine date not null,                               -- le lundi de la semaine finie
  rang    integer not null check (rang between 1 and 3),
  id      uuid not null,                               -- le joueur (jamais renvoyé au jeu)
  pseudo  text not null,
  valeur  double precision not null,                   -- son gain (en euros) de cette semaine-là
  points  integer,                                     -- ses points de cette semaine-là (null : semaine figée en version 2, classée à l'argent)
  primary key (semaine, id)
);
alter table public.fournil_palmares add column if not exists points integer;
create index if not exists fournil_palmares_id on public.fournil_palmares (id);
comment on table public.fournil_palmares is
  'Le Fournil : les podiums des semaines finies, figés une fois. Accès uniquement par les fonctions du jeu.';

-- les semaines déjà figées, même vides : une semaine n'est figée qu'une fois
create table if not exists public.fournil_semaines (
  semaine date primary key,
  figee   timestamptz not null
);
comment on table public.fournil_semaines is
  'Le Fournil : les semaines dont le palmarès est figé. Accès uniquement par les fonctions du jeu.';

-- les portes : une ligne par inscription réussie, avec l'empreinte de sa source (sha256 de « ip:<adresse> »), gardée 24 h.
-- Elle sert à limiter les inscriptions par source, pour qu'un seul robot ne bloque pas les amis qui arrivent.
create table if not exists public.fournil_portes (
  empreinte text not null,
  quand     timestamptz not null
);
create index if not exists fournil_portes_empreinte on public.fournil_portes (empreinte, quand);
comment on table public.fournil_portes is
  'Le Fournil : les inscriptions des dernières 24 h par source (empreinte seulement). Accès uniquement par fournil_publier.';

-- la sécurité ligne par ligne est activée SANS aucune règle : personne ne voit ni ne touche ces tables par l'API.
-- On enlève les règles qui auraient pu être ajoutées à la main, pour que ce soit toujours vrai.
alter table public.fournil_joueurs enable row level security;
alter table public.fournil_palmares enable row level security;
alter table public.fournil_semaines enable row level security;
alter table public.fournil_portes enable row level security;
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename in ('fournil_joueurs', 'fournil_palmares', 'fournil_semaines', 'fournil_portes') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- aucun droit direct sur les tables pour les visiteurs (anon) ni pour les comptes (authenticated) :
-- Supabase en donne par défaut aux nouvelles tables, on les retire explicitement.
revoke all on table public.fournil_joueurs, public.fournil_palmares, public.fournil_semaines, public.fournil_portes
  from public, anon, authenticated;

-- les fonctions d'une version plus ancienne dont la forme a changé (une ancienne forme laissée en place rendrait l'appel
-- ambigu pour l'API : on la retire avant de créer la nouvelle)
drop function if exists public.fournil_reponse(text, uuid, date);
drop function if exists public.fournil_reponse(text, uuid, date, double precision, boolean);
drop function if exists public.fournil_publier(uuid, text, text, double precision);


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

-- le jour, heure de Paris
create or replace function public.fournil_jour(p_quand timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_quand at time zone 'Europe/Paris')::date
$$;

-- le plafond des points : ce que le barème permet en p_jours jours commencés (heure de Paris), avec une petite marge.
-- Le barème (src/game.js, POINTS) : au plus 60 points par jour (journée 10, événements 20, améliorations 30) ; une fois par
-- semaine, le défi (30) et l'Atelier (3 × 20) ; soit 510 sur une semaine. Jour par jour : 60 × jours + 100 (le défi et
-- l'Atelier peuvent tomber dès le premier jour, plus 10 de marge pour un minuit approximatif) ; sur la semaine : 510 tout
-- rond, sans marge (le jeu plafonne lui-même ses points à 510 : un tricheur ne peut au mieux qu'égaler le joueur parfait).
create or replace function public.fournil_points_plafond(p_jours integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(510, 60 * least(greatest(coalesce(p_jours, 1), 1), 7) + 100)
$$;

-- le pseudo nettoyé, ou null s'il n'est pas valable :
--   · forme Unicode composée (é tapé en deux morceaux devient un seul é) ;
--   · apostrophes typographiques ’ ‘ ʼ ` ´ → ' (le clavier des iPhone les met tout seul) ;
--   · les blancs (espaces, tabulations, espaces insécables…) deviennent une seule espace, rien au début ni à la fin ;
--   · 2 à 16 caractères : lettres A-Z, lettres accentuées (latin et latin étendu A, de À à ž, sans × ni ÷ ni les lettres
--     qui imitent l, i ou la ponctuation : ı Ĳ ĳ ĸ Ŀ ŀ ŉ ſ et tout le latin étendu B, comme ǀ ou ǃ), chiffres, espace, - _ ' . ;
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


-- ─── 3. L'enveloppe : ce qu'un boulanger peut plausiblement gagner en un temps donné ─────────────
--
-- R(L) est le rythme de gain (€ par seconde) qu'on accepte d'un boulanger dont la fortune plausible vaut L. Il est donné par
-- des paliers {log10 L, log10 R} ; entre deux paliers, R varie comme une puissance de L (une droite en échelle log-log) ;
-- sous le premier palier, R est constant (le plancher : 500 000 €/s jusqu'à 10 000 €) ; au-delà du dernier, même pente.
-- La borne d'un envoi suit cette enveloppe pas à pas (dL/dt = R(L)) : les gains qui en rapportent d'autres sont comptés.
--
-- D'où viennent ces chiffres (simulations de test/longevite.js et src/game.js rejouées seconde par seconde) :
--   · vingt trajectoires de 60 à 120 jours, aux quatre dates de départ du test de longévité (5 oct., 1er nov., 1er mars,
--     7 juin : saisons, marché du samedi et du dimanche ×1,5 compris) : les trois profils du jeu (occasionnel 17 min,
--     régulier 36 min, assidu 80 min par jour), un « acharné » (16 h par jour, 120 jours) et un « marathon » (23 h 48 sur 24,
--     60 jours). Tout y est : gains d'absence (8 h et plus), coups de feu ×3, critiques ×2, anniversaires ×5, commandes payées
--     6 fois, pain du jour, spécialité, recette de saison, pourboires, défis du jour et de la semaine, habitués, boutiques ;
--   · pour chaque tranche de fortune, le plus fort gain en UNE HEURE observé chez n'importe lequel de ces joueurs (ce sont
--     l'acharné et le marathon qui fixent la limite), pris une demi-décade plus haut et arrondi vers le haut à chaque décade ;
--   · puis l'algorithme ci-dessous (avec sa réserve de 24 h) a été rejoué sur chaque trajectoire : envois toutes les 10 s,
--     toutes les 5 min, une fois par session ou une fois par jour, en arrivant au jour 0, 10 ou 40. En DIVISANT ces rythmes,
--     le premier envoi plafonné n'apparaît qu'à ÷3,9 pour le marathon 24 h/24, ÷4,8 pour l'acharné, ÷17 pour l'assidu, ÷19
--     pour le régulier et ÷20 pour l'occasionnel : la marge est d'au moins ×3,9 sur le joueur le plus acharné qu'on puisse
--     imaginer, et de ×17 sur les profils du jeu. Un joueur honnête n'est jamais plafonné.
--
--   fortune L        rythme accepté R(L)     repères (joueurs simulés)
--   ≤ 1e4 €          5e5 €/s (le plancher)   au premier jour, tout le monde passe 1e7 € en un quart d'heure
--   1e10 €           1,3e7 €/s               l'assidu au jour 2, le marathon après quelques heures
--   1e13 €           5e9 €/s                 l'assidu au jour 5
--   1e16 €           2,5e12 €/s              l'assidu au jour 10, le marathon au jour 9
--   1e19 €           1,3e14 €/s              l'assidu au jour 60, le marathon au jour 25
--   1e20 €           4e14 €/s                l'acharné au jour 50 ; au-delà, R grandit comme L (+1,4 % par heure)
--
-- La réserve : le temps d'enveloppe qu'un envoi n'a pas utilisé est gardé (24 h au plus) pour les envois suivants. Elle
-- absorbe les gros coups d'un instant (prime du défi de la semaine, trois défis du jour réclamés d'un coup, commande livrée)
-- sans élargir le rythme de fond : sur la durée, rien ne dépasse R. On arrive au classement avec une réserve pleine : sans
-- elle, un joueur honnête qui rejoint en pleine partie (au jour 40, juste avant une prime) n'aurait plus qu'une marge de ×1,5
-- (×3,1 avec une heure de réserve à l'arrivée, ×3,9 avec 24 h).
--
-- L'échelle de la borne est la fortune PLAUSIBLE (fortune d'arrivée + tout ce qui a été compté), pas la plus haute fortune
-- envoyée : un saut inventé, plafonné, ne fait pas grandir la borne des envois suivants.
--
-- La fortune d'arrivée, elle, n'est prouvée par rien (une sauvegarde se bricole) : comme échelle, elle est plafonnée à 1e20 €.
-- Sans ce plafond, un tricheur qui arrive avec 7e23 € compterait 2,9e23 € dix secondes plus tard (au-delà de 1e20, R grandit
-- comme L). 1e20 est le plus bas plafond qui garde la marge : rejoués en arrivant aux jours 0, 10, 40, 59 et 90 (l'acharné
-- dépasse 1e20 vers le jour 50, 9e20 au jour 120), les honnêtes gardent une marge d'au moins ×3,8 (×1,6 avec un plafond à 1e19).
--
-- Ce qu'il reste à un tricheur obstiné (il envoie sans arrêt, toujours à la limite) : au mieux ~4 fois le joueur parfait
-- 24 h/24. Réserve pleine de l'arrivée comprise, en arrivant avec une fausse fortune de 1e6 € : 1e18 € tout de suite (ce que
-- l'enveloppe ajoute en 24 h), 8e18 € au bout d'un jour, 2e20 € au bout d'une semaine ; en arrivant avec 1e20 € ou plus (le
-- pire cas) : 4e19 € tout de suite, 1e20 € au bout d'un jour, 1,5e21 € au bout d'une semaine (il faut deux mois à l'assidu
-- pour 1e19 €, 25 jours au marathon). C'est la limite de ce qu'un serveur peut savoir sans voir la partie ; un intrus se
-- retire à la main.

-- les paliers {log10 fortune, log10 rythme en €/s}
create or replace function public.fournil_paliers()
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select '{{4,5.7},{5,5.8},{6,5.9},{7,6.0},{8,6.1},{9,6.5},{10,7.1},{11,7.7},{12,8.7},{13,9.7},{14,10.4},{15,11.1},{16,12.4},{17,13.2},{18,13.7},{19,14.1},{20,14.6},{24,18.6}}'::double precision[]
$$;

-- le segment k de l'enveloppe (0 = sous le premier palier, n = au-delà du dernier) : de « de » à « a », R = c · L^b
create or replace function public.fournil_segment(p_k integer, out de double precision, out a double precision,
                                                  out b double precision, out c double precision)
language plpgsql
immutable
set search_path = ''
as $$
declare
  p double precision[] := public.fournil_paliers();
  n integer := array_length(p, 1);
  k integer := least(greatest(p_k, 0), n);
  j integer;
begin
  if k = 0 then
    de := 0; a := power(10::double precision, p[1][1]); b := 0; c := power(10::double precision, p[1][2]);
    return;
  end if;
  j := least(k, n - 1); -- au-delà du dernier palier : la pente du dernier segment
  b := (p[j + 1][2] - p[j][2]) / (p[j + 1][1] - p[j][1]);
  if abs(b - 1) < 1e-9 then b := 1; elsif abs(b) < 1e-9 then b := 0; end if; -- presque 1 (ou 0) : 1 (ou 0), sinon le calcul perd sa précision
  de := power(10::double precision, p[k][1]);
  a := case when k < n then power(10::double precision, p[k + 1][1]) else 'infinity'::double precision end;
  c := power(10::double precision, p[k][2] - b * p[k][1]);
end
$$;

-- le temps (en secondes) que met l'enveloppe pour aller de p_de à p_a
create or replace function public.fournil_duree(p_de double precision, p_a double precision)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := array_length(public.fournil_paliers(), 1);
  s record;
  x double precision;
  y double precision;
  t double precision := 0;
begin
  if p_de is null or p_a is null or not (p_a > p_de) then
    return 0;
  end if;
  for k in 0..n loop
    s := public.fournil_segment(k);
    continue when p_de >= s.a;
    exit when p_a <= s.de;
    x := greatest(p_de, s.de);
    y := least(p_a, s.a);
    if s.b = 1 then
      t := t + ln(y / x) / s.c;
    else
      t := t + (power(y, 1 - s.b) - power(x, 1 - s.b)) / ((1 - s.b) * s.c);
    end if;
  end loop;
  return t;
end
$$;

-- la plus haute fortune que l'enveloppe atteint en p_secondes depuis p_de (au plus 1e30 : jamais de débordement)
create or replace function public.fournil_borne(p_de double precision, p_secondes double precision)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := array_length(public.fournil_paliers(), 1);
  s record;
  x double precision := greatest(coalesce(p_de, 0), 0);
  u double precision := greatest(coalesce(p_secondes, 0), 0);
  t double precision;
  base double precision;
begin
  if x >= 1e30 then
    return x;
  end if;
  for k in 0..n loop
    s := public.fournil_segment(k);
    continue when x >= s.a;
    x := greatest(x, s.de);
    -- le temps pour aller au bout de ce segment
    if s.a = 'infinity'::double precision then
      t := 'infinity'::double precision;
    elsif s.b = 1 then
      t := ln(s.a / x) / s.c;
    else
      t := (power(s.a, 1 - s.b) - power(x, 1 - s.b)) / ((1 - s.b) * s.c);
    end if;
    if u < t then
      -- on s'arrête dans ce segment
      if s.b = 1 then
        if ln(x) + s.c * u > ln(1e30::double precision) then
          return 1e30;
        end if;
        return x * exp(s.c * u);
      end if;
      base := power(x, 1 - s.b) + (1 - s.b) * s.c * u;
      if base <= 0 then
        return case when s.b > 1 then 1e30 else x end; -- (pente > 1 : l'enveloppe s'emballe ; sinon x = 0 et u = 0)
      end if;
      if log(base) / (1 - s.b) > 30 then
        return 1e30;
      end if;
      return power(base, 1 / (1 - s.b));
    end if;
    u := u - t;
    x := s.a;
  end loop;
  return least(x, 1e30);
end
$$;


-- ─── 4. Le palmarès : chaque semaine finie est figée une fois, à la première requête qui suit ───
-- Appelée au début de chaque fonction du jeu. Les semaines à figer : celle qui vient de finir (même vide), et toute semaine
-- plus ancienne dont des joueurs gardent encore le gain (personne n'est venu depuis). Deux requêtes simultanées ne figent
-- jamais deux fois : la ligne de fournil_semaines fait office de verrou (la seconde attend la première, puis ne fait rien).
create or replace function public.fournil_figer(p_lundi date)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_s date;
  v_n integer;
  v_pts boolean;
begin
  if exists (select 1 from public.fournil_semaines where semaine = p_lundi - 7) then
    return; -- le chemin de tous les jours : la semaine passée est déjà figée, donc toutes les précédentes aussi
  end if;
  for v_s in
    select distinct j.semaine from public.fournil_joueurs j
     where j.semaine < p_lundi
       and not exists (select 1 from public.fournil_semaines f where f.semaine = j.semaine)
    union
    select p_lundi - 7
    order by 1
  loop
    insert into public.fournil_semaines (semaine, figee) values (v_s, public.fournil_maintenant())
      on conflict (semaine) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      -- les trois premiers EN POINTS (ex æquo au même rang) ; leur gain en euros est gardé pour information.
      -- Une semaine où personne n'a de points (la dernière semaine de la v2, pas encore figée quand on recolle la v3 ; ou une
      -- semaine où seuls des téléphones de la v2 ont joué) est classée à l'argent, comme en v2 : son podium n'est pas perdu.
      v_pts := exists (select 1 from public.fournil_joueurs where semaine = v_s and points > 0);
      insert into public.fournil_palmares (semaine, rang, id, pseudo, valeur, points)
      select v_s, r.rang, r.id, r.pseudo, r.gain, case when v_pts then r.points end
        from (select j.id, j.pseudo, j.gain, j.points,
                     rank() over (order by case when v_pts then j.points::double precision else j.gain end desc)::int as rang
                from public.fournil_joueurs j
               where j.semaine = v_s and (case when v_pts then j.points > 0 else j.gain > 0 end)) r
       where r.rang <= 3
      on conflict (semaine, id) do nothing;
    end if;
  end loop;
end
$$;

-- la réponse de fournil_publier : ok/erreur, et, si p_id est donné, les rangs de ce joueur (en points), ses points, et ce
-- qui a été compté (argent et points)
create or replace function public.fournil_reponse(p_erreur text, p_id uuid, p_lundi date,
                                                  p_compte double precision, p_plafonne boolean,
                                                  p_points_comptes integer, p_points_plafonnes boolean)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'ok', p_erreur is null,
    'erreur', p_erreur,
    'version', 3,
    'rang_semaine', (
      select (select count(*) from public.fournil_joueurs a where a.semaine = p_lundi and a.points > m.points)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id and m.semaine = p_lundi),
    'rang_total', (
      select (select count(*) from public.fournil_joueurs a where a.points_total > m.points_total)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id),
    'joueurs', (select count(*)::int from public.fournil_joueurs),
    'joueurs_total', (select count(*)::int from public.fournil_joueurs),
    'joueurs_semaine', (select count(*)::int from public.fournil_joueurs where semaine = p_lundi),
    'semaine', to_char(p_lundi, 'YYYY-MM-DD'),
    'points_semaine', (select m.points from public.fournil_joueurs m where m.id = p_id and m.semaine = p_lundi),
    'points_total', (select m.points_total from public.fournil_joueurs m where m.id = p_id),
    'points_comptes', p_points_comptes,
    'points_plafonnes', p_points_plafonnes,
    'compte', p_compte,
    'plafonne', p_plafonne
  )
$$;


-- ─── 5. fournil_publier : rejoindre le classement, puis envoyer ses points et sa fortune ───────
-- p_points : ses points de boulanger de la semaine ; p_lundi : le lundi (heure de Paris, sur l'horloge du jeu) de ces points.
-- Les deux sont facultatifs : un téléphone de la version 2 les omet (sa fortune compte, ses points ne bougent pas).
-- Réponse : { ok, erreur: null | 'pseudo_pris' | 'pseudo_invalide' | 'jeton' | 'valeur' | 'trop_vite' | 'complet', version: 3,
--             rang_semaine, rang_total (en points), joueurs et joueurs_total (tous les temps), joueurs_semaine, semaine: 'AAAA-MM-JJ',
--             points_semaine, points_total : ses points comptés ; points_comptes : les points comptés par cet envoi,
--             points_plafonnes : vrai si une partie n'a pas été comptée ;
--             compte : l'argent compté par cet envoi (null si refusé), plafonne : vrai si une partie n'a pas été comptée }
-- Premier envoi d'un identifiant : le joueur est inscrit ; aucun argent n'est compté (on part de zéro, sa fortune sert
-- d'échelle) ; ses points de la semaine, eux, comptent (dans les plafonds) : la semaine d'arrivée fait partie de « Tous les temps ».
-- Envois suivants : le jeton doit correspondre ; le pseudo peut changer (s'il est libre) ;
--   · les points comptés : min( p_points, plafond depuis lundi ) − points déjà comptés (jamais négatif), seulement si p_lundi
--     est la semaine du serveur ;
--   · le gain compté vaut min( fortune − sommet (jamais négatif) , ce que l'enveloppe ajoute en (réserve + temps réel écoulé
--     depuis l'envoi précédent) ).
-- Un identifiant effacé par le ménage (90 jours sans nouvelles) repasse simplement par l'inscription.
create or replace function public.fournil_publier(p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision,
                                                  p_points integer default null, p_lundi date default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi      date := public.fournil_lundi(v_maintenant);
  v_jour       date := public.fournil_jour(v_maintenant);
  v_pseudo     text := public.fournil_pseudo_propre(p_pseudo);
  v_fortune    double precision;
  v_empreinte  text;
  v_contrainte text;
  v_ip         text;
  v_porte      text;
  v_inscrit    boolean;
  v_credit     double precision;
  v_voulu      double precision;
  v_permis     double precision;
  v_compte     double precision;
  v_plafonne   boolean;
  v_pts        boolean;                              -- ses points comptent-ils à cet envoi ? (la semaine du serveur, un nombre donné)
  v_pts_cible  integer;
  v_pts_compte integer;
  v_pts_plaf   boolean;
  j            public.fournil_joueurs%rowtype;
begin
  perform public.fournil_figer(v_lundi);
  -- 1. l'identité : un identifiant et un jeton bien formés
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return public.fournil_reponse('jeton', null, v_lundi, null, null, null, null);
  end if;
  -- 2. le pseudo
  if v_pseudo is null then
    return public.fournil_reponse('pseudo_invalide', null, v_lundi, null, null, null, null);
  end if;
  -- 3. la fortune : un vrai nombre (ni NaN ni infini), positif, sous la borne (NaN échoue aussi à la comparaison)
  if p_fortune is null or not (p_fortune >= 0 and p_fortune <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  -- les points : un nombre entier positif, sous 100 000 (le barème en permet 510 par semaine)
  if p_points is not null and not (p_points >= 0 and p_points <= 100000) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  v_fortune := p_fortune + 0; -- un éventuel « −0 » devient 0
  -- seuls comptent les points de la semaine du serveur : à minuit le lundi, un téléphone en retard (ou en avance) de quelques
  -- minutes ne mélange pas deux semaines ; un ancien téléphone (sans points) ne change pas les siens
  v_pts := p_points is not null and p_lundi is not null and p_lundi = v_lundi;
  v_empreinte := public.fournil_empreinte(p_jeton);

  select * into j from public.fournil_joueurs where id = p_id for update;
  v_inscrit := found;

  -- le ménage, à chaque envoi :
  --   · les boulangers sans nouvelles depuis 90 jours sortent du classement : leur pseudo et leur place se libèrent, leur
  --     palmarès part avec eux (un téléphone ouvert envoie toutes les 5 minutes) ;
  --   · une inscription jamais suivie d'un autre envoi sort au bout de 7 jours (les robots qui s'inscrivent et s'en vont).
  -- Le joueur qui appelle n'est jamais effacé ici : il garde sa ligne, sous le contrôle de son jeton. Une ligne qu'un autre
  -- envoi tient en ce moment est laissée de côté (skip locked) : le ménage n'attend jamais personne, donc aucun interblocage.
  with partis as (
    delete from public.fournil_joueurs
     where id in (select o.id from public.fournil_joueurs o
                   where o.id <> p_id
                     and (o.maj < v_maintenant - interval '90 days' or (o.maj = o.cree and o.cree < v_maintenant - interval '7 days'))
                     for update skip locked)
    returning id
  )
  delete from public.fournil_palmares where id in (select id from partis);

  if v_inscrit then
    -- ── un joueur déjà inscrit ──
    if j.jeton <> v_empreinte then
      return public.fournil_reponse('jeton', null, v_lundi, null, null, null, null);
    end if;
    if v_maintenant < j.maj + interval '10 seconds' then
      return public.fournil_reponse('trop_vite', p_id, v_lundi, null, null, null, null); -- rien ne change, mais on redonne ses rangs
    end if;
    if lower(v_pseudo) <> lower(j.pseudo)
       and exists (select 1 from public.fournil_joueurs where lower(pseudo) = lower(v_pseudo) and id <> p_id) then
      return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null);
    end if;
    -- une nouvelle semaine : le gain et les points repartent de zéro (ceux de la semaine finie sont déjà figés dans le palmarès)
    if j.semaine <> v_lundi then
      j.gain := 0;
      j.points := 0;
      j.semaine := v_lundi;
    end if;
    -- les points : seulement ce qui dépasse ceux déjà comptés cette semaine, dans les plafonds du barème
    v_pts_compte := 0;
    v_pts_plaf := false;
    if v_pts then
      -- (pas de second plafond « depuis l'envoi précédent » : chaque envoi le remettrait à zéro, toutes les 10 s, sans rien
      -- borner ; et un joueur honnête peut prendre 150 points en quelques minutes : Atelier, défi, journée, améliorations)
      v_pts_cible := least(p_points, public.fournil_points_plafond(v_jour - v_lundi + 1));
      v_pts_compte := greatest(v_pts_cible - j.points, 0);
      v_pts_plaf := p_points > j.points + v_pts_compte;
      j.points := j.points + v_pts_compte;
      j.points_total := j.points_total + v_pts_compte;
      j.points_jour := v_jour;
    end if;
    -- ce qui peut compter : seulement ce qui dépasse la plus haute fortune déjà envoyée…
    v_voulu := greatest(v_fortune - j.sommet, 0);
    -- … et pas plus que ce que l'enveloppe ajoute en (réserve + temps réel écoulé, à l'horloge du serveur)
    v_credit := greatest(j.reserve, 0) + greatest(extract(epoch from (v_maintenant - j.maj))::double precision, 0);
    v_permis := greatest(public.fournil_borne(j.plausible, v_credit) - j.plausible, 0);
    v_compte := least(v_voulu, v_permis);
    v_plafonne := v_compte < v_voulu;
    -- le temps d'enveloppe utilisé sort de la réserve ; le reste est gardé, 24 h au plus
    if v_compte > 0 then
      v_credit := v_credit - public.fournil_duree(j.plausible, j.plausible + v_compte);
    end if;
    j.reserve := least(greatest(v_credit, 0), 86400);
    j.plausible := j.plausible + v_compte;
    j.total := j.total + v_compte;
    j.gain := j.gain + v_compte;
    -- l'excès plafonné est perdu pour toujours : le sommet monte quand même
    j.sommet := greatest(j.sommet, v_fortune);
    begin
      update public.fournil_joueurs
         set pseudo = v_pseudo, fortune = v_fortune, sommet = j.sommet, plausible = j.plausible, reserve = j.reserve,
             total = j.total, gain = j.gain, semaine = j.semaine, maj = v_maintenant,
             points = j.points, points_total = j.points_total, points_jour = j.points_jour
       where id = p_id;
    exception when unique_violation then
      return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null); -- un autre a pris ce pseudo au même instant
    end;
  else
    -- ── une inscription ──
    -- une inscription à la fois : chaque appel est une transaction, le verrou tient jusqu'à sa fin, donc l'inscription
    -- suivante compte la ligne déjà validée (sinon des envois simultanés passent tous sous les plafonds)
    perform pg_catalog.pg_advisory_xact_lock(7231001);
    -- par source d'abord : l'adresse que Cloudflare réécrit à chaque requête (cf-connecting-ip ; jamais x-forwarded-for,
    -- que le téléphone peut remplir lui-même). Sans cet en-tête, seuls les plafonds communs jouent.
    v_ip := nullif(btrim(coalesce(
              (nullif(pg_catalog.current_setting('request.headers', true), '')::json) ->> 'cf-connecting-ip', '')), '');
    delete from public.fournil_portes where quand < v_maintenant - interval '1 day';
    if v_ip is not null then
      -- en IPv6, une même box ou un même téléphone dispose de tout un bloc /64 : on compte le bloc, pas l'adresse
      begin
        v_ip := case when pg_catalog.family(v_ip::inet) = 6 then pg_catalog.network(pg_catalog.set_masklen(v_ip::inet, 64))::text
                     else pg_catalog.host(v_ip::inet) end;
      exception when others then
        null; -- une adresse illisible : on la compte telle quelle
      end;
      v_porte := public.fournil_empreinte('ip:' || v_ip);
      if (select count(*) from public.fournil_portes where empreinte = v_porte and quand > v_maintenant - interval '1 hour') >= 10
         or (select count(*) from public.fournil_portes where empreinte = v_porte) >= 20 then
        return public.fournil_reponse('trop_vite', null, v_lundi, null, null, null, null);
      end if;
    end if;
    -- puis pour tout le monde ensemble
    if (select count(*) from public.fournil_joueurs) >= 2000 then
      return public.fournil_reponse('complet', null, v_lundi, null, null, null, null);
    end if;
    if (select count(*) from public.fournil_joueurs where cree > v_maintenant - interval '1 hour') >= 60 then
      return public.fournil_reponse('trop_vite', null, v_lundi, null, null, null, null);
    end if;
    if exists (select 1 from public.fournil_joueurs where lower(pseudo) = lower(v_pseudo)) then
      return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null);
    end if;
    begin
      -- l'argent part de zéro : rien n'est compté ; la fortune envoyée sert de sommet et d'échelle (plafonnée à 1e20 €, voir
      -- la partie 3 : rien ne prouve la fortune d'arrivée), la réserve est pleine. Les points de la semaine comptent, dans le
      -- plafond depuis lundi.
      v_pts_compte := case when v_pts then least(p_points, public.fournil_points_plafond(v_jour - v_lundi + 1)) else 0 end;
      v_pts_plaf := v_pts and p_points > v_pts_compte;
      insert into public.fournil_joueurs (id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj,
                                          points, points_total, points_jour)
      values (p_id, v_empreinte, v_pseudo, v_fortune, v_fortune, least(v_fortune, 1e20), 86400, 0, 0,
              v_lundi, v_maintenant, v_maintenant,
              v_pts_compte, v_pts_compte, case when v_pts then v_jour end);
      if v_porte is not null then
        insert into public.fournil_portes (empreinte, quand) values (v_porte, v_maintenant);
      end if;
    exception when unique_violation then
      -- deux envois au même instant : même pseudo pris par un autre, ou le même joueur envoyé deux fois
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'fournil_joueurs_pseudo' then
        return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null);
      end if;
      return public.fournil_reponse('trop_vite', null, v_lundi, null, null, null, null);
    end;
    v_compte := 0;
    v_plafonne := false;
  end if;

  return public.fournil_reponse(null, p_id, v_lundi, v_compte, v_plafonne, v_pts_compte, v_pts_plaf);
end
$$;


-- ─── 6. fournil_classement : lire le classement ─────────────────────────────────────────────────
-- p_periode : 'semaine' (les points depuis lundi, seulement ceux qui ont envoyé cette semaine) ou 'total' (depuis l'arrivée).
-- p_id : son propre identifiant (facultatif), pour se retrouver même hors des premiers.
-- p_limite : le nombre de lignes (50 par défaut, 100 au plus).
-- Réponse : { version: 3, semaine: 'AAAA-MM-JJ', periode, joueurs, lignes: [{ rang, pseudo, points, valeur, moi, podium }],
--             moi: { rang, points, valeur, podium } | null }
-- Le rang se fait sur les POINTS (de la semaine, ou depuis l'arrivée) ; valeur : l'argent gagné sur la même période, pour
-- information (un téléphone de la version 2 l'affiche encore comme avant, dans l'ordre des points).
-- podium : 1, 2 ou 3 si ce joueur était sur le podium de la semaine PASSÉE (sa toque à côté du pseudo), sinon null.
-- Les ex æquo ont le même rang (puis l'ordre des pseudos) ; jamais d'identifiant ni de jeton dans la réponse.
create or replace function public.fournil_classement(p_periode text, p_id uuid default null, p_limite integer default 50)
returns json
language plpgsql
volatile
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
  perform public.fournil_figer(v_lundi);

  with valeurs as (
    select j.id, j.pseudo,
           case when p_periode = 'semaine' then j.points else j.points_total end as points,
           case when p_periode = 'semaine' then j.gain else j.total end as valeur, p.rang as podium
      from public.fournil_joueurs j
      left join public.fournil_palmares p on p.id = j.id and p.semaine = v_lundi - 7
     where p_periode = 'total' or j.semaine = v_lundi
  ), rangs as (
    select id, pseudo, points, valeur, podium,
           rank() over (order by points desc)::int as rang,
           row_number() over (order by points desc, lower(pseudo), id) as ordre
      from valeurs
  )
  select json_build_object(
           'version', 3,
           'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
           'periode', p_periode,
           'joueurs', (select count(*)::int from rangs),
           'lignes', coalesce((select json_agg(json_build_object('rang', r.rang, 'pseudo', r.pseudo, 'points', r.points, 'valeur', r.valeur,
                                                                 'moi', coalesce(r.id = p_id, false), 'podium', r.podium)
                                               order by r.ordre)
                                 from rangs r where r.ordre <= v_limite), '[]'::json),
           'moi', (select json_build_object('rang', r.rang, 'points', r.points, 'valeur', r.valeur, 'podium', r.podium) from rangs r where r.id = p_id)
         )
    into v_res;
  return v_res;
end
$$;


-- ─── 7. fournil_retirer : quitter le classement ─────────────────────────────────────────────────
-- Réponse : { ok: true } (retiré, ou déjà absent) ou { ok: false, erreur: 'jeton' } (ce n'est pas son jeton).
-- Son palmarès part avec lui (ses coupes et ses tenues restent sur son téléphone).
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
  perform public.fournil_figer(public.fournil_lundi(public.fournil_maintenant()));
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
  delete from public.fournil_palmares where id = p_id;
  delete from public.fournil_joueurs where id = p_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 8. fournil_recompenses : ses podiums, et le podium de la semaine passée ────────────────────
-- Réponse : { ok, erreur: null | 'jeton',
--             podiums: [{ semaine: 'AAAA-MM-JJ' (le lundi de la semaine du podium), rang: 1 | 2 | 3 }], du plus ancien au plus récent,
--             derniere: { semaine, podium: [{ rang, pseudo, points, valeur }] } | null (null : personne n'a marqué la semaine passée) }
-- Un identifiant inconnu (jamais inscrit, ou effacé par le ménage) : ok, aucun podium. Le jeton d'un autre : 'jeton', rien.
create or replace function public.fournil_recompenses(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lundi    date := public.fournil_lundi(public.fournil_maintenant());
  v_jeton    text;
  v_inscrit  boolean;
  v_derniere json;
begin
  perform public.fournil_figer(v_lundi);
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton', 'podiums', '[]'::json, 'derniere', null);
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id;
  v_inscrit := found;
  if v_inscrit and v_jeton <> public.fournil_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton', 'podiums', '[]'::json, 'derniere', null);
  end if;
  select json_build_object('semaine', to_char(v_lundi - 7, 'YYYY-MM-DD'),
                           'podium', json_agg(json_build_object('rang', p.rang, 'pseudo', p.pseudo, 'points', p.points, 'valeur', p.valeur)
                                              order by p.rang, lower(p.pseudo)))
    into v_derniere
    from public.fournil_palmares p
   where p.semaine = v_lundi - 7
  having count(*) > 0;
  return json_build_object(
    'ok', true,
    'erreur', null,
    'podiums', coalesce((select json_agg(json_build_object('semaine', to_char(p.semaine, 'YYYY-MM-DD'), 'rang', p.rang)
                                         order by p.semaine)
                           from public.fournil_palmares p
                          where v_inscrit and p.id = p_id), '[]'::json),
    'derniere', v_derniere
  );
end
$$;


-- ─── 9. fournil_heure : l'heure du serveur ──────────────────────────────────────────────────────
-- Réponse : { ms } (millisecondes depuis le 1er janvier 1970, temps universel) : une source d'heure sûre pour le jeu
-- (l'heure du téléphone, elle, se change dans les réglages).
create or replace function public.fournil_heure()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
begin
  perform public.fournil_figer(public.fournil_lundi(v_maintenant));
  return json_build_object('ms', floor(extract(epoch from v_maintenant) * 1000)::bigint);
end
$$;


-- ─── 10. Les droits : le jeu n'appelle que les cinq fonctions ───────────────────────────────────
-- Postgres et Supabase donnent par défaut le droit d'exécuter les nouvelles fonctions à tout le monde :
-- on le retire partout, puis on le rend seulement pour les cinq fonctions du jeu.
revoke all on function public.fournil_maintenant() from public, anon, authenticated;
revoke all on function public.fournil_lundi(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_jour(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_points_plafond(integer) from public, anon, authenticated;
revoke all on function public.fournil_pseudo_propre(text) from public, anon, authenticated;
revoke all on function public.fournil_jeton_valable(text) from public, anon, authenticated;
revoke all on function public.fournil_empreinte(text) from public, anon, authenticated;
revoke all on function public.fournil_paliers() from public, anon, authenticated;
revoke all on function public.fournil_segment(integer) from public, anon, authenticated;
revoke all on function public.fournil_duree(double precision, double precision) from public, anon, authenticated;
revoke all on function public.fournil_borne(double precision, double precision) from public, anon, authenticated;
revoke all on function public.fournil_figer(date) from public, anon, authenticated;
revoke all on function public.fournil_reponse(text, uuid, date, double precision, boolean, integer, boolean) from public, anon, authenticated;

revoke all on function public.fournil_publier(uuid, text, text, double precision, integer, date) from public;
revoke all on function public.fournil_classement(text, uuid, integer) from public;
revoke all on function public.fournil_retirer(uuid, text) from public;
revoke all on function public.fournil_recompenses(uuid, text) from public;
revoke all on function public.fournil_heure() from public;
grant execute on function public.fournil_publier(uuid, text, text, double precision, integer, date) to anon, authenticated;
grant execute on function public.fournil_classement(text, uuid, integer) to anon, authenticated;
grant execute on function public.fournil_retirer(uuid, text) to anon, authenticated;
grant execute on function public.fournil_recompenses(uuid, text) to anon, authenticated;
grant execute on function public.fournil_heure() to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';
