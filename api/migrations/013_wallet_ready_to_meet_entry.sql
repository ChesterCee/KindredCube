ALTER TABLE wallet_ledger
  DROP CONSTRAINT IF EXISTS wallet_ledger_entry_type_check;

ALTER TABLE wallet_ledger
  ADD CONSTRAINT wallet_ledger_entry_type_check
  CHECK (entry_type IN ('top_up', 'super_like', 'photo_comment', 'liked_you_reveal', 'ready_to_meet_chat', 'refund'));
