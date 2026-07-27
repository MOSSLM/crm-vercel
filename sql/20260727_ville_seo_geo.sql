-- Ville SEO : détermination géographique sur le référentiel officiel des communes.
--
-- La « ville SEO » est la grande ville mise en avant partout sur le site d'une
-- entreprise (Quetigny → Dijon). Elle était devinée par le LLM, avec un repli qui
-- mappait un département entier vers UNE ville — faux dès qu'un département a
-- plusieurs pôles (71 : Chalon-sur-Saône ~45k vs Mâcon ~34k ; 62, 76, 83, 06…).
--
-- L'edge function `enrich-lead-magnet` calcule désormais la ville SEO sur la
-- distance réelle, à partir de `communes_fr`, avec cet ordre d'autorité :
--   1. ville_seo_overrides      (correction manuelle, gagne toujours)
--   2. calcul géographique      (communes_fr + seuils d'enrichment_geo_settings)
--   3. extraction LLM           (filet : référentiel non chargé, pas de coordonnées)
--   4. entreprises.ville        (dernier recours, toujours une vraie ville)
--
-- `communes_fr` est peuplée depuis les Paramètres du CRM (onglet Enrichissement),
-- qui interroge geo.api.gouv.fr département par département. Tant qu'elle est
-- vide, l'enrichissement continue de fonctionner en retombant sur l'étape 3.
--
-- À exécuter manuellement dans l'éditeur SQL Supabase.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Référentiel des communes françaises
-- ---------------------------------------------------------------------------
-- Une commune porte plusieurs codes postaux ET un code postal couvre plusieurs
-- communes : d'où le tableau `codes_postaux` plutôt qu'une colonne scalaire.
CREATE TABLE IF NOT EXISTS communes_fr (
  code_insee    TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  codes_postaux TEXT[] NOT NULL DEFAULT '{}',
  population    INTEGER NOT NULL DEFAULT 0,
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recherche de la commune d'origine par code postal.
CREATE INDEX IF NOT EXISTS communes_fr_codes_postaux_idx
  ON communes_fr USING GIN (codes_postaux);

-- Recherche des grandes villes candidates : l'index partiel réduit le balayage
-- à quelques centaines de lignes au lieu des ~35 000 communes.
CREATE INDEX IF NOT EXISTS communes_fr_big_cities_idx
  ON communes_fr (lat, lon)
  WHERE population >= 15000;

ALTER TABLE communes_fr ENABLE ROW LEVEL SECURITY;

-- Lecture publique : données ouvertes, et l'edge function (service-role) doit lire.
DROP POLICY IF EXISTS "Public read communes_fr" ON communes_fr;
CREATE POLICY "Public read communes_fr"
  ON communes_fr FOR SELECT
  USING (true);

-- Écriture réservée à la route de chargement (authentifiée).
DROP POLICY IF EXISTS "Authenticated write communes_fr" ON communes_fr;
CREATE POLICY "Authenticated write communes_fr"
  ON communes_fr FOR ALL
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. Corrections manuelles de la ville SEO
-- ---------------------------------------------------------------------------
-- Consultée AVANT tout calcul. Une ligne vaut pour toutes les entreprises de la
-- commune (ou du code postal), pas seulement celle qu'on regardait.
-- Résolution : (code_postal, commune) d'abord, puis (code_postal, NULL).
CREATE TABLE IF NOT EXISTS ville_seo_overrides (
  id          BIGSERIAL PRIMARY KEY,
  code_postal TEXT NOT NULL,
  commune     TEXT,
  ville_seo   TEXT NOT NULL,
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule règle par (code postal, commune). `commune IS NULL` = règle par
-- défaut du code postal : deux index partiels, NULL n'étant pas comparable
-- dans un index unique classique.
CREATE UNIQUE INDEX IF NOT EXISTS ville_seo_overrides_cp_commune_idx
  ON ville_seo_overrides (code_postal, commune)
  WHERE commune IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ville_seo_overrides_cp_idx
  ON ville_seo_overrides (code_postal)
  WHERE commune IS NULL;

ALTER TABLE ville_seo_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read ville_seo_overrides" ON ville_seo_overrides;
CREATE POLICY "Public read ville_seo_overrides"
  ON ville_seo_overrides FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated write ville_seo_overrides" ON ville_seo_overrides;
CREATE POLICY "Authenticated write ville_seo_overrides"
  ON ville_seo_overrides FOR ALL
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Seuils de l'arbitrage géographique
-- ---------------------------------------------------------------------------
-- Table singleton, même patron qu'`enrichment_llm_settings` : l'edge function lit
-- la ligne id='default' à chaque run et retombe sur ces mêmes valeurs si elle
-- manque. Les seuils s'ajustent depuis les Paramètres, sans redéploiement.
--
-- Règle appliquée, dans l'ordre :
--   1. métropole (>= metro_population) à <= metro_radius_km      → la plus proche
--   2. sinon, >= big_city_population à <= preferred_radius_km    → la PLUS PEUPLÉE
--   3. sinon, >= big_city_population à <= max_radius_km          → la PLUS PROCHE
CREATE TABLE IF NOT EXISTS enrichment_geo_settings (
  id                  TEXT PRIMARY KEY DEFAULT 'default',
  metro_population    INTEGER NOT NULL DEFAULT 100000,
  metro_radius_km     INTEGER NOT NULL DEFAULT 30,
  big_city_population INTEGER NOT NULL DEFAULT 20000,
  preferred_radius_km INTEGER NOT NULL DEFAULT 35,
  max_radius_km       INTEGER NOT NULL DEFAULT 60,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_geo_settings_singleton CHECK (id = 'default'),
  CONSTRAINT enrichment_geo_settings_radii CHECK (
    metro_radius_km > 0 AND preferred_radius_km > 0 AND max_radius_km >= preferred_radius_km
  ),
  CONSTRAINT enrichment_geo_settings_populations CHECK (
    big_city_population > 0 AND metro_population >= big_city_population
  )
);

INSERT INTO enrichment_geo_settings (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE enrichment_geo_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read enrichment_geo_settings" ON enrichment_geo_settings;
CREATE POLICY "Public read enrichment_geo_settings"
  ON enrichment_geo_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated write enrichment_geo_settings" ON enrichment_geo_settings;
CREATE POLICY "Authenticated write enrichment_geo_settings"
  ON enrichment_geo_settings FOR ALL
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 4. Provenance de la ville SEO
-- ---------------------------------------------------------------------------
-- 'auto'   : posée par l'enrichissement — un recalcul en masse peut la corriger.
-- 'manual' : saisie dans la fiche — jamais touchée par un recalcul.
-- NULL     : antérieure à cette migration, traitée comme 'auto'.
ALTER TABLE lead_magnet_projects
  ADD COLUMN IF NOT EXISTS override_city_source TEXT;

ALTER TABLE lead_magnet_projects
  DROP CONSTRAINT IF EXISTS lead_magnet_projects_override_city_source_check;
ALTER TABLE lead_magnet_projects
  ADD CONSTRAINT lead_magnet_projects_override_city_source_check
  CHECK (override_city_source IS NULL OR override_city_source IN ('auto', 'manual'));

COMMIT;
