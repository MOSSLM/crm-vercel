-- Section Projects: a named, multi-page design unit authored in the section
-- builder. Each page is composed of ordered library sections (theme_sections).
-- A project can be instantiated into a real multi-page site while its sections
-- remain individually reusable in the library.

CREATE TABLE IF NOT EXISTS section_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  style_guide JSONB,                 -- extracted from the imported design (optional)
  source_meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_slug, slug)
);

CREATE INDEX IF NOT EXISTS idx_section_projects_slug ON section_projects(theme_slug);

CREATE TABLE IF NOT EXISTS section_project_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES section_projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                -- page path, e.g. "/", "/about"
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  sections JSONB NOT NULL DEFAULT '[]',  -- ordered [{ section_id, service_tag? }]
  seo JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_section_project_pages_project
  ON section_project_pages(project_id, sort_order);

-- Provenance link: sections created from a project import. They remain
-- independent/reusable; this only lets the section tree group them under a
-- project (and lets us clean up on project delete via SET NULL).
ALTER TABLE public.theme_sections
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES section_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_theme_sections_project ON theme_sections(project_id);

-- updated_at triggers (reuse the generic function created with theme_sections)
DROP TRIGGER IF EXISTS section_projects_updated_at ON section_projects;
CREATE TRIGGER section_projects_updated_at
  BEFORE UPDATE ON section_projects
  FOR EACH ROW EXECUTE FUNCTION update_theme_sections_updated_at();

DROP TRIGGER IF EXISTS section_project_pages_updated_at ON section_project_pages;
CREATE TRIGGER section_project_pages_updated_at
  BEFORE UPDATE ON section_project_pages
  FOR EACH ROW EXECUTE FUNCTION update_theme_sections_updated_at();

-- RLS — service-role full access, matching theme_sections.
ALTER TABLE section_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON section_projects;
CREATE POLICY "Service role full access" ON section_projects FOR ALL USING (true);

ALTER TABLE section_project_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON section_project_pages;
CREATE POLICY "Service role full access" ON section_project_pages FOR ALL USING (true);
