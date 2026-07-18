-- Saved Games — lets users pause and resume solo play sessions.
-- Each user can have at most 2 saved games at a time.
CREATE TABLE IF NOT EXISTS saved_games (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url   TEXT        NOT NULL,
  image_filename TEXT,
  piece_count INT         NOT NULL CHECK (piece_count > 0),
  grid_cols   INT         NOT NULL,
  grid_rows   INT         NOT NULL,
  elapsed_sec INT         NOT NULL DEFAULT 0,
  -- Full pieces array serialised as JSONB so we can restore exact board state
  pieces_state JSONB      NOT NULL DEFAULT '[]',
  puzzle_id   UUID        REFERENCES puzzles(id) ON DELETE SET NULL,
  saved_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_games_user ON saved_games(user_id, saved_at DESC);

ALTER TABLE saved_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own saves"   ON saved_games FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saves" ON saved_games FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own saves" ON saved_games FOR DELETE USING (auth.uid() = user_id);
