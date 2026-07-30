ALTER TABLE member_likes
  ADD COLUMN IF NOT EXISTS matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_started_at timestamptz;

CREATE INDEX IF NOT EXISTS member_likes_match_expiry_idx
  ON member_likes(liker_id, liked_user_id, match_expires_at);
