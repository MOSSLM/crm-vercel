-- Ajout d'une couleur personnalisable sur les projets production
begin;

alter table if exists public.crm_projects
  add column if not exists color text not null default '#4f46e5';

alter table if exists public.crm_projects
  drop constraint if exists crm_projects_color_hex_check;

alter table if exists public.crm_projects
  add constraint crm_projects_color_hex_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

commit;
