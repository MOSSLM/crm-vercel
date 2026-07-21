-- Twilio call-center — SMS/MMS messaging (Phase 4)

-- 1. sms_messages -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_sid    text,
  direction     text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_e164     text,
  to_e164       text,
  number_id     uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  agent_id      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  contact_id    text REFERENCES public.contacts(id) ON DELETE SET NULL,
  entreprise_id integer REFERENCES public.entreprises(id) ON DELETE SET NULL,
  body          text,
  media         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'queued',
  error_message text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_agent ON public.sms_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_sms_contact ON public.sms_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_counterpart ON public.sms_messages(from_e164, to_e164);
CREATE INDEX IF NOT EXISTS idx_sms_sent_at ON public.sms_messages(sent_at DESC);

-- 2. scheduled_sms — queue flushed by the telephony cron tick ----------------
CREATE TABLE IF NOT EXISTS public.scheduled_sms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_e164        text NOT NULL,
  body           text NOT NULL,
  from_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  agent_id       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  contact_id     text REFERENCES public.contacts(id) ON DELETE SET NULL,
  entreprise_id  integer REFERENCES public.entreprises(id) ON DELETE SET NULL,
  scheduled_for  timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  sms_sid        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sms_due
  ON public.scheduled_sms(scheduled_for) WHERE status = 'pending';

-- 3. RLS --------------------------------------------------------------------
ALTER TABLE public.sms_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_sms ENABLE ROW LEVEL SECURITY;

-- sms_messages: admins all, agents their own. Writes are service-role.
CREATE POLICY "admin read sms" ON public.sms_messages
  FOR SELECT USING (public.is_admin());
CREATE POLICY "agent read own sms" ON public.sms_messages
  FOR SELECT USING (public.is_freelance() AND agent_id = (SELECT auth.uid()));

-- scheduled_sms: admins all, agents their own (incl. cancel).
CREATE POLICY "admin manage scheduled_sms" ON public.scheduled_sms
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "agent read own scheduled_sms" ON public.scheduled_sms
  FOR SELECT USING (public.is_freelance() AND agent_id = (SELECT auth.uid()));
