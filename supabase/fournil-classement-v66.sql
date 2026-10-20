-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.6 : la limite de la Maison hantée, relevée pour ses activités (Halloween « qui choque »)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un petit patch à coller PAR-DESSUS la version 6.5 déjà installée : SQL Editor → New query → coller tout → Run. Il se recolle
--  autant de fois qu'on veut, sans casse. Le fichier complet (supabase/fournil-classement.sql) porte le même tableau : le recoller
--  plus tard ne revient pas en arrière. À coller AVANT l'ouverture de la Maison hantée, le mardi 27 octobre 2026 à midi.
--
--  Pourquoi : la Maison hantée a désormais des choses à FAIRE (src/hantee.js) : le ×6 de présence qui s'endort sans toucher, les
--  clients-monstres à servir, les fournées parfaites, les apparitions à attraper, les commandes de la nuit. Elles paient (plafonnées à
--  l'heure et au jour), et dès le premier jour, quand l'économie grimpe le plus vite : un joueur qui ne lâche jamais l'événement gagne
--  donc plus (×1,08 à la fin, mais bien plus tôt dans la première nuit), et l'ancienne table tombait à ×1,69 de marge au lieu d'au
--  moins ×2,2. L'enveloppe du serveur (ce qu'il aurait pu gagner, avec une marge d'au moins ×2,2) doit grandir d'autant, sinon un
--  joueur honnête et assidu serait plafonné.
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_evts() : la ligne 'hantee', même fenêtre (du mardi 27 octobre 2026 à midi au lundi 2 novembre 2026 à 20 h, heure
--      de Paris), même pas de 6 heures, ses 27 log10 (la recette du jour à la part 0,25 et les activités, jouées au mieux, minute par
--      minute ; ×2,21 de marge au plus juste, ×11,5 au plus large après six heures) ;
--    · chaque nouvelle valeur est supérieure ou égale à celle de la 6.5, au même pas : personne n'est plafonné plus bas qu'avant ;
--    · la même signature, le même langage, la même volatilité, le même search_path que la version 6 ; les mêmes droits (fonction
--      interne : ni anon ni authenticated). fournil_evt_borne lit cette table : elle suit d'elle-même. Le Quartier ne change pas.
--  Aucune table, aucune donnée, aucune autre fonction n'est touchée : joueurs, points, billets, bonbons, palmarès et podiums
--  restent tels quels.
--  En bas, une requête de contrôle : le tableau de la Maison hantée, et sa limite en ce moment (0 avant l'ouverture).

begin;

-- les événements génériques : 'hantee', « La Maison hantée » (src/hantee.js, test/fournil-hantee.test.js) ; un pas de 6 heures
-- (27 valeurs : 6 j 12 h) ; avant la 6.6 :
-- {11.65,14.2,16.05,16.35,16.75,17,17.15,17.35,17.45,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05,18.1,18.15,18.15,18.2,18.25,18.3,18.3,18.35,18.4,18.4}
create or replace function public.fournil_evts()
returns table (nom text, debut timestamptz, fin timestamptz, pas double precision, tableau double precision[])
language sql
immutable
set search_path = ''
as $$
  values ('hantee'::text, '2026-10-27 12:00:00 Europe/Paris'::timestamptz, '2026-11-02 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,14.35,16.3,16.4,16.85,17.05,17.2,17.35,17.5,17.6,17.65,17.75,17.85,17.9,17.95,18,18.05,18.1,18.15,18.2,18.25,18.3,18.3,18.35,18.35,18.4,18.4}'::double precision[])
$$;

-- les droits : comme en version 6, une fonction interne (personne d'autre que le propriétaire ne l'appelle)
revoke all on function public.fournil_evts() from public, anon, authenticated;

commit;

-- le contrôle : le tableau de la Maison hantée, et la plus haute valeur de bonbons acceptée en ce moment (et son log10)
select (select x.tableau from public.fournil_evts() x where x.nom = 'hantee') as hantee,
       public.fournil_evt_borne('hantee', now()) as borne_hantee,
       round(log(greatest(public.fournil_evt_borne('hantee', now()), 1))::numeric, 2) as borne_hantee_log10;
