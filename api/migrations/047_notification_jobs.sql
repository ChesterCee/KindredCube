-- Private API worker state, never exposed through a client-facing endpoint.
CREATE TABLE IF NOT EXISTS notification_activity (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_active_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO notification_activity(user_id, last_active_at)
SELECT user_id, max(last_seen_at) FROM auth_sessions GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('post_meet', 'inactivity')),
  meeting_started_at timestamptz,
  due_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS notification_jobs_due_idx ON notification_jobs(available_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS notification_jobs_user_kind_idx ON notification_jobs(user_id, kind, created_at DESC);
REVOKE ALL ON notification_jobs, notification_activity FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_jobs, notification_activity TO kindred_app;
