CREATE TABLE IF NOT EXISTS ready_meet_chat_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  first_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  reconsider_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT ready_meet_chat_invitations_distinct_users CHECK (requester_id <> recipient_id),
  CONSTRAINT ready_meet_chat_invitations_pair_unique UNIQUE (requester_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS ready_meet_chat_invitations_recipient_status_idx
  ON ready_meet_chat_invitations(recipient_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ready_meet_chat_invitations_requester_status_idx
  ON ready_meet_chat_invitations(requester_id, status, updated_at DESC);

ALTER TABLE ready_meet_chat_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ready_meet_chat_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ready_meet_chat_invitations_participant_select ON ready_meet_chat_invitations;
CREATE POLICY ready_meet_chat_invitations_participant_select ON ready_meet_chat_invitations
  FOR SELECT USING (
    requester_id = current_setting('app.user_id', true)::uuid
    OR recipient_id = current_setting('app.user_id', true)::uuid
  );

DROP POLICY IF EXISTS ready_meet_chat_invitations_requester_insert ON ready_meet_chat_invitations;
CREATE POLICY ready_meet_chat_invitations_requester_insert ON ready_meet_chat_invitations
  FOR INSERT WITH CHECK (requester_id = current_setting('app.user_id', true)::uuid);

DROP POLICY IF EXISTS ready_meet_chat_invitations_participant_update ON ready_meet_chat_invitations;
CREATE POLICY ready_meet_chat_invitations_participant_update ON ready_meet_chat_invitations
  FOR UPDATE USING (
    requester_id = current_setting('app.user_id', true)::uuid
    OR recipient_id = current_setting('app.user_id', true)::uuid
  ) WITH CHECK (
    requester_id = current_setting('app.user_id', true)::uuid
    OR recipient_id = current_setting('app.user_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON ready_meet_chat_invitations TO kindred_app;
