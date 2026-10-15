-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le réveil des notifications : toutes les 5 minutes, Supabase appelle la fonction d'envoi « notifier »
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller dans Supabase : SQL Editor → New query → coller tout → Run. Une seule fois, APRÈS :
--    1. le SQL du classement (supabase/fournil-classement.sql, version 6) ;
--    2. la fonction « notifier » créée (Edge Functions), avec ses secrets VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUJET et CRON_SECRET,
--       et « Verify JWT » DÉSACTIVÉ (le réveil s'annonce avec CRON_SECRET, pas avec une clé de Supabase) ;
--    3. les extensions pg_cron et pg_net activées (Database → Extensions ; les deux lignes « create extension » ci-dessous le font
--       aussi, sans rien changer si elles le sont déjà).
--
--  UNE SEULE VALEUR À REMPLACER, plus bas : COLLE-ICI-TON-CRON_SECRET → la même valeur que le secret CRON_SECRET de la fonction
--  (la page « Clés des notifications » la tire au hasard). Sans ce remplacement, le script s'arrête avec un message et ne change rien.
--  Le secret reste dans la base (la table cron.job, que ni anon ni authenticated ne peuvent lire) : jamais dans le dépôt.
--
--  Il se recolle sans risque (une nouvelle valeur du secret, ou en cas de doute) : la tâche « fournil-notifier » est remplacée,
--  jamais doublée.
--
--  Ce qu'il installe :
--    · la tâche « fournil-notifier » : toutes les 5 minutes, un POST vers https://jklbitrlkfrktmnarejc.supabase.co/functions/v1/notifier
--      avec l'en-tête « Authorization: Bearer <CRON_SECRET> » (pg_net, sans attendre la réponse) ; la fonction refuse tout appel
--      sans le bon secret ;
--    · la tâche « fournil-notifier-menage » : chaque nuit, l'historique des tâches de plus de 3 jours est effacé (288 lignes par
--      jour sinon).
--
--  Pour tout arrêter (plus aucune notification ne part ; la file attend) :
--    select cron.unschedule('fournil-notifier'); select cron.unschedule('fournil-notifier-menage');
--  Pour voir les derniers réveils : select * from cron.job_run_details order by start_time desc limit 10;
--  Pour voir les dernières réponses de la fonction : select status_code, content from net._http_response order by created desc limit 10;
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  -- ▼▼▼ À REMPLACER : la valeur du secret CRON_SECRET de la fonction notifier (entre les apostrophes) ▼▼▼
  v_secret text := 'COLLE-ICI-TON-CRON_SECRET';
  -- ▲▲▲ (rien d'autre à changer) ▲▲▲
  v_url    text := 'https://jklbitrlkfrktmnarejc.supabase.co/functions/v1/notifier';
begin
  v_secret := btrim(v_secret);
  if v_secret like 'COLLE-ICI%' then
    raise exception 'Remplace d''abord COLLE-ICI-TON-CRON_SECRET par la valeur du secret CRON_SECRET de la fonction notifier, puis relance.';
  end if;
  if char_length(v_secret) < 24 or v_secret !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'CRON_SECRET doit faire au moins 24 caractères, lettres, chiffres, - ou _ (la page « Clés des notifications » en tire un au hasard).';
  end if;
  perform cron.schedule(
    'fournil-notifier',
    '*/5 * * * *',
    format($cmd$select net.http_post(url := %L, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L), timeout_milliseconds := 20000)$cmd$,
           v_url, 'Bearer ' || v_secret)
  );
  perform cron.schedule(
    'fournil-notifier-menage',
    '17 3 * * *',
    $cmd$delete from cron.job_run_details where end_time < now() - interval '3 days'$cmd$
  );
end
$$;
