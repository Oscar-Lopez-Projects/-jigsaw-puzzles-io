import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// ─── ELO point gains per star rating ───────────────────────────
const ELO_GAINS: Record<number, number> = { 3: 25, 2: 15, 1: 5 };

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

// Submit a leaderboard score + update ELO (protected)
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

  // Update ELO rating
  await updateElo(req.userId!, stars);

  res.status(201).json(data);
});

// POST /elo/update — manual ELO update after puzzle completion (protected)
// Called automatically by the records route, but also available standalone
router.post('/elo/update', requireAuth, async (req: AuthRequest, res) => {
  const { stars } = req.body;

  if (!stars || ![1, 2, 3].includes(stars)) {
    return res.status(400).json({ error: 'stars must be 1, 2, or 3' });
  }

  const result = await updateElo(req.userId!, stars);
  if (result.error) return res.status(500).json({ error: result.error });
  res.json(result.data);
});

// ─── ELO update helper ─────────────────────────────────────────
async function updateElo(userId: string, stars: number) {
  const gain = ELO_GAINS[stars] || 5;

  // Get current rating
  const { data: current, error: fetchErr } = await supabase
    .from('elo_ratings')
    .select('rating, wins')
    .eq('user_id', userId)
    .single();

  if (fetchErr || !current) {
    // Create if doesn't exist
    const { data, error } = await supabase
      .from('elo_ratings')
      .upsert({
        user_id: userId,
        rating: 1200 + gain,
        wins: 1,
        last_match_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    return { data, error: error?.message };
  }

  // Update existing
  const newRating = current.rating + gain;
  const { data, error } = await supabase
    .from('elo_ratings')
    .update({
      rating: newRating,
      wins: current.wins + 1,
      last_match_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();

  return { data, error: error?.message };
}

export default router;
