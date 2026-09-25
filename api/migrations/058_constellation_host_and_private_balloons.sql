ALTER TABLE constellation_room_messages
  ADD COLUMN IF NOT EXISTS is_host_message boolean NOT NULL DEFAULT false;

ALTER TABLE constellation_room_messages
  DROP CONSTRAINT IF EXISTS constellation_room_messages_message_text_check;

ALTER TABLE constellation_room_messages
  ADD CONSTRAINT constellation_room_messages_content_check
  CHECK (char_length(message_text) <= 1000 AND (char_length(message_text) > 0 OR image_data IS NOT NULL));

ALTER TABLE constellation_room_message_balloons
  DROP CONSTRAINT IF EXISTS constellation_room_message_balloons_inflation_count_check;

ALTER TABLE constellation_room_message_balloons
  ADD CONSTRAINT constellation_room_message_balloons_inflation_count_check
  CHECK (inflation_count BETWEEN 0 AND 3);

ALTER TABLE constellation_room_message_balloons
  ADD COLUMN IF NOT EXISTS author_decision text
  CHECK (author_decision IN ('accepted', 'popped'));

CREATE TABLE IF NOT EXISTS constellation_room_participants (
  room_key text NOT NULL CHECK (char_length(room_key) BETWEEN 2 AND 80),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_key, user_id)
);

ALTER TABLE constellation_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_room_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS constellation_room_participants_self ON constellation_room_participants;
CREATE POLICY constellation_room_participants_self ON constellation_room_participants
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE ON constellation_room_participants TO kindred_app;
