ALTER TABLE constellation_balloon_decisions
  ADD COLUMN IF NOT EXISTS inflation_count integer NOT NULL DEFAULT 0
    CHECK (inflation_count BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS popped_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS constellation_balloon_member_visibility ON constellation_balloon_decisions;
CREATE POLICY constellation_balloon_member_visibility ON constellation_balloon_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM constellation_match_sessions session
        JOIN constellations constellation ON constellation.id = session.constellation_id
       WHERE session.id = session_id
         AND (
           constellation.creator_id = nullif(current_setting('app.user_id', true), '')::uuid
           OR EXISTS (
             SELECT 1 FROM constellation_members member
              WHERE member.constellation_id = constellation.id
                AND member.user_id = nullif(current_setting('app.user_id', true), '')::uuid
                AND member.status = 'accepted'
           )
         )
    )
  );

DROP POLICY IF EXISTS constellation_balloon_featured_insert ON constellation_balloon_decisions;
CREATE POLICY constellation_balloon_featured_insert ON constellation_balloon_decisions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM constellation_match_sessions session
       WHERE session.id = session_id
         AND session.featured_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS constellation_balloon_featured_update ON constellation_balloon_decisions;
CREATE POLICY constellation_balloon_featured_update ON constellation_balloon_decisions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM constellation_match_sessions session
       WHERE session.id = session_id
         AND session.featured_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM constellation_match_sessions session
       WHERE session.id = session_id
         AND session.featured_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );
