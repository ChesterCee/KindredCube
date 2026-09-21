ALTER TABLE constellations
  ADD COLUMN IF NOT EXISTS origin_city text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS origin_latitude double precision,
  ADD COLUMN IF NOT EXISTS origin_longitude double precision;

ALTER TABLE constellations
  DROP CONSTRAINT IF EXISTS constellations_origin_latitude_check,
  DROP CONSTRAINT IF EXISTS constellations_origin_longitude_check;

ALTER TABLE constellations
  ADD CONSTRAINT constellations_origin_latitude_check
    CHECK (origin_latitude IS NULL OR origin_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT constellations_origin_longitude_check
    CHECK (origin_longitude IS NULL OR origin_longitude BETWEEN -180 AND 180);

UPDATE constellations constellation
   SET origin_city = COALESCE(NULLIF(profile.matching_data->>'currentLocation', ''), 'Local community'),
       origin_country = NULLIF(profile.matching_data->>'currentCountry', ''),
       origin_latitude = profile.area_latitude,
       origin_longitude = profile.area_longitude
  FROM discovery_profiles profile
 WHERE profile.user_id = constellation.creator_id
   AND constellation.origin_latitude IS NULL;

CREATE INDEX IF NOT EXISTS constellations_origin_idx
  ON constellations(origin_latitude, origin_longitude);
