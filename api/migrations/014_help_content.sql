CREATE TABLE IF NOT EXISTS help_content_pages (
  slug text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('profile_setup', 'account_management', 'data_management')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_content_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_content_pages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS help_content_public_read ON help_content_pages;
CREATE POLICY help_content_public_read ON help_content_pages
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS help_content_admin_write ON help_content_pages;
CREATE POLICY help_content_admin_write ON help_content_pages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(u.email::text) = lower(current_setting('app.admin_owner_email', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(u.email::text) = lower(current_setting('app.admin_owner_email', true))
    )
  );

GRANT SELECT ON help_content_pages TO kindred_app;
GRANT INSERT, UPDATE ON help_content_pages TO kindred_app;

INSERT INTO help_content_pages (slug, category, title, summary, body)
VALUES
  ('photos', 'profile_setup', 'Photos', 'Choose photos that show the real you.', 'Add at least three clear photos. Your first photo should be your strongest photo because it becomes your main profile picture.'),
  ('bio', 'profile_setup', 'Bio', 'Write a bio that helps someone understand you quickly.', 'Use your bio to share your personality, values, lifestyle, and what makes connecting with you meaningful.'),
  ('prompts', 'profile_setup', 'Prompts', 'Prompts help your profile feel more human.', 'Pick prompts that invite conversation and answer them in your own words. Specific answers usually perform better than generic answers.'),
  ('interests', 'profile_setup', 'Interests', 'Interests help KindredCube find common ground.', 'Choose interests that genuinely reflect how you spend your time or what you would enjoy doing with someone.'),
  ('values', 'profile_setup', 'Values', 'Values help match people beyond surface attraction.', 'Choose qualities and values that matter to you in another person. These help improve recommendations and connection quality.'),
  ('profile-strength', 'profile_setup', 'Profile Strength', 'A stronger profile receives stronger recommendations.', 'Profile strength increases when you add photos, bio, prompts, interests, values, more-about-you details, and verification.'),
  ('login-email-password', 'account_management', 'Login, Email, and Password', 'Manage account access safely.', 'Use a strong password and keep your email address current so you can receive verification and password reset links.'),
  ('verification', 'account_management', 'Verification', 'Verification helps people trust your profile.', 'KindredCube uses Stripe for verification. KindredCube does not store your identification documents.'),
  ('notifications', 'account_management', 'Notifications', 'Control how KindredCube keeps in touch.', 'You can control notifications for messages, admirers, matches, profile tips, and marketing updates.'),
  ('account-access', 'account_management', 'Account Access', 'Keep access to your account protected.', 'Log out when using a shared device and contact support if you believe your account has been accessed without permission.'),
  ('export-data', 'data_management', 'Export Data', 'Request a copy of your information.', 'KindredCube can support account data export so users can understand what information is associated with their account.'),
  ('privacy-choices', 'data_management', 'Privacy Choices', 'Control visibility and privacy preferences.', 'Use profile visibility, blocks, pause, and privacy settings to control how you appear on KindredCube.'),
  ('delete-account', 'data_management', 'Delete Account', 'Delete your account when you are ready to leave.', 'Deleting your account removes active profile data. Minimal safety/legal records may be retained where required.'),
  ('blocked-users', 'data_management', 'Blocked Users', 'Blocking removes access between both people.', 'When you block someone, you are removed from each other’s discovery, likes, matches, and chats.'),
  ('saved-profile-data', 'data_management', 'Saved Profile Data', 'Your profile changes should stay with your account.', 'Photos, bio, prompts, and profile settings are saved to your private account space and should not leak to other users.')
ON CONFLICT (slug) DO NOTHING;
