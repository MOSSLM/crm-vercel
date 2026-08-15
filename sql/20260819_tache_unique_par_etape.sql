-- ── Une étape de séquence ne pose qu'une tâche ─────────────────────────────
--
-- LE PROBLÈME, TEL QU'IL S'EST VU
-- Un agent avait deux fois « Froid et Climatisation » dans ses WhatsApp à
-- envoyer. Deux tâches, même inscription, même étape (`s3`), créées à 1,5
-- seconde d'intervalle — donc la même opportunité deux fois dans sa file.
--
-- POURQUOI
-- Déclarer « il a répondu » avance l'inscription PUIS traite l'étape suivante
-- tout de suite, sans attendre le ticker. L'avancement pose
-- `next_run_at = maintenant` ; la tâche, elle, n'arrive que deux à quatre
-- secondes plus tard (modèle, audit, démo, attribution), et c'est seulement
-- alors que `next_run_at` repasse à `null`. Pendant cette fenêtre
-- l'inscription est DUE : le ticker, qui passe toutes les minutes, traite la
-- même étape en parallèle et pose une seconde tâche.
--
-- Le code garde désormais la trace (`poserTacheDEtape` lit avant d'écrire),
-- mais une lecture ne tranche pas une course où les deux chemins lisent avant
-- que l'un ait écrit. Seule la base peut le faire.
--
-- CE QUE L'INDEX DIT
-- Au plus UNE tâche vivante par (inscription, étape). Les tâches annulées
-- (`skipped`) en sortent : un demi-tour de séquence — retour sur la branche
-- « il a répondu » après une relance — annule les tâches en vol puis repose
-- l'étape, et doit continuer à le pouvoir.

-- 1. Les doublons déjà en base. On garde la PREMIÈRE — celle que l'agent a vue
--    en premier, et qui porte l'historique — et on annule les suivantes.
--    `doublon_technique` reste dans la charge utile : ces lignes n'ont jamais
--    correspondu à un geste de démarchage, et les compter comme des tâches
--    sautées par l'agent fausserait ses statistiques.
with doublons as (
  select
    id,
    row_number() over (partition by enrollment_id, step_id order by created_at, id) as rang
  from public.prospection_tasks
  where enrollment_id is not null
    and step_id is not null
    and status <> 'skipped'
)
update public.prospection_tasks t
   set status = 'skipped',
       payload = coalesce(t.payload, '{}'::jsonb) || jsonb_build_object('doublon_technique', true)
  from doublons d
 where d.id = t.id
   and d.rang > 1;

-- 2. Et plus jamais.
create unique index if not exists prospection_tasks_enrollment_step_uniq
  on public.prospection_tasks (enrollment_id, step_id)
  where enrollment_id is not null
    and step_id is not null
    and status <> 'skipped';

comment on index public.prospection_tasks_enrollment_step_uniq is
  'Au plus une tâche vivante par (inscription, étape). Tranche la course entre le traitement immédiat d''un geste d''agent et le ticker, qui voient la même étape due au même instant. Les tâches annulées (skipped) en sortent pour qu''un demi-tour de séquence puisse re-poser une étape.';
