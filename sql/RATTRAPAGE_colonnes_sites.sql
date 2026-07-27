-- Rattrapage : colonnes de `sites` attendues par le code.
--
-- À exécuter dans l'éditeur SQL Supabase quand un aperçu ou un site publié
-- signale « column sites.<x> does not exist ». Le symptôme observé : une seule
-- colonne absente (paywall_enabled) faisait échouer la requête entière de
-- site-resolver, donc TOUS les aperçus et TOUS les sites publiés tombaient en
-- 404, sans rien qui nomme la cause.
--
-- Sans risque et rejouable : chaque instruction est `if not exists`, aucune
-- donnée existante n'est touchée. Regroupe les colonnes des migrations qui
-- altèrent `sites`, de la plus ancienne à la plus récente.

begin;

-- 20260505_site_builder_v2.sql
alter table public.sites
  add column if not exists published_subdomain text unique,
  add column if not exists published_domain    text,
  add column if not exists is_published        boolean not null default false,
  add column if not exists enterprise_id       integer references public.entreprises(id) on delete set null,
  add column if not exists site_config         jsonb,
  add column if not exists client_portal_token     text unique,
  add column if not exists client_portal_activated boolean not null default false;

-- 20260513_sites_lead_magnet_project.sql
alter table public.sites
  add column if not exists lead_magnet_project_id uuid;

-- 20260606_is_template_and_lm_deploye_stage.sql
alter table public.sites
  add column if not exists is_template boolean not null default false;

-- 20260626_claude_design_builder.sql
alter table public.sites
  add column if not exists build_stage             text not null default 'a_faire',
  add column if not exists is_claude_design        boolean not null default false,
  add column if not exists tweaks                  jsonb not null default '{}',
  add column if not exists shared_assets           jsonb not null default '{}',
  add column if not exists published_tweaks        jsonb,
  add column if not exists published_shared_assets jsonb;

-- Instantanés de publication (verrou snapshot de resolveSite)
alter table public.sites
  add column if not exists style_guide           jsonb,
  add column if not exists sitemap               jsonb,
  add column if not exists published_style_guide jsonb,
  add column if not exists published_site_config jsonb,
  add column if not exists published_sitemap     jsonb,
  add column if not exists published_instances   jsonb,
  add column if not exists published_variables   jsonb,
  add column if not exists published_reviews     jsonb;

-- 20260722_demo_site_paywall.sql  ← celle qui manquait en production
alter table public.sites
  add column if not exists paywall_enabled boolean not null default false,
  add column if not exists booking_url     text,
  add column if not exists client_brief    text;

commit;

-- Vérification : doit lister les colonnes ci-dessus.
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'sites' order by column_name;
