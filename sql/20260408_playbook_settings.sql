-- Playbook settings: stores per-user cold call targets that can't be derived from CRM data.
-- Currently only pickup_rate (taux décroché) since answered/unanswered calls are not tracked.

CREATE TABLE IF NOT EXISTS playbook_settings (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_rate integer     DEFAULT 40 CHECK (pickup_rate BETWEEN 1 AND 100),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE playbook_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own playbook settings"
  ON playbook_settings FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_playbook_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_playbook_settings_updated_at
  BEFORE UPDATE ON playbook_settings
  FOR EACH ROW EXECUTE FUNCTION update_playbook_settings_updated_at();
