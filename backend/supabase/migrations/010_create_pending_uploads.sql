-- Tracks images uploaded at puzzle-start so orphans can be cleaned up
-- if a user never completes the puzzle (abandons it).
-- When a record or saved_game is created, mark the upload as 'claimed'.
-- A background job (or on-demand cleanup) can delete 'pending' uploads
-- older than 24 hours.
CREATE TABLE IF NOT EXISTS pending_uploads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path TEXT       NOT NULL,          -- path inside the bucket
  image_url   TEXT        NOT NULL,          -- full public URL
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'claimed', 'deleted')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  claimed_at  TIMESTAMPTZ
);

CREATE INDEX idx_pending_uploads_user   ON pending_uploads(user_id, status);
CREATE INDEX idx_pending_uploads_status ON pending_uploads(status, created_at);

ALTER TABLE pending_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own uploads"    ON pending_uploads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own uploads" ON pending_uploads FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own uploads" ON pending_uploads FOR UPDATE  USING (auth.uid() = user_id);
