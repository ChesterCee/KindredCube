ALTER TABLE post_meet_checks
  ADD COLUMN IF NOT EXISTS met boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS missed_reason text;

