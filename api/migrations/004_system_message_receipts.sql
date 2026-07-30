CREATE TABLE IF NOT EXISTS system_message_receipts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_key text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  PRIMARY KEY (user_id, message_key)
);

-- Preserve receipts written by older app builds before this state had its own table.
INSERT INTO system_message_receipts (user_id, message_key, delivered_at, read_at)
SELECT
  user_id,
  'amara-welcome-v1',
  COALESCE(
    NULLIF(settings_data ->> 'amaraWelcomeDeliveredAt', '')::timestamptz,
    NULLIF(settings_data ->> 'amaraWelcomeReadAt', '')::timestamptz,
    created_at
  ),
  NULLIF(settings_data ->> 'amaraWelcomeReadAt', '')::timestamptz
FROM user_private_spaces
WHERE settings_data ? 'amaraWelcomeDeliveredAt'
   OR settings_data ? 'amaraWelcomeReadAt'
ON CONFLICT (user_id, message_key) DO NOTHING;

ALTER TABLE system_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_message_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_message_receipt_owner_only ON system_message_receipts;
CREATE POLICY system_message_receipt_owner_only ON system_message_receipts
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON system_message_receipts TO kindred_app;
