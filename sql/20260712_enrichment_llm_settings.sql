-- Configuration globale du modèle IA de l'edge function d'enrichissement.
--
-- L'edge function `enrich-lead-magnet` appelle un LLM pour analyser les sites.
-- Le modèle était codé en dur ; cette table permet de le choisir depuis les
-- Paramètres du CRM (provider + model). L'edge function lit la ligne
-- id='default' à chaque run — même pattern que `enrichment_tag_settings`.
--
-- Table singleton : une seule ligne, id='default'.

-- ---------------------------------------------------------------------------
-- 1. Table de configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_llm_settings (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  provider   TEXT NOT NULL DEFAULT 'openai',
  model      TEXT NOT NULL DEFAULT 'gpt-5',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_llm_settings_singleton CHECK (id = 'default'),
  CONSTRAINT enrichment_llm_settings_provider CHECK (provider IN ('openai', 'deepseek'))
);

-- Ligne par défaut (GPT-5). Ne réécrit pas une config déjà posée.
INSERT INTO enrichment_llm_settings (id, provider, model)
  VALUES ('default', 'openai', 'gpt-5')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE enrichment_llm_settings ENABLE ROW LEVEL SECURITY;

-- Lecture publique : la config n'est pas sensible et l'edge function
-- (service-role) doit pouvoir la lire.
DROP POLICY IF EXISTS "Public read enrichment_llm_settings" ON enrichment_llm_settings;
CREATE POLICY "Public read enrichment_llm_settings"
  ON enrichment_llm_settings FOR SELECT
  USING (true);

-- Écriture réservée aux utilisateurs authentifiés (via l'API Paramètres).
DROP POLICY IF EXISTS "Authenticated insert enrichment_llm_settings" ON enrichment_llm_settings;
CREATE POLICY "Authenticated insert enrichment_llm_settings"
  ON enrichment_llm_settings FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated update enrichment_llm_settings" ON enrichment_llm_settings;
CREATE POLICY "Authenticated update enrichment_llm_settings"
  ON enrichment_llm_settings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);
