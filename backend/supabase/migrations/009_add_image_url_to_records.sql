-- Add image_url to puzzle_records so solo play completions can show the image.
ALTER TABLE puzzle_records ADD COLUMN IF NOT EXISTS image_url TEXT;
