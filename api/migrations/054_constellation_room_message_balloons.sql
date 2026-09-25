CREATE TABLE IF NOT EXISTS constellation_room_message_balloons (
  message_id uuid NOT NULL REFERENCES constellation_room_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balloon_active boolean NOT NULL DEFAULT true,
  inflation_count integer NOT NULL DEFAULT 0 CHECK (inflation_count BETWEEN 0 AND 20),
  reason_code text,
  private_note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS constellation_room_message_balloons_message_idx
  ON constellation_room_message_balloons(message_id, balloon_active, inflation_count DESC);

ALTER TABLE constellation_room_message_balloons ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_room_message_balloons FORCE ROW LEVEL SECURITY;
CREATE POLICY constellation_room_message_balloons_visible ON constellation_room_message_balloons
  FOR SELECT USING (true);
CREATE POLICY constellation_room_message_balloons_self_insert ON constellation_room_message_balloons
  FOR INSERT WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY constellation_room_message_balloons_self_update ON constellation_room_message_balloons
  FOR UPDATE USING (user_id = current_setting('app.user_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE ON constellation_room_message_balloons TO kindred_app;
