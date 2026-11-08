-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Opération Poncin — LA SUPPRESSION de son classement du butin (le jeu a quitté la Salle de jeux le 8 novembre 2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase : SQL Editor → New query → coller tout → Run. Il se recolle autant de fois qu'on veut :
--  tout est en « drop … if exists », et un second passage ne trouve plus rien à retirer.
--
--  Il retire SEULEMENT les objets d'Opération Poncin, tous au préfixe poncin_ (ceux de l'ancien supabase/poncin-butin.sql) :
--    · les tables public.poncin_joueurs et public.poncin_portes (avec leurs index poncin_joueurs_pseudo et poncin_portes_empreinte,
--      leurs droits et leur sécurité ligne par ligne, qui partent avec elles) ;
--    · les fonctions poncin_maintenant, poncin_lundi, poncin_jour, poncin_pseudo_propre, poncin_jeton_valable, poncin_empreinte,
--      poncin_bornes, poncin_reponse, poncin_publier, poncin_classement, poncin_vu et poncin_retirer ;
--    · et, par sécurité, tout autre objet du schéma public dont le nom commence par poncin_ (une ancienne version d'une
--      fonction, avec d'autres paramètres, restée sur le serveur ; une vue, une séquence ou un type ajoutés à la main).
--  Rien du Fournil (fournil_…) ni de Dernier Rempart (zombies_…) n'est touché : aucun de leurs objets ne dépend de Poncin.
--  Aucune « cascade » : si un objet d'un autre jeu dépendait d'une table ou d'une fonction poncin_, Postgres refuserait de
--  la retirer, et TOUT le script serait annulé (une seule transaction) : rien ne serait effacé.
--
--  Le résultat (la dernière requête, une seule ligne) : poncin_restants = 0.
--  Essayé dans un vrai Postgres (PGlite) par test/poncin-suppression-sql.cjs : le Fournil, Poncin et Dernier Rempart collés, puis
--  ce patch deux fois ; plus aucun objet poncin_, et tout le reste à l'identique.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Les vues poncin_ qu'on aurait ajoutées à la main (elles lisent les tables : elles partent d'abord) ──
do $$
declare
  r record;
begin
  for r in select c.relname, c.relkind from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname like 'poncin\_%' and c.relkind in ('v', 'm')
            order by c.oid desc loop -- la plus récente d'abord : elle peut lire une plus ancienne
    execute format('drop %s if exists public.%I', case r.relkind when 'm' then 'materialized view' else 'view' end, r.relname);
  end loop;
end
$$;

-- ─── 2. Les tables (leurs index, droits et règles partent avec elles) ───────────────────────────
drop table if exists public.poncin_portes;
drop table if exists public.poncin_joueurs;

-- ─── 3. Les fonctions, telles que les posait poncin-butin.sql ─────────────────────────────────
drop function if exists public.poncin_publier(uuid, text, text, integer, integer, boolean, boolean, integer);
drop function if exists public.poncin_classement(text, uuid, integer);
drop function if exists public.poncin_vu(uuid, text);
drop function if exists public.poncin_retirer(uuid, text);
drop function if exists public.poncin_reponse(text, uuid, date, date, bigint, integer, boolean);
drop function if exists public.poncin_bornes();
drop function if exists public.poncin_empreinte(text);
drop function if exists public.poncin_jeton_valable(text);
drop function if exists public.poncin_pseudo_propre(text);
drop function if exists public.poncin_jour(timestamptz);
drop function if exists public.poncin_lundi(timestamptz);
drop function if exists public.poncin_maintenant();

-- ─── 4. Le reste : tout objet du schéma public au nom en poncin_ (anciennes versions, ajouts à la main) ──
do $$
declare
  r record;
begin
  -- les tables, les séquences, les index isolés
  for r in select c.relname, c.relkind from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname like 'poncin\_%' and c.relkind in ('r', 'p', 'f', 'S', 'i', 'I')
            order by case c.relkind when 'S' then 1 when 'i' then 2 when 'I' then 2 else 0 end, c.oid desc loop
    execute format('drop %s if exists public.%I',
      case r.relkind when 'f' then 'foreign table' when 'S' then 'sequence' when 'i' then 'index' when 'I' then 'index' else 'table' end, r.relname);
  end loop;
  -- les fonctions, procédures et agrégats, quels que soient leurs paramètres
  for r in select p.proname, p.prokind, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
             from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'poncin\_%' loop
    execute format('drop %s if exists public.%I(%s)',
      case r.prokind when 'a' then 'aggregate' when 'p' then 'procedure' else 'function' end, r.proname, r.args);
  end loop;
  -- les types créés à part (énumérations, domaines, types composés ; pas ceux des tables, déjà partis avec elles)
  for r in select t.typname from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid = t.typnamespace
            where n.nspname = 'public' and t.typname like 'poncin\_%' and t.typelem = 0
              and (t.typrelid = 0 or (select c.relkind from pg_catalog.pg_class c where c.oid = t.typrelid) = 'c') loop
    execute format('drop type if exists public.%I', r.typname);
  end loop;
end
$$;

commit;

-- ─── 5. Le contrôle : les objets poncin_ qui restent, dans tous les schémas de la base (il en faut 0) ──
select (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where c.relname like 'poncin\_%' and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\_toast%')
     + (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where p.proname like 'poncin\_%' and n.nspname not in ('pg_catalog', 'information_schema'))
     + (select count(*) from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid = t.typnamespace
         where t.typname like 'poncin\_%' and t.typrelid = 0 and n.nspname not in ('pg_catalog', 'information_schema'))
       as poncin_restants;
