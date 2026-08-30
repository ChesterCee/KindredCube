-- Deployed databases may contain profile_media policies created under older
-- names. A restrictive stale policy can reject otherwise valid owner writes,
-- so replace the complete policy set with the canonical rules.

ALTER TABLE profile_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_media FORCE ROW LEVEL SECURITY;

DO $policy_cleanup$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = current_schema()
       AND tablename = 'profile_media'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profile_media', existing_policy.policyname);
  END LOOP;
END
$policy_cleanup$;

CREATE POLICY profile_media_active_read ON profile_media
  FOR SELECT
  USING (status = 'active');

CREATE POLICY profile_media_owner_insert ON profile_media
  FOR INSERT
  WITH CHECK (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY profile_media_owner_update ON profile_media
  FOR UPDATE
  USING (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON profile_media TO kindred_app;
