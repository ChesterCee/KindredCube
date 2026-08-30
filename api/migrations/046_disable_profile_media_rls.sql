-- Profile media is served publicly for visible profiles, while every write is
-- scoped to the authenticated user by PrivateSpaceController. Some deployed
-- databases contain legacy triggers/policies that reject those valid writes
-- even after the canonical policies are recreated. Keep database privileges
-- limited to the API role, but stop applying RLS to this media blob table.

ALTER TABLE profile_media NO FORCE ROW LEVEL SECURITY;
ALTER TABLE profile_media DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON profile_media FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON profile_media TO kindred_app;
