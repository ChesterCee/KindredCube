ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsent_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_for_sender_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_for_recipient_at timestamptz;
