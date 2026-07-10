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

  // Calculate rank position and percentile
  const userRating = elo?.rating || 1200;
  const { count: totalPlayers } = await supabase
    .from('elo_ratings')
    .select('*', { count: 'exact', head: true });

  const { count: playersAbove } = await supabase
    .from('elo_ratings')
    .select('*', { count: 'exact', head: true })
    .gt('rating', userRating);

  const rank = (playersAbove || 0) + 1;
  const rankPercentile = totalPlayers && totalPlayers > 0
    ? Math.max(0.1, Math.round((rank / totalPlayers) * 1000) / 10)
    : 0;

  // Get their puzzle records
  const { data: records } = await supabase
    .from('puzzle_records')
    .select('completion_time_sec, stars, piece_count')
    .eq('user_id', userId);

  const totalPuzzles = records?.length || 0;
  const totalStars = records?.reduce((s, r) => s + r.stars, 0) || 0;
  const avgStars = totalPuzzles > 0 ? totalStars / totalPuzzles : 0;
  const bestTime = totalPuzzles > 0 ? Math.min(...records!.map((r) => r.completion_time_sec)) : null;
  const threeStarCount = records?.filter((r) => r.stars === 3).length || 0;
  const totalTime = records?.reduce((s, r) => s + r.completion_time_sec, 0) || 0;

  // Get challenge stats
  const { data: challengesSent } = await supabase
    .from('challenges')
    .select('id, winner, status, completed_at')
    .eq('challenger_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  const { data: challengesReceived } = await supabase
    .from('challenges')
    .select('id, winner, status, completed_at')
    .eq('opponent_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  const allChallenges = [...(challengesSent || []), ...(challengesReceived || [])];
  const challengeWins = (challengesSent?.filter((c) => c.winner === 'challenger').length || 0)
    + (challengesReceived?.filter((c) => c.winner === 'opponent').length || 0);
  const challengeLosses = (challengesSent?.filter((c) => c.winner === 'opponent').length || 0)
    + (challengesReceived?.filter((c) => c.winner === 'challenger').length || 0);
  const challengeTies = allChallenges.filter((c) => c.winner === 'tie').length;

  // Calculate streaks — sort all challenges by date descending
  const sortedChallenges = allChallenges
    .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

  // Determine if each challenge was a win for this user
  const winHistory = sortedChallenges.map((c) => {
    const isSent = challengesSent?.some((s) => s.id === c.id);
    if (isSent) return c.winner === 'challenger';
    return c.winner === 'opponent';
  });

  // Current streak: count consecutive wins from most recent
  let currentStreak = 0;
  for (const won of winHistory) {
    if (won) currentStreak++;
    else break;
  }

  // Longest streak: find the longest consecutive wins ever
  let longestStreak = 0;
  let tempStreak = 0;
  for (const won of winHistory) {
    if (won) { tempStreak++; longestStreak = Math.max(longestStreak, tempStreak); }
    else { tempStreak = 0; }
  }

  res.json({
    ...user,
    elo: elo || { rating: 1200, wins: 0, losses: 0 },
    rank: { position: rank, percentile: rankPercentile, totalPlayers: totalPlayers || 0 },
    stats: {
      totalPuzzles,
      avgStars: +avgStars.toFixed(1),
      bestTime,
      threeStarCount,
      totalTime,
    },
    challenges: {
      total: allChallenges.length,
      wins: challengeWins,
      losses: challengeLosses,
      ties: challengeTies,
      currentStreak,
      longestStreak,
    },
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
