ALTER TABLE identity_verification_sessions
  DROP CONSTRAINT IF EXISTS identity_verification_sessions_provider_check;

ALTER TABLE identity_verification_sessions
  ADD CONSTRAINT identity_verification_sessions_provider_check
  CHECK (provider IN ('stripe', 'kindredcube'));

ALTER TABLE identity_verification_sessions
  DROP CONSTRAINT IF EXISTS identity_verification_sessions_verification_type_check;

ALTER TABLE identity_verification_sessions
  ADD CONSTRAINT identity_verification_sessions_verification_type_check
  CHECK (verification_type IN ('document_and_selfie', 'video_selfie'));

CREATE TABLE IF NOT EXISTS video_selfie_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime_type text NOT NULL CHECK (mime_type IN ('video/mp4', 'video/quicktime', 'video/mov')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  consent_version text NOT NULL DEFAULT 'video-selfie-verification-v1',
  consented_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'redacted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_selfie_verifications_user_created_idx
  ON video_selfie_verifications(user_id, created_at DESC);

ALTER TABLE video_selfie_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_selfie_verifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_selfie_verifications_owner_only ON video_selfie_verifications;
CREATE POLICY video_selfie_verifications_owner_only ON video_selfie_verifications
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON video_selfie_verifications TO kindred_app;
