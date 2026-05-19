-- Image library: central, taggable, reusable across sites.
-- Co-exists with the per-site `site_builder_assets` table (which remains for
-- ad-hoc uploads in the builder). The library is filterable by service tags
-- and prioritises images matching the active company's `service_tags`.
-- The reserved tag value 'all' marks an image as universal (suggested for
-- every company).

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-library',
  'media-library',
  true,
  15728640, -- 15 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read media-library"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media-library');

CREATE POLICY "Authenticated upload media-library"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media-library');

CREATE POLICY "Authenticated delete media-library"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'media-library');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_library (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  public_url      TEXT NOT NULL,
  mime_type       TEXT,
  size_bytes      BIGINT,
  width           INTEGER,
  height          INTEGER,
  alt_text        TEXT,
  description     TEXT,
  service_tags    JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_type      TEXT NOT NULL DEFAULT 'stock',
  entreprise_id   INTEGER REFERENCES entreprises(id) ON DELETE SET NULL,
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT media_library_image_type_check
    CHECK (image_type IN ('stock', 'ai_generated', 'personal', 'company')),

  CONSTRAINT media_library_company_requires_entreprise
    CHECK (image_type <> 'company' OR entreprise_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_media_library_service_tags
  ON media_library USING GIN (service_tags);
CREATE INDEX IF NOT EXISTS idx_media_library_image_type
  ON media_library (image_type);
CREATE INDEX IF NOT EXISTS idx_media_library_entreprise_id
  ON media_library (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_media_library_created_at
  ON media_library (created_at DESC);

-- Auto-update `updated_at` on any change
CREATE OR REPLACE FUNCTION media_library_set_updated_at()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_library_updated_at ON media_library;
CREATE TRIGGER trg_media_library_updated_at
  BEFORE UPDATE ON media_library
  FOR EACH ROW
  EXECUTE FUNCTION media_library_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read media_library"
  ON media_library FOR SELECT
  USING (true);

CREATE POLICY "Authenticated insert media_library"
  ON media_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update media_library"
  ON media_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete media_library"
  ON media_library FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- RPC: rank media by overlap with a company's service_tags.
-- Returns every row with `match_count` (number of tags in common) and
-- `is_universal` (image carries the reserved 'all' tag). Callers split the
-- result into "Suggested" (match_count > 0 OR is_universal) and "Other".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION media_library_by_company(p_entreprise_id INTEGER)
RETURNS TABLE (
  id            UUID,
  file_name     TEXT,
  storage_path  TEXT,
  public_url    TEXT,
  mime_type     TEXT,
  size_bytes    BIGINT,
  width         INTEGER,
  height        INTEGER,
  alt_text      TEXT,
  description   TEXT,
  service_tags  JSONB,
  image_type    TEXT,
  entreprise_id INTEGER,
  uploaded_by   UUID,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  match_count   INTEGER,
  is_universal  BOOLEAN
) AS $$
  WITH company AS (
    SELECT COALESCE(e.service_tags, '[]'::jsonb) AS tags
    FROM entreprises e
    WHERE e.id = p_entreprise_id
  ),
  company_tags AS (
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(tags)
      FROM company
    ) AS tag_array
  )
  SELECT
    m.id,
    m.file_name,
    m.storage_path,
    m.public_url,
    m.mime_type,
    m.size_bytes,
    m.width,
    m.height,
    m.alt_text,
    m.description,
    m.service_tags,
    m.image_type,
    m.entreprise_id,
    m.uploaded_by,
    m.created_at,
    m.updated_at,
    CARDINALITY(
      ARRAY(
        SELECT jsonb_array_elements_text(m.service_tags)
        INTERSECT
        SELECT UNNEST(c.tag_array)
      )
    )::INTEGER AS match_count,
    (m.service_tags ? 'all') AS is_universal
  FROM media_library m
  CROSS JOIN company_tags c
  ORDER BY
    (m.service_tags ? 'all') DESC,
    CARDINALITY(
      ARRAY(
        SELECT jsonb_array_elements_text(m.service_tags)
        INTERSECT
        SELECT UNNEST(c.tag_array)
      )
    ) DESC,
    m.created_at DESC;
$$ LANGUAGE sql STABLE;

-- Pin search_path to silence "function_search_path_mutable" lint.
ALTER FUNCTION public.media_library_by_company(integer) SET search_path = 'public';
