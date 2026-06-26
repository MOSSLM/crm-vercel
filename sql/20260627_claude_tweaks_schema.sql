-- Claude Design Builder — Tweaks schema per template.
--
-- Stores the controls extracted from a template's *-tweaks.jsx (preset color
-- palettes + selects + per-page radios) so the CRM Tweaks panel reproduces the
-- template's EXACT controls instead of a generic color picker.
--
-- Shape: { theme: TweakControl[], pageExtras: { "<slug>": TweakControl[] } }
-- (see src/lib/site-builder/claude-design/parse-tweaks-schema.ts).
--
-- Additive + idempotent.

begin;

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS tweaks_schema JSONB NOT NULL DEFAULT '{}'::jsonb;

commit;
