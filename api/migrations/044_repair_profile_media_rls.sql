-- Repair profile media policies on deployed databases so authenticated users can
-- upload their own photos/media while public profile reads still only expose
-- active media through signed app requests.

ALTER TABLE profile_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_media FORCE ROW LEVEL SECURITY;

ALTER TABLE profile_media
  DROP CONSTRAINT IF EXISTS profile_media_media_type_check;

ALTER TABLE profile_media
  ADD CONSTRAINT profile_media_media_type_check
  CHECK (media_type IN ('profile_photo', 'chat_media'));

ALTER TABLE profile_media
  DROP CONSTRAINT IF EXISTS profile_media_mime_type_check;

ALTER TABLE profile_media
  ADD CONSTRAINT profile_media_mime_type_check
  CHECK (
    mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'audio/mp4',
      'audio/mpeg',
      'audio/aac',
      'audio/x-m4a',
      'audio/wav',
      'audio/webm'
    )
  );

ALTER TABLE profile_media
  DROP CONSTRAINT IF EXISTS profile_media_size_bytes_check;

ALTER TABLE profile_media
  ADD CONSTRAINT profile_media_size_bytes_check
  CHECK (size_bytes > 0 AND size_bytes <= 52428800);

DROP POLICY IF EXISTS profile_media_insert_owner ON profile_media;
CREATE POLICY profile_media_insert_owner ON profile_media
  FOR INSERT
  WITH CHECK (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS profile_media_authenticated_read ON profile_media;
CREATE POLICY profile_media_authenticated_read ON profile_media
  FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS profile_media_update_owner ON profile_media;
CREATE POLICY profile_media_update_owner ON profile_media
  FOR UPDATE
  USING (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON profile_media TO kindred_app;
