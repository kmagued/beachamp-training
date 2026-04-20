-- Decouple feedback from sessions: feedback is now a free-standing note from coach/admin to player
ALTER TABLE feedback ALTER COLUMN session_date DROP NOT NULL;
ALTER TABLE feedback ALTER COLUMN rating DROP NOT NULL;
