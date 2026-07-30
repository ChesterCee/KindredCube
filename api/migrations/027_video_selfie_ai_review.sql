ALTER TABLE video_selfie_verifications
  DROP CONSTRAINT IF EXISTS video_selfie_verifications_status_check;

ALTER TABLE video_selfie_verifications
  ALTER COLUMN status SET DEFAULT 'processing';

ALTER TABLE video_selfie_verifications
  ADD CONSTRAINT video_selfie_verifications_status_check
  CHECK (status IN ('processing', 'verified', 'requires_input', 'redacted'));

ALTER TABLE video_selfie_verifications
  ADD COLUMN IF NOT EXISTS ai_review_status text NOT NULL DEFAULT 'pending'
    CHECK (ai_review_status IN ('pending', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS ai_reason_code text,
  ADD COLUMN IF NOT EXISTS ai_review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NOT NULL DEFAULT now();

UPDATE video_selfie_verifications
   SET ai_review_status = 'completed',
       ai_confidence = COALESCE(ai_confidence, 1),
       ai_reason_code = COALESCE(ai_reason_code, 'legacy_pre_ai_review'),
       ai_review_notes = COALESCE(ai_review_notes, 'Created before AI selfie review enforcement.')
 WHERE status = 'verified'
   AND ai_reason_code IS NULL;
