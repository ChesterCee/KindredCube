DROP POLICY IF EXISTS constellation_room_participants_self ON constellation_room_participants;

CREATE POLICY constellation_room_participants_visible ON constellation_room_participants
  FOR SELECT USING (true);

CREATE POLICY constellation_room_participants_self_insert ON constellation_room_participants
  FOR INSERT WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

CREATE POLICY constellation_room_participants_self_update ON constellation_room_participants
  FOR UPDATE USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
