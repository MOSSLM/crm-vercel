-- ── Ranger une séquence sans la détruire ────────────────────────────────────
--
-- LE CHOIX QUI MANQUAIT
-- Une séquence dont on ne veut plus n'avait que deux issues : rester dans la
-- liste (« brouillon », indistinguable de celle qu'on est en train d'écrire) ou
-- disparaître par `delete`. Or supprimer une séquence emporte ses inscriptions
-- — `sequence_enrollments.automation_id` est en `on delete cascade`, et les
-- tâches de démarchage suivent par `enrollment_id` — donc l'historique de tous
-- les prospects qu'elle a démarchés. Le geste courant (« celle-ci, on ne s'en
-- sert plus ») n'avait pas de bouton qui ne détruise rien.
--
-- CE QUE `archived` VEUT DIRE
-- Hors du plan de travail, gardée en base. Elle sort des listes où l'on CHOISIT
-- une séquence (suggestion du tableau marketing, sélecteur du pipeline
-- commercial, tableau de bord du régulateur, vue semaine) et de la liste des
-- séquences, qui la montre derrière son filtre. Elle reste lisible partout où
-- on RELIT du passé : le nom d'une séquence archivée s'affiche toujours sur les
-- tâches et les inscriptions qu'elle a produites.
--
-- CE QUE ÇA FAIT AUX INSCRIPTIONS EN COURS
-- Rien qu'un statut ne fasse déjà : tout le moteur exige `status = 'on'`.
-- Archiver revient donc, pour une inscription active, à mettre en pause —
-- `processSequenceEnrollment` la gèle avec `hold_reason = 'sequence_paused'`,
-- sans rien perdre, et elle repart si la séquence est réactivée. L'écran le dit
-- avant d'archiver, en comptant les inscriptions concernées.
--
-- POURQUOI PAS UNE COLONNE `archived_at`
-- Les quatre états existants vivent déjà dans `status`, et tout le code pose la
-- même question (« est-ce `on` ? »). Une seconde source d'autorité aurait obligé
-- chaque lecture à croiser deux colonnes — une occasion de plus de diverger,
-- pour un état qui est exactement de même nature que « en pause ».

alter table public.automations drop constraint if exists automations_status_check;

alter table public.automations
  add constraint automations_status_check
  check (status in ('on', 'paused', 'draft', 'error', 'archived'));

comment on column public.automations.status is
  'on = en service · paused = arrêtée volontairement · draft = jamais lancée · '
  'error = dernière exécution en échec · archived = rangée, hors des listes de choix. '
  'Seul « on » autorise le moteur à faire avancer une inscription.';
