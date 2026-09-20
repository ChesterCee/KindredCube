CREATE TABLE IF NOT EXISTS constellation_referrals (
  referred_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  constellation_id uuid NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referred_user_id <> creator_id)
);

CREATE TABLE IF NOT EXISTS constellation_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  constellation_id uuid NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_order_id uuid NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents > 0),
  commission_rate_bps integer NOT NULL DEFAULT 1000 CHECK (commission_rate_bps = 1000),
  commission_amount_cents integer NOT NULL CHECK (commission_amount_cents > 0),
  currency char(3) NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'reversed')),
  available_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS constellation_commissions_creator_idx ON constellation_commissions(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS constellation_commissions_constellation_idx ON constellation_commissions(constellation_id, created_at DESC);

ALTER TABLE constellation_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_referrals FORCE ROW LEVEL SECURITY;
ALTER TABLE constellation_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_commissions FORCE ROW LEVEL SECURITY;

CREATE POLICY constellation_referrals_participant_read ON constellation_referrals FOR SELECT USING (
  referred_user_id = current_setting('app.user_id', true)::uuid OR creator_id = current_setting('app.user_id', true)::uuid
);
CREATE POLICY constellation_referrals_self_claim ON constellation_referrals FOR INSERT WITH CHECK (
  referred_user_id = current_setting('app.user_id', true)::uuid
);
CREATE POLICY constellation_commissions_creator_read ON constellation_commissions FOR SELECT USING (
  creator_id = current_setting('app.user_id', true)::uuid
);
CREATE POLICY constellation_commissions_server_insert ON constellation_commissions FOR INSERT WITH CHECK (true);
CREATE POLICY constellation_commissions_creator_update ON constellation_commissions FOR UPDATE USING (
  creator_id = current_setting('app.user_id', true)::uuid
) WITH CHECK (
  creator_id = current_setting('app.user_id', true)::uuid
);

GRANT SELECT, INSERT ON constellation_referrals, constellation_commissions TO kindred_app;
GRANT UPDATE ON constellation_commissions TO kindred_app;
