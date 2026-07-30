CREATE TABLE IF NOT EXISTS discovery_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  gender text NOT NULL CHECK (gender IN ('Man', 'Woman', 'Nonbinary')),
  seeking text NOT NULL CHECK (seeking IN ('Women', 'Men', 'Everyone')),
  date_of_birth date NOT NULL,
  culture text NOT NULL DEFAULT '' CHECK (char_length(culture) <= 80),
  occupation text NOT NULL DEFAULT '' CHECK (char_length(occupation) <= 120),
  matching_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  area_latitude double precision,
  area_longitude double precision,
  visible boolean NOT NULL DEFAULT true,
  recently_active_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (area_latitude IS NULL OR area_latitude BETWEEN -90 AND 90),
  CHECK (area_longitude IS NULL OR area_longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS discovery_profiles_visibility_idx
  ON discovery_profiles(visible, recently_active_at DESC);
CREATE INDEX IF NOT EXISTS discovery_profiles_gender_idx
  ON discovery_profiles(gender, visible);

ALTER TABLE discovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_profiles_authenticated_read ON discovery_profiles;
CREATE POLICY discovery_profiles_authenticated_read ON discovery_profiles
  FOR SELECT
  USING (
    nullif(current_setting('app.user_id', true), '') IS NOT NULL
    AND (visible = true OR user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  );

DROP POLICY IF EXISTS discovery_profiles_owner_write ON discovery_profiles;
CREATE POLICY discovery_profiles_owner_write ON discovery_profiles
  FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- A member must also disappear from discovery when that candidate blocked them.
DROP POLICY IF EXISTS user_blocks_target_visibility ON user_blocks;
CREATE POLICY user_blocks_target_visibility ON user_blocks
  FOR SELECT
  USING (
    blocker_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR blocked_profile_id = nullif(current_setting('app.user_id', true), '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON discovery_profiles TO kindred_app;

INSERT INTO discovery_profiles
  (user_id, display_name, gender, seeking, date_of_birth, culture, occupation, matching_data, visible)
SELECT
  u.id,
  u.public_username::text,
  CASE WHEN p.profile_data->>'identity' IN ('Man', 'Woman', 'Nonbinary')
    THEN p.profile_data->>'identity' ELSE 'Nonbinary' END,
  CASE WHEN p.profile_data->>'seeking' IN ('Women', 'Men', 'Everyone')
    THEN p.profile_data->>'seeking' ELSE 'Everyone' END,
  (p.profile_data->>'dateOfBirth')::date,
  COALESCE(p.profile_data->>'culture', ''),
  COALESCE(p.profile_data->>'work', ''),
  jsonb_build_object(
    'personality', p.profile_data->'personality',
    'relationshipGoals', p.profile_data->'relationshipGoals',
    'interests', p.profile_data->'interests',
    'causes', p.profile_data->'causes',
    'values', p.profile_data->'values',
    'languages', p.profile_data->'languages',
    'culturePreferences', p.profile_data->'culturePreferences',
    'details', p.profile_data->'details',
    'profileStrength', p.profile_data->'profileStrength'
  ),
  COALESCE((p.settings_data->>'profilePaused')::boolean, false) = false
FROM users u
JOIN user_private_spaces p ON p.user_id = u.id
WHERE u.status = 'active'
  AND u.email_verified_at IS NOT NULL
  AND p.profile_data ? 'dateOfBirth'
ON CONFLICT (user_id) DO NOTHING;
