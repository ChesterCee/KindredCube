CREATE TABLE IF NOT EXISTS user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'unknown' CHECK (platform IN ('ios', 'android', 'web', 'unknown')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx
  ON user_push_tokens(user_id, enabled, last_seen_at DESC);

ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_push_tokens_owner_only ON user_push_tokens;
DROP POLICY IF EXISTS user_push_tokens_owner_insert ON user_push_tokens;
DROP POLICY IF EXISTS user_push_tokens_owner_update ON user_push_tokens;
DROP POLICY IF EXISTS user_push_tokens_owner_or_chat_delivery_select ON user_push_tokens;

CREATE POLICY user_push_tokens_owner_or_chat_delivery_select ON user_push_tokens
  FOR SELECT
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
        FROM chat_messages m
       WHERE m.sender_id = nullif(current_setting('app.user_id', true), '')::uuid
         AND m.recipient_id = user_push_tokens.user_id
    )
  );

CREATE POLICY user_push_tokens_owner_insert ON user_push_tokens
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY user_push_tokens_owner_update ON user_push_tokens
  FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON user_push_tokens TO kindred_app;
