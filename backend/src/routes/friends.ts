import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get my friends list (accepted + pending)
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  // Friends where I'm the requester
  const { data: sent } = await supabase
    .from('friends')
    .select(`
      id, status, created_at,
      addressee:addressee_id ( id, username, avatar_url )
    `)
    .eq('requester_id', userId);

  // Friends where I'm the addressee
  const { data: received } = await supabase
    .from('friends')
    .select(`
      id, status, created_at,
      requester:requester_id ( id, username, avatar_url )
    `)
    .eq('addressee_id', userId);

  res.json({
    sent: sent || [],
    received: received || [],
  });
});

// Send a friend request
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const { addressee_id } = req.body;
  const userId = req.userId!;

  if (!addressee_id) return res.status(400).json({ error: 'addressee_id is required' });
  if (addressee_id === userId) return res.status(400).json({ error: 'Cannot add yourself as a friend' });

  // Check if friendship already exists in either direction
  const { data: existing } = await supabase
    .from('friends')
    .select('id, status')
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${addressee_id}),and(requester_id.eq.${addressee_id},addressee_id.eq.${userId})`)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'Friend request already exists', existing: existing[0] });
  }

  const { data, error } = await supabase
    .from('friends')
    .insert({ requester_id: userId, addressee_id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Accept or decline a friend request
router.patch('/:friendshipId', requireAuth, async (req: AuthRequest, res) => {
  const { friendshipId } = req.params;
  const { status } = req.body;

  if (!status || !['accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be "accepted" or "declined"' });
  }

  const { data, error } = await supabase
    .from('friends')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .eq('addressee_id', req.userId!)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Friendship not found or not addressed to you' });
  res.json(data);
});

// Remove a friend (unfriend / cancel request)
router.delete('/:friendshipId', requireAuth, async (req: AuthRequest, res) => {
  const { friendshipId } = req.params;
  const userId = req.userId!;

  const { error } = await supabase
    .from('friends')
    .delete()
    .eq('id', friendshipId)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Friendship removed' });
});

// Get recent activity from friends (puzzle completions & challenge results)
router.get('/activity', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  // Get accepted friend IDs
  const { data: sentFriends } = await supabase
    .from('friends')
    .select('addressee_id')
    .eq('requester_id', userId)
    .eq('status', 'accepted');

  const { data: recvFriends } = await supabase
    .from('friends')
    .select('requester_id')
    .eq('addressee_id', userId)
    .eq('status', 'accepted');

  const friendIds = [
    ...(sentFriends || []).map((f) => f.addressee_id),
    ...(recvFriends || []).map((f) => f.requester_id),
  ];

  if (friendIds.length === 0) return res.json([]);

  // Get recent puzzle records from friends (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: friendRecords } = await supabase
    .from('puzzle_records')
    .select('id, user_id, image_reference, piece_count, completion_time_sec, stars, completed_at')
    .in('user_id', friendIds)
    .gte('completed_at', sevenDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(20);

  // Get recent challenge completions involving friends
  const { data: friendChallenges } = await supabase
    .from('challenges')
    .select('id, challenger_id, opponent_id, winner, puzzle_title, completed_at')
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(20);

  // Get usernames for friend IDs
  const { data: friendUsers } = await supabase
    .from('users')
    .select('id, username')
    .in('id', friendIds);

  const userMap: Record<string, string> = {};
  (friendUsers || []).forEach((u) => { userMap[u.id] = u.username; });

  const activities: { id: string; username: string; type: string; description: string; time: string }[] = [];

  // Puzzle completions
  (friendRecords || []).forEach((r) => {
    const username = userMap[r.user_id];
    if (!username) return;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const mins = Math.floor(r.completion_time_sec / 60);
    const secs = r.completion_time_sec % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    activities.push({
      id: `rec-${r.id}`,
      username,
      type: 'puzzle',
      description: `completed ${r.image_reference || 'a puzzle'} (${r.piece_count} pcs) in ${timeStr} ${stars}`,
      time: r.completed_at,
    });
  });

  // Challenge results (only those involving friends)
  (friendChallenges || []).forEach((c) => {
    const challIsF = friendIds.includes(c.challenger_id);
    const oppIsF = friendIds.includes(c.opponent_id);
    if (!challIsF && !oppIsF) return;

    const friendId = challIsF ? c.challenger_id : c.opponent_id;
    const username = userMap[friendId];
    if (!username) return;

    let desc = '';
    if (c.winner === 'challenger' && challIsF) desc = `won a challenge on ${c.puzzle_title || 'a puzzle'}`;
    else if (c.winner === 'opponent' && oppIsF) desc = `won a challenge on ${c.puzzle_title || 'a puzzle'}`;
    else if (c.winner === 'tie') desc = `tied a challenge on ${c.puzzle_title || 'a puzzle'}`;
    else desc = `lost a challenge on ${c.puzzle_title || 'a puzzle'}`;

    activities.push({
      id: `ch-${c.id}-${friendId}`,
      username,
      type: 'challenge',
      description: desc,
      time: c.completed_at,
    });
  });

  // Sort by time descending, limit to 10
  activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  res.json(activities.slice(0, 10));
});

export default router;
