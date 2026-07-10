-- Comments on challenges
CREATE TABLE IF NOT EXISTS challenge_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Likes on challenges
CREATE TABLE IF NOT EXISTS challenge_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX idx_comments_challenge ON challenge_comments(challenge_id, created_at DESC);
CREATE INDEX idx_likes_challenge ON challenge_likes(challenge_id);

ALTER TABLE challenge_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments full access" ON challenge_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Likes full access" ON challenge_likes FOR ALL USING (true) WITH CHECK (true);
