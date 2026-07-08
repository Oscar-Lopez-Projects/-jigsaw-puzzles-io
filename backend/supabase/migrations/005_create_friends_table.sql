-- Friends table — bidirectional friend requests
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friends_requester ON friends(requester_id, status);
CREATE INDEX idx_friends_addressee ON friends(addressee_id, status);

-- RLS
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Users can see friendships they are part of
CREATE POLICY "Users see own friendships" ON friends
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can send friend requests
CREATE POLICY "Users can send requests" ON friends
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Users can update friendships addressed to them (accept/decline)
CREATE POLICY "Addressee can update status" ON friends
  FOR UPDATE USING (auth.uid() = addressee_id);

-- Users can delete friendships they are part of (unfriend)
CREATE POLICY "Users can delete own friendships" ON friends
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
