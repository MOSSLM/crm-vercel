-- Rattrapage : colonnes de `sites` attendues par le code.
--
-- ┌─ D'ABORD, UN CONSTAT SANS RIEN MODIFIER ─────────────────────────────────┐
-- │ Cette requête liste les colonnes qui manquent. Si elle ne renvoie AUCUNE │
-- │ ligne, la base est à jour et le reste de ce fichier est inutile.         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
--   select c.nom as colonne_manquante
--   from unnest(array[
--     'published_subdomain','published_domain','is_published','enterprise_id',
--     'site_config','client_portal_token','client_portal_activated',
--     'lead_magnet_project_id','is_template','build_stage','is_claude_design',
--     'tweaks','shared_assets','published_tweaks','published_shared_assets',
--     'style_guide','sitemap','published_style_guide','published_site_config',
--     'published_sitemap','published_instances','published_variables',
--     'published_reviews','paywall_enabled','booking_url','client_brief',
--     'og_image_url','og_shot_url','og_logo_url','og_generated_at','og_shot_at',
--     'og_shot_mobile_url','og_logo_sombre'
--   ]) as c(nom)
--   where not exists (
--     select 1 from information_schema.columns
--     where table_schema = 'public' and table_name = 'sites' and column_name = c.nom
--   );
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

-- ⚠️ AVANT TOUT : vérifiez que vous êtes sur le BON projet Supabase.
--
-- Le serveur lit la variable SUPABASE_URL configurée dans Vercel :
-- https://<ref>.supabase.co → ouvrez le projet <ref> dans le dashboard.
-- (Le bundle navigateur, lui, code en dur son propre ref dans
--  src/utils/supabase/info.tsx ; rien ne garantit que les deux coïncident.)
--
-- Pour identifier le bon projet, exécutez ceci dans chacun — il doit répondre `t` :
--   select to_regclass('public.sites') is not null as bon_projet;
--
-- Le message « relation "public.sites" does not exist » ne veut PAS dire qu'il
-- manque des migrations : il veut dire que la table n'est pas dans CE projet.
-- N'appliquez surtout pas les migrations « pour créer la table » — vous
-- fabriqueriez un schéma vide en double dans un projet qui n'est pas le vôtre.

do $$
begin
  if to_regclass('public.sites') is null then
    raise exception
      'Mauvais projet Supabase : public.sites est introuvable ici. Ouvrez le projet correspondant à SUPABASE_URL (Vercel → Settings → Environment Variables) et relancez ce script.';
  end if;
end $$;

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

-- La contrainte qui accompagne build_stage (identique à la migration source :
-- un CHECK plutôt qu'un enum PG, pour renommer une étape sans ALTER TYPE).
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'sites' and constraint_name = 'sites_build_stage_check'
  ) then
    alter table public.sites
      add constraint sites_build_stage_check
      check (build_stage in ('a_faire', 'en_cours', 'a_verifier', 'pret'));
  end if;
end $$;

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

-- 20260810_sites_og.sql — carte OpenGraph pré-générée (preview WhatsApp)
alter table public.sites
  add column if not exists og_image_url    text,
  add column if not exists og_shot_url     text,
  add column if not exists og_logo_url     text,
  add column if not exists og_generated_at timestamptz,
  add column if not exists og_shot_at      timestamptz;

-- 20260810_sites_og_v2.sql — capture mobile + lisibilité du logo
alter table public.sites
  add column if not exists og_shot_mobile_url text,
  add column if not exists og_logo_sombre     boolean;

commit;

-- Vérification : doit lister les colonnes ci-dessus.
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'sites' order by column_name;
