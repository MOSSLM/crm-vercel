-- LA REPRISE DES APPELS À FROID — 632 tâches qui n'appartenaient à personne.
--
-- LA RÈGLE QUI LA MOTIVE, mot pour mot : « ceux qui ne sont pas en séquence, on
-- ne doit pas les voir dans des tâches, même pas d'appels. Dans tous les cas on
-- met en séquence pour avoir des tâches. »
--
-- CE QUE CE STOCK ÉTAIT. L'attribution semait une tâche « Appel à froid » par
-- entreprise, sans séquence, sans étape, sans inscription. Au 20/08/2026 il en
-- restait 632 en attente, sur 632 entreprises :
--   ·  86 sur des entreprises DÉJÀ inscrites ailleurs et vivantes — du travail
--      en DOUBLE, invisible depuis la file ;
--   ·  15 sur des entreprises dont la séquence est terminée ;
--   · 531 jamais inscrites, dont 524 joignables et 7 sans aucun canal.
--
-- ET CE QU'ELLES N'ÉTAIENT PAS : aucune des 531 n'a de démo publiée, aucune n'a
-- été touchée (`premiere_touche_le` nul), aucune n'a reçu le moindre message.
-- Ce sont donc de VRAIS premiers contacts, et elles entrent en S1 à l'étape 0.
-- La question « à quelle étape les remettre » ne se posait que pour les 101
-- autres, et elle est déjà tranchée : leur inscription existe et fait foi.
--
-- ⚠️ RIEN NE PART. S1 est en `draft` : le moteur gare toute inscription sur
-- `hold_reason = 'sequence_paused'` sans exécuter la moindre étape. Les 524
-- attendront que la séquence soit relue et activée — c'est le geste de Matteo,
-- pas celui de cette migration.
--
-- ON ARCHIVE AVANT D'ÉCRIRE. Le trigger `updated_at` détruit la preuve de ce
-- qui était là ; une fois écrasée, elle ne revient pas.

begin;

-- ── 1. L'archive, avant tout le reste ────────────────────────────────────
create table if not exists public.archive_taches_froides_20260820 as
select * from public.prospection_tasks
where automation_id is null and status in ('pending', 'snoozed');

comment on table public.archive_taches_froides_20260820 is
  'Les 632 tâches d''appel à froid en attente au 20/08/2026, avant leur mise à l''écart. Semées une par une par l''ancienne attribution, sans séquence ni inscription. Copie complète : c''est la seule trace de ce que la file contenait avant la reprise.';

-- ── 2. S1 devient la SÉQUENCE D'ENTRÉE ───────────────────────────────────
-- Elle ne déclare aucun public, et c'est volontaire : elle commence par une
-- condition (« a-t-il un mobile ? ») et aiguille elle-même vers WhatsApp,
-- l'e-mail ou l'appel. `sequenceSuggeree` ne peut donc pas la proposer — elle
-- ignore exprès les séquences sans besoin de canal, sinon la première séquence
-- sans règle s'imposerait à tout le parc. On la DÉSIGNE.
update public.automations
set settings = coalesce(settings, '{}'::jsonb) || '{"entree": true}'::jsonb
where id = '0e7a1f30-0000-4000-8000-000000000001';

-- ── 3. Les 524 entrent en S1, à l'étape 0 ────────────────────────────────
-- `vars` est laissé vide : le moteur résout les variables à l'exécution
-- (`resolveEntities`), et les recopier ici en figerait une version périmée. Le
-- seul contenu est la marque de reprise, pour qu'on sache d'où elles viennent.
with candidates as (
  select
    e.id as entreprise_id,
    (select t.opportunite_id
       from public.prospection_tasks t
      where t.entreprise_id = e.id and t.automation_id is null
        and t.status in ('pending', 'snoozed')
      order by t.created_at
      limit 1) as opportunite_id,
    -- Le décideur d'abord : c'est lui que le message nommera.
    (select c.id from public.contacts c
      where c.entreprise_id = e.id
      order by c.is_decision_maker desc nulls last, c.created_at
      limit 1) as contact_id,
    e.owner_id
  from public.entreprises e
  where exists (
      select 1 from public.prospection_tasks t
       where t.entreprise_id = e.id and t.automation_id is null
         and t.status in ('pending', 'snoozed'))
    and not exists (
      select 1 from public.sequence_enrollments se where se.entreprise_id = e.id)
    -- Joignable : la même question que la garde du moteur — personne à qui
    -- écrire NI appeler, on n'inscrit pas.
    and (
      nullif(trim(coalesce(e.email, '')), '') is not null
      or nullif(trim(coalesce(e.telephone, '')), '') is not null
      or exists (select 1 from public.contacts c
                  where c.entreprise_id = e.id
                    and (nullif(trim(coalesce(c.email, '')), '') is not null
                         or nullif(trim(coalesce(c.tel, '')), '') is not null))
    )
), inserees as (
  insert into public.sequence_enrollments
    (automation_id, entreprise_id, contact_id, opportunite_id, current_step,
     status, next_run_at, send_at, hold_reason, vars, created_by)
  select
    '0e7a1f30-0000-4000-8000-000000000001',
    c.entreprise_id, c.contact_id, c.opportunite_id, 0,
    'active', now(), null, 'sequence_paused',
    jsonb_build_object('reprise_20260820',
      jsonb_build_object('depuis', 'appel_a_froid', 'etape_avant', 0)),
    c.owner_id
  from candidates c
  returning id, entreprise_id, contact_id
)
-- La liste de la campagne suit l'inscription. Un segment est dynamique, une
-- LISTE de campagne ne l'est pas : c'est ce dénominateur stable qui rend la
-- campagne mesurable.
insert into public.campagne_leads
  (automation_id, entreprise_id, contact_id, enrollment_id, origine, origine_ref, statut)
select '0e7a1f30-0000-4000-8000-000000000001',
       i.entreprise_id, i.contact_id, i.id, 'reprise', 'appel_a_froid', 'inscrit'
from inserees i
on conflict (automation_id, entreprise_id) do nothing;

-- ── 4. Les 632 tâches sortent de la file ─────────────────────────────────
-- `skipped`, jamais supprimées : on qualifie et on masque. Le motif reste sur
-- la ligne, pour qu'on sache dans six mois pourquoi elle ne s'est pas faite.
update public.prospection_tasks
set status = 'skipped',
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'reprise_20260820',
      jsonb_build_object(
        'motif', 'appel à froid sans séquence — repris par S1',
        'le', now()))
where automation_id is null and status in ('pending', 'snoozed');

commit;

-- ── À RELIRE APRÈS APPLICATION ───────────────────────────────────────────
-- Le dépôt n'est pas la vérité sur Supabase : on vérifie en base.
--
-- 1. Plus une seule tâche en attente sans inscription :
--      select count(*) from prospection_tasks
--       where automation_id is null and status in ('pending','snoozed');   -- 0
--
-- 2. S1 porte le drapeau d'entrée :
--      select settings->'entree' from automations
--       where id='0e7a1f30-0000-4000-8000-000000000001';                   -- true
--
-- 3. Les inscriptions sont garées, pas actives — rien ne peut partir :
--      select status, hold_reason, count(*) from sequence_enrollments
--       where automation_id='0e7a1f30-0000-4000-8000-000000000001'
--       group by 1,2;                          -- active / sequence_paused
--
-- 4. Aucune entreprise n'a deux inscriptions vivantes :
--      select entreprise_id, count(*) from sequence_enrollments
--       where status in ('active','paused') group by 1 having count(*) > 1;  -- vide
