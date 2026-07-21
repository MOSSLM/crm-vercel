-- Track which site_builder_assets row a media_library image was imported from,
-- so the "Importer les images du site builder" action is idempotent: an asset
-- already present in the library is skipped on re-run (no duplicates).
--
-- Nullable: normal library uploads leave it NULL. The partial unique index only
-- constrains rows that carry a source, so it never blocks ordinary inserts.

ALTER TABLE media_library
  ADD COLUMN IF NOT EXISTS source_asset_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS media_library_source_asset_id_key
  ON media_library (source_asset_id)
  WHERE source_asset_id IS NOT NULL;
