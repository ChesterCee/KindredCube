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
