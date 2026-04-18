-- Migration: Add surrounding_cities and postal_code to lead_magnet_projects
-- Used by the AI enrichment assistant to store geo data for Framer templates

ALTER TABLE public.lead_magnet_projects
  ADD COLUMN IF NOT EXISTS surrounding_cities text NULL,
  ADD COLUMN IF NOT EXISTS postal_code text NULL;

COMMENT ON COLUMN public.lead_magnet_projects.surrounding_cities IS
  'Villes dans un rayon de 30-40km, format "Ville1; Ville2; Ville3"';

COMMENT ON COLUMN public.lead_magnet_projects.postal_code IS
  'Code postal de la ville principale (override_city / override_location)';
