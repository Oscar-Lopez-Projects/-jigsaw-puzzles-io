-- Challenges table — async PvP puzzle duels between friends
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The player who initiated the challenge
  challenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The friend being challenged
  opponent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Puzzle info (image stored as URL so opponent plays same image)
  image_url TEXT NOT NULL,
  puzzle_title TEXT NOT NULL,
  piece_count INT NOT NULL CHECK (piece_count > 0),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'easy', 'medium', 'hard')),
  -- Challenger's result (set when challenge is created)
  challenger_time_sec INT NOT NULL CHECK (challenger_time_sec > 0),
  challenger_stars INT NOT NULL CHECK (challenger_stars BETWEEN 1 AND 3),
  -- Opponent's result (set when opponent completes the puzzle)
  opponent_time_sec INT,
  opponent_stars INT CHECK (opponent_stars IS NULL OR opponent_stars BETWEEN 1 AND 3),
  -- Who won: 'challenger', 'opponent', 'tie', or NULL if not yet completed
  winner TEXT CHECK (winner IS NULL OR winner IN ('challenger', 'opponent', 'tie')),
  -- Status: pending (waiting for opponent), completed, declined
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_challenges_challenger ON challenges(challenger_id, status);
CREATE INDEX idx_challenges_opponent ON challenges(opponent_id, status);

-- RLS
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own challenges" ON challenges
  FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

CREATE POLICY "Users can create challenges" ON challenges
  FOR INSERT WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Opponent can update challenge" ON challenges
  FOR UPDATE USING (auth.uid() = opponent_id OR auth.uid() = challenger_id);
