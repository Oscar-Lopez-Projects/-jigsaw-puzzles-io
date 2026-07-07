-- Add image reference to puzzle_records
ALTER TABLE puzzle_records ADD COLUMN IF NOT EXISTS image_reference TEXT;
