CREATE TABLE IF NOT EXISTS deleted_account_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email_hash char(64) NOT NULL,
  username_hash char(64) NOT NULL,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  details_present boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_account_identifiers_email_idx
  ON deleted_account_identifiers (email_hash, deleted_at DESC);

CREATE INDEX IF NOT EXISTS deleted_account_identifiers_username_idx
  ON deleted_account_identifiers (username_hash, deleted_at DESC);

GRANT SELECT, INSERT ON deleted_account_identifiers TO kindred_app;
