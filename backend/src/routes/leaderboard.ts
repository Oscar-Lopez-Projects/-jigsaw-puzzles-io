import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get global leaderboard (top players by ELO) — public
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;

  const { data, error } = await supabase
    .from('elo_ratings')
    .select(`
      user_id,
      rating,
      wins,
      losses,
      users ( username, avatar_url )
    `)
    .order('rating', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get leaderboard for a specific puzzle — public
router.get('/puzzle/:puzzleId', async (req, res) => {
  const { puzzleId } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;

  const { data, error } = await supabase
    .from('leaderboard_scores')
    .select(`
      user_id,
      completion_time_sec,
      stars,
      users ( username, avatar_url )
    `)
    .eq('puzzle_id', puzzleId)
    .order('completion_time_sec', { ascending: true })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Submit a leaderboard score (protected)
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { puzzle_id, completion_time_sec, stars } = req.body;

  if (!puzzle_id || !completion_time_sec || !stars) {
    return res.status(400).json({ error: 'puzzle_id, completion_time_sec, and stars are required' });
  }

  // Upsert — keep the best time for each user/puzzle combo
  const { data, error } = await supabase
    .from('leaderboard_scores')
    .upsert(
      { user_id: req.userId, puzzle_id, completion_time_sec, stars },
      { onConflict: 'user_id,puzzle_id' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
