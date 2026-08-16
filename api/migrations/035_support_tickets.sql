CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open', 'in_review', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx
  ON support_tickets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON support_tickets (status, created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_owner_select ON support_tickets;
CREATE POLICY support_tickets_owner_select ON support_tickets
  FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS support_tickets_owner_insert ON support_tickets;
CREATE POLICY support_tickets_owner_insert ON support_tickets
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS support_tickets_admin_select ON support_tickets;
CREATE POLICY support_tickets_admin_select ON support_tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM users admin_user
       WHERE admin_user.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(admin_user.email::text) = 'chester.chirenje@tectavis.com'
    )
  );

GRANT SELECT, INSERT, UPDATE ON support_tickets TO kindred_app;
