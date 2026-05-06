-- ─── Site Versions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  site_config jsonb NOT NULL,
  change_description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_versions_site_version_idx ON site_versions (site_id, version_number);
CREATE INDEX IF NOT EXISTS site_versions_site_created_idx ON site_versions (site_id, created_at DESC);

ALTER TABLE site_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_versions_auth" ON site_versions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Keep only the 20 most recent versions per site
CREATE OR REPLACE FUNCTION cleanup_site_versions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM site_versions
  WHERE site_id = NEW.site_id
    AND id NOT IN (
      SELECT id FROM site_versions
      WHERE site_id = NEW.site_id
      ORDER BY version_number DESC
      LIMIT 20
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_site_versions
  AFTER INSERT ON site_versions
  FOR EACH ROW EXECUTE FUNCTION cleanup_site_versions();
