-- ============================================================
-- Site Builder V2 — single migration
-- Adds: publishing columns on sites, client_overrides table,
--       blog_posts table, client portal token on entreprises
-- ============================================================

-- 1. Extend `sites` table with publishing + enterprise linkage
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS published_subdomain   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS published_domain      TEXT,
  ADD COLUMN IF NOT EXISTS is_published          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enterprise_id         INTEGER REFERENCES public.entreprises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_config           JSONB;

-- Index for fast subdomain lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_published_subdomain
  ON public.sites (published_subdomain)
  WHERE published_subdomain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sites_published_domain
  ON public.sites (published_domain)
  WHERE published_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sites_enterprise_id
  ON public.sites (enterprise_id)
  WHERE enterprise_id IS NOT NULL;

-- 2. Client-editable section overrides
CREATE TABLE IF NOT EXISTS public.client_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  section_id  TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_overrides_site_section_unique UNIQUE (site_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_client_overrides_site_id
  ON public.client_overrides (site_id);

CREATE TRIGGER trg_client_overrides_updated_at
  BEFORE UPDATE ON public.client_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Blog posts
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL,
  excerpt          TEXT,
  content          TEXT,
  cover_image_url  TEXT,
  published_at     TIMESTAMPTZ,
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_site_slug_unique UNIQUE (site_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_site_id
  ON public.blog_posts (site_id, is_published, published_at DESC);

CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Client portal tokens on entreprises
ALTER TABLE public.entreprises
  ADD COLUMN IF NOT EXISTS client_portal_token         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS client_portal_activated     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entreprises_portal_token
  ON public.entreprises (client_portal_token)
  WHERE client_portal_token IS NOT NULL;

-- 5. Helper function: generate a random portal token (URL-safe base64, 24 chars)
CREATE OR REPLACE FUNCTION public.generate_portal_token()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_');
$$;

-- 6. Auto-generate portal token when a new entreprise is created
CREATE OR REPLACE FUNCTION public.ensure_portal_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_portal_token IS NULL THEN
    NEW.client_portal_token := public.generate_portal_token();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entreprises_portal_token
  BEFORE INSERT ON public.entreprises
  FOR EACH ROW EXECUTE FUNCTION public.ensure_portal_token();

-- Backfill existing enterprises that have no token yet
UPDATE public.entreprises
SET client_portal_token = public.generate_portal_token()
WHERE client_portal_token IS NULL;

-- 7. RLS policies — service role bypasses RLS so these are for anon/client access
-- Allow reading published sites (no auth required — public)
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sites_public_read ON public.sites;
CREATE POLICY sites_public_read ON public.sites
  FOR SELECT USING (is_published = TRUE);

-- Client overrides: readable by anyone, writable only via service role
ALTER TABLE public.client_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_overrides_public_read ON public.client_overrides;
CREATE POLICY client_overrides_public_read ON public.client_overrides
  FOR SELECT USING (TRUE);

-- Blog posts: published posts are public
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blog_posts_public_read ON public.blog_posts;
CREATE POLICY blog_posts_public_read ON public.blog_posts
  FOR SELECT USING (is_published = TRUE);
