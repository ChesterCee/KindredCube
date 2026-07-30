ALTER TABLE post_meet_checks
  ADD COLUMN IF NOT EXISTS showed_up text,
  ADD COLUMN IF NOT EXISTS felt_safe text,
  ADD COLUMN IF NOT EXISTS respectful text,
  ADD COLUMN IF NOT EXISTS trust_score numeric(4,2),
  ADD COLUMN IF NOT EXISTS counted_for_trust_at timestamptz,
  ADD COLUMN IF NOT EXISTS safety_concern boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS answers_private jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS user_trust_scores (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rolling_score numeric(4,2) NOT NULL DEFAULT 0,
  counted_meetups integer NOT NULL DEFAULT 0,
  excellent_meetups integer NOT NULL DEFAULT 0,
  poor_meetups integer NOT NULL DEFAULT 0,
  severe_safety_signals integer NOT NULL DEFAULT 0,
  meetup_verified boolean NOT NULL DEFAULT false,
  needs_guidelines_review boolean NOT NULL DEFAULT false,
  ready_to_meet_disabled_until timestamptz,
  last_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_trust_scores_visibility_idx
  ON user_trust_scores(meetup_verified, rolling_score DESC, ready_to_meet_disabled_until);

ALTER TABLE user_trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trust_scores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_trust_scores_app_read ON user_trust_scores;
CREATE POLICY user_trust_scores_app_read ON user_trust_scores
  FOR SELECT USING (true);

DROP POLICY IF EXISTS user_trust_scores_app_write ON user_trust_scores;
CREATE POLICY user_trust_scores_app_write ON user_trust_scores
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS post_meet_checks_participant_read ON post_meet_checks;
CREATE POLICY post_meet_checks_participant_read ON post_meet_checks
  FOR SELECT USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR other_user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON user_trust_scores TO kindred_app;
