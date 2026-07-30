ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending_email_verification', 'active', 'suspended', 'banned', 'deleted'));

CREATE TABLE IF NOT EXISTS platform_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email_hash char(64),
  username_hash char(64),
  photo_fingerprints jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL DEFAULT 'permanent_platform_ban',
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS platform_bans_email_hash_idx
  ON platform_bans(email_hash)
  WHERE active = true AND email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_bans_username_hash_idx
  ON platform_bans(username_hash)
  WHERE active = true AND username_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_bans_photo_fingerprints_idx
  ON platform_bans USING gin(photo_fingerprints)
  WHERE active = true;

ALTER TABLE platform_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_bans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_bans_admin_only ON platform_bans;
CREATE POLICY platform_bans_admin_only ON platform_bans
  USING (current_setting('app.admin', true) = 'true')
  WITH CHECK (current_setting('app.admin', true) = 'true');

DROP POLICY IF EXISTS platform_bans_active_lookup ON platform_bans;
CREATE POLICY platform_bans_active_lookup ON platform_bans
  FOR SELECT
  USING (active = true);

GRANT SELECT, INSERT, UPDATE ON platform_bans TO kindred_app;
