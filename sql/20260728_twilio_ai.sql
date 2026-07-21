-- Twilio call-center — recording, transcription & AI evaluation (Phase 5)

-- Tags on calls (Onoff "tags d'appel").
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- 1. call_transcripts -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    uuid UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  provider   text,          -- 'twilio' | 'manual' | 'deepgram' | …
  language   text DEFAULT 'fr',
  text       text NOT NULL DEFAULT '',
  segments   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. call_ai_evaluations ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_ai_evaluations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  summary     text,
  sentiment   text,          -- 'positif' | 'neutre' | 'negatif'
  score       integer,       -- 0..100 quality/outcome score
  objections  jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_action text,
  topics      jsonb NOT NULL DEFAULT '[]'::jsonb,
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS (writes are service-role; reads scoped in the API layer) ------------
ALTER TABLE public.call_transcripts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_ai_evaluations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read call_transcripts" ON public.call_transcripts
  FOR SELECT USING (public.is_admin());
CREATE POLICY "admin read call_ai_evaluations" ON public.call_ai_evaluations
  FOR SELECT USING (public.is_admin());
