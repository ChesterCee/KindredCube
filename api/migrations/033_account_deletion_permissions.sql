-- Account deletion needs to remove active credentials and one-time tokens for
-- the signed-in user. The original auth grants intentionally avoided broad
-- deletes, but the delete-account workflow now performs scoped cleanup inside
-- an authenticated user transaction.
GRANT DELETE ON password_credentials TO kindred_app;
GRANT DELETE ON email_verification_tokens TO kindred_app;
GRANT DELETE ON email_login_tickets TO kindred_app;
GRANT DELETE ON password_reset_tokens TO kindred_app;
