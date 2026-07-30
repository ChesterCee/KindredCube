CREATE OR REPLACE FUNCTION cleanup_expired_pending_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM users
   WHERE status = 'pending_email_verification'
     AND email_verified_at IS NULL
     AND created_at < now() - interval '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_expired_pending_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_pending_accounts() TO kindred_app;
