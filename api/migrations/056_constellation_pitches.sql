ALTER TABLE constellations
  ADD COLUMN IF NOT EXISTS pitch_about text NOT NULL DEFAULT '' CHECK (char_length(pitch_about) <= 800),
  ADD COLUMN IF NOT EXISTS pitch_looking_for text NOT NULL DEFAULT '' CHECK (char_length(pitch_looking_for) <= 800);
