CREATE TABLE IF NOT EXISTS post_meet_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_started_at timestamptz NOT NULL,
  meeting_ended_at timestamptz NOT NULL,
  venue text NOT NULL CHECK (char_length(venue) BETWEEN 1 AND 500),
  venue_latitude numeric(9,6),
  venue_longitude numeric(9,6),
  plans_respected text,
  profile_matched text,
  boundaries_respected text,
  felt_unsafe text,
  would_meet_again text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id <> other_user_id),
  CHECK (meeting_ended_at > meeting_started_at),
  UNIQUE (user_id, other_user_id, meeting_started_at)
);

CREATE INDEX IF NOT EXISTS post_meet_checks_user_created_idx
  ON post_meet_checks(user_id, created_at DESC);

ALTER TABLE post_meet_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_meet_checks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_meet_checks_owner_only ON post_meet_checks;
CREATE POLICY post_meet_checks_owner_only ON post_meet_checks
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON post_meet_checks TO kindred_app;
