CREATE TABLE IF NOT EXISTS hidden_chat_conversations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, other_user_id),
  CHECK (user_id <> other_user_id)
);

CREATE INDEX IF NOT EXISTS hidden_chat_conversations_user_hidden_idx
  ON hidden_chat_conversations(user_id, hidden_at DESC);

ALTER TABLE hidden_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hidden_chat_conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hidden_chat_conversations_owner_select ON hidden_chat_conversations;
CREATE POLICY hidden_chat_conversations_owner_select ON hidden_chat_conversations
  FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS hidden_chat_conversations_owner_insert ON hidden_chat_conversations;
CREATE POLICY hidden_chat_conversations_owner_insert ON hidden_chat_conversations
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS hidden_chat_conversations_owner_update ON hidden_chat_conversations;
CREATE POLICY hidden_chat_conversations_owner_update ON hidden_chat_conversations
  FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON hidden_chat_conversations TO kindred_app;
