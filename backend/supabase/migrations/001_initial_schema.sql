-- ══════════════════════════════════════════════════════════════
-- Jigsaw Puzzles I.O — Initial Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query)
-- ══════════════════════════════════════════════════════════════

-- ── Users table ─────────────────────────────────────────────
-- Mirrors Supabase Auth user but stores app-specific profile data
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Puzzles table ───────────────────────────────────────────
-- Stores community-uploaded puzzles
CREATE TABLE IF NOT EXISTS puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  piece_count INT NOT NULL CHECK (piece_count > 0),
  is_public BOOLEAN DEFAULT TRUE,
  plays INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Puzzle Records table ────────────────────────────────────
-- A user's personal history of solved puzzles
CREATE TABLE IF NOT EXISTS puzzle_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id UUID REFERENCES puzzles(id) ON DELETE SET NULL,
  piece_count INT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'easy', 'medium', 'hard')),
  completion_time_sec INT NOT NULL CHECK (completion_time_sec > 0),
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 3),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Leaderboard Scores table ────────────────────────────────
-- Best score per user per puzzle (upsert on improvement)
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  completion_time_sec INT NOT NULL CHECK (completion_time_sec > 0),
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 3),
  achieved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, puzzle_id)
);

-- ── ELO Ratings table ───────────────────────────────────────
-- Player ranking for PvP matchmaking
CREATE TABLE IF NOT EXISTS elo_ratings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating INT NOT NULL DEFAULT 1200,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  last_match_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- Indexes for performance
-- ══════════════════════════════════════════════════════════════

CREATE INDEX idx_puzzle_records_user ON puzzle_records(user_id);
CREATE INDEX idx_puzzle_records_completed ON puzzle_records(completed_at DESC);
CREATE INDEX idx_leaderboard_puzzle ON leaderboard_scores(puzzle_id, completion_time_sec ASC);
CREATE INDEX idx_leaderboard_user ON leaderboard_scores(user_id);
CREATE INDEX idx_elo_rating ON elo_ratings(rating DESC);
CREATE INDEX idx_puzzles_public ON puzzles(is_public, created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- Row Level Security (RLS) — enable on all tables
-- ══════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE elo_ratings ENABLE ROW LEVEL SECURITY;

-- Users: anyone can read, only own profile can update
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Puzzles: public puzzles readable by all, owners can insert/update/delete
CREATE POLICY "Public puzzles readable" ON puzzles FOR SELECT USING (is_public = true);
CREATE POLICY "Users can insert own puzzles" ON puzzles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own puzzles" ON puzzles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own puzzles" ON puzzles FOR DELETE USING (auth.uid() = user_id);

-- Records: users see only their own
CREATE POLICY "Users see own records" ON puzzle_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own records" ON puzzle_records FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Leaderboard: readable by all, insertable by own user
CREATE POLICY "Leaderboard readable" ON leaderboard_scores FOR SELECT USING (true);
CREATE POLICY "Users insert own scores" ON leaderboard_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scores" ON leaderboard_scores FOR UPDATE USING (auth.uid() = user_id);

-- ELO: readable by all, server manages updates (service role key bypasses RLS)
CREATE POLICY "ELO readable" ON elo_ratings FOR SELECT USING (true);
