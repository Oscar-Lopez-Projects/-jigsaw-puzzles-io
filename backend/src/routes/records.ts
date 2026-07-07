import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all records for the authenticated user
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('puzzle_records')
    .select('*')
    .eq('user_id', req.userId!)
    .order('completed_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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
  res.status(201).json(data);
});

export default router;
