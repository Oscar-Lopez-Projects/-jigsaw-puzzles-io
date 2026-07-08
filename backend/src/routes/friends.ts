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

export default router;
