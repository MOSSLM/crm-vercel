-- Form Builder: creates forms + form_submissions tables
CREATE TABLE public.forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE,
  description   TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  questions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  logic         JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand         JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  style         JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  enterprise_id INTEGER REFERENCES public.entreprises(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_forms_tags ON public.forms USING gin (tags);
CREATE INDEX idx_forms_enterprise_id ON public.forms (enterprise_id);
CREATE INDEX idx_forms_slug ON public.forms (slug);
CREATE TRIGGER trg_forms_updated_at
  BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.form_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  site_id       UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  enterprise_id INTEGER REFERENCES public.entreprises(id) ON DELETE SET NULL,
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact       JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent    TEXT,
  ip_hash       TEXT,
  source_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'received',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_form_submissions_form_id ON public.form_submissions (form_id);
CREATE INDEX idx_form_submissions_site_id ON public.form_submissions (site_id);

-- RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_forms" ON public.forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_forms" ON public.forms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_read_published_forms" ON public.forms FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "auth_read_submissions" ON public.form_submissions FOR SELECT TO authenticated USING (true);
