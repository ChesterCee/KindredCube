ALTER TABLE constellation_members DROP CONSTRAINT IF EXISTS constellation_members_status_check;
ALTER TABLE constellation_members
  ADD CONSTRAINT constellation_members_status_check
  CHECK (status IN ('suggested', 'pending', 'accepted', 'declined'));

DROP POLICY IF EXISTS constellation_members_self_insert ON constellation_members;
CREATE POLICY constellation_members_self_or_creator_insert ON constellation_members FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.user_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM constellations constellation
       WHERE constellation.id = constellation_id
         AND constellation.creator_id = current_setting('app.user_id', true)::uuid
    )
  );

UPDATE constellations SET experience_type = 'moderated_match' WHERE experience_type = 'community';
