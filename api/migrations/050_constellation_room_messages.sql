CREATE TABLE IF NOT EXISTS constellation_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_key text NOT NULL CHECK (char_length(room_key) BETWEEN 2 AND 80),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_text text NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS constellation_room_messages_room_idx
  ON constellation_room_messages(room_key, created_at DESC);

ALTER TABLE constellation_room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_room_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY constellation_room_messages_visible ON constellation_room_messages FOR SELECT USING (true);
CREATE POLICY constellation_room_messages_self_insert ON constellation_room_messages FOR INSERT
  WITH CHECK (sender_id = current_setting('app.user_id', true)::uuid);
GRANT SELECT, INSERT ON constellation_room_messages TO kindred_app;
