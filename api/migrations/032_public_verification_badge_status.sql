-- Public profile cards, chat headers, and discovery need to show whether a
-- member has a public verification badge. Keep the raw verification rows
-- private, but expose badge-safe booleans through SECURITY DEFINER helpers.

ALTER TABLE identity_verification_sessions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE video_selfie_verifications NO FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public_identity_verified(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM identity_verification_sessions iv
     WHERE iv.user_id = target_user_id
       AND (iv.status = 'verified' OR iv.verified_at IS NOT NULL)
       AND (
         iv.provider = 'stripe'
         OR iv.provider_session_id LIKE 'vs_%'
         OR iv.verification_type = 'document_and_selfie'
       )
  );
$$;

CREATE OR REPLACE FUNCTION public_selfie_verified(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1
        FROM identity_verification_sessions iv
       WHERE iv.user_id = target_user_id
         AND (iv.status = 'verified' OR iv.verified_at IS NOT NULL)
         AND iv.provider = 'kindredcube'
         AND iv.verification_type = 'video_selfie'
    )
    OR EXISTS (
      SELECT 1
        FROM video_selfie_verifications vsv
       WHERE vsv.user_id = target_user_id
         AND vsv.status = 'verified'
    )
  );
$$;

REVOKE ALL ON FUNCTION public_identity_verified(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_selfie_verified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_identity_verified(uuid) TO kindred_app;
GRANT EXECUTE ON FUNCTION public_selfie_verified(uuid) TO kindred_app;
