-- Add category column to puzzles table
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

-- Valid categories: nature, animals, art, memes, food, travel, architecture, sports, other
-- No constraint — keep it flexible for future additions

CREATE INDEX idx_puzzles_category ON puzzles(category, created_at DESC);
