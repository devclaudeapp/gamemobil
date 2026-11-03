-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement, version 6.8 : les projets de quartier (des chantiers financés par tous)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  Un patch à coller PAR-DESSUS la version 6.7.1 déjà installée : SQL Editor → New query → coller tout → Run. Il se recolle
--  autant de fois qu'on veut, sans casse. Le fichier complet (supabase/fournil-classement.sql) porte le même code (la table en § 1,
--  l'enveloppe en § 3, les fonctions en § 9 ter h, les droits en § 10) : le recoller plus tard ne revient pas en arrière.
--
--  Ce qu'il fait, et rien d'autre :
--    · une table fermée, fournil_projets (une ligne par chantier : son prix, la semaine où il a ouvert, ce que cette semaine-là avait
--      déjà versé au chantier d'avant, et quand il a été fini) ; RLS sans règle, aucun droit pour anon ni authenticated ;
--    · fournil_projets() : lisible par tous (anon, authenticated), security definer comme le reste. Elle fige d'abord la semaine
--      passée (fournil_figer, comme fournil_objectif), puis verse dans le chantier en cours le total des points de boulanger de
--      chaque semaine depuis son ouverture (les semaines figées : fournil_objectif.total ; la semaine en cours : la somme vivante de
--      fournil_joueurs.points, la même que l'objectif commun). Un chantier rempli est fini (une fois, sous verrou), le suivant ouvre
--      la même semaine avec le reste. Prix d'un chantier, fixé à son ouverture : fournil_projet_base(rang) × les joueurs actifs (le
--      plus grand de ceux de la semaine d'avant et de ceux qui ont déjà des points cette semaine), bornés de 5 à 60 ;
--    · trois petites fonctions internes (ni anon ni authenticated) : fournil_projet_base, fournil_projet_actifs, fournil_projet_total ;
--    · l'enveloppe des gains plausibles relevée de 1e18 à 1e21 € (fournil_paliers, la table de rythmes que fournil_publier lit à
--      chaque envoi : la même fonction, interne, seuls ses paliers changent) : l'acharné du lot « progression » (16 h par jour)
--      passe 1e20 € vers le 16e jour, et l'ancienne table le plafonnait (le détail : supabase/fournil-classement.sql, § 3).
--  Aucune autre table ni fonction n'est touchée : fournil_publier, fournil_figer, l'objectif commun restent tels quels. Rien de
--  nouveau n'est envoyé par les téléphones : les points sont déjà bornés par joueur (137 par jour, 989 par semaine), le
--  chantier n'avance qu'avec eux. Un téléphone d'avant ce patch n'appelle pas fournil_projets ; un téléphone de ce lot sans ce
--  patch reçoit une erreur 404 de l'API et n'affiche rien (le décor garde les chantiers déjà vus).
--
--  Réponse de fournil_projets() :
--    { version: 1, semaine: 'AAAA-MM-JJ' (le lundi), cette_semaine: total vivant des points de la semaine,
--      en_cours: { rang, cout, total, pourcent: 0 à 99, actifs, depuis: 'AAAA-MM-JJ' },
--      finis: [{ rang, semaine: 'AAAA-MM-JJ' (le lundi de la semaine où il s'est rempli), fini: horodatage ISO }] (les 200 derniers) }
--  Le nom, le décor et la récompense de chaque rang sont dans le jeu (PROGRESSION.projetDe(rang)) : le serveur ne connaît que des rangs.

begin;

-- la v6.5 doit être là (l'objectif commun : fournil_objectif, fournil_figer) : sinon, rien n'est changé
do $$
begin
  if to_regclass('public.fournil_objectif') is null or to_regprocedure('public.fournil_figer(date)') is null
     or to_regprocedure('public.fournil_objectif()') is null then
    raise exception 'Le Fournil : colle d''abord la version 6.7.1 (supabase/fournil-classement.sql), puis ce patch';
  end if;
end
$$;

-- ─── 1. La table ───
create table if not exists public.fournil_projets (
  rang        integer primary key check (rang >= 1),
  cout        integer not null check (cout > 0),     -- base(rang) × actifs bornés de 5 à 60, fixé à l'ouverture
  actifs      integer not null check (actifs >= 0),  -- les joueurs actifs comptés à l'ouverture (pour l'affichage)
  debut       date not null,                          -- le lundi de la semaine où il a ouvert
  deja        integer not null default 0 check (deja >= 0), -- les points de la semaine « debut » déjà versés aux chantiers d'avant
  fini        timestamptz,                            -- null tant qu'il n'est pas rempli
  semaine_fin date                                    -- le lundi de la semaine où il s'est rempli
);
comment on table public.fournil_projets is
  'Le Fournil : les chantiers du quartier, financés par les points de tous. Accès uniquement par les fonctions du jeu.';
alter table public.fournil_projets enable row level security;
do $$
declare
  r record;
begin
  for r in select policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'fournil_projets' loop
    execute format('drop policy if exists %I on public.fournil_projets', r.policyname);
  end loop;
end
$$;
revoke all on table public.fournil_projets from public, anon, authenticated;

-- ─── 2. Les petites fonctions internes ───
-- la base du prix du chantier n°rang, par joueur actif (en points de boulanger) : 1 200, puis +8 % par chantier (réglé sur sim.js : un chantier toutes les 2 à 4 semaines)
create or replace function public.fournil_projet_base(p_rang integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select round(1200 * power(1.08, greatest(0, p_rang - 1)))::integer
$$;

-- les joueurs actifs à l'ouverture d'un chantier : le plus grand de ceux de la semaine d'avant (figée : fournil_objectif.joueurs) et de
-- ceux qui ont déjà des points cette semaine (la première semaine du patch, la semaine d'avant figée peut être vide)
create or replace function public.fournil_projet_actifs(p_lundi date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_avant integer;
  v_cette integer;
begin
  select o.joueurs into v_avant from public.fournil_objectif o where o.semaine = p_lundi - 7 and o.joueurs is not null;
  select count(*)::integer into v_cette from public.fournil_joueurs j where j.semaine = p_lundi and j.points > 0;
  return greatest(coalesce(v_avant, 0), coalesce(v_cette, 0));
end
$$;

-- le total des points d'une semaine : figé (fournil_objectif.total) pour une semaine passée, la somme vivante pour la semaine en cours
create or replace function public.fournil_projet_total(p_semaine date, p_lundi date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_t integer;
begin
  if p_semaine >= p_lundi then
    select coalesce(sum(j.points), 0)::integer into v_t from public.fournil_joueurs j where j.semaine = p_lundi;
  else
    select coalesce(o.total, 0) into v_t from public.fournil_objectif o where o.semaine = p_semaine and o.fige is not null;
  end if;
  return greatest(0, coalesce(v_t, 0));
end
$$;

-- ─── 3. fournil_projets : le chantier en cours et ceux qui sont finis, lisible par tous ───
create or replace function public.fournil_projets()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi      date := public.fournil_lundi(v_maintenant);
  p            public.fournil_projets%rowtype;
  v_w          date;
  v_acc        bigint;
  v_dispo      bigint;
  v_fin        date;
  v_actifs     integer;
  v_tours      integer := 0;
begin
  perform public.fournil_figer(v_lundi);                         -- la semaine passée figée (son total compte pour les chantiers)
  perform pg_catalog.pg_advisory_xact_lock(7231068);             -- un seul appel à la fois finit un chantier
  if not exists (select 1 from public.fournil_projets) then
    v_actifs := public.fournil_projet_actifs(v_lundi);
    insert into public.fournil_projets (rang, cout, actifs, debut, deja)
    values (1, public.fournil_projet_base(1) * greatest(5, least(60, v_actifs)), v_actifs, v_lundi, 0)
    on conflict (rang) do nothing;
  end if;
  loop
    select * into p from public.fournil_projets where fini is null order by rang limit 1;
    if not found then exit; end if;
    v_acc := 0; v_w := p.debut; v_fin := null;
    while v_w <= v_lundi loop
      v_dispo := greatest(0, public.fournil_projet_total(v_w, v_lundi) - case when v_w = p.debut then p.deja else 0 end);
      if v_acc + v_dispo >= p.cout then v_fin := v_w; exit; end if;
      v_acc := v_acc + v_dispo; v_w := v_w + 7;
    end loop;
    exit when v_fin is null or v_tours >= 20;                    -- pas rempli (ou 20 chantiers finis d'un coup : la suite au prochain appel)
    update public.fournil_projets set fini = v_maintenant, semaine_fin = v_fin where rang = p.rang and fini is null;
    v_actifs := public.fournil_projet_actifs(v_lundi);
    insert into public.fournil_projets (rang, cout, actifs, debut, deja)
    values (p.rang + 1, public.fournil_projet_base(p.rang + 1) * greatest(5, least(60, v_actifs)), v_actifs, v_fin,
            least(2000000000, (case when v_fin = p.debut then p.deja else 0 end) + (p.cout - v_acc)))
    on conflict (rang) do nothing;
    v_tours := v_tours + 1;
  end loop;
  return json_build_object(
    'version', 1,
    'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
    'cette_semaine', public.fournil_projet_total(v_lundi, v_lundi),
    'en_cours', (case when p.rang is null then null else json_build_object(
      'rang', p.rang, 'cout', p.cout, 'total', least(v_acc, p.cout), 'pourcent', least(99, floor(100.0 * v_acc / p.cout))::integer,
      'actifs', p.actifs, 'depuis', to_char(p.debut, 'YYYY-MM-DD')) end),
    'finis', coalesce((select json_agg(json_build_object('rang', f.rang, 'semaine', to_char(f.semaine_fin, 'YYYY-MM-DD'), 'fini', public.fournil_iso(f.fini)) order by f.rang)
                         from (select * from public.fournil_projets where fini is not null order by rang desc limit 200) f), '[]'::json)
  );
end
$$;

-- ─── 4. L'enveloppe des gains plausibles, relevée de 1e18 à 1e21 € (le lot « progression ») ───
-- les paliers {log10 fortune, log10 rythme en €/s} : +0,05 à 1e18, +0,15 à 1e19, +0,2 à 1e20 et à 1e21 (un palier de plus), puis
-- l'ancienne pente rejointe à 1e22 (un palier de plus) ; rien ne change en dessous de 1e17 € ni au-delà de 1e22 €
-- (avant : …{17,13.2},{18,13.7},{19,14.1},{20,14.6},{24,18.6}). Le même code que le fichier complet, § 3.
create or replace function public.fournil_paliers()
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select '{{4,5.7},{5,5.8},{6,5.9},{7,6.0},{8,6.1},{9,6.5},{10,7.1},{11,7.7},{12,8.7},{13,9.7},{14,10.4},{15,11.1},{16,12.4},{17,13.2},{18,13.75},{19,14.25},{20,14.8},{21,15.8},{22,16.6},{24,18.6}}'::double precision[]
$$;

-- ─── 5. Les droits : les fonctions internes à personne, fournil_projets à tous ───
revoke all on function public.fournil_paliers() from public, anon, authenticated;
revoke all on function public.fournil_projet_base(integer) from public, anon, authenticated;
revoke all on function public.fournil_projet_actifs(date) from public, anon, authenticated;
revoke all on function public.fournil_projet_total(date, date) from public, anon, authenticated;
revoke all on function public.fournil_projets() from public;
grant execute on function public.fournil_projets() to anon, authenticated;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';

-- contrôle (lecture seule : le premier chantier s'ouvre au premier appel du jeu, avec les joueurs actifs de ce moment-là) :
-- installe = true, chantiers = 0 au premier collage (ou le nombre de chantiers déjà ouverts si on recolle)
select to_regprocedure('public.fournil_projets()') is not null as installe, (select count(*) from public.fournil_projets) as chantiers,
       (select count(*) from public.fournil_projets where fini is not null) as finis;
