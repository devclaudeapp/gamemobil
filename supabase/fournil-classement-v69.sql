-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.9 : le Marché d'automne (13 → 20 novembre 2026), son classement et son enveloppe
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un patch à coller PAR-DESSUS la version 6.8 déjà installée : SQL Editor → New query → coller tout → Run. Il se recolle
--  autant de fois qu'on veut, sans casse. À coller AVANT l'ouverture du Marché d'automne, le vendredi 13 novembre 2026 à midi
--  (heure de Paris) : sans lui, le serveur ne connaît pas 'marche' et ignore les noisettes envoyées (le jeu le supporte : l'onglet
--  du classement reste vide, rien ne casse).
--  ÉTAT : la table confirmée sur les VRAIES règles (src/marche.js : test/fournil-marche.test.js, outils/marche/rythme.js --reel), essayée
--  dans PGlite (test/fournil-classement-sql.cjs, section v6.9 : le patch collé deux fois par-dessus la 6.8), et recopiée dans le fichier
--  complet supabase/fournil-classement.sql (la règle du dépôt : le même tableau, le même code). C'est CE PATCH qu'on colle sur Supabase.
--
--  Pourquoi : le Marché d'automne (src/marche.js : le même moteur que la Maison hantée, sa propre monnaie, les noisettes) est un
--  événement générique de plus : une ligne de fournil_evts(). Tout le reste suit de lui-même depuis la version 5 et la 6.6 :
--  fournil_publier accepte p_evt = 'marche' (l'événement existe) et borne son score par fournil_evt_borne (la table ci-dessous),
--  fournil_classement('marche') rend son classement à part, fournil_evt_figer fige ses quinze premiers une heure après la fin
--  (le vendredi 20 novembre à 21 h), fournil_recompenses rend evenements.marche = { rang, joueurs, podium }, et fournil_annoncer
--  envoie l'ouverture et la fin à ceux qui veulent les événements.
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_evts() : la ligne 'hantee' INCHANGÉE (sa fenêtre et son tableau de la 6.6 : son podium déjà figé reste lisible, et
--      fournil_classement('hantee') reste une période connue), et la ligne 'marche' : du vendredi 13 novembre 2026 à midi au vendredi
--      20 novembre 2026 à 20 h, heure de Paris ; un pas de 6 heures ; 31 log10 (0 à 180 h : la fenêtre fait 176 h). La table vient de
--      outils/marche/rythme.js : le marathon (23 h 48 par jour, le ×6 jamais endormi, toutes les activités, la recette du jour et la
--      collection au mieux, Astuces achetées ou offertes dès le 12e palier) sur 24 tirages, minute par minute, × 2,2 arrondi au 0,05
--      supérieur, croissante ; retirée sur le prototype puis sur les VRAIES règles (src/marche.js, --reel), elle est le plus haut des deux
--      à chaque pas (les vraies règles ont demandé +0,05 à 48 h et à 144 h ; le prototype, +0,05 à 6 et 12 h). Sur les vraies règles :
--      ×2,20 de marge au plus juste, et encore ×2,21 sur 24 autres tirages qu'elle n'a pas vus ; ×13,9 et ×14,7 au plus large après les
--      sept premières heures (outils/marche/rythme-reel-table-v69.txt). Sa valeur d'ouverture est celle de la Maison hantée (11,65) ;
--    · fournil_evt_titre : « le Marché d'automne » (le texte des notifications d'ouverture et de fin) ;
--    · les mêmes signatures, le même langage, la même volatilité, le même search_path ; les mêmes droits (fonctions internes : ni anon
--      ni authenticated). Aucune table, aucune donnée, aucune autre fonction n'est touchée.
--  En bas, une requête de contrôle : les événements connus, la table du Marché, sa limite en ce moment (0 avant l'ouverture) et le titre.

begin;

-- la v6.6 au moins doit être là (le podium des événements jusqu'au 15e, la colonne joueurs) : sinon, rien n'est changé
do $$
begin
  if to_regprocedure('public.fournil_evt_borne(text, timestamp with time zone)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fournil_evenements' and column_name = 'joueurs') then
    raise exception 'Le Fournil : colle d''abord la version 6.8 (supabase/fournil-classement.sql), puis ce patch';
  end if;
end
$$;

-- les événements génériques : 'hantee' (« La Maison hantée », inchangée depuis la 6.6) et 'marche' (« Le Marché d'automne », src/marche.js,
-- test/fournil-marche.test.js ; outils/marche/rythme.js pour la conception) ; un pas de 6 heures
create or replace function public.fournil_evts()
returns table (nom text, debut timestamptz, fin timestamptz, pas double precision, tableau double precision[])
language sql
immutable
set search_path = ''
as $$
  values ('hantee'::text, '2026-10-27 12:00:00 Europe/Paris'::timestamptz, '2026-11-02 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,16.1,16.1,16.35,16.75,17,17.15,17.35,17.45,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05,18.1,18.15,18.15,18.2,18.25,18.3,18.3,18.35,18.4,18.4}'::double precision[]),
         ('marche'::text, '2026-11-13 12:00:00 Europe/Paris'::timestamptz, '2026-11-20 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.95,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.95,18,18.05,18.1,18.15,18.15,18.2}'::double precision[]) -- v6.9 : le Marché d'automne
$$;

-- le nom d'un événement dans une phrase (« la Maison hantée », « le Marché d'automne », « le Quartier ») ; un événement à venir sans nom : son identifiant
create or replace function public.fournil_evt_titre(p_evt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_evt when 'hantee' then 'la Maison hantée' when 'marche' then 'le Marché d''automne' when 'quartier' then 'le Quartier' else coalesce(p_evt, 'l''événement') end
$$;

-- les droits : comme en version 6 (fonctions internes : personne d'autre que le propriétaire ne les appelle)
revoke all on function public.fournil_evts() from public, anon, authenticated;
revoke all on function public.fournil_evt_titre(text) from public, anon, authenticated;

commit;

-- le contrôle : les événements connus (hantee, marche), la table du Marché (31 valeurs), la plus haute valeur de noisettes acceptée en ce
-- moment (0 avant le 13 novembre à midi) et son log10, celle de la fin, et le titre des notifications
select (select string_agg(x.nom, ', ' order by x.debut) from public.fournil_evts() x) as evenements,
       (select x.tableau from public.fournil_evts() x where x.nom = 'marche') as marche,
       (select array_length(x.tableau, 1) from public.fournil_evts() x where x.nom = 'marche') as marche_valeurs,
       public.fournil_evt_borne('marche', now()) as borne_marche,
       round(log(greatest(public.fournil_evt_borne('marche', now()), 1))::numeric, 2) as borne_marche_log10,
       round(log(public.fournil_evt_borne('marche', '2026-11-20 20:00:00 Europe/Paris'::timestamptz))::numeric, 2) as borne_marche_fin_log10,
       public.fournil_evt_titre('marche') as titre;
