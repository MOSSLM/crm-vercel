-- Allowlist globale des service_tags pour l'edge function d'enrichissement.
--
-- L'edge function `enrich-lead-magnet` extrait des service_tags d'un site web puis
-- les merge dans lead_magnet_projects.service_tags_snapshot et entreprises.service_tags.
-- Cette table permet d'interdire certains tags : un tag avec allowed = false ne sera
-- ni ajouté par l'enrichissement, ni conservé dans le snapshot du lead magnet.
--
-- Convention : un tag absent de la table est autorisé par défaut. Seuls les tags
-- explicitement basculés depuis les Paramètres ont une ligne ici.

-- ---------------------------------------------------------------------------
-- 1. Table de configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_tag_settings (
  tag        TEXT PRIMARY KEY,
  allowed    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE enrichment_tag_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read enrichment_tag_settings" ON enrichment_tag_settings;
CREATE POLICY "Public read enrichment_tag_settings"
  ON enrichment_tag_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert enrichment_tag_settings" ON enrichment_tag_settings;
CREATE POLICY "Authenticated insert enrichment_tag_settings"
  ON enrichment_tag_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update enrichment_tag_settings" ON enrichment_tag_settings;
CREATE POLICY "Authenticated update enrichment_tag_settings"
  ON enrichment_tag_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete enrichment_tag_settings" ON enrichment_tag_settings;
CREATE POLICY "Authenticated delete enrichment_tag_settings"
  ON enrichment_tag_settings FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. Vue : tags distincts réellement utilisés par les entreprises
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW enrichment_distinct_service_tags AS
SELECT DISTINCT trim(jsonb_array_elements_text(service_tags)) AS tag
FROM entreprises
WHERE jsonb_typeof(service_tags) = 'array';
