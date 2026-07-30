CREATE TABLE IF NOT EXISTS biometric_face_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_video_selfie_id uuid REFERENCES video_selfie_verifications(id) ON DELETE SET NULL,
  provider text NOT NULL,
  template_version text NOT NULL,
  template_ciphertext text NOT NULL,
  template_iv text NOT NULL,
  template_auth_tag text NOT NULL,
  duplicate_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS biometric_face_templates_user_idx
  ON biometric_face_templates(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS biometric_face_templates_duplicate_idx
  ON biometric_face_templates(duplicate_fingerprint)
  WHERE status = 'active';

ALTER TABLE biometric_face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_face_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS biometric_face_templates_owner_read ON biometric_face_templates;
CREATE POLICY biometric_face_templates_owner_read ON biometric_face_templates
  FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS biometric_face_templates_owner_insert ON biometric_face_templates;
CREATE POLICY biometric_face_templates_owner_insert ON biometric_face_templates
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS biometric_face_templates_owner_update ON biometric_face_templates;
CREATE POLICY biometric_face_templates_owner_update ON biometric_face_templates
  FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON biometric_face_templates TO kindred_app;

ALTER TABLE video_selfie_verifications
  ALTER COLUMN ciphertext DROP NOT NULL,
  ALTER COLUMN iv DROP NOT NULL,
  ALTER COLUMN auth_tag DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS raw_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS face_template_id uuid REFERENCES biometric_face_templates(id) ON DELETE SET NULL;
