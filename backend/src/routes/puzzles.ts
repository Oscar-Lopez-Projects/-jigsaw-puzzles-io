import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get community puzzles (public, no auth needed)
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Upload a community puzzle (protected)
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { title, image_url, piece_count } = req.body;

  if (!title || !image_url || !piece_count) {
    return res.status(400).json({ error: 'title, image_url, and piece_count are required' });
  }

  const { data, error } = await supabase
    .from('puzzles')
    .insert({
      user_id: req.userId,
      title,
      image_url,
      piece_count,
      is_public: true,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
