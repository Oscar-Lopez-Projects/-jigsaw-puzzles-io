import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Register a new user
router.post('/register', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'email, password, and username are required' });
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm for now
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  // Create profile row in users table
  const { error: profileError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      username,
    });

  if (profileError) {
    // Rollback: delete auth user if profile creation fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  // Create initial ELO rating
  await supabase
    .from('elo_ratings')
    .insert({ user_id: authData.user.id });

  res.status(201).json({
    message: 'Account created successfully',
    user: { id: authData.user.id, email, username },
  });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('users')
    .select('id, username, email, avatar_url')
    .eq('id', data.user.id)
    .single();

  res.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
    user: profile,
  });
});

// Get current authenticated user profile
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, avatar_url, created_at')
    .eq('id', req.userId!)
    .single();

  if (error) return res.status(404).json({ error: 'User not found' });
  res.json(data);
});

// Refresh session token
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });

  if (error || !data.session) {
    return res.status(401).json({ error: error?.message || 'Failed to refresh session' });
  }

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
});

export default router;
