ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS requires_current_password boolean NOT NULL DEFAULT false;
