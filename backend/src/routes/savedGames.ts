import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

const MAX_SAVES = 2;

// ── GET /api/saved-games ─────────────────────────────────────
// Returns all saved games for the authenticated user (max 2).
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('saved_games')
    .select('*')
    .eq('user_id', req.userId!)
    .order('saved_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── POST /api/saved-games ────────────────────────────────────
// Save (or overwrite) a game. Enforces the 2-save limit.
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const {
    image_url,
    image_filename,
    piece_count,
    grid_cols,
    grid_rows,
    elapsed_sec,
    pieces_state,
    puzzle_id,
  } = req.body;

  if (!image_url || !piece_count || !grid_cols || !grid_rows || !pieces_state) {
    return res.status(400).json({ error: 'image_url, piece_count, grid_cols, grid_rows, and pieces_state are required' });
  }

  // Check how many saves the user already has
  const { data: existing, error: countErr } = await supabase
    .from('saved_games')
    .select('id, saved_at')
    .eq('user_id', req.userId!)
    .order('saved_at', { ascending: false });

  if (countErr) return res.status(500).json({ error: countErr.message });

  if (existing && existing.length >= MAX_SAVES) {
    return res.status(409).json({
      error: `You already have ${MAX_SAVES} saved games. Please delete one before saving a new game.`,
      code: 'MAX_SAVES_REACHED',
      saves: existing,
    });
  }

  const { data, error } = await supabase
    .from('saved_games')
    .insert({
      user_id:        req.userId,
      image_url,
      image_filename: image_filename || null,
      piece_count,
      grid_cols,
      grid_rows,
      elapsed_sec:    elapsed_sec ?? 0,
      pieces_state,
      puzzle_id:      puzzle_id || null,
      saved_at:       new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ── DELETE /api/saved-games/:id ──────────────────────────────
// Delete a specific saved game (only the owner can delete).
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('saved_games')
    .delete()
    .eq('id', id)
    .eq('user_id', req.userId!); // ensures ownership

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
