-- Extended player profile fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS weight INTEGER,
  ADD COLUMN IF NOT EXISTS preferred_hand TEXT CHECK (preferred_hand IN ('left', 'right')),
  ADD COLUMN IF NOT EXISTS preferred_position TEXT CHECK (preferred_position IN ('defender', 'blocker')),
  ADD COLUMN IF NOT EXISTS guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
