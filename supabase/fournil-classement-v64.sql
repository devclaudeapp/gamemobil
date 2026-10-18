-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.4 : la limite des événements, relevée pour le Sirop ×4 et le Cristal ×2
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un petit patch à coller PAR-DESSUS la version 6.3 (ou directement par-dessus la 6 ou la 6.2) déjà installée : SQL Editor →
--  New query → coller tout → Run. Il se recolle autant de fois qu'on veut, sans casse.
--
--  Pourquoi : les deux dernières recettes des événements rapportent encore plus (seul leur gain par niveau change) : au Quartier
--  (src/quartier.js), le Sirop violet ×4 et le Cristal bleu ×2 ; à la Maison hantée (src/hantee.js), leurs jumeaux, les Gâteaux
--  du cimetière ×4 et les Œufs de dragon en chocolat ×1,5. Un niveau de Sirop se remboursait encore ~5,6 fois plus lentement qu'un
--  niveau de Spécialité ; ce n'est plus que ~1,4 fois. Un joueur qui ne lâche jamais l'événement gagne donc plus à la fin :
--  l'enveloppe du serveur (ce qu'il aurait pu gagner, avec une marge d'au moins ×2) doit grandir d'autant, sinon un joueur
--  honnête et assidu serait plafonné.
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_quartier_table() : les quinze log10 de l'enveloppe des billets du Quartier, un par jour (jours 0 à 14) ;
--    · fournil_evts() : la ligne 'hantee', même fenêtre (du mardi 27 octobre 2026 à midi au lundi 2 novembre 2026 à 20 h, heure
--      de Paris), même pas de 6 heures, ses 27 log10 ;
--    · chaque nouvelle valeur est supérieure ou égale à celle de la 6.3, au même pas : personne n'est plafonné plus bas qu'avant ;
--    · les mêmes signatures, le même langage, la même volatilité, le même search_path que la version 6 ; les mêmes droits
--      (fonctions internes : ni anon ni authenticated). fournil_quartier_borne et fournil_evt_borne lisent ces tables : elles
--      suivent d'elles-mêmes.
--  Aucune table, aucune donnée, aucune autre fonction n'est touchée : joueurs, points, billets, bonbons, palmarès et podiums
--  restent tels quels. Un billet ou un bonbon déjà plafonné ne remonte pas tout seul : le prochain envoi du téléphone (qui renvoie
--  toujours son total) le recompte sous la nouvelle enveloppe.
--  En bas, une requête de contrôle : les deux tableaux, et la limite du Quartier en ce moment.

begin;

-- l'enveloppe des billets du Quartier : le log10 de ce qu'un joueur qui ne lâche jamais sa Planque aurait gagné k jours après
-- l'ouverture, k de 0 à 14, marge d'au moins ×2 (simulation de test/fournil-quartier.test.js, qui vérifie cette table)
-- (avant la 6.4 : {12.5,14.5,16.4,16.9,17.15,17.3,17.45,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05})
create or replace function public.fournil_quartier_table()
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select '{12.5,14.5,16.55,17.15,17.45,17.65,17.8,17.9,18,18.1,18.2,18.25,18.3,18.4,18.45}'::double precision[]
$$;

-- les événements génériques : 'hantee', « La Maison hantée » (src/hantee.js, test/fournil-hantee.test.js) ; un pas de 6 heures
-- (27 valeurs : 6 j 12 h) ; avant la 6.4 :
-- {11.65,14.05,16.05,16.1,16.35,16.6,16.75,16.9,17,17.1,17.2,17.25,17.35,17.4,17.45,17.5,17.55,17.55,17.6,17.65,17.65,17.7,17.75,17.75,17.8,17.8,17.8}
create or replace function public.fournil_evts()
returns table (nom text, debut timestamptz, fin timestamptz, pas double precision, tableau double precision[])
language sql
immutable
set search_path = ''
as $$
  values ('hantee'::text, '2026-10-27 12:00:00 Europe/Paris'::timestamptz, '2026-11-02 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,14.05,16.05,16.2,16.55,16.8,17,17.15,17.25,17.35,17.45,17.55,17.6,17.65,17.7,17.75,17.8,17.85,17.9,17.95,18,18,18.05,18.1,18.1,18.15,18.15}'::double precision[])
$$;

-- les droits : comme en version 6, des fonctions internes (personne d'autre que le propriétaire ne les appelle)
revoke all on function public.fournil_quartier_table() from public, anon, authenticated;
revoke all on function public.fournil_evts() from public, anon, authenticated;

commit;

-- le contrôle : les deux tableaux, et la plus haute valeur de billets acceptée en ce moment au Quartier (et son log10)
select public.fournil_quartier_table() as quartier,
       (select x.tableau from public.fournil_evts() x where x.nom = 'hantee') as hantee,
       public.fournil_quartier_borne(now()) as borne_quartier,
       round(log(greatest(public.fournil_quartier_borne(now()), 1))::numeric, 2) as borne_quartier_log10;
