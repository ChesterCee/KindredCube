CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_profile_id text NOT NULL CHECK (char_length(blocked_profile_id) BETWEEN 3 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_profile_id)
);

CREATE TABLE IF NOT EXISTS safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reported_profile_id text NOT NULL CHECK (char_length(reported_profile_id) BETWEEN 3 AND 128),
  reason_code text NOT NULL CHECK (reason_code IN (
    'fake_profile',
    'harassment',
    'scam_or_money_request',
    'hate_or_discrimination',
    'inappropriate_content',
    'safety_concern',
    'other'
  )),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'actioned', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_reports_queue_idx ON safety_reports(status, created_at);
CREATE INDEX IF NOT EXISTS safety_reports_target_idx ON safety_reports(reported_profile_id, created_at DESC);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_blocks_owner_only ON user_blocks;
CREATE POLICY user_blocks_owner_only ON user_blocks
  USING (blocker_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (blocker_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safety_reports_submitter_insert ON safety_reports;
CREATE POLICY safety_reports_submitter_insert ON safety_reports
  FOR INSERT
  WITH CHECK (reporter_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, DELETE ON user_blocks TO kindred_app;
GRANT INSERT ON safety_reports TO kindred_app;
