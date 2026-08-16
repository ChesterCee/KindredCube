ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS close_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

DROP POLICY IF EXISTS support_tickets_owner_update ON support_tickets;
CREATE POLICY support_tickets_owner_update ON support_tickets
  FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
