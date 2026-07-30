ALTER TABLE user_private_spaces DISABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_likes DISABLE ROW LEVEL SECURITY;

INSERT INTO member_likes (liker_id, liked_user_id, source, visible_at)
SELECT
  ps.user_id,
  liked.profile_id::uuid,
  'connect',
  now() + interval '30 days'
FROM user_private_spaces ps
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(ps.settings_data -> 'likedProfileIds') = 'array'
      THEN ps.settings_data -> 'likedProfileIds'
    ELSE '[]'::jsonb
  END
) AS liked(profile_id)
JOIN discovery_profiles d
  ON d.user_id = liked.profile_id::uuid
WHERE liked.profile_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ps.user_id <> liked.profile_id::uuid
ON CONFLICT (liker_id, liked_user_id) DO NOTHING;

ALTER TABLE user_private_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private_spaces FORCE ROW LEVEL SECURITY;
ALTER TABLE discovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE member_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_likes FORCE ROW LEVEL SECURITY;
