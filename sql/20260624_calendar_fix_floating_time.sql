-- =====================================================================
-- Calendrier — correction du décalage de fuseau (+2h)
-- =====================================================================
-- À exécuter une seule fois dans l'éditeur SQL Supabase si la table
-- crm_calendar_events a déjà été créée avec start_at/end_at en timestamptz.
--
-- Contexte : l'app manipule des heures LOCALES « flottantes » — elle écrit
-- '2026-06-25T08:00:00' (sans fuseau) et relit via getHours(). Stockées en
-- timestamptz, ces valeurs ont été réinterprétées en UTC puis réaffichées en
-- heure de Paris (UTC+2), d'où l'affichage à 10h au lieu de 8h.
--
-- Correctif : colonnes timestamp SANS fuseau. La conversion `at time zone 'UTC'`
-- récupère l'heure d'horloge d'origine des lignes déjà enregistrées (les blocs
-- existants s'affichent alors aux bons horaires, sans autre manipulation).
-- =====================================================================

begin;

alter table public.crm_calendar_events
  alter column start_at type timestamp without time zone using (start_at at time zone 'UTC'),
  alter column end_at   type timestamp without time zone using (end_at   at time zone 'UTC');

commit;
