-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.6 : la limite de la Maison hantée relevée pour ses activités, et ses acharnés jusqu'au 15e
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un patch à coller PAR-DESSUS la version 6.5 déjà installée : SQL Editor → New query → coller tout → Run. Il se recolle
--  autant de fois qu'on veut, sans casse. Le fichier complet (supabase/fournil-classement.sql) porte le même tableau et le même code : le recoller
--  plus tard ne revient pas en arrière. À coller AVANT l'ouverture de la Maison hantée, le mardi 27 octobre 2026 à midi.
--
--  Pourquoi : la Maison hantée a désormais des choses à FAIRE (src/hantee.js) : le ×6 de présence qui s'endort sans toucher, les
--  clients-monstres à servir, les fournées parfaites, les apparitions à attraper, les commandes de la nuit. Elles paient (plafonnées à
--  l'heure et au jour), et dès le premier jour, quand l'économie grimpe le plus vite : un joueur qui ne lâche jamais l'événement gagne
--  donc plus (×1,08 à la fin, mais bien plus tôt dans la première nuit), et l'ancienne table tombait à ×1,69 de marge au lieu d'au
--  moins ×2,2. L'enveloppe du serveur (ce qu'il aurait pu gagner, avec une marge d'au moins ×2,2) doit grandir d'autant, sinon un
--  joueur honnête et assidu serait plafonné.
--  Mise à jour du 21 octobre (v6.7 du jeu, avant toute mise en ligne de ce patch) : les paliers de la Maison hantée réglés pour le
--  « juste milieu » entre joueurs occasionnels et acharnés (seuils plus bas jusqu'au 12e, et chaque palier s'ouvre un jour de la
--  semaine : quatre le premier jour, puis trois, puis deux). La réputation du Manoir (×1,5 par palier, jusqu'au 12e) suit les bonbons :
--  le marathon l'a donc toute dès les premières heures (×3 à ×10 plus haut qu'avant entre la 2e et la 6e heure), puis il gagne moins
--  (les recettes et Sortilèges « après le palier » attendent leur jour : 511 Bd à la fin au lieu de 861). La table monte au 1er pas
--  (6 h : 14,5 → 16,1 ; l'interpolation depuis l'ouverture doit couvrir ces premières heures) et retombe ensuite sur la v6.5 en ligne,
--  dont elle ne descend jamais. Avant cette mise à jour, le patch portait :
--  {11.65,14.5,16.35,16.45,16.9,17.05,17.25,17.4,17.5,17.65,17.7,17.8,17.85,17.9,17.95,18.05,18.1,18.15,18.2,18.2,18.25,18.3,18.35,18.35,18.4,18.4,18.45}
--
--  Mise à jour du 21 octobre (les ACHARNÉS de la Maison hantée, avant toute mise en ligne de ce patch) : comme le classement de la semaine
--  (v6.5), le podium final de l'événement garde les QUINZE premiers, et chacun reçoit dans son jeu des étoiles et un boost (le téléphone
--  les donne, une fois : src/classement.js, RECOMPENSES_EVT ; les trois premiers gardent en plus la tenue d'Halloween en or, comme avant) ;
--  et le titre « Légende du Manoir » (le 20e palier, à vie), que montre la photo de sa boutique, se voit à côté du pseudo dans la liste.
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_evt_podium accepte les rangs 1 à 15 (contrainte fournil_evt_podium_rang_check) ; fournil_evenements gagne la colonne
--      joueurs (combien de joueurs classés quand l'événement a été figé, « 7e sur 12 » ; null pour un événement figé avant la 6.6) ;
--    · fournil_evt_figer : les quinze premiers (score > 0, ex æquo au même rang) et le nombre de joueurs ; le Quartier, figé à part le
--      27 octobre, garde son podium à trois (fournil_quartier_figer n'est pas touchée) ;
--    · fournil_recompenses : evenements.<evt> = { rang: 1 à 15 | null, joueurs, podium: les trois premiers seulement, comme avant } (un
--      téléphone d'avant ne lit que les rangs 1 à 3 ; le reste de la réponse est le même) ;
--    · fournil_classement : titre sur chaque ligne et dans moi (le champ ti de la photo de sa boutique, s'il a la forme d'un identifiant ;
--      null sinon) ; la médaille du podium final d'un événement (podium) reste aux trois premiers ;
--    · fournil_evts() : la ligne 'hantee', même fenêtre (du mardi 27 octobre 2026 à midi au lundi 2 novembre 2026 à 20 h, heure
--      de Paris), même pas de 6 heures, ses 27 log10 (la recette du jour à la part 0,25 et les activités, jouées au mieux, minute par
--      minute, sur 80 tirages du hasard des coups de pouce, Sortilèges achetés et offerts : ×2,36 de marge au plus juste, et encore
--      ×2,33 sur 40 autres tirages qu'elle n'a pas vus ; ×34 au plus large juste après six heures, ×14,4 après sept heures, ×10,7
--      ensuite) ;
--    · chaque nouvelle valeur est supérieure ou égale à celle de la 6.5, au même pas : personne n'est plafonné plus bas qu'avant ;
--    · les mêmes signatures, le même langage, la même volatilité, le même search_path que la version 6 ; les mêmes droits (fonctions
--      internes : ni anon ni authenticated ; fournil_classement et fournil_recompenses : anon et authenticated). fournil_evt_borne lit
--      la table de fournil_evts() : elle suit d'elle-même. Le Quartier ne change pas.
--  Aucune donnée n'est touchée : joueurs, points, billets, bonbons, palmarès, podiums et photos restent tels quels (un podium d'événement
--  déjà figé à trois reste lisible tel quel).
--  En bas, une requête de contrôle : le tableau de la Maison hantée, sa limite en ce moment (0 avant l'ouverture), et ce que la 6.6
--  installe (les rangs du podium des événements, la colonne joueurs).

begin;

-- ─── les tables : le podium d'un événement jusqu'au 15e, le nombre de joueurs classés ───
alter table public.fournil_evt_podium drop constraint if exists fournil_evt_podium_rang_check;
alter table public.fournil_evt_podium add constraint fournil_evt_podium_rang_check check (rang between 1 and 15);
alter table public.fournil_evenements add column if not exists joueurs integer;

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
          '{11.65,16.1,16.1,16.35,16.75,17,17.15,17.35,17.45,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05,18.1,18.15,18.15,18.2,18.25,18.3,18.3,18.35,18.4,18.4}'::double precision[])
$$;

-- ─── le podium final des événements génériques : les quinze premiers, et le nombre de joueurs ───
create or replace function public.fournil_evt_figer(p_maintenant timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  e record;
  v_n integer;
  v_j integer;
begin
  for e in select x.nom from public.fournil_evts() x
            where p_maintenant >= x.fin + interval '1 hour'
              and not exists (select 1 from public.fournil_evenements f where f.nom = x.nom) loop
    insert into public.fournil_evenements (nom, figee) values (e.nom, p_maintenant) on conflict (nom) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      insert into public.fournil_evt_podium (evt, id, rang, pseudo, valeur)
      select e.nom, r.id, r.rang, r.pseudo, r.valeur
        from (select s.id, j.pseudo, s.valeur, rank() over (order by s.valeur desc)::int as rang
                from public.fournil_evt_scores s join public.fournil_joueurs j on j.id = s.id
               where s.evt = e.nom and s.valeur > 0) r
       where r.rang <= 15
      on conflict (evt, id) do nothing;
      -- version 6.6 : combien de joueurs étaient classés à la fin (score > 0)
      select count(*)::int into v_j from public.fournil_evt_scores s join public.fournil_joueurs j on j.id = s.id
       where s.evt = e.nom and s.valeur > 0;
      update public.fournil_evenements set joueurs = v_j where nom = e.nom;
    end if;
  end loop;
end
$$;

-- ─── fournil_classement : le titre de chaque ligne (la photo de sa boutique), la médaille du podium final aux trois premiers ───
-- (le même code que la version 6.5, sauf titre et la jointure du podium final d'un événement : e.rang <= 3)
create or replace function public.fournil_classement(p_periode text, p_id uuid default null, p_limite integer default 50)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi  date := public.fournil_lundi(v_maintenant);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_evt    boolean := p_periode is not null and p_periode not in ('semaine', 'total', 'quartier')
                      and exists (select 1 from public.fournil_evts() x where x.nom = p_periode);
  v_res    json;
begin
  if p_periode is null or (p_periode not in ('semaine', 'total', 'quartier') and not v_evt) then
    raise exception using errcode = '22023', message = 'fournil_classement : période inconnue (« semaine », « total », « quartier » ou un événement)';
  end if;
  perform public.fournil_figer(v_lundi);

  with valeurs as (
    select j.id, j.pseudo,
           case when p_periode = 'semaine' then j.points when p_periode = 'total' then j.points_total else null end as points,
           case when p_periode = 'semaine' then j.gain when p_periode = 'total' then j.total when p_periode = 'quartier' then j.quartier else s.valeur end as valeur,
           case when p_periode = 'quartier' then q.rang when v_evt then e.rang else p.rang end as podium,
           coalesce(j.vu > v_maintenant - interval '4 minutes' and j.vu <= v_maintenant + interval '1 minute', false) as en_ligne,
           case when f.photo ->> 'ti' ~ '^[a-z0-9-]{1,24}$' then f.photo ->> 'ti' end as titre
      from public.fournil_joueurs j
      left join public.fournil_palmares p on p.id = j.id and p.semaine = v_lundi - 7 and p.rang <= 3
      left join public.fournil_quartier_podium q on q.id = j.id
      left join public.fournil_evt_scores s on v_evt and s.evt = p_periode and s.id = j.id
      left join public.fournil_evt_podium e on v_evt and e.evt = p_periode and e.id = j.id and e.rang <= 3
      left join public.fournil_photos f on f.id = j.id
     where (p_periode = 'total') or (p_periode = 'semaine' and j.semaine = v_lundi) or (p_periode = 'quartier' and j.quartier > 0)
        or (v_evt and s.valeur > 0)
  ), rangs as (
    select id, pseudo, points, valeur, podium, en_ligne, titre,
           rank() over (order by case when p_periode = 'quartier' or v_evt then valeur else points::double precision end desc)::int as rang,
           row_number() over (order by case when p_periode = 'quartier' or v_evt then valeur else points::double precision end desc, lower(pseudo), id) as ordre
      from valeurs
  )
  select json_build_object(
           'version', 6,
           'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
           'periode', p_periode,
           'joueurs', (select count(*)::int from rangs),
           'en_ligne_n', (select count(*)::int from rangs where en_ligne),
           'lignes', coalesce((select json_agg(json_build_object('rang', r.rang, 'pseudo', r.pseudo, 'points', r.points, 'valeur', r.valeur,
                                                                 'moi', coalesce(r.id = p_id, false), 'podium', r.podium, 'en_ligne', r.en_ligne, 'titre', r.titre)
                                               order by r.ordre)
                                 from rangs r where r.ordre <= v_limite), '[]'::json),
           'moi', (select json_build_object('rang', r.rang, 'points', r.points, 'valeur', r.valeur, 'podium', r.podium, 'en_ligne', r.en_ligne, 'titre', r.titre) from rangs r where r.id = p_id)
         )
    into v_res;
  return v_res;
end
$$;

-- ─── fournil_recompenses : sa place au classement final de l'événement (1 à 15), le nombre de joueurs, le podium à trois ───
-- (le même code que la version 6.5, sauf evenements : joueurs, et le podium filtré aux trois premiers)
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
  v_pourboires json;
  v_objectif   json;
begin
  perform public.fournil_figer(v_lundi);
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton', 'podiums', '[]'::json, 'places', '[]'::json, 'derniere', null, 'quartier', null, 'quartier_podium', null, 'evenements', '{}'::json, 'pourboires', '[]'::json, 'objectif', null);
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id;
  v_inscrit := found;
  if v_inscrit and v_jeton <> public.fournil_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton', 'podiums', '[]'::json, 'places', '[]'::json, 'derniere', null, 'quartier', null, 'quartier_podium', null, 'evenements', '{}'::json, 'pourboires', '[]'::json, 'objectif', null);
  end if;
  -- les pourboires reçus pas encore accusés (les 20 plus récents) ; version 6.5 : la lecture ne les marque plus
  select coalesce(json_agg(json_build_object('de', x.pseudo, 'quand', public.fournil_iso(x.quand)) order by x.quand), '[]'::json)
    into v_pourboires
    from (select j.pseudo, p.quand from public.fournil_pourboires p join public.fournil_joueurs j on j.id = p.de
           where v_inscrit and p.a = p_id and p.vu is null
           order by p.quand desc limit 20) x;
  -- la récompense de l'objectif commun (la plus récente semaine pas encore accusée) ; version 6.5 : la lecture ne la marque plus
  select json_build_object('semaine', to_char(max(g.semaine), 'YYYY-MM-DD'), 'reussi', true, 'recompense', true)
    into v_objectif
    from public.fournil_objectif_gagnants g
   where v_inscrit and g.id = p_id and g.recu is null
  having count(*) > 0;
  select json_build_object('semaine', to_char(v_lundi - 7, 'YYYY-MM-DD'),
                           'podium', json_agg(json_build_object('rang', p.rang, 'pseudo', p.pseudo, 'points', p.points, 'valeur', p.valeur)
                                              order by p.rang, lower(p.pseudo)))
    into v_derniere
    from public.fournil_palmares p
   where p.semaine = v_lundi - 7 and p.rang <= 3
  having count(*) > 0;
  return json_build_object(
    'ok', true,
    'erreur', null,
    'podiums', coalesce((select json_agg(json_build_object('semaine', to_char(p.semaine, 'YYYY-MM-DD'), 'rang', p.rang)
                                         order by p.semaine)
                           from public.fournil_palmares p
                          where v_inscrit and p.id = p_id and p.rang <= 3), '[]'::json),
    'places', coalesce((select json_agg(json_build_object('semaine', to_char(p.semaine, 'YYYY-MM-DD'), 'rang', p.rang, 'joueurs', s.joueurs)
                                        order by p.semaine)
                          from public.fournil_palmares p left join public.fournil_semaines s on s.semaine = p.semaine
                         where v_inscrit and p.id = p_id), '[]'::json),
    'derniere', v_derniere,
    'quartier', (select q.rang from public.fournil_quartier_podium q where v_inscrit and q.id = p_id),
    'quartier_podium', case when exists (select 1 from public.fournil_evenements where nom = 'quartier')
      then coalesce((select json_agg(json_build_object('rang', q.rang, 'pseudo', q.pseudo, 'valeur', q.valeur) order by q.rang, lower(q.pseudo))
                       from public.fournil_quartier_podium q), '[]'::json) end,
    'evenements', coalesce((
      select json_object_agg(x.nom, json_build_object(
               'rang', (select e.rang from public.fournil_evt_podium e where v_inscrit and e.evt = x.nom and e.id = p_id),
               'joueurs', (select f.joueurs from public.fournil_evenements f where f.nom = x.nom),
               'podium', coalesce((select json_agg(json_build_object('rang', e.rang, 'pseudo', e.pseudo, 'valeur', e.valeur) order by e.rang, lower(e.pseudo))
                                     from public.fournil_evt_podium e where e.evt = x.nom and e.rang <= 3), '[]'::json)))
        from public.fournil_evts() x
       where exists (select 1 from public.fournil_evenements f where f.nom = x.nom)), '{}'::json),
    'pourboires', v_pourboires,
    'objectif', v_objectif
  );
end
$$;

-- les droits : comme en version 6, les fonctions internes (personne d'autre que le propriétaire ne les appelle) ; les fonctions du jeu
-- à anon et authenticated seulement
revoke all on function public.fournil_evts() from public, anon, authenticated;
revoke all on function public.fournil_evt_figer(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_classement(text, uuid, integer) from public;
revoke all on function public.fournil_recompenses(uuid, text) from public;
grant execute on function public.fournil_classement(text, uuid, integer) to anon, authenticated;
grant execute on function public.fournil_recompenses(uuid, text) to anon, authenticated;

commit;

-- le contrôle : le tableau de la Maison hantée, la plus haute valeur de bonbons acceptée en ce moment (et son log10), puis ce que la
-- 6.6 installe (les rangs du podium des événements, la colonne joueurs)
select (select x.tableau from public.fournil_evts() x where x.nom = 'hantee') as hantee,
       public.fournil_evt_borne('hantee', now()) as borne_hantee,
       round(log(greatest(public.fournil_evt_borne('hantee', now()), 1))::numeric, 2) as borne_hantee_log10,
       (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'fournil_evt_podium_rang_check') as evt_podium_rangs,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fournil_evenements' and column_name = 'joueurs') as evenements_joueurs;
