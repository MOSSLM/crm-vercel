-- =====================================================================
-- pg_cron : le tick du réchauffeur
-- =====================================================================
-- APPLIQUÉ EN PRODUCTION LE 02/09/2026. Le secret n'est PAS à recopier :
-- le bloc le relit dans le job voisin `automations-tick`. Un secret qu'on
-- recopie à la main est un secret qui finit dans un presse-papier, puis dans
-- un fichier — c'est exactement ce que le point ouvert de CLAUDE.md reproche
-- à `20260808_donnees_publiques_cron.sql`.
--
-- LE JOB N'A JAMAIS ÉTÉ POSÉ, et c'est la troisième raison pour laquelle la
-- chauffe ne démarrait pas. `sql/20260819_rechauffeur.sql` a créé les cinq
-- tables, `src/lib/rechauffeur/` porte le moteur, `/api/rechauffeur/tick`
-- l'expose — et personne n'a jamais appelé cette route. Mesuré le 02/09/2026 :
-- `rechauffe_journal` était VIDE, quatorze jours après la migration. Le
-- registre des bots le disait pourtant en toutes lettres (« À POSER, il ne
-- tourne pas encore ») ; une note dans un fichier n'a jamais planifié personne.
--
-- POURQUOI IL NE SE GREFFE PAS SUR `automations-tick`. Celui-là tourne CHAQUE
-- MINUTE avec cinq envois par passage : c'est la file de prospection, elle doit
-- rester nerveuse. Le réchauffeur, lui, ouvre des sessions IMAP vers les boîtes
-- témoins — des secondes, pas des millisecondes. Les mettre ensemble ferait
-- porter au courrier qui rapporte le risque de délai du courrier qui ne
-- rapporte rien. D'où sa route, son job, et sa `maxDuration` de 300 s.
--
-- LES DIX MINUTES SONT UN CHOIX DE MOTEUR, PAS UNE PRÉFÉRENCE. Les créneaux
-- sont tirés au hasard dans une fenêtre de onze heures et `MAX_ENVOIS_PAR_TICK`
-- vaut 6 : à ce rythme, un ou deux messages sont dus par passage. Espacer
-- davantage transformerait l'étalement horaire — la moitié du travail — en
-- rafales, puisque le retard se rattraperait six par six.
--
-- Minute 3 puis toutes les 10 : les autres jobs occupent `*`, 0, 7, 23, 41,
-- `*/5` et `*/15`. Décaler de trois minutes évite de partir en même temps
-- qu'eux sur un pool de connexions partagé.
--
-- ⚠️ IL NE SUFFIT PAS. Un tick ne planifie que pour les expéditeurs
-- `statut = 'chauffe'` ET portant une `demarre_le` : sans ce couple, il tourne
-- à vide, sans erreur. Le bouton « Démarrer la chauffe » de
-- Prospection → Réchauffeur pose les deux d'un coup — c'est le seul geste
-- humain qui reste après ce fichier.
--
-- Rejouable : le job est désinstallé avant d'être réinstallé.
-- =====================================================================

do $$
declare
  secret text;
  cmd    text;
begin
  select substring(command from 'x-pg-cron-secret[^0-9a-zA-Z]+([0-9a-zA-Z-]+)')
    into secret
  from cron.job
  where jobname = 'automations-tick';

  if secret is null then
    raise exception 'Secret pg_cron introuvable dans le job automations-tick';
  end if;

  -- Rejouable : on désinstalle avant de réinstaller.
  if exists (select 1 from cron.job where jobname = 'rechauffeur-tick') then
    perform cron.unschedule('rechauffeur-tick');
  end if;

  cmd := format(
    $q$
  select net.http_post(
    url        := 'https://www.samadigitalstudio.fr/api/rechauffeur/tick',
    headers    := %L::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 280000
  ) as request_id;
    $q$,
    json_build_object(
      'content-type', 'application/json',
      'x-pg-cron-secret', secret
    )::text
  );

  perform cron.schedule('rechauffeur-tick', '3-59/10 * * * *', cmd);
end $$;

-- ── Contrôle ─────────────────────────────────────────────────────────
-- 1. Le job existe et il est actif :
--   select jobname, schedule, active from cron.job where jobname = 'rechauffeur-tick';
--
-- 2. Il passe, et ce qu'il répond :
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'rechauffeur-tick')
--   order by start_time desc limit 10;
--
-- 2 bis. Le secret est bien celui du voisin, sans jamais l'afficher :
--   with s as (
--     select (select substring(command from 'x-pg-cron-secret[^0-9a-zA-Z]+([0-9a-zA-Z-]+)')
--             from cron.job where jobname='automations-tick') as ref,
--            (select substring(command from 'x-pg-cron-secret[^0-9a-zA-Z]+([0-9a-zA-Z-]+)')
--             from cron.job where jobname='rechauffeur-tick') as neuf)
--   select ref = neuf as identiques from s;
--
-- 3. LE SEUL CONTRÔLE QUI PROUVE QUE LA CHAUFFE TRAVAILLE — le journal se
--    remplit. Tant qu'il est vide, le tick tourne à vide : relire le statut et
--    la date de départ des expéditeurs avant de chercher ailleurs.
--   select genre, au, detail from public.rechauffe_journal order by au desc limit 20;
--   select statut, demarre_le, email from public.rechauffe_expediteurs;
