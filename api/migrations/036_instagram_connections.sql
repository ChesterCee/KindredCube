CREATE TABLE IF NOT EXISTS instagram_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_oauth_states_user_idx
  ON instagram_oauth_states(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS instagram_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  instagram_user_id text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE instagram_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_oauth_states FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instagram_oauth_states_owner ON instagram_oauth_states;
CREATE POLICY instagram_oauth_states_owner ON instagram_oauth_states
  FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS instagram_oauth_states_callback_lookup ON instagram_oauth_states;
CREATE POLICY instagram_oauth_states_callback_lookup ON instagram_oauth_states
  FOR SELECT
  USING (expires_at > now());

ALTER TABLE instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instagram_connections_owner ON instagram_connections;
CREATE POLICY instagram_connections_owner ON instagram_connections
  FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON instagram_oauth_states TO kindred_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON instagram_connections TO kindred_app;
