import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Get community puzzles (public, no auth needed)
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const { data, error } = await supabase
    .from('puzzles')
    .select(`
      id,
      title,
      image_url,
      piece_count,
      plays,
      created_at,
      user_id,
      users ( username )
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Upload a community puzzle (protected, accepts multipart image)
router.post('/upload', requireAuth, upload.single('image'), async (req: AuthRequest, res) => {
  const file = req.file;
  const { title, piece_count } = req.body;

  if (!file) {
    return res.status(400).json({ error: 'Image file is required' });
  }
  if (!title || !piece_count) {
    return res.status(400).json({ error: 'title and piece_count are required' });
  }

  const pieceCountNum = parseInt(piece_count);
  if (isNaN(pieceCountNum) || pieceCountNum <= 0) {
    return res.status(400).json({ error: 'piece_count must be a positive number' });
  }

  // Generate a unique filename
  const ext = file.originalname.split('.').pop() || 'jpg';
  const fileName = `${req.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('puzzle-images')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
  }

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from('puzzle-images')
    .getPublicUrl(fileName);

  const imageUrl = urlData.publicUrl;

  // Save metadata to Postgres
  const { data, error: dbError } = await supabase
    .from('puzzles')
    .insert({
      user_id: req.userId,
      title,
      image_url: imageUrl,
      piece_count: pieceCountNum,
      is_public: true,
    })
    .select()
    .single();

  if (dbError) {
    // Attempt to clean up the uploaded file
    await supabase.storage.from('puzzle-images').remove([fileName]);
    return res.status(500).json({ error: dbError.message });
  }

  res.status(201).json(data);
});

// Increment play count when someone starts a community puzzle
router.post('/:puzzleId/play', async (req, res) => {
  const { puzzleId } = req.params;

  const { error } = await supabase.rpc('increment_plays', { puzzle_id_input: puzzleId });

  // Fallback if the RPC doesn't exist yet — just do a manual increment
  if (error) {
    const { data: puzzle } = await supabase
      .from('puzzles')
      .select('plays')
      .eq('id', puzzleId)
      .single();

    if (puzzle) {
      await supabase
        .from('puzzles')
        .update({ plays: (puzzle.plays || 0) + 1 })
        .eq('id', puzzleId);
    }
  }

  res.json({ success: true });
});

export default router;
