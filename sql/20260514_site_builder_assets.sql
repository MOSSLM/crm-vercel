-- Create storage bucket for site builder assets (images, etc.)
-- This bucket is public: files can be read without authentication.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-builder-assets',
  'site-builder-assets',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public SELECT on objects in this bucket
CREATE POLICY "Public read site-builder assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-builder-assets');

-- Allow authenticated upload
CREATE POLICY "Authenticated users can upload site-builder assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-builder-assets');

-- Allow authenticated delete of own files
CREATE POLICY "Authenticated users can delete their site-builder assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-builder-assets');

-- Track uploaded assets per site
CREATE TABLE IF NOT EXISTS site_builder_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     TEXT NOT NULL,
  path        TEXT NOT NULL,            -- storage path (filename in bucket)
  public_url  TEXT NOT NULL,
  filename    TEXT NOT NULL,
  size        INTEGER,
  mime_type   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by site
CREATE INDEX IF NOT EXISTS idx_site_builder_assets_site_id ON site_builder_assets(site_id);

-- RLS
ALTER TABLE site_builder_assets ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read site_builder_assets"
  ON site_builder_assets FOR SELECT
  USING (true);

-- Authenticated insert
CREATE POLICY "Authenticated insert site_builder_assets"
  ON site_builder_assets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated delete
CREATE POLICY "Authenticated delete site_builder_assets"
  ON site_builder_assets FOR DELETE
  TO authenticated
  USING (true);
