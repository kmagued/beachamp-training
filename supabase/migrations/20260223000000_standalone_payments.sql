-- Allow payments without a player (e.g. single sessions, walk-ins)
ALTER TABLE payments
ALTER COLUMN player_id DROP NOT NULL;

-- Allow subscriptions without a player (standalone/private sessions)
ALTER TABLE subscriptions
ALTER COLUMN player_id DROP NOT NULL;

-- Add a note field for standalone payment descriptions
ALTER TABLE payments
ADD COLUMN note TEXT;