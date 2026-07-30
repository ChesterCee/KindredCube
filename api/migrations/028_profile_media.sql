CREATE TABLE IF NOT EXISTS profile_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'profile_photo' CHECK (media_type = 'profile_photo'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  data bytea NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_media_user_created_idx
  ON profile_media(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_media_sha256_idx
  ON profile_media(sha256);

ALTER TABLE profile_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_media FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_media_insert_owner ON profile_media;
CREATE POLICY profile_media_insert_owner ON profile_media
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS profile_media_authenticated_read ON profile_media;
CREATE POLICY profile_media_authenticated_read ON profile_media
  FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS profile_media_update_owner ON profile_media;
CREATE POLICY profile_media_update_owner ON profile_media
  FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON profile_media TO kindred_app;
