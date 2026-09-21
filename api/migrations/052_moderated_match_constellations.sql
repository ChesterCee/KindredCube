ALTER TABLE constellations
  ADD COLUMN IF NOT EXISTS experience_type text NOT NULL DEFAULT 'community'
    CHECK (experience_type IN ('community', 'moderated_match')),
  ADD COLUMN IF NOT EXISTS moderator_type text NOT NULL DEFAULT 'human'
    CHECK (moderator_type IN ('ai', 'human')),
  ADD COLUMN IF NOT EXISTS featured_gender text NOT NULL DEFAULT 'Man'
    CHECK (featured_gender IN ('Man', 'Woman', 'Nonbinary')),
  ADD COLUMN IF NOT EXISTS audience_gender text NOT NULL DEFAULT 'Women'
    CHECK (audience_gender IN ('Men', 'Women', 'Everyone'));

CREATE TABLE IF NOT EXISTS constellation_match_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constellation_id uuid NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  featured_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  candidate_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  current_question text NOT NULL DEFAULT 'Tell us your name, and what brings you here?',
  question_count integer NOT NULL DEFAULT 1 CHECK (question_count BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'conversation' CHECK (status IN ('conversation', 'match_check', 'matched', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS constellation_match_one_active_session
  ON constellation_match_sessions(constellation_id)
  WHERE status IN ('conversation', 'match_check');

CREATE TABLE IF NOT EXISTS constellation_balloon_decisions (
  session_id uuid NOT NULL REFERENCES constellation_match_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balloon_active boolean NOT NULL DEFAULT true,
  reason_code text CHECK (reason_code IN ('children', 'distance', 'work_lifestyle', 'family_goals', 'values', 'attraction', 'communication', 'other')),
  private_note text NOT NULL DEFAULT '' CHECK (char_length(private_note) <= 500),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS constellation_match_votes (
  session_id uuid NOT NULL REFERENCES constellation_match_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('yes', 'not_yet', 'no')),
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

ALTER TABLE constellation_match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_match_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE constellation_balloon_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_balloon_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE constellation_match_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_match_votes FORCE ROW LEVEL SECURITY;

CREATE POLICY constellation_match_sessions_visible ON constellation_match_sessions FOR SELECT USING (true);
CREATE POLICY constellation_match_sessions_insert ON constellation_match_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY constellation_match_sessions_update ON constellation_match_sessions FOR UPDATE USING (true);
CREATE POLICY constellation_balloon_private ON constellation_balloon_decisions FOR SELECT
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM constellation_match_sessions session
      JOIN constellations constellation ON constellation.id = session.constellation_id
      WHERE session.id = session_id AND constellation.creator_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );
CREATE POLICY constellation_balloon_self_insert ON constellation_balloon_decisions FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY constellation_balloon_self_update ON constellation_balloon_decisions FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY constellation_match_votes_private ON constellation_match_votes FOR SELECT
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM constellation_match_sessions session
      WHERE session.id = session_id
        AND nullif(current_setting('app.user_id', true), '')::uuid IN (session.featured_user_id, session.candidate_user_id)
    )
  );
CREATE POLICY constellation_match_votes_self_insert ON constellation_match_votes FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY constellation_match_votes_self_update ON constellation_match_votes FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON constellation_match_sessions, constellation_balloon_decisions, constellation_match_votes TO kindred_app;
