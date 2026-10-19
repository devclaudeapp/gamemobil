-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.5 : les places de la semaine jusqu'au 15e, et des récompenses qui ne se perdent plus
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un patch à coller PAR-DESSUS la version 6.4 (ou directement par-dessus la 6, la 6.2 ou la 6.3) déjà installée : SQL Editor →
--  New query → coller tout → Run. Il se recolle autant de fois qu'on veut, sans casse. Le fichier complet
--  (supabase/fournil-classement.sql) porte le même code : le recoller plus tard ne revient pas en arrière.
--
--  Pourquoi :
--    · il y a une douzaine de joueurs, et seuls les trois premiers de la semaine étaient récompensés. Le palmarès garde désormais
--      les QUINZE premiers (points > 0, ex æquo au même rang) ; chacun reçoit dans son jeu des étoiles et un boost (le téléphone
--      les donne, une fois par semaine : src/classement.js, RECOMPENSES_RANG), les trois premiers gardent en plus la tenue et la
--      coupe, comme avant. Le lundi matin, une notification dit à chacun sa place ;
--    · une réponse du serveur perdue en route (réseau mobile qui coupe, plus de 8 s d'attente) faisait perdre pour toujours les
--      pourboires reçus et la récompense de l'objectif commun : le serveur les marquait « remis » au moment de les envoyer. Ils
--      restent maintenant à lire tant que le téléphone ne les a pas accusés, ce qu'il fait après les avoir rangés et sauvés ;
--    · la limite de la Maison hantée, 6 heures après l'ouverture : 10^14,2 au lieu de 10^14,05 (un joueur qui ouvre dès midi
--      pile et achète tout de suite pouvait la toucher).
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_palmares accepte les rangs 1 à 15 (contrainte fournil_palmares_rang_check) ; fournil_semaines gagne la colonne
--      joueurs (combien de joueurs classés cette semaine-là, « 7e sur 12 » ; null pour une semaine figée avant la 6.5, qui reste
--      lisible avec ses trois premiers) ; la file fournil_notifs accepte le type 'semaine' (avec 'retour' et 'vote', ceux de
--      fournil-retours.sql) ;
--    · fournil_figer : les quinze premiers, le nombre de joueurs, et la notification 'semaine' (le lundi à 9 h, heure de Paris) pour
--      la semaine qui vient de finir ; fournil_notif_permise : 'semaine' suit la case « objectif commun » ;
--    · fournil_recompenses : podiums et derniere ne parlent toujours que des trois premiers ; places en plus ([{ semaine, rang,
--      joueurs }], rangs 1 à 15) ; les pourboires et l'objectif ne sont plus marqués par la lecture ;
--    · fournil_classement : la toque de la semaine passée, seulement pour les trois premiers (le reste du code est le même) ;
--    · fournil_vu_objectif (nouvelle) : accuser la récompense de l'objectif commun ; fournil_vu_pourboires (qui existe déjà, pour les
--      pourboires) compare l'heure à la milliseconde, comme le téléphone la voit (fournil_iso) : sans cela, le dernier pourboire
--      reçu (now() a six chiffres après la seconde) n'était jamais accusé ;
--    · fournil_quartier_table() et fournil_evts() : les tableaux de la 6.4, sauf la 2e valeur de la ligne 'hantee' (14,2) ;
--    · les mêmes signatures, le même langage, la même volatilité, le même search_path que la version 6 ; les mêmes droits (les
--      fonctions internes : ni anon ni authenticated ; fournil_vu_objectif et fournil_vu_pourboires : anon et authenticated).
--  Aucune donnée n'est touchée : joueurs, points, billets, bonbons, palmarès, podiums, pourboires et objectifs restent tels quels.
--  Un téléphone de la v6 est toujours servi (les mêmes champs, places en plus ; il ne lit que les rangs 1 à 3, et ses pourboires
--  revenus à chaque lecture sont reconnus : il ne les paie pas deux fois).
--  En bas, une requête de contrôle : les deux tableaux, la limite du Quartier en ce moment, et ce que la 6.5 a changé.

begin;

-- ─── les tables : la place des quinze, le nombre de joueurs, le nouveau type de notification ───
alter table public.fournil_palmares drop constraint if exists fournil_palmares_rang_check;
alter table public.fournil_palmares add constraint fournil_palmares_rang_check check (rang between 1 and 15);
alter table public.fournil_semaines add column if not exists joueurs integer;
alter table public.fournil_notifs drop constraint if exists fournil_notifs_type_check;
alter table public.fournil_notifs add constraint fournil_notifs_type_check
  check (type in ('pleine', 'pourboire', 'evenement', 'objectif', 'essai', 'retour', 'vote', 'semaine'));

-- ce joueur veut-il ce type de notification ? (au moins un appareil abonné, et le cas coché ; l'essai : un appareil suffit).
-- Les deux types de fournil-retours.sql y sont aussi (recoller ce fichier après lui ne les perd pas) : 'vote' suit la case
-- « événements » ; 'retour' (réservé aux admins) : un appareil suffit. Version 6.5 : 'semaine' (sa place du lundi) suit la case
-- « objectif commun »
create or replace function public.fournil_notif_permise(p_joueur uuid, p_type text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.fournil_abonnements a where a.joueur = p_joueur)
     and (p_type in ('essai', 'retour') or coalesce((select case p_type when 'pleine' then p.pleine when 'pourboire' then p.pourboires
                                                           when 'evenement' then p.evenements when 'vote' then p.evenements
                                                           when 'objectif' then p.objectif when 'semaine' then p.objectif else false end
                                          from public.fournil_notif_prefs p where p.id = p_joueur), false))
$$;

-- ─── 4. Le palmarès : chaque semaine finie est figée une fois, à la première requête qui suit ───
-- Appelée au début de chaque fonction du jeu. Les semaines à figer : celle qui vient de finir (même vide), et toute semaine
-- plus ancienne dont des joueurs gardent encore le gain (personne n'est venu depuis). Deux requêtes simultanées ne figent
-- jamais deux fois : la ligne de fournil_semaines fait office de verrou (la seconde attend la première, puis ne fait rien).
-- Version 6.5 : les quinze premiers, le nombre de joueurs classés, et pour la semaine qui vient de finir, la notification du lundi.
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
  v_j integer;
  v_due timestamptz;
  g record;
begin
  perform public.fournil_quartier_figer(public.fournil_maintenant()); -- l'événement « Le Quartier », une fois fini
  perform public.fournil_evt_figer(public.fournil_maintenant());      -- les événements génériques (version 5), une fois finis
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
      -- les quinze premiers EN POINTS (ex æquo au même rang ; les trois premiers avant la version 6.5) ; leur gain en euros est
      -- gardé pour information. Une semaine où personne n'a de points (la dernière semaine de la v2, pas encore figée quand on
      -- recolle la v3 ; ou une semaine où seuls des téléphones de la v2 ont joué) est classée à l'argent, comme en v2 : son
      -- podium n'est pas perdu.
      v_pts := exists (select 1 from public.fournil_joueurs where semaine = v_s and points > 0);
      insert into public.fournil_palmares (semaine, rang, id, pseudo, valeur, points)
      select v_s, r.rang, r.id, r.pseudo, r.gain, case when v_pts then r.points end
        from (select j.id, j.pseudo, j.gain, j.points,
                     rank() over (order by case when v_pts then j.points::double precision else j.gain end desc)::int as rang
                from public.fournil_joueurs j
               where j.semaine = v_s and (case when v_pts then j.points > 0 else j.gain > 0 end)) r
       where r.rang <= 15
      on conflict (semaine, id) do nothing;
      -- version 6.5 : combien de joueurs étaient classés cette semaine-là (« 7e sur 12 »)
      select count(*)::int into v_j from public.fournil_joueurs j
       where j.semaine = v_s and (case when v_pts then j.points > 0 else j.gain > 0 end);
      update public.fournil_semaines set joueurs = v_j where semaine = v_s;
      -- l'objectif commun de cette semaine-là (version 6), figé en même temps : récompensé seulement pour la semaine qui vient de finir
      perform public.fournil_objectif_figer(v_s, public.fournil_maintenant(), v_s = p_lundi - 7);
      -- version 6.5 : la semaine qui vient de finir (pas une plus ancienne rattrapée au réveil du projet) : à chaque joueur classé
      -- qui l'a demandé, sa place, le lundi à 9 h (heure de Paris), ou tout de suite s'il est plus tard
      if v_s = p_lundi - 7 then
        v_due := greatest(public.fournil_maintenant(), (p_lundi::timestamp + interval '9 hours') at time zone 'Europe/Paris');
        for g in select p.id, p.rang from public.fournil_palmares p where p.semaine = v_s order by p.rang loop
          begin
            perform public.fournil_notif_mettre(g.id, 'semaine',
              'Semaine finie : tu es ' || case when g.rang = 1 then '1er' else g.rang || 'e' end || ' sur ' || v_j
              || case when g.rang <= 3 then ' ! Ta tenue, ta coupe et ta récompense t''attendent.' else ' ! Ta récompense t''attend.' end,
              v_due);
          exception when check_violation then
            null; -- une file qui ne connaît pas encore 'semaine' (un vieux fournil-retours.sql recollé après) : pas de notification, rien ne casse
          end;
        end loop;
      end if;
    end if;
  end loop;
  perform public.fournil_objectif_but(p_lundi); -- le but de la semaine qui commence, fixé une fois
end
$$;

-- ─── 6. fournil_classement : le classement de la semaine, de tous les temps, ou d'un événement ───
-- (le même code que la version 6, sauf la toque : podium ne vaut que pour les trois premiers de la semaine passée)
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
           coalesce(j.vu > v_maintenant - interval '4 minutes' and j.vu <= v_maintenant + interval '1 minute', false) as en_ligne
      from public.fournil_joueurs j
      left join public.fournil_palmares p on p.id = j.id and p.semaine = v_lundi - 7 and p.rang <= 3
      left join public.fournil_quartier_podium q on q.id = j.id
      left join public.fournil_evt_scores s on v_evt and s.evt = p_periode and s.id = j.id
      left join public.fournil_evt_podium e on v_evt and e.evt = p_periode and e.id = j.id
     where (p_periode = 'total') or (p_periode = 'semaine' and j.semaine = v_lundi) or (p_periode = 'quartier' and j.quartier > 0)
        or (v_evt and s.valeur > 0)
  ), rangs as (
    select id, pseudo, points, valeur, podium, en_ligne,
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
                                                                 'moi', coalesce(r.id = p_id, false), 'podium', r.podium, 'en_ligne', r.en_ligne)
                                               order by r.ordre)
                                 from rangs r where r.ordre <= v_limite), '[]'::json),
           'moi', (select json_build_object('rang', r.rang, 'points', r.points, 'valeur', r.valeur, 'podium', r.podium, 'en_ligne', r.en_ligne) from rangs r where r.id = p_id)
         )
    into v_res;
  return v_res;
end
$$;

-- ─── 8. fournil_recompenses : ses podiums, ses places, le podium de la semaine passée, le podium final de l'événement ───
-- Réponse : { ok, erreur: null | 'jeton',
--             podiums: [{ semaine: 'AAAA-MM-JJ' (le lundi de la semaine du podium), rang: 1 | 2 | 3 }], du plus ancien au plus récent,
--             places: [{ semaine, rang: 1 à 15, joueurs: les joueurs classés cette semaine-là | null (semaine figée avant la 6.5) }]
--             (version 6.5 : toutes ses places au palmarès, podiums compris, du plus ancien au plus récent),
--             derniere: { semaine, podium: [{ rang, pseudo, points, valeur }] } | null (null : personne n'a marqué la semaine passée ;
--             les trois premiers seulement),
--             quartier: 1 | 2 | 3 | null (son rang au podium FINAL de l'événement « Le Quartier », une fois figé),
--             quartier_podium: [{ rang, pseudo, valeur }] | null (le podium final, figé ; null tant que l'événement n'est pas fini),
--             evenements: { <evt>: { rang: 1 | 2 | 3 | null, podium: [{ rang, pseudo, valeur }] } } (version 5 : un champ par événement
--             générique dont le podium final est figé, 'hantee' compris ; {} tant qu'aucun n'est fini),
--             pourboires: [{ de: pseudo, quand: ISO }] (version 6 : les pourboires reçus pas encore accusés, du plus ancien au plus
--             récent, les 20 plus récents au plus ; version 6.5 : la lecture ne les marque plus, le téléphone les accuse avec
--             fournil_vu_pourboires une fois rangés et sauvés : une réponse perdue les rend de nouveau à la lecture suivante),
--             objectif: { semaine: 'AAAA-MM-JJ', reussi: true, recompense: true } | null (version 6 : l'objectif commun d'une semaine
--             finie réussie à laquelle il a mis 30 points ou plus, la plus récente pas encore accusée ; version 6.5 : rendu jusqu'à
--             ce que fournil_vu_objectif l'accuse) }
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
               'podium', coalesce((select json_agg(json_build_object('rang', e.rang, 'pseudo', e.pseudo, 'valeur', e.valeur) order by e.rang, lower(e.pseudo))
                                     from public.fournil_evt_podium e where e.evt = x.nom), '[]'::json)))
        from public.fournil_evts() x
       where exists (select 1 from public.fournil_evenements f where f.nom = x.nom)), '{}'::json),
    'pourboires', v_pourboires,
    'objectif', v_objectif
  );
end
$$;

-- ─── 9 ter c. fournil_vu_pourboires : accuser les pourboires reçus ───
-- Marque vus tous ceux reçus jusqu'à p_jusqua (null : maintenant). Depuis la version 6.5, fournil_recompenses ne les marque plus : le
-- téléphone les accuse ainsi une fois rangés et sauvés (p_jusqua : le plus récent qu'il a reçu). quand est comparé à la milliseconde :
-- le téléphone ne voit que la milliseconde (fournil_iso), alors que now() en a six chiffres ; sans cela, le dernier reçu restait à
-- lire. Réponse : { ok, erreur: null | 'jeton' | 'inconnu' }.
create or replace function public.fournil_vu_pourboires(p_id uuid, p_jeton text, p_jusqua timestamptz default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_joueur_verifie(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  update public.fournil_pourboires set vu = v_maintenant
   where a = p_id and vu is null and date_trunc('milliseconds', quand) <= least(coalesce(p_jusqua, v_maintenant), v_maintenant);
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── 9 ter c bis. fournil_vu_objectif : accuser la récompense de l'objectif commun (version 6.5) ───
-- Le téléphone l'appelle une fois la récompense rangée et sauvée : toutes ses semaines réussies jusqu'à p_semaine (le lundi rendu par
-- fournil_recompenses) sont marquées reçues. Réponse : { ok, erreur: null | 'jeton' | 'inconnu' }.
create or replace function public.fournil_vu_objectif(p_id uuid, p_jeton text, p_semaine date)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_joueur_verifie(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  update public.fournil_objectif_gagnants set recu = public.fournil_maintenant()
   where id = p_id and recu is null and semaine <= p_semaine;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ═══ TABLES À FIGER LE 22 OCT. (recette du jour, activités, vote) ═══
-- Les valeurs ci-dessous sont celles de la 6.4, sauf la 2e valeur de la ligne 'hantee' (14,05 → 14,2). Le 22 octobre, ces deux
-- tableaux seront remplacés par ceux de la simulation des nouveautés (recette du jour, activités, vote), avec la même marge.

-- l'enveloppe des billets du Quartier : le log10 de ce qu'un joueur qui ne lâche jamais sa Planque aurait gagné k jours après
-- l'ouverture, k de 0 à 14, marge d'au moins ×2 (simulation de test/fournil-quartier.test.js, qui vérifie cette table)
-- (inchangée depuis la 6.4)
create or replace function public.fournil_quartier_table()
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select '{12.5,14.5,16.55,17.15,17.45,17.65,17.8,17.9,18,18.1,18.2,18.25,18.3,18.4,18.45}'::double precision[]
$$;

-- les événements génériques : 'hantee', « La Maison hantée » (src/hantee.js, test/fournil-hantee.test.js) ; un pas de 6 heures
-- (27 valeurs : 6 j 12 h) ; avant la 6.5 :
-- {11.65,14.05,16.05,16.2,16.55,16.8,17,17.15,17.25,17.35,17.45,17.55,17.6,17.65,17.7,17.75,17.8,17.85,17.9,17.95,18,18,18.05,18.1,18.1,18.15,18.15}
create or replace function public.fournil_evts()
returns table (nom text, debut timestamptz, fin timestamptz, pas double precision, tableau double precision[])
language sql
immutable
set search_path = ''
as $$
  values ('hantee'::text, '2026-10-27 12:00:00 Europe/Paris'::timestamptz, '2026-11-02 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,14.2,16.05,16.2,16.55,16.8,17,17.15,17.25,17.35,17.45,17.55,17.6,17.65,17.7,17.75,17.8,17.85,17.9,17.95,18,18,18.05,18.1,18.1,18.15,18.15}'::double precision[])
$$;

-- les droits : comme en version 6, les fonctions internes (personne d'autre que le propriétaire ne les appelle) ; les fonctions du
-- jeu à anon et authenticated seulement
revoke all on function public.fournil_notif_permise(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_figer(date) from public, anon, authenticated;
revoke all on function public.fournil_quartier_table() from public, anon, authenticated;
revoke all on function public.fournil_evts() from public, anon, authenticated;
revoke all on function public.fournil_classement(text, uuid, integer) from public;
revoke all on function public.fournil_recompenses(uuid, text) from public;
revoke all on function public.fournil_vu_pourboires(uuid, text, timestamptz) from public;
revoke all on function public.fournil_vu_objectif(uuid, text, date) from public;
grant execute on function public.fournil_classement(text, uuid, integer) to anon, authenticated;
grant execute on function public.fournil_recompenses(uuid, text) to anon, authenticated;
grant execute on function public.fournil_vu_pourboires(uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.fournil_vu_objectif(uuid, text, date) to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite (fournil_vu_objectif est nouvelle)
notify pgrst, 'reload schema';

-- le contrôle : les deux tableaux, la plus haute valeur de billets acceptée en ce moment au Quartier (et son log10), puis ce que la
-- 6.5 installe (les rangs du palmarès, les types de la file, fournil_vu_objectif, fournil_vu_pourboires à la milliseconde)
select public.fournil_quartier_table() as quartier,
       (select x.tableau from public.fournil_evts() x where x.nom = 'hantee') as hantee,
       public.fournil_quartier_borne(now()) as borne_quartier,
       round(log(greatest(public.fournil_quartier_borne(now()), 1))::numeric, 2) as borne_quartier_log10,
       (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'fournil_palmares_rang_check') as palmares_rangs,
       (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'fournil_notifs_type_check') as notifs_types,
       to_regprocedure('public.fournil_vu_objectif(uuid, text, date)') is not null as vu_objectif,
       position('date_trunc' in pg_get_functiondef('public.fournil_vu_pourboires(uuid, text, timestamptz)'::regprocedure)) > 0 as vu_pourboires_ms;
