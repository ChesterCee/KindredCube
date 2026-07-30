CREATE TABLE IF NOT EXISTS member_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'connect' CHECK (source IN ('connect', 'explore', 'ready_to_meet')),
  visible_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (liker_id <> liked_user_id),
  UNIQUE (liker_id, liked_user_id)
);

CREATE INDEX IF NOT EXISTS member_likes_liked_visible_idx
  ON member_likes(liked_user_id, visible_at DESC);

CREATE INDEX IF NOT EXISTS member_likes_liker_idx
  ON member_likes(liker_id, created_at DESC);

ALTER TABLE member_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_likes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_likes_participant_read ON member_likes;
CREATE POLICY member_likes_participant_read ON member_likes
  FOR SELECT
  USING (
    liker_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR liked_user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS member_likes_sender_insert ON member_likes;
CREATE POLICY member_likes_sender_insert ON member_likes
  FOR INSERT
  WITH CHECK (liker_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS member_likes_sender_update ON member_likes;
CREATE POLICY member_likes_sender_update ON member_likes
  FOR UPDATE
  USING (liker_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (liker_id = nullif(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON member_likes TO kindred_app;
