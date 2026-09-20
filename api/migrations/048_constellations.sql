CREATE TABLE IF NOT EXISTS constellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 240),
  requires_approval boolean NOT NULL DEFAULT true,
  cover_mime_type text CHECK (cover_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  cover_data bytea,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS constellation_members (
  constellation_id uuid NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (constellation_id, user_id)
);

CREATE INDEX IF NOT EXISTS constellation_members_status_idx ON constellation_members(constellation_id, status);
CREATE INDEX IF NOT EXISTS constellations_public_idx ON constellations(published_at DESC) WHERE published_at IS NOT NULL;

ALTER TABLE constellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellations FORCE ROW LEVEL SECURITY;
ALTER TABLE constellation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_members FORCE ROW LEVEL SECURITY;

CREATE POLICY constellations_visible ON constellations FOR SELECT USING (true);
CREATE POLICY constellations_creator_insert ON constellations FOR INSERT WITH CHECK (creator_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY constellations_creator_update ON constellations FOR UPDATE USING (creator_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY constellations_creator_delete ON constellations FOR DELETE USING (creator_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY constellation_members_visible ON constellation_members FOR SELECT USING (true);
CREATE POLICY constellation_members_self_insert ON constellation_members FOR INSERT WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);
CREATE POLICY constellation_members_creator_update ON constellation_members FOR UPDATE USING (
  EXISTS (SELECT 1 FROM constellations c WHERE c.id = constellation_id AND c.creator_id = current_setting('app.user_id', true)::uuid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON constellations, constellation_members TO kindred_app;
