CREATE TABLE IF NOT EXISTS identity_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  provider_session_id text NOT NULL UNIQUE,
  verification_type text NOT NULL DEFAULT 'document_and_selfie'
    CHECK (verification_type = 'document_and_selfie'),
  status text NOT NULL CHECK (status IN ('requires_input', 'processing', 'verified', 'canceled', 'redacted')),
  last_error_code text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_verification_user_idx
  ON identity_verification_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stripe_identity_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE identity_verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_verification_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identity_verification_owner_only ON identity_verification_sessions;
CREATE POLICY identity_verification_owner_only ON identity_verification_sessions
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON identity_verification_sessions TO kindred_app;
GRANT SELECT, INSERT ON stripe_identity_webhook_events TO kindred_app;
