-- Configuration globale du modèle IA vision qui auto-tague et décrit les images
-- de la bibliothèque (`media_library`).
--
-- L'endpoint `/api/media/auto-tag` lit la ligne id='default' pour choisir le
-- provider + modèle (Claude Haiku par défaut, GPT-4o mini possible). Même
-- pattern singleton que `enrichment_llm_settings`.

-- ---------------------------------------------------------------------------
-- 1. Table de configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_autotag_settings (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  provider   TEXT NOT NULL DEFAULT 'anthropic',
  model      TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_autotag_settings_singleton CHECK (id = 'default'),
  CONSTRAINT media_autotag_settings_provider CHECK (provider IN ('anthropic', 'openai'))
);

-- Ligne par défaut (Claude Haiku, économe). Ne réécrit pas une config existante.
INSERT INTO media_autotag_settings (id, provider, model)
  VALUES ('default', 'anthropic', 'claude-haiku-4-5-20251001')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE media_autotag_settings ENABLE ROW LEVEL SECURITY;

-- Lecture publique : config non sensible.
DROP POLICY IF EXISTS "Public read media_autotag_settings" ON media_autotag_settings;
CREATE POLICY "Public read media_autotag_settings"
  ON media_autotag_settings FOR SELECT
  USING (true);

-- Écriture réservée aux utilisateurs authentifiés (via l'API Paramètres).
DROP POLICY IF EXISTS "Authenticated insert media_autotag_settings" ON media_autotag_settings;
CREATE POLICY "Authenticated insert media_autotag_settings"
  ON media_autotag_settings FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated update media_autotag_settings" ON media_autotag_settings;
CREATE POLICY "Authenticated update media_autotag_settings"
  ON media_autotag_settings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);
