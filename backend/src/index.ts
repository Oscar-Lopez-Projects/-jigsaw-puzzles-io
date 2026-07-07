import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './supabaseClient.js';
import authRouter from './routes/auth.js';
import recordsRouter from './routes/records.js';
import puzzlesRouter from './routes/puzzles.js';
import leaderboardRouter from './routes/leaderboard.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Health check
app.get('/api/health', async (_req, res) => {
  const { error } = await supabase.from('users').select('id').limit(1);
  res.json({ status: error ? 'unhealthy' : 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/records', recordsRouter);
app.use('/api/puzzles', puzzlesRouter);
app.use('/api/leaderboard', leaderboardRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
