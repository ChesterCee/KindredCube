ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_content_kind_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_content_kind_check
  CHECK (content_kind IN ('text', 'gif', 'image', 'audio', 'video', 'meeting_proposal', 'meeting_response'));
