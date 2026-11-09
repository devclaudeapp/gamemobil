-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 7.0 : le Marché de Noël (18 → 25 décembre 2026), son classement et son enveloppe
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un patch à coller PAR-DESSUS la version 6.9 déjà installée : SQL Editor → New query → coller tout → Run. Il se recolle
--  autant de fois qu'on veut, sans casse. À coller AVANT l'ouverture du Marché de Noël, le vendredi 18 décembre 2026 à midi
--  (heure de Paris) : sans lui, le serveur ne connaît pas 'noel' et ignore les sucres d'orge envoyés (le jeu le supporte : l'onglet
--  du classement reste vide, rien ne casse ; une fois collé, le prochain envoi compte le score, borné à l'instant de l'envoi).
--  ÉTAT (9 nov., conception, docs/noel-contrat.md § 5) : la table vient du PROTOTYPE des règles (outils/noel/proto.js : src/marche.js
--  aux dates de Noël), essayée dans PGlite (outils/noel/sql-v70.cjs : le patch collé deux fois par-dessus la 6.9, 34 vérifications).
--  Le constructeur A la refait sur les VRAIES règles (src/noel.js, outils/noel/rythme.js --reel --plancher), la recopie ici et dans le
--  fichier complet supabase/fournil-classement.sql (la règle du dépôt : le même tableau, le même code), et ajoute la section v7.0 de
--  test/fournil-classement-sql.cjs. C'est CE PATCH qu'on colle sur Supabase.
--
--  Pourquoi : le Marché de Noël (src/noel.js : le même moteur que le Marché d'automne et la Maison hantée, sa propre monnaie, les
--  pains d'épices) est un événement générique de plus : une ligne de fournil_evts(). Tout le reste suit de lui-même depuis la version 5
--  et la 6.6 : fournil_publier accepte p_evt = 'noel' (l'événement existe) et borne son score par fournil_evt_borne (la table
--  ci-dessous), fournil_classement('noel') rend son classement à part, fournil_evt_figer fige ses quinze premiers une heure après la
--  fin (le vendredi 25 décembre à 21 h), fournil_recompenses rend evenements.noel = { rang, joueurs, podium }, et fournil_annoncer
--  envoie l'ouverture et la fin à ceux qui veulent les événements.
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_evts() : les lignes 'hantee' et 'marche' INCHANGÉES (leurs fenêtres et leurs tableaux de la 6.6 et de la 6.9 : leurs
--      podiums déjà figés restent lisibles, et fournil_classement('hantee') / ('marche') restent des périodes connues), et la ligne
--      'noel' : du vendredi 18 décembre 2026 à midi au vendredi 25 décembre 2026 à 20 h, heure de Paris ; un pas de 6 heures ; 31 log10
--      (0 à 180 h : la fenêtre fait 176 h, comme celle du Marché d'automne). La table vient de outils/noel/rythme.js : le marathon
--      (23 h 48 par jour, le ×6 jamais endormi, toutes les activités, la recette du jour et la collection au mieux, Astuces achetées ou
--      offertes dès le 12e palier) sur 24 tirages, minute par minute, × 2,2 arrondi au 0,05 supérieur, croissante, puis relevée au moins
--      à la table du Marché d'automne (le même moteur sur la même fenêtre : --plancher) ; elle lui est identique. ×2,20 de marge au plus
--      juste, et encore ×2,22 sur 24 autres tirages qu'elle n'a pas vus ; ×14,1 et ×14,9 au plus large après les sept premières heures.
--      Sa valeur d'ouverture est celle des deux autres (11,65) ;
--    · fournil_evt_titre : « le Marché de Noël » (le texte des notifications d'ouverture et de fin) ;
--    · les mêmes signatures, le même langage, la même volatilité, le même search_path ; les mêmes droits (fonctions internes : ni anon
--      ni authenticated). Aucune table, aucune donnée, aucune autre fonction n'est touchée.
--  En bas, une requête de contrôle : les événements connus, la table du Marché de Noël, sa limite en ce moment (0 avant l'ouverture)
--  et le titre.

begin;

-- la v6.6 au moins doit être là (le podium des événements jusqu'au 15e, la colonne joueurs) : sinon, rien n'est changé (la ligne
-- 'marche' de la 6.9 est reprise telle quelle ci-dessous : un serveur resté en 6.8 la reçoit avec ce patch)
do $$
begin
  if to_regprocedure('public.fournil_evt_borne(text, timestamp with time zone)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fournil_evenements' and column_name = 'joueurs') then
    raise exception 'Le Fournil : colle d''abord la version 6.9 (supabase/fournil-classement.sql), puis ce patch';
  end if;
end
$$;

-- les événements génériques : 'hantee' (« La Maison hantée », inchangée depuis la 6.6), 'marche' (« Le Marché d'automne », inchangée
-- depuis la 6.9) et 'noel' (« Le Marché de Noël », src/noel.js, test/fournil-noel.test.js ; outils/noel/rythme.js pour la conception) ;
-- un pas de 6 heures
create or replace function public.fournil_evts()
returns table (nom text, debut timestamptz, fin timestamptz, pas double precision, tableau double precision[])
language sql
immutable
set search_path = ''
as $$
  values ('hantee'::text, '2026-10-27 12:00:00 Europe/Paris'::timestamptz, '2026-11-02 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,16.1,16.1,16.35,16.75,17,17.15,17.35,17.45,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05,18.1,18.15,18.15,18.2,18.25,18.3,18.3,18.35,18.4,18.4}'::double precision[]),
         ('marche'::text, '2026-11-13 12:00:00 Europe/Paris'::timestamptz, '2026-11-20 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.95,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.95,18,18.05,18.1,18.15,18.15,18.2}'::double precision[]), -- v6.9 : le Marché d'automne
         ('noel'::text, '2026-12-18 12:00:00 Europe/Paris'::timestamptz, '2026-12-25 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.95,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.95,18,18.05,18.1,18.15,18.15,18.2}'::double precision[]) -- v7.0 : le Marché de Noël
$$;

-- le nom d'un événement dans une phrase (« la Maison hantée », « le Marché d'automne », « le Marché de Noël », « le Quartier ») ; un événement à venir sans nom : son identifiant
create or replace function public.fournil_evt_titre(p_evt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_evt when 'hantee' then 'la Maison hantée' when 'marche' then 'le Marché d''automne' when 'noel' then 'le Marché de Noël' when 'quartier' then 'le Quartier' else coalesce(p_evt, 'l''événement') end
$$;

-- les droits : comme en version 6 (fonctions internes : personne d'autre que le propriétaire ne les appelle)
revoke all on function public.fournil_evts() from public, anon, authenticated;
revoke all on function public.fournil_evt_titre(text) from public, anon, authenticated;

commit;

-- le contrôle : les événements connus (hantee, marche, noel), la table du Marché de Noël (31 valeurs), la plus haute valeur de sucres
-- d'orge acceptée en ce moment (0 avant le 18 décembre à midi) et son log10, celle de la fin, et le titre des notifications
select (select string_agg(x.nom, ', ' order by x.debut) from public.fournil_evts() x) as evenements,
       (select x.tableau from public.fournil_evts() x where x.nom = 'noel') as noel,
       (select array_length(x.tableau, 1) from public.fournil_evts() x where x.nom = 'noel') as noel_valeurs,
       public.fournil_evt_borne('noel', now()) as borne_noel,
       round(log(greatest(public.fournil_evt_borne('noel', now()), 1))::numeric, 2) as borne_noel_log10,
       round(log(public.fournil_evt_borne('noel', '2026-12-25 20:00:00 Europe/Paris'::timestamptz))::numeric, 2) as borne_noel_fin_log10,
       public.fournil_evt_titre('noel') as titre;
