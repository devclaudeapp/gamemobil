-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.7 : les points continuent au-delà d'une heure de jeu, et la série de jours de suite
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un patch à coller PAR-DESSUS la version 6.6 déjà installée : SQL Editor → New query → coller tout → Run. Il se recolle
--  autant de fois qu'on veut, sans casse. Le fichier complet (supabase/fournil-classement.sql) porte le même code : le recoller
--  plus tard ne revient pas en arrière. À coller AVANT la mise en ligne du jeu du lot 7 : un jeu du lot 7 face à un serveur 6.6
--  serait plafonné à 60 × jours + 100 (510 la semaine), et ce qui dépasse serait perdu le dimanche soir.
--
--  Pourquoi : le barème plafonnait à 60 points par jour et 510 par semaine ; une heure de jeu suffisait à les atteindre, d'où des
--  égalités entre un joueur d'une heure et un joueur de quatre heures. Le jeu du lot 7 (src/game.js, POINTS) compte désormais :
--    · le socle d'avant, inchangé (journée complète 10, événement réussi 2 et 20 au plus par jour, améliorations 30 au plus par jour) ;
--    · chaque objectif du jour réclamé (2, 6 par jour) ; la présence : pétrissage gagné (4, 48 par jour), client mystère servi
--      (1, 80 par jour), grosse commande livrée (4, 48 par jour), descente évitée (4, 48 par jour) ; chaque palier d'événement
--      franchi (3, 12 par jour) ;
--    · la DÉGRESSIVITÉ du jour : ce brut compte plein jusqu'à 60, pour moitié de 60 à 160, pour un quart de 160 à 220, puis plus
--      rien : 125 au plus par jour ;
--    · hors dégressivité, l'Atelier CHAQUE JOUR (le meilleur score du jour de chaque mini-jeu, 0 à 4 points, 12 par jour) et le
--      défi de la semaine (30, une fois) ;
--  soit 137 au plus par jour et 7 × 137 + 30 = 989 par semaine (le maximum du jeu). Le serveur, lui, ajoute la SÉRIE : un jour
--  compte dès son premier envoi de points (heure de Paris) ; +10 au 3e jour de suite, +20 au 7e, puis à chaque tour de 7 (10e,
--  14e…), 30 au plus par semaine. Le maximum honnête d'une semaine est donc 1 019, et c'est aussi tout ce que le tricheur obtient.
--
--  Ce qu'il fait, et rien d'autre :
--    · fournil_joueurs gagne la colonne serie (les jours de suite avec un envoi de points ; 0 pour tous au collage) ;
--    · fournil_points_plafond(p_jours) = least(989, 137 × jours commencés + 50) : 187, 324, 461, 598, 735, 872, 989 (137 par jour
--      commencé, + le défi 30 et 20 de marge pour un minuit approximatif ; 989 sur la semaine, sans marge : le maximum du jeu) ;
--    · fournil_serie_bonus(p_serie) (nouvelle, interne) : 10 au 3e jour, 20 au 7e, puis à chaque tour de 7 ; 0 sinon ;
--    · fournil_publier (même signature) : au premier envoi de points d'un jour, la série avance (+1 si le jour précédent avait un
--      envoi de points, sinon elle repart à 1) et son bonus s'ajoute aux points de la semaine, à « Tous les temps » et à
--      points_bonus (comme les pourboires de la 6.0 : le téléphone, qui renvoie son total, ne l'absorbe pas). L'inscription démarre
--      la série à 1 (avec des points). Un envoi « trop_vite », d'une autre semaine ou sans points (vieux téléphone) ne la fait pas
--      avancer. La nouvelle semaine remet points_bonus à zéro (comme avant) ; la série, elle, continue ;
--    · fournil_reponse (même signature) rend en plus serie (la série, 0 si elle est cassée : dernier jour de points avant-hier ou
--      plus ancien), serie_auj (aujourd'hui compte déjà) et serie_bonus (les points de série de la semaine) ; version reste 6 :
--      le téléphone reconnaît la 6.7 à la présence de serie ;
--    · les mêmes signatures, le même langage, la même volatilité, le même search_path que la version 6 ; les mêmes droits (fonctions
--      internes : ni anon ni authenticated ; fournil_publier : anon et authenticated).
--  Aucune donnée n'est touchée : joueurs, points, billets, bonbons, palmarès, podiums et photos restent tels quels ; aucun point
--  n'est effacé (la série part de 0 et se construit aux envois suivants).
--  En bas, une requête de contrôle : les plafonds du lundi (187) et de la semaine (989), la colonne serie, les bonus de série du
--  1er au 14e jour ({0,0,10,0,0,0,20,0,0,10,0,0,0,20}) et le nombre de joueurs en série.

begin;

-- ─── la table : la série de jours de suite ───
alter table public.fournil_joueurs add column if not exists serie integer not null default 0;

-- ─── le plafond des points : 137 par jour commencé + 50 (le défi 30, 20 de marge), 989 sur la semaine ───
-- (version 6.6 : least(510, 60 × jours + 100))
create or replace function public.fournil_points_plafond(p_jours integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(989, 137 * least(greatest(coalesce(p_jours, 1), 1), 7) + 50)
$$;

-- le bonus de la série (version 6.7) : un jour compte dès son premier envoi de points (heure de Paris) ; +10 au 3e jour de suite,
-- +20 au 7e, puis à chaque tour de 7 (10e, 14e…) ; 0 sinon. Au plus 30 sur une semaine (un 3e et un 7e jour, ou un 10e et un 14e).
create or replace function public.fournil_serie_bonus(p_serie integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_serie, 0) <= 0 then 0 when p_serie % 7 = 3 then 10 when p_serie % 7 = 0 then 20 else 0 end
$$;

-- ─── fournil_reponse : la série en plus (le reste est le même code que la version 6.6) ───
-- version 6.7 : serie (les jours de suite avec un envoi de points ; 0 si la série est cassée), serie_auj (aujourd'hui compte déjà),
-- serie_bonus (les points de série de la semaine : points_bonus)
create or replace function public.fournil_reponse(p_erreur text, p_id uuid, p_lundi date,
                                                  p_compte double precision, p_plafonne boolean,
                                                  p_points_comptes integer, p_points_plafonnes boolean,
                                                  p_quartier_plafonne boolean default null,
                                                  p_evt text default null, p_evt_plafonne boolean default null)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'ok', p_erreur is null,
    'erreur', p_erreur,
    'version', 6,
    'photo_maj', (select public.fournil_iso(f.maj) from public.fournil_photos f where f.id = p_id),
    'evt', case when p_evt is not null and exists (select 1 from public.fournil_evts() x where x.nom = p_evt) then p_evt end,
    'evt_score', (select s.valeur from public.fournil_evt_scores s where p_evt is not null and s.evt = p_evt and s.id = p_id),
    'rang_evt', (
      select (select count(*) from public.fournil_evt_scores a where a.evt = p_evt and a.valeur > m.valeur)::int + 1
      from public.fournil_evt_scores m
      where p_evt is not null and m.evt = p_evt and m.id = p_id and m.valeur > 0),
    'evt_plafonne', p_evt_plafonne,
    'quartier', (select m.quartier from public.fournil_joueurs m where m.id = p_id),
    'rang_quartier', (
      select (select count(*) from public.fournil_joueurs a where a.quartier > m.quartier)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id and m.quartier > 0),
    'quartier_plafonne', p_quartier_plafonne,
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
    -- version 6.7 : la série de jours de suite (0 si elle est cassée : le dernier jour d'envoi de points est avant-hier ou plus ancien),
    -- serie_auj : aujourd'hui compte déjà ; serie_bonus : les points de série de la semaine (points_bonus)
    'serie', (select case when m.points_jour >= public.fournil_jour(public.fournil_maintenant()) - 1 then m.serie else 0 end
              from public.fournil_joueurs m where m.id = p_id),
    'serie_auj', (select coalesce(m.points_jour = public.fournil_jour(public.fournil_maintenant()), false) from public.fournil_joueurs m where m.id = p_id),
    'serie_bonus', (select m.points_bonus from public.fournil_joueurs m where m.id = p_id and m.semaine = p_lundi),
    'compte', p_compte,
    'plafonne', p_plafonne
  )
$$;

-- ─── fournil_publier : la série au premier envoi de points du jour (le reste est le même code que la version 6.6) ───
-- version 6.7 : la série. Au premier envoi de points d'un jour (heure de Paris), la série avance (+1 si le jour d'avant avait un
-- envoi de points, sinon elle repart à 1) ; son bonus (fournil_serie_bonus) s'ajoute à points, points_total et points_bonus.
create or replace function public.fournil_publier(p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision,
                                                  p_points integer default null, p_lundi date default null,
                                                  p_quartier double precision default null,
                                                  p_evt text default null, p_score double precision default null,
                                                  p_photo jsonb default null)
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
  v_bonus      integer;                              -- version 6.7 : les points de la série comptés par cet envoi
  v_q          boolean;                              -- ses billets du quartier comptent-ils à cet envoi ? (un nombre donné, dans la fenêtre)
  v_q_borne    double precision;
  v_q_plaf     boolean;
  v_fenetre    record := public.fournil_quartier_fenetre();
  v_e          boolean;                              -- le score de l'événement générique compte-t-il à cet envoi ? (connu, dans sa fenêtre)
  v_e_borne    double precision;
  v_e_plaf     boolean;
  v_evt        record;
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
  -- les points : un nombre entier positif, sous 100 000 (le barème en permet 989 par semaine, 1 019 avec la série)
  if p_points is not null and not (p_points >= 0 and p_points <= 100000) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  -- les billets du quartier : un vrai nombre positif sous 1e24 (sinon : refusé comme une fortune absurde)
  if p_quartier is not null and not (p_quartier >= 0 and p_quartier <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  -- le score d'un événement : de même
  if p_score is not null and not (p_score >= 0 and p_score <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  v_fortune := p_fortune + 0; -- un éventuel « −0 » devient 0
  -- les billets ne comptent que pendant l'événement (et une heure de grâce après sa fin, le temps du dernier envoi)
  v_q := p_quartier is not null and v_maintenant >= v_fenetre.debut and v_maintenant < v_fenetre.fin + interval '1 hour';
  v_q_borne := public.fournil_quartier_borne(least(v_maintenant, v_fenetre.fin));
  v_q_plaf := null;
  -- le score d'un événement générique : seulement un événement connu, pendant sa fenêtre (et une heure de grâce), sous son enveloppe
  select x.debut, x.fin into v_evt from public.fournil_evts() x where p_evt is not null and x.nom = p_evt;
  v_e := found and p_score is not null and v_maintenant >= v_evt.debut and v_maintenant < v_evt.fin + interval '1 hour';
  v_e_borne := case when v_e then public.fournil_evt_borne(p_evt, least(v_maintenant, v_evt.fin)) else 0 end;
  v_e_plaf := null;
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
  delete from public.fournil_quartier_podium where id in (select id from public.fournil_quartier_podium q where not exists (select 1 from public.fournil_joueurs x where x.id = q.id));
  delete from public.fournil_evt_scores s where not exists (select 1 from public.fournil_joueurs x where x.id = s.id);
  delete from public.fournil_evt_podium q where not exists (select 1 from public.fournil_joueurs x where x.id = q.id);

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
      j.points_bonus := 0;
      j.semaine := v_lundi;
    end if;
    -- les points : seulement ce qui dépasse ceux déjà comptés cette semaine, dans les plafonds du barème (les points des pourboires
    -- donnés, version 6, sont à part : le téléphone ne les connaît pas, ils ne se mélangent pas aux siens)
    v_pts_compte := 0;
    v_pts_plaf := false;
    if v_pts then
      -- (pas de second plafond « depuis l'envoi précédent » : chaque envoi le remettrait à zéro, toutes les 10 s, sans rien
      -- borner ; et un joueur honnête peut prendre 150 points en quelques minutes : Atelier, défi, journée, améliorations)
      v_pts_cible := least(p_points, public.fournil_points_plafond(v_jour - v_lundi + 1));
      v_pts_compte := greatest(v_pts_cible - (j.points - j.points_bonus), 0);
      v_pts_plaf := p_points > (j.points - j.points_bonus) + v_pts_compte;
      j.points := j.points + v_pts_compte;
      j.points_total := j.points_total + v_pts_compte;
      -- version 6.7 : la série de jours de suite ; un jour compte dès son premier envoi de points (heure de Paris) ; +10 au 3e jour,
      -- +20 au 7e, puis à chaque tour de 7 (10e, 14e…) ; ces points du serveur vont aussi dans points_bonus (le téléphone ne les connaît pas)
      if j.points_jour is distinct from v_jour then
        j.serie := case when j.points_jour = v_jour - 1 then j.serie + 1 else 1 end;
        v_bonus := public.fournil_serie_bonus(j.serie);
        j.points := j.points + v_bonus;
        j.points_total := j.points_total + v_bonus;
        j.points_bonus := j.points_bonus + v_bonus;
      end if;
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
    -- les billets du quartier : la plus haute valeur envoyée, sous l'enveloppe du moment
    if v_q then
      v_q_plaf := p_quartier > v_q_borne;
      if least(p_quartier, v_q_borne) > j.quartier then
        j.quartier := least(p_quartier, v_q_borne);
        j.quartier_maj := v_maintenant;
      end if;
    end if;
    begin
      update public.fournil_joueurs
         set pseudo = v_pseudo, fortune = v_fortune, sommet = j.sommet, plausible = j.plausible, reserve = j.reserve,
             total = j.total, gain = j.gain, semaine = j.semaine, maj = v_maintenant,
             points = j.points, points_total = j.points_total, points_jour = j.points_jour, points_bonus = j.points_bonus, serie = j.serie,
             quartier = j.quartier, quartier_maj = j.quartier_maj, vu = v_maintenant
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
      if v_q then
        v_q_plaf := p_quartier > v_q_borne;
      end if;
      insert into public.fournil_joueurs (id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj,
                                          points, points_total, points_jour, quartier, quartier_maj, vu, serie)
      values (p_id, v_empreinte, v_pseudo, v_fortune, v_fortune, least(v_fortune, 1e20), 86400, 0, 0,
              v_lundi, v_maintenant, v_maintenant,
              v_pts_compte, v_pts_compte, case when v_pts then v_jour end,
              case when v_q then least(p_quartier, v_q_borne) else 0 end, case when v_q then v_maintenant end, v_maintenant,
              case when v_pts then 1 else 0 end);
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

  -- le score de l'événement générique (inscription comme envoi suivant) : la plus haute valeur envoyée, sous l'enveloppe du moment
  if v_e then
    v_e_plaf := p_score > v_e_borne;
    insert into public.fournil_evt_scores (evt, id, valeur, maj) values (p_evt, p_id, least(p_score, v_e_borne), v_maintenant)
    on conflict (evt, id) do update set valeur = excluded.valeur, maj = excluded.maj
      where excluded.valeur > public.fournil_evt_scores.valeur;
  end if;

  -- la photo de sa boutique (version 6) : un objet, 3 Ko de texte jsonb au plus, au plus une toutes les 10 min ; sinon ignorée
  if p_photo is not null and jsonb_typeof(p_photo) = 'object' and octet_length(p_photo::text) <= 3072 then
    insert into public.fournil_photos (id, photo, maj) values (p_id, p_photo, v_maintenant)
    on conflict (id) do update set photo = excluded.photo, maj = excluded.maj
      where public.fournil_photos.maj <= excluded.maj - interval '10 minutes';
  end if;

  return public.fournil_reponse(null, p_id, v_lundi, v_compte, v_plafonne, v_pts_compte, v_pts_plaf, v_q_plaf, p_evt, v_e_plaf);
end
$$;

-- les droits : comme en version 6, les fonctions internes (personne d'autre que le propriétaire ne les appelle) ; fournil_publier
-- à anon et authenticated seulement
revoke all on function public.fournil_points_plafond(integer) from public, anon, authenticated;
revoke all on function public.fournil_serie_bonus(integer) from public, anon, authenticated;
revoke all on function public.fournil_reponse(text, uuid, date, double precision, boolean, integer, boolean, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.fournil_publier(uuid, text, text, double precision, integer, date, double precision, text, double precision, jsonb) from public;
grant execute on function public.fournil_publier(uuid, text, text, double precision, integer, date, double precision, text, double precision, jsonb) to anon, authenticated;

commit;

-- le contrôle : les plafonds du lundi et de la semaine, la colonne serie, les bonus de série du 1er au 14e jour, et combien de
-- joueurs sont en série (0 juste après le premier collage)
select public.fournil_points_plafond(1) as plafond_lundi, public.fournil_points_plafond(7) as plafond_semaine,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fournil_joueurs' and column_name = 'serie') as colonne_serie,
       (select array_agg(public.fournil_serie_bonus(k) order by k) from generate_series(1, 14) k) as bonus_serie_1_a_14,
       (select count(*) from public.fournil_joueurs where serie > 0) as joueurs_en_serie;
