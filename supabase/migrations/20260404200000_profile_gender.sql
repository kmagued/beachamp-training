-- Add gender field to profiles
ALTER TABLE profiles
  ADD COLUMN gender TEXT DEFAULT NULL
  CHECK (gender IN ('male', 'female'));
