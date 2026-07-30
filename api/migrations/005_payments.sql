CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_type text NOT NULL CHECK (purchase_type IN ('wallet', 'kindred_pass', 'premium')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency char(3) NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'refunded')),
  stripe_checkout_session_id text UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON payment_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta_cents integer NOT NULL CHECK (delta_cents <> 0),
  entry_type text NOT NULL CHECK (entry_type IN ('top_up', 'super_like', 'photo_comment', 'liked_you_reveal', 'refund')),
  stripe_event_id text UNIQUE,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx ON wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement text NOT NULL CHECK (entitlement IN ('premium', 'kindred_pass')),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  stripe_subscription_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entitlement)
);

CREATE TABLE IF NOT EXISTS stripe_payment_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entitlements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_orders_owner_only ON payment_orders;
CREATE POLICY payment_orders_owner_only ON payment_orders
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS wallet_accounts_owner_only ON wallet_accounts;
CREATE POLICY wallet_accounts_owner_only ON wallet_accounts
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS wallet_ledger_owner_only ON wallet_ledger;
CREATE POLICY wallet_ledger_owner_only ON wallet_ledger
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
DROP POLICY IF EXISTS user_entitlements_owner_only ON user_entitlements;
CREATE POLICY user_entitlements_owner_only ON user_entitlements
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON payment_orders TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON wallet_accounts TO kindred_app;
GRANT SELECT, INSERT ON wallet_ledger TO kindred_app;
GRANT SELECT, INSERT, UPDATE ON user_entitlements TO kindred_app;
GRANT SELECT, INSERT ON stripe_payment_webhook_events TO kindred_app;
