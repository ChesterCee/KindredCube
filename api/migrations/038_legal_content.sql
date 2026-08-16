CREATE TABLE IF NOT EXISTS legal_content_pages (
  slug text PRIMARY KEY CHECK (slug IN ('privacy', 'terms', 'community-guidelines')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legal_content_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_content_pages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_content_public_read ON legal_content_pages;
CREATE POLICY legal_content_public_read ON legal_content_pages
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS legal_content_admin_write ON legal_content_pages;
CREATE POLICY legal_content_admin_write ON legal_content_pages
  FOR ALL
  USING (
    current_user = 'kindred_admin'
    OR
    EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(u.email::text) = lower(current_setting('app.admin_owner_email', true))
    )
  )
  WITH CHECK (
    current_user = 'kindred_admin'
    OR
    EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid
         AND lower(u.email::text) = lower(current_setting('app.admin_owner_email', true))
    )
  );

GRANT SELECT ON legal_content_pages TO kindred_app;
GRANT INSERT, UPDATE ON legal_content_pages TO kindred_app;

INSERT INTO legal_content_pages (slug, title, summary, body)
VALUES
  ('privacy', 'KindredCube Privacy Policy', 'How KindredCube collects, uses, shares, protects, and retains personal information.', 'KindredCube is a dating and social discovery platform developed by Tectavis, Inc. This Privacy Policy explains how we collect, use, disclose, protect, and retain information when you use KindredCube.'),
  ('terms', 'KindredCube Terms of Service', 'The terms governing access to and use of KindredCube.', 'These Terms of Service govern your access to and use of KindredCube, including the mobile application, website, matching services, messaging, verification tools, Ready to Meet, Wallet, paid features, support tools, and related services.'),
  ('community-guidelines', 'KindredCube Community Guidelines', 'Rules for respectful, safe, and honest participation on KindredCube.', 'KindredCube is built for adults who want meaningful, respectful, and safe connections. These Community Guidelines explain the conduct expected from everyone using the platform.')
ON CONFLICT (slug) DO NOTHING;
