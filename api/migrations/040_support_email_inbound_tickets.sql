ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS contact_email text;

ALTER TABLE support_tickets
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_contact_email_created_idx
  ON support_tickets (lower(contact_email), created_at DESC)
  WHERE contact_email IS NOT NULL;

DROP POLICY IF EXISTS support_tickets_admin_insert ON support_tickets;
CREATE POLICY support_tickets_admin_insert ON support_tickets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM users admin_user
       WHERE admin_user.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(admin_user.email::text) = 'chester.chirenje@tectavis.com'
    )
  );
