ALTER TABLE constellation_room_messages
  ADD COLUMN IF NOT EXISTS image_mime_type text CHECK (image_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN IF NOT EXISTS image_data bytea;
