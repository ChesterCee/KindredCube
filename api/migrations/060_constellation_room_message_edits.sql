ALTER TABLE constellation_room_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

DROP POLICY IF EXISTS constellation_room_messages_self_update ON constellation_room_messages;
CREATE POLICY constellation_room_messages_self_update ON constellation_room_messages FOR UPDATE
  USING (sender_id = current_setting('app.user_id', true)::uuid AND NOT is_host_message)
  WITH CHECK (sender_id = current_setting('app.user_id', true)::uuid AND NOT is_host_message);

DROP POLICY IF EXISTS constellation_room_messages_self_delete ON constellation_room_messages;
CREATE POLICY constellation_room_messages_self_delete ON constellation_room_messages FOR DELETE
  USING (sender_id = current_setting('app.user_id', true)::uuid AND NOT is_host_message);

GRANT UPDATE (message_text, edited_at), DELETE ON constellation_room_messages TO kindred_app;
