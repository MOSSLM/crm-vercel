-- Twilio call-center — inbound routing, voicemail & IVR (Phase 3)

-- 1. voicemails -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voicemails (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id          uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  call_sid         text,
  number_id        uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  agent_id         uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  from_e164        text,
  recording_url    text,
  recording_sid    text,
  duration_seconds integer,
  transcription    text,
  listened         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voicemails_agent ON public.voicemails(agent_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_created ON public.voicemails(created_at DESC);

-- 2. ivr_flows — per-number call-flow config (greeting, ring strategy, menu) -
CREATE TABLE IF NOT EXISTS public.ivr_flows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_id  uuid NOT NULL UNIQUE REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT false,
  -- config shape (interpreted by /api/twilio/incoming):
  --   { greeting, ringStrategy: 'agent'|'all'|'forward', ringTimeout,
  --     menu: [{ digit, action: 'agent'|'voicemail'|'forward', target }] }
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS --------------------------------------------------------------------
ALTER TABLE public.voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivr_flows  ENABLE ROW LEVEL SECURITY;

-- voicemails: admins all, agents their own. Writes are service-role (webhook).
CREATE POLICY "admin read voicemails" ON public.voicemails
  FOR SELECT USING (public.is_admin());
CREATE POLICY "agent read own voicemails" ON public.voicemails
  FOR SELECT USING (public.is_freelance() AND agent_id = (SELECT auth.uid()));
-- agents may mark their own voicemail as listened.
CREATE POLICY "agent update own voicemails" ON public.voicemails
  FOR UPDATE USING (public.is_freelance() AND agent_id = (SELECT auth.uid()))
  WITH CHECK (public.is_freelance() AND agent_id = (SELECT auth.uid()));

-- ivr_flows: admins manage; staff may read.
CREATE POLICY "admin manage ivr_flows" ON public.ivr_flows
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "staff read ivr_flows" ON public.ivr_flows
  FOR SELECT USING (public.is_staff());
