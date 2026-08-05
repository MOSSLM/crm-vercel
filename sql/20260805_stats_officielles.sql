-- Chiffres clés officiels : ceux que le client a confirmés.
--
-- POURQUOI
-- Les sites démo affichent des chiffres clés (années d'expérience, clients
-- satisfaits, installations). Beaucoup d'entreprises ne les publient pas sur leur
-- site, ou les y laissent périmer : l'enrichissement se rabat alors sur le nombre
-- d'avis Google, multiplié pour donner un ordre de grandeur crédible
-- (`avis × 1,4`, puis `× 2` pour les installations). C'est volontaire et adapté à
-- une démo privée, accessible sur lien uniquement.
--
-- Il manquait la suite : quand le client donne ses vrais chiffres au cours de
-- l'échange commercial, il faut pouvoir les saisir sans qu'un réenrichissement
-- vienne les écraser. D'où ces colonnes, séparées des estimations :
--
--   colonne _official remplie  → affichée telle quelle
--   colonne _official vide     → repli sur l'estimation existante
--
-- L'enrichissement ne lit ni n'écrit JAMAIS ces colonnes. C'est ce qui garantit
-- qu'un chiffre confirmé par le client survit à toutes les relances.
--
-- APPLICATION : à la main dans l'éditeur SQL Supabase. Idempotent, rejouable.

do $$
begin
  if to_regclass('public.lead_magnet_projects') is null then
    raise notice 'lead_magnet_projects absente : rien à faire.';
    return;
  end if;

  alter table public.lead_magnet_projects
    add column if not exists stat_years_experience_official        text,
    add column if not exists stat_satisfied_clients_official       text,
    add column if not exists stat_installations_completed_official text,
    add column if not exists stat_rge_count_official               text;

  raise notice 'Colonnes de chiffres officiels en place.';
end $$;

comment on column public.lead_magnet_projects.stat_years_experience_official is
  'Années d''expérience CONFIRMÉES par le client. Prioritaire sur '
  'stat_years_experience, qui est une estimation. Jamais écrite par '
  'l''enrichissement : un réenrichissement ne doit pas effacer un chiffre donné '
  'par le client. NULL = pas encore confirmé, on affiche l''estimation.';

comment on column public.lead_magnet_projects.stat_satisfied_clients_official is
  'Clients satisfaits CONFIRMÉS par le client. À défaut, l''estimation '
  'stat_satisfied_clients (nombre d''avis Google × 1,4) est affichée. Jamais '
  'écrite par l''enrichissement.';

comment on column public.lead_magnet_projects.stat_installations_completed_official is
  'Installations CONFIRMÉES par le client. À défaut, l''estimation '
  'stat_installations_completed. Jamais écrite par l''enrichissement.';

comment on column public.lead_magnet_projects.stat_rge_count_official is
  'Qualifications (RGE, Qualibat…) CONFIRMÉES par le client. Comme les autres '
  'chiffres RGE, reste facultative : beaucoup d''entreprises n''en ont aucune.';
