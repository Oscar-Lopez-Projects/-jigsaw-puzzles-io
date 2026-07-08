import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Search users by username
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  const query = req.query.q as string;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, username, avatar_url')
    .ilike('username', `%${query.trim()}%`)
    .neq('id', req.userId!)
    .limit(10);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get a user's public profile
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, avatar_url, created_at')
    .eq('id', userId)
    .single();

  if (userErr || !user) return res.status(404).json({ error: 'User not found' });

  // Get their ELO
  const { data: elo } = await supabase
    .from('elo_ratings')
    .select('rating, wins, losses')
    .eq('user_id', userId)
    .single();

  // Get their puzzle stats
  const { data: records } = await supabase
    .from('puzzle_records')
    .select('completion_time_sec, stars, piece_count')
    .eq('user_id', userId);

  const totalPuzzles = records?.length || 0;
  const totalStars = records?.reduce((s, r) => s + r.stars, 0) || 0;
  const avgStars = totalPuzzles > 0 ? totalStars / totalPuzzles : 0;
  const bestTime = totalPuzzles > 0 ? Math.min(...records!.map((r) => r.completion_time_sec)) : null;

  res.json({
    ...user,
    elo: elo || { rating: 1200, wins: 0, losses: 0 },
    stats: { totalPuzzles, avgStars: +avgStars.toFixed(1), bestTime },
  });
});

// Delete own account
router.delete('/me', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  // Delete from users table (cascade will handle records, elo, friends, etc.)
  const { error: deleteErr } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  // Delete auth user
  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  if (authErr) return res.status(500).json({ error: authErr.message });

  res.json({ message: 'Account deleted successfully' });
});

export default router;
