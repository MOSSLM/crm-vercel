-- Link sites to a lead_magnet_project for SEO city variables and reviews injection.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS lead_magnet_project_id uuid
    REFERENCES public.lead_magnet_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sites_lead_magnet_project_id
  ON public.sites (lead_magnet_project_id);
