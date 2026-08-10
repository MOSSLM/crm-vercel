-- 20260810_charte_sama.sql — la charte Sama jusque dans les valeurs par défaut.
--
-- Le CRM est passé de l'orange/noir à la charte Sama (nuit #0A1B33, azur
-- #2F7AE0, brume). Repeindre le CSS ne suffit pas : plusieurs tables portent
-- une couleur par défaut, et chaque nouvelle ligne renaîtrait orange.
--
-- Deux gestes par table :
--   1. le `default` de la colonne passe à la nouvelle valeur ;
--   2. les lignes RESTÉES à l'ancienne valeur par défaut sont recalées.
--
-- Ce second point est volontairement étroit : on ne touche qu'aux lignes qui
-- portent exactement l'ancien défaut, jamais à une couleur choisie à la main.
-- Une étiquette d'appel que quelqu'un a délibérément mise en orange le reste.

-- ── Téléphonie : étiquettes d'appel ──────────────────────────────────────
alter table if exists public.call_tags
  alter column color set default '#2F7AE0';
update public.call_tags set color = '#2F7AE0' where color = '#E2552B';

-- ── Rendez-vous : couleur de marque d'une page de réservation ────────────
-- L'ancien défaut #2A6FDB était le bleu « information » ; la marque, c'est
-- l'azur. Le repli applicatif (src/app/api/public/scheduling/manage) suit.
alter table if exists public.scheduling_pages
  alter column brand_color set default '#2F7AE0';
update public.scheduling_pages set brand_color = '#2F7AE0' where brand_color = '#2A6FDB';

-- ── Calendrier : catégories d'événements ─────────────────────────────────
alter table if exists public.crm_calendar_categories
  alter column color set default '#2F7AE0';
update public.crm_calendar_categories set color = '#2F7AE0' where color = '#2A6FDB';

-- ── Étiquettes CRM : le défaut était le gris taupe de l'ancienne charte ──
alter table if exists public.crm_tags
  alter column color set default '#8AA0C0';
update public.crm_tags set color = '#8AA0C0' where color = '#8A877F';

-- ── Types de tâches (seed) : mêmes teintes que les canaux de l'interface ─
update public.automation_task_types set color = '#2F7AE0' where id = 'tt_email' and color = '#2A6FDB';
update public.automation_task_types set color = '#8AA0C0' where id = 'tt_admin' and color = '#8A877F';

-- `tt_call` (#C8881F), `tt_wa` (#1F8A5B) et `tt_meeting` (#7A5AE0) sont déjà
-- conformes : warn, ok et magic n'ont pas bougé d'une charte à l'autre.
