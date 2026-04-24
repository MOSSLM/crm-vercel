-- Add missing indexes on opportunites foreign key columns.
-- Without these, lookups by entreprise_id and stage_id do full table scans.

create index if not exists opportunites_entreprise_id_idx
  on public.opportunites using btree (entreprise_id);

create index if not exists opportunites_stage_id_idx
  on public.opportunites using btree (stage_id);

-- Also index lead_magnet_projects by opportunite_id since it's queried on every page load
create index if not exists lead_magnet_projects_opportunite_id_idx
  on public.lead_magnet_projects using btree (opportunite_id);
