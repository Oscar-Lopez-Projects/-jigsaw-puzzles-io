import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './supabaseClient.js';
import authRouter from './routes/auth.js';
import recordsRouter from './routes/records.js';
import puzzlesRouter from './routes/puzzles.js';
import leaderboardRouter from './routes/leaderboard.js';
import usersRouter from './routes/users.js';
import friendsRouter from './routes/friends.js';
import challengesRouter from './routes/challenges.js';
import savedGamesRouter from './routes/savedGames.js';
import imagesRouter from './routes/images.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', async (_req, res) => {
  const { error } = await supabase.from('users').select('id').limit(1);
  res.json({ status: error ? 'unhealthy' : 'ok', timestamp: new Date().toISOString() });
});

// Diagnostic: report which Supabase role the backend is actually using
app.get('/api/diag', async (_req, res) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  let role = 'unknown';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString());
    role = payload.role || 'no-role';
  } catch { role = 'decode-failed'; }
  // Try reading another user's records to test RLS bypass
  const { data, error } = await supabase
    .from('puzzle_records')
    .select('id')
    .limit(50);
  res.json({
    keyRole: role,
    keyLength: key.length,
    totalRecordsVisible: data?.length ?? 0,
    error: error?.message || null,
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/puzzles', puzzlesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/saved-games', savedGamesRouter);
app.use('/api/images', imagesRouter);

// Only listen when running directly (not when imported for tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
