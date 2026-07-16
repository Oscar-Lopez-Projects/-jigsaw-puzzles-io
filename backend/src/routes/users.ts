import { Router } from 'express';
import multer from 'multer';
import { supabase, supabaseAuth } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max for avatars

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

// Get suggested players (users who aren't already friends with the requester)
router.get('/suggestions/list', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const limit = parseInt(req.query.limit as string) || 5;

  // Get all friend relationships (any status) to exclude them
  const { data: sentFriends } = await supabase
    .from('friends')
    .select('addressee_id')
    .eq('requester_id', userId);

  const { data: recvFriends } = await supabase
    .from('friends')
    .select('requester_id')
    .eq('addressee_id', userId);

  const excludeIds = new Set<string>([userId]);
  (sentFriends || []).forEach((f) => excludeIds.add(f.addressee_id));
  (recvFriends || []).forEach((f) => excludeIds.add(f.requester_id));

  // Get users sorted by ELO (most active/ranked players first), excluding friends
  const { data: eloUsers } = await supabase
    .from('elo_ratings')
    .select('user_id, rating')
    .order('rating', { ascending: false })
    .limit(limit + excludeIds.size); // fetch extra to account for filtering

  // Filter out friends and self
  const candidateIds = (eloUsers || [])
    .filter((e) => !excludeIds.has(e.user_id))
    .slice(0, limit)
    .map((e) => e.user_id);

  if (candidateIds.length === 0) {
    return res.json([]);
  }

  // Fetch user profiles for the candidates
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, avatar_url')
    .in('id', candidateIds);

  if (error) return res.status(500).json({ error: error.message });

  // Attach ELO rating to each user and sort by rating
  const eloMap = new Map((eloUsers || []).map((e) => [e.user_id, e.rating]));
  const result = (users || [])
    .map((u) => ({ ...u, rating: eloMap.get(u.id) || 0 }))
    .sort((a, b) => b.rating - a.rating);

  res.json(result);
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

  // Calculate daily ELO gains for last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: recentRecords } = await supabase
    .from('puzzle_records')
    .select('stars, completed_at')
    .eq('user_id', userId)
    .gte('completed_at', sevenDaysAgo);

  const { data: recentChSent } = await supabase
    .from('challenges')
    .select('winner, completed_at')
    .eq('challenger_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo);

  const { data: recentChRecv } = await supabase
    .from('challenges')
    .select('winner, completed_at')
    .eq('opponent_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo);

  const eloGainMap: Record<number, number> = { 3: 25, 2: 15, 1: 5 };
  const dailyElo: { date: string; elo: number }[] = [];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    let dayElo = 0;

    (recentRecords || []).forEach((r) => {
      if (r.completed_at?.startsWith(dateStr)) dayElo += eloGainMap[r.stars] || 5;
    });
    (recentChSent || []).forEach((c) => {
      if (c.completed_at?.startsWith(dateStr)) {
        if (c.winner === 'challenger') dayElo += 20;
        else if (c.winner === 'opponent') dayElo -= 10;
        else dayElo += 5;
      }
    });
    (recentChRecv || []).forEach((c) => {
      if (c.completed_at?.startsWith(dateStr)) {
        if (c.winner === 'opponent') dayElo += 20;
        else if (c.winner === 'challenger') dayElo -= 10;
        else dayElo += 5;
      }
    });

    dailyElo.push({ date: dateStr, elo: dayElo });
  }

  const totalEloChange = dailyElo.reduce((s, d) => s + d.elo, 0);

  res.json({
    ...user,
    elo: elo || { rating: 0, wins: 0, losses: 0 },
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
    dailyElo,
    totalEloChange,
  });
});

// Upload avatar
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req: AuthRequest, res) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: 'Avatar image is required' });

  const ext = file.originalname.split('.').pop() || 'jpg';
  const fileName = `avatars/${req.userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('puzzle-images')
    .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: urlData } = supabase.storage.from('puzzle-images').getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', req.userId!);

  if (updateError) return res.status(500).json({ error: updateError.message });
  res.json({ avatar_url: urlData.publicUrl });
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

  // Delete auth user (use isolated auth client)
  const { error: authErr } = await supabaseAuth.auth.admin.deleteUser(userId);
  if (authErr) return res.status(500).json({ error: authErr.message });

  res.json({ message: 'Account deleted successfully' });
});

export default router;
