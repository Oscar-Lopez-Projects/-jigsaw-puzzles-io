import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get my challenges (sent + received)
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const { data: sent, error: sentErr } = await supabase
    .from('challenges')
    .select(`
      *,
      opponent:opponent_id ( id, username, avatar_url )
    `)
    .eq('challenger_id', userId)
    .order('created_at', { ascending: false });

  const { data: received, error: recvErr } = await supabase
    .from('challenges')
    .select(`
      *,
      challenger:challenger_id ( id, username, avatar_url )
    `)
    .eq('opponent_id', userId)
    .order('created_at', { ascending: false });

  if (sentErr || recvErr) {
    return res.status(500).json({ error: sentErr?.message || recvErr?.message });
  }

  res.json({ sent: sent || [], received: received || [] });
});

// Create a challenge (after completing a puzzle)
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const {
    opponent_id,
    image_url,
    puzzle_title,
    piece_count,
    difficulty,
    challenger_time_sec,
    challenger_stars,
  } = req.body;

  if (!opponent_id || !image_url || !puzzle_title || !piece_count || !difficulty || !challenger_time_sec || !challenger_stars) {
    return res.status(400).json({ error: 'All fields are required: opponent_id, image_url, puzzle_title, piece_count, difficulty, challenger_time_sec, challenger_stars' });
  }

  // Verify they are friends
  const { data: friendship } = await supabase
    .from('friends')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester_id.eq.${req.userId},addressee_id.eq.${opponent_id}),and(requester_id.eq.${opponent_id},addressee_id.eq.${req.userId})`)
    .limit(1);

  if (!friendship || friendship.length === 0) {
    return res.status(403).json({ error: 'You can only challenge accepted friends' });
  }

  const { data, error } = await supabase
    .from('challenges')
    .insert({
      challenger_id: req.userId,
      opponent_id,
      image_url,
      puzzle_title,
      piece_count,
      difficulty,
      challenger_time_sec,
      challenger_stars,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Submit opponent's result (complete the challenge)
router.patch('/:challengeId', requireAuth, async (req: AuthRequest, res) => {
  const { challengeId } = req.params;
  const { opponent_time_sec } = req.body;

  if (!opponent_time_sec || typeof opponent_time_sec !== 'number' || opponent_time_sec <= 0) {
    return res.status(400).json({ error: 'opponent_time_sec must be a positive number' });
  }

  // Get the challenge
  const { data: challenge, error: fetchErr } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .eq('opponent_id', req.userId!)
    .eq('status', 'pending')
    .single();

  if (fetchErr || !challenge) {
    return res.status(404).json({ error: 'Challenge not found or already completed' });
  }

  // Calculate opponent stars server-side
  const expectedTime = challenge.piece_count * 3;
  let opponent_stars: number;
  if (opponent_time_sec <= expectedTime) opponent_stars = 3;
  else if (opponent_time_sec <= expectedTime * 2) opponent_stars = 2;
  else opponent_stars = 1;

  // Determine winner — faster time wins; if same time, more stars wins; if still tie, it's a tie
  let winner: string;
  if (opponent_time_sec < challenge.challenger_time_sec) {
    winner = 'opponent';
  } else if (opponent_time_sec > challenge.challenger_time_sec) {
    winner = 'challenger';
  } else {
    // Same time — compare stars
    if (opponent_stars > challenge.challenger_stars) winner = 'opponent';
    else if (opponent_stars < challenge.challenger_stars) winner = 'challenger';
    else winner = 'tie';
  }

  const { data, error } = await supabase
    .from('challenges')
    .update({
      opponent_time_sec,
      opponent_stars,
      winner,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', challengeId)
    .select(`
      *,
      challenger:challenger_id ( id, username, avatar_url ),
      opponent:opponent_id ( id, username, avatar_url )
    `)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Update ELO for both players
  const eloGain = { winner: 20, loser: -10, tie: 5 };
  if (winner === 'opponent') {
    await updateEloForChallenge(req.userId!, eloGain.winner, true);
    await updateEloForChallenge(challenge.challenger_id, eloGain.loser, false);
  } else if (winner === 'challenger') {
    await updateEloForChallenge(challenge.challenger_id, eloGain.winner, true);
    await updateEloForChallenge(req.userId!, eloGain.loser, false);
  } else {
    await updateEloForChallenge(req.userId!, eloGain.tie, false);
    await updateEloForChallenge(challenge.challenger_id, eloGain.tie, false);
  }

  res.json(data);
});

// Decline a challenge
router.patch('/:challengeId/decline', requireAuth, async (req: AuthRequest, res) => {
  const { challengeId } = req.params;

  const { data, error } = await supabase
    .from('challenges')
    .update({ status: 'declined' })
    .eq('id', challengeId)
    .eq('opponent_id', req.userId!)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Challenge not found' });
  res.json(data);
});

// Helper: update ELO for challenge results
async function updateEloForChallenge(userId: string, change: number, isWin: boolean) {
  const { data: current } = await supabase
    .from('elo_ratings')
    .select('rating, wins, losses')
    .eq('user_id', userId)
    .single();

  if (!current) return;

  const newRating = Math.max(0, current.rating + change);
  await supabase.from('elo_ratings').update({
    rating: newRating,
    wins: isWin ? current.wins + 1 : current.wins,
    losses: !isWin && change < 0 ? current.losses + 1 : current.losses,
    last_match_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}

// Get a single challenge with full details
router.get('/:challengeId/details', async (req, res) => {
  const { challengeId } = req.params;

  const { data: challenge, error } = await supabase
    .from('challenges')
    .select(`
      *,
      challenger:challenger_id ( id, username, avatar_url ),
      opponent:opponent_id ( id, username, avatar_url )
    `)
    .eq('id', challengeId)
    .single();

  if (error || !challenge) return res.status(404).json({ error: 'Challenge not found' });

  // Get comments
  const { data: comments } = await supabase
    .from('challenge_comments')
    .select(`
      id, content, created_at,
      user:user_id ( id, username, avatar_url )
    `)
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true });

  // Get likes count
  const { count: likesCount } = await supabase
    .from('challenge_likes')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId);

  res.json({ ...challenge, comments: comments || [], likes_count: likesCount || 0 });
});

// Post a comment on a challenge
router.post('/:challengeId/comments', requireAuth, async (req: AuthRequest, res) => {
  const { challengeId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content is required' });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or less' });
  }

  const { data, error } = await supabase
    .from('challenge_comments')
    .insert({ challenge_id: challengeId, user_id: req.userId, content: content.trim() })
    .select(`
      id, content, created_at,
      user:user_id ( id, username, avatar_url )
    `)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Like/unlike a challenge (toggle)
router.post('/:challengeId/like', requireAuth, async (req: AuthRequest, res) => {
  const { challengeId } = req.params;

  // Check if already liked
  const { data: existing } = await supabase
    .from('challenge_likes')
    .select('id')
    .eq('challenge_id', challengeId)
    .eq('user_id', req.userId!)
    .single();

  if (existing) {
    // Unlike
    await supabase.from('challenge_likes').delete().eq('id', existing.id);
    res.json({ liked: false });
  } else {
    // Like
    await supabase.from('challenge_likes').insert({ challenge_id: challengeId, user_id: req.userId });
    res.json({ liked: true });
  }
});

// Check if user liked a challenge
router.get('/:challengeId/liked', requireAuth, async (req: AuthRequest, res) => {
  const { challengeId } = req.params;

  const { data } = await supabase
    .from('challenge_likes')
    .select('id')
    .eq('challenge_id', challengeId)
    .eq('user_id', req.userId!)
    .single();

  res.json({ liked: !!data });
});

export default router;
