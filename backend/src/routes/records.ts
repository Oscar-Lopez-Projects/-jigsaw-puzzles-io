import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all records for the authenticated user
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  console.log('[Records GET] userId from token:', req.userId);
  const { data, error } = await supabase
    .from('puzzle_records')
    .select('*')
    .eq('user_id', req.userId!)
    .order('completed_at', { ascending: false });

  console.log('[Records GET] returned', data?.length, 'records');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get records for a specific user (public)
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('puzzle_records')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Create a new record (protected)
// Stars are calculated server-side to prevent cheating.
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { puzzle_id, piece_count, completion_time_sec, difficulty, image_reference } = req.body;

  if (!piece_count || !completion_time_sec || !difficulty) {
    return res.status(400).json({ error: 'piece_count, completion_time_sec, and difficulty are required' });
  }

  // Validate inputs
  if (typeof piece_count !== 'number' || piece_count <= 0) {
    return res.status(400).json({ error: 'piece_count must be a positive number' });
  }
  if (typeof completion_time_sec !== 'number' || completion_time_sec <= 0) {
    return res.status(400).json({ error: 'completion_time_sec must be a positive number' });
  }
  const validDifficulties = ['beginner', 'easy', 'medium', 'hard'];
  if (!validDifficulties.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of: ${validDifficulties.join(', ')}` });
  }

  // Calculate star rating server-side (cannot be faked by client)
  // 3 stars: solved in ≤ 3 sec/piece
  // 2 stars: solved in ≤ 6 sec/piece
  // 1 star:  anything slower
  const expectedTime = piece_count * 3;
  let stars: number;
  if (completion_time_sec <= expectedTime) stars = 3;
  else if (completion_time_sec <= expectedTime * 2) stars = 2;
  else stars = 1;

  const { data, error } = await supabase
    .from('puzzle_records')
    .insert({
      user_id: req.userId,
      puzzle_id: puzzle_id || null,
      piece_count,
      completion_time_sec,
      difficulty,
      stars,
      image_reference: image_reference || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Update ELO after successful record save
  const eloGains: Record<number, number> = { 3: 25, 2: 15, 1: 5 };
  const gain = eloGains[stars] || 5;
  const { data: eloRow } = await supabase
    .from('elo_ratings')
    .select('rating, wins')
    .eq('user_id', req.userId!)
    .single();

  if (eloRow) {
    await supabase.from('elo_ratings').update({
      rating: eloRow.rating + gain,
      wins: eloRow.wins + 1,
      last_match_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.userId!);
  }

  // If it's a community puzzle, also upsert into leaderboard_scores (keep best time)
  if (puzzle_id) {
    const { data: existing } = await supabase
      .from('leaderboard_scores')
      .select('completion_time_sec')
      .eq('user_id', req.userId!)
      .eq('puzzle_id', puzzle_id)
      .single();

    // Only update if this time is better (faster)
    if (!existing || completion_time_sec < existing.completion_time_sec) {
      await supabase.from('leaderboard_scores').upsert(
        { user_id: req.userId, puzzle_id, completion_time_sec, stars },
        { onConflict: 'user_id,puzzle_id' }
      );
    }
  }

  res.status(201).json(data);
});

export default router;
