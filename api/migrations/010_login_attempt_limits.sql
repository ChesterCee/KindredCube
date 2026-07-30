CREATE TABLE IF NOT EXISTS login_attempt_limits (
  identifier_hash char(64) PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

CREATE INDEX IF NOT EXISTS login_attempt_limits_locked_idx
  ON login_attempt_limits(locked_until)
  WHERE locked_until IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON login_attempt_limits TO kindred_app;
