CREATE TABLE IF NOT EXISTS admin_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  token_hash char(64) UNIQUE,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_mfa_challenges_user_idx
  ON admin_mfa_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_mfa_challenges_session_idx
  ON admin_mfa_challenges(session_id, created_at DESC);

ALTER TABLE admin_mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_mfa_challenges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_mfa_self_insert ON admin_mfa_challenges;
CREATE POLICY admin_mfa_self_insert ON admin_mfa_challenges
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS admin_mfa_self_update ON admin_mfa_challenges;
CREATE POLICY admin_mfa_self_update ON admin_mfa_challenges
  FOR UPDATE
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS admin_mfa_self_select ON admin_mfa_challenges;
CREATE POLICY admin_mfa_self_select ON admin_mfa_challenges
  FOR SELECT
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR current_setting('app.admin', true) = 'true'
  );

DROP POLICY IF EXISTS payment_orders_admin_review ON payment_orders;
CREATE POLICY payment_orders_admin_review ON payment_orders
  FOR SELECT
  USING (current_setting('app.admin', true) = 'true');
DROP POLICY IF EXISTS wallet_ledger_admin_review ON wallet_ledger;
CREATE POLICY wallet_ledger_admin_review ON wallet_ledger
  FOR SELECT
  USING (current_setting('app.admin', true) = 'true');
DROP POLICY IF EXISTS user_entitlements_admin_review ON user_entitlements;
CREATE POLICY user_entitlements_admin_review ON user_entitlements
  FOR SELECT
  USING (current_setting('app.admin', true) = 'true');

GRANT SELECT, INSERT, UPDATE ON admin_mfa_challenges TO kindred_app;
