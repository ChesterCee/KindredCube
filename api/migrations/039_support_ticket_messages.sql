ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS email_reply_token text;

UPDATE support_tickets
   SET email_reply_token = encode(gen_random_bytes(16), 'hex')
 WHERE email_reply_token IS NULL;

ALTER TABLE support_tickets
  ALTER COLUMN email_reply_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_email_reply_token_idx
  ON support_tickets (email_reply_token);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_email text,
  body text NOT NULL,
  source text NOT NULL DEFAULT 'app',
  external_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_messages_sender_type_check CHECK (sender_type IN ('user', 'admin', 'email')),
  CONSTRAINT support_ticket_messages_source_check CHECK (source IN ('app', 'admin', 'email'))
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_created_idx
  ON support_ticket_messages (ticket_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_messages_external_message_id_idx
  ON support_ticket_messages (external_message_id)
  WHERE external_message_id IS NOT NULL;

ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_messages_owner_select ON support_ticket_messages;
CREATE POLICY support_ticket_messages_owner_select ON support_ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM support_tickets st
       WHERE st.id = support_ticket_messages.ticket_id
         AND st.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS support_ticket_messages_owner_insert ON support_ticket_messages;
CREATE POLICY support_ticket_messages_owner_insert ON support_ticket_messages
  FOR INSERT
  WITH CHECK (
    sender_type = 'user'
    AND source = 'app'
    AND sender_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
        FROM support_tickets st
       WHERE st.id = support_ticket_messages.ticket_id
         AND st.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS support_ticket_messages_admin_all ON support_ticket_messages;
CREATE POLICY support_ticket_messages_admin_all ON support_ticket_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM users admin_user
       WHERE admin_user.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(admin_user.email::text) = 'chester.chirenje@tectavis.com'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM users admin_user
       WHERE admin_user.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(admin_user.email::text) = 'chester.chirenje@tectavis.com'
    )
  );

GRANT SELECT, INSERT, UPDATE ON support_ticket_messages TO kindred_app;

DROP POLICY IF EXISTS support_tickets_admin_update ON support_tickets;
CREATE POLICY support_tickets_admin_update ON support_tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM users admin_user
       WHERE admin_user.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(admin_user.email::text) = 'chester.chirenje@tectavis.com'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM users admin_user
       WHERE admin_user.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(admin_user.email::text) = 'chester.chirenje@tectavis.com'
    )
  );

INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, body, source, created_at)
SELECT id, 'user', user_id, message, 'app', created_at
  FROM support_tickets st
 WHERE NOT EXISTS (
   SELECT 1
     FROM support_ticket_messages stm
    WHERE stm.ticket_id = st.id
      AND stm.source = 'app'
      AND stm.body = st.message
 );
