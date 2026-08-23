ALTER TABLE billing_outbox
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_at timestamptz;

UPDATE billing_outbox
SET completed_at = COALESCE(sent_at, dispatched_at)
WHERE completed_at IS NULL
  AND COALESCE(sent_at, dispatched_at) IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_outbox_job_available_idx
  ON billing_outbox (available_at, created_at)
  WHERE completed_at IS NULL AND dead_at IS NULL;
