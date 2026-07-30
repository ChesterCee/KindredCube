CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  public_username citext NOT NULL UNIQUE,
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 2 AND 80),
  last_name text NOT NULL CHECK (char_length(last_name) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'pending_email_verification'
    CHECK (status IN ('pending_email_verification', 'active', 'suspended', 'deleted')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  hash_algorithm text NOT NULL DEFAULT 'argon2id',
  hash_version integer NOT NULL DEFAULT 1,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_user_idx
  ON email_verification_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_login_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_login_tickets_user_idx
  ON email_login_tickets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name text,
  user_agent_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_session_idx
  ON session_refresh_tokens(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  session_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_audit_user_idx ON auth_audit_events(user_id, created_at DESC);

-- Private application data is protected twice: by API authorization and PostgreSQL RLS.
-- The API sets app.user_id locally inside each user-scoped transaction.
CREATE TABLE IF NOT EXISTS user_private_spaces (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_private_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private_spaces FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS private_space_owner_only ON user_private_spaces;
CREATE POLICY private_space_owner_only ON user_private_spaces
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- The runtime API role is intentionally non-superuser and receives only the
-- operations needed by the authentication service. Migrations use a separate role.
GRANT SELECT, INSERT, UPDATE ON users TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON password_credentials TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON email_verification_tokens TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON email_login_tickets TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON password_reset_tokens TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON auth_sessions TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON session_refresh_tokens TO kindred_app;
GRANT SELECT, INSERT ON auth_audit_events TO kindred_app;
GRANT USAGE, SELECT ON SEQUENCE auth_audit_events_id_seq TO kindred_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_private_spaces TO kindred_app;
