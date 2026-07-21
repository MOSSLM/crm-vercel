-- Twilio call-center — number portability requests (Phase 2)
--
-- Tracks requests to port an existing number into Twilio. FR fixed/geographic
-- numbers are portable today; FR mobile (+33 6/7) port-ins are currently paused
-- by Twilio, so those are parked with status 'blocked_mobile' until it reopens.
-- Admin-only workflow.

CREATE TABLE IF NOT EXISTS public.number_porting_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  e164            text NOT NULL,
  number_type     text NOT NULL DEFAULT 'local'
                    CHECK (number_type IN ('local', 'mobile', 'tollfree')),
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                      'draft',            -- being prepared
                      'submitted',        -- sent to Twilio
                      'pending_carrier',  -- awaiting losing carrier
                      'blocked_mobile',   -- FR mobile port-in paused by Twilio
                      'completed',        -- number now on Twilio
                      'rejected'          -- refused / cancelled
                    )),
  current_carrier text,
  account_holder  text,
  -- Uploaded proof references (RIO/mandate, ID, proof of address, invoice…).
  docs            jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes           text,
  requested_by    uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_porting_status ON public.number_porting_requests(status);
CREATE INDEX IF NOT EXISTS idx_porting_e164 ON public.number_porting_requests(e164);

ALTER TABLE public.number_porting_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage porting" ON public.number_porting_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
