-- Add retry tracking to crm_workflow_scheduled_actions, mirroring the shape
-- already present on public.automation_jobs (attempts, last_error). The cron
-- route uses these to retry transient failures up to MAX_ATTEMPTS before
-- flipping status to 'failed' (terminal).
ALTER TABLE public.crm_workflow_scheduled_actions
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text NULL;

-- Drop the old status CHECK if any, then re-add allowing 'failed'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'crm_workflow_scheduled_actions'
      AND c.conname = 'crm_workflow_scheduled_actions_status_check'
  ) THEN
    ALTER TABLE public.crm_workflow_scheduled_actions
      DROP CONSTRAINT crm_workflow_scheduled_actions_status_check;
  END IF;
END $$;

ALTER TABLE public.crm_workflow_scheduled_actions
  ADD CONSTRAINT crm_workflow_scheduled_actions_status_check
  CHECK (status IN ('pending', 'executed', 'failed', 'cancelled'));
