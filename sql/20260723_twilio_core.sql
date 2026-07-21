-- Twilio call-center — core schema (Phase 0)
--
-- Introduces the telephony backbone the softphone, number admin, and inbound
-- routing build on:
--   * phone_numbers        — provisioned Twilio numbers, optionally assigned to an agent
--   * agent_phone_settings — per-agent On/Off mode, default number, forwarding, schedule
--   * calls                — one row per call (in/out), linked to CRM entities
--   * call_events          — raw Twilio status-callback journal (idempotency / audit)
--
-- FK type conventions in this DB (verified against existing tables):
--   contacts.id = text · entreprises.id = integer · opportunites.id = uuid ·
--   user_profiles.id = uuid.
--
-- RLS: most writes happen server-side via the service-role client (webhooks +
-- call logging) which bypasses RLS. Policies below therefore mainly gate client
-- reads: admins see everything, a freelance agent sees only their own rows.
-- Reuses the existing role helpers public.is_admin() / public.is_freelance().

-- 1. phone_numbers ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  e164              text NOT NULL UNIQUE,
  friendly_name     text,
  country           text NOT NULL DEFAULT 'FR',
  number_type       text NOT NULL DEFAULT 'local'
                      CHECK (number_type IN ('local', 'mobile', 'tollfree')),
  capabilities      jsonb NOT NULL DEFAULT '{"voice": true, "sms": true, "mms": false}'::jsonb,
  provider          text NOT NULL DEFAULT 'twilio',
  twilio_sid        text,
  assigned_agent_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'released', 'porting')),
  monthly_cost      numeric(10,2),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_agent ON public.phone_numbers(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON public.phone_numbers(status);

-- 2. agent_phone_settings ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_phone_settings (
  user_id                uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  mode                   text NOT NULL DEFAULT 'on' CHECK (mode IN ('on', 'off')),
  default_number_id      uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  forward_to_e164        text,
  voicemail_greeting_url text,
  voicemail_greeting_tts text,
  -- schedule: On/Off windows + scheduled SMS windows, evaluated by pg_cron.
  schedule               jsonb NOT NULL DEFAULT '{}'::jsonb,
  whisper_opt_in         boolean NOT NULL DEFAULT false,
  recording_enabled      boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 3. calls ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_call_sid  text UNIQUE,
  direction        text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_e164        text,
  to_e164          text,
  number_id        uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  agent_id         uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  contact_id       text REFERENCES public.contacts(id) ON DELETE SET NULL,
  entreprise_id    integer REFERENCES public.entreprises(id) ON DELETE SET NULL,
  opportunite_id   uuid REFERENCES public.opportunites(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'initiated',
  started_at       timestamptz NOT NULL DEFAULT now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  recording_url    text,
  recording_sid    text,
  voicemail_url    text,
  disposition      text,   -- outcome tag: positif / negatif / repondeur / ...
  cost             numeric(10,4),
  notes            text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_agent ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON public.calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_entreprise ON public.calls(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_calls_opportunite ON public.calls(opportunite_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON public.calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_sid ON public.calls(twilio_call_sid);

-- 4. call_events ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  call_sid   text,
  event      text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_events_call ON public.call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_sid ON public.call_events(call_sid);

-- 5. RLS --------------------------------------------------------------------
ALTER TABLE public.phone_numbers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_phone_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events          ENABLE ROW LEVEL SECURITY;

-- phone_numbers: admins manage; agents read the numbers assigned to them.
CREATE POLICY "admin manage phone_numbers" ON public.phone_numbers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "agent read assigned phone_numbers" ON public.phone_numbers
  FOR SELECT USING (
    public.is_freelance() AND assigned_agent_id = (SELECT auth.uid())
  );

-- agent_phone_settings: each user manages their own row; admins manage all.
CREATE POLICY "admin manage agent_phone_settings" ON public.agent_phone_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "user manage own agent_phone_settings" ON public.agent_phone_settings
  FOR ALL USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- calls: admins read all, agents read their own. Writes are service-role.
CREATE POLICY "admin read calls" ON public.calls
  FOR SELECT USING (public.is_admin());
CREATE POLICY "agent read own calls" ON public.calls
  FOR SELECT USING (
    public.is_freelance() AND agent_id = (SELECT auth.uid())
  );

-- call_events: admins read; writes are service-role.
CREATE POLICY "admin read call_events" ON public.call_events
  FOR SELECT USING (public.is_admin());
