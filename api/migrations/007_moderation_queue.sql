ALTER TABLE user_blocks
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed'));

CREATE INDEX IF NOT EXISTS user_blocks_target_idx
  ON user_blocks(blocked_profile_id, created_at DESC);

ALTER TABLE safety_reports
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderator_notes text NOT NULL DEFAULT '' CHECK (char_length(moderator_notes) <= 2000),
  ADD COLUMN IF NOT EXISTS action_taken text;

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email citext NOT NULL,
  public_username text NOT NULL DEFAULT '',
  details text NOT NULL CHECK (char_length(details) BETWEEN 20 AND 2000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'accepted', 'rejected')),
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  moderator_notes text NOT NULL DEFAULT '' CHECK (char_length(moderator_notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS moderation_appeals_status_idx
  ON moderation_appeals(status, created_at);
CREATE INDEX IF NOT EXISTS moderation_appeals_user_idx
  ON moderation_appeals(user_id, created_at DESC);

DROP POLICY IF EXISTS safety_reports_admin_review ON safety_reports;
CREATE POLICY safety_reports_admin_review ON safety_reports
  USING (current_setting('app.admin', true) = 'true')
  WITH CHECK (current_setting('app.admin', true) = 'true');

DROP POLICY IF EXISTS user_blocks_admin_review ON user_blocks;
CREATE POLICY user_blocks_admin_review ON user_blocks
  USING (current_setting('app.admin', true) = 'true')
  WITH CHECK (current_setting('app.admin', true) = 'true');

ALTER TABLE moderation_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_appeals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS moderation_appeals_admin_review ON moderation_appeals;
CREATE POLICY moderation_appeals_admin_review ON moderation_appeals
  USING (current_setting('app.admin', true) = 'true')
  WITH CHECK (current_setting('app.admin', true) = 'true');

GRANT SELECT, UPDATE ON safety_reports TO kindred_app;
GRANT SELECT, UPDATE ON user_blocks TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON moderation_appeals TO kindred_app;
