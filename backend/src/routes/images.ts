/**
 * /api/images — Generic image upload endpoint.
 *
 * Designed to be reusable across:
 *   - Solo puzzle play  (context: 'solo')
 *   - Saved games       (context: 'save')
 *   - Multiplayer       (context: 'multiplayer')  ← future
 *   - User gallery      (context: 'gallery')      ← future
 *   - Profile photos    (context: 'profile')      ← future
 *
 * The caller specifies a `context` query param. The file is stored at
 *   uploads/<context>/<userId>/<timestamp>-<random>.<ext>
 * inside the existing `puzzle-images` bucket.
 *
 * A row is inserted into `pending_uploads` so orphaned files
 * (abandoned puzzles) can be cleaned up later.
 *
 * Call POST /api/images/claim/:uploadId  once the image has been
 * permanently saved (in a record or saved_game) to mark it claimed.
 */

import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../supabaseClient.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Accept up to 20 MB — the client should already compress, but be lenient
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const ALLOWED_CONTEXTS = ['solo', 'save', 'multiplayer', 'gallery', 'profile'] as const;
type UploadContext = (typeof ALLOWED_CONTEXTS)[number];

// ── POST /api/images?context=solo ────────────────────────────
// Authenticated upload. Returns { upload_id, image_url }.
router.post('/', requireAuth, upload.single('image'), async (req: AuthRequest, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'image file is required' });

  const context = (req.query.context as string) || 'solo';
  if (!ALLOWED_CONTEXTS.includes(context as UploadContext)) {
    return res.status(400).json({ error: `context must be one of: ${ALLOWED_CONTEXTS.join(', ')}` });
  }

  // Determine file extension — default to jpg (client sends JPEG after compression)
  const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';

  const storagePath = `uploads/${context}/${req.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

  // Upload to Supabase Storage (puzzle-images bucket, same as everything else)
  const { error: uploadError } = await supabase.storage
    .from('puzzle-images')
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
  }

  const { data: urlData } = supabase.storage.from('puzzle-images').getPublicUrl(storagePath);
  const imageUrl = urlData.publicUrl;

  // Record as pending — will be claimed once a record/save is created
  const { data: uploadRow, error: dbError } = await supabase
    .from('pending_uploads')
    .insert({
      user_id:      req.userId,
      storage_path: storagePath,
      image_url:    imageUrl,
      status:       'pending',
    })
    .select('id')
    .single();

  if (dbError) {
    // Non-fatal: the file is uploaded, we just can't track it.
    console.warn('[images] Failed to record pending upload:', dbError.message);
  }

  res.status(201).json({
    upload_id: uploadRow?.id ?? null,
    image_url: imageUrl,
  });
});

// ── POST /api/images/claim/:uploadId ─────────────────────────
// Mark an upload as claimed (linked to a record or saved_game).
// Called after successfully creating the record/save.
router.post('/claim/:uploadId', requireAuth, async (req: AuthRequest, res) => {
  const { uploadId } = req.params;

  const { error } = await supabase
    .from('pending_uploads')
    .update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', uploadId)
    .eq('user_id', req.userId!); // ownership check

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── DELETE /api/images/:uploadId ─────────────────────────────
// Explicitly abandon an upload (user navigates away / starts new puzzle).
// Deletes from storage and marks as deleted in the DB.
router.delete('/:uploadId', requireAuth, async (req: AuthRequest, res) => {
  const { uploadId } = req.params;

  // Fetch the row first to get the storage path and verify ownership
  const { data: row, error: fetchErr } = await supabase
    .from('pending_uploads')
    .select('storage_path, status')
    .eq('id', uploadId)
    .eq('user_id', req.userId!)
    .single();

  if (fetchErr || !row) return res.status(404).json({ error: 'Upload not found' });
  // Don't delete claimed uploads — they are referenced by records
  if (row.status === 'claimed') return res.status(409).json({ error: 'Cannot delete a claimed upload' });

  // Remove from storage
  await supabase.storage.from('puzzle-images').remove([row.storage_path]);

  // Mark as deleted
  await supabase.from('pending_uploads').update({ status: 'deleted' }).eq('id', uploadId);

  res.json({ success: true });
});

export default router;
