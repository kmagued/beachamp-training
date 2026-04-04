-- Change private session requests from specific date to day of week
-- The admin assigns the actual date when confirming

ALTER TABLE private_session_requests
  ADD COLUMN requested_day_of_week INTEGER DEFAULT NULL
  CHECK (requested_day_of_week >= 0 AND requested_day_of_week <= 6);

-- Migrate existing data (extract day_of_week from requested_date)
UPDATE private_session_requests
  SET requested_day_of_week = EXTRACT(DOW FROM requested_date)::INTEGER
  WHERE requested_date IS NOT NULL;

-- Make the new column NOT NULL after migration
ALTER TABLE private_session_requests
  ALTER COLUMN requested_day_of_week SET NOT NULL;

-- Drop the old date column
ALTER TABLE private_session_requests
  DROP COLUMN requested_date;
