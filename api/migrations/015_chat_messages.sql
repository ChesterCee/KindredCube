CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_kind text NOT NULL CHECK (content_kind IN ('text', 'gif', 'image', 'audio')),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS chat_messages_pair_created_idx
  ON chat_messages(
    LEAST(sender_id, recipient_id),
    GREATEST(sender_id, recipient_id),
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS chat_messages_recipient_created_idx
  ON chat_messages(recipient_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_participant_read ON chat_messages;
CREATE POLICY chat_messages_participant_read ON chat_messages
  FOR SELECT
  USING (
    sender_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR recipient_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS chat_messages_sender_insert ON chat_messages;
CREATE POLICY chat_messages_sender_insert ON chat_messages
  FOR INSERT
  WITH CHECK (sender_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS chat_messages_participant_update ON chat_messages;
CREATE POLICY chat_messages_participant_update ON chat_messages
  FOR UPDATE
  USING (
    sender_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR recipient_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    sender_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR recipient_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON chat_messages TO kindred_app;
