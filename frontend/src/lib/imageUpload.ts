/**
 * imageUpload.ts — Client-side image compression + upload utility.
 *
 * Reusable across solo play, saved games, multiplayer, and gallery.
 * Compresses images to max 1800px on the long side at 82% JPEG quality
 * before uploading, keeping storage and bandwidth minimal.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface UploadResult {
  upload_id: string | null;
  image_url: string;
}

/**
 * Compress a data URL to JPEG at the given max dimension and quality.
 * Returns a Blob ready for upload.
 */
export async function compressImage(
  dataUrl: string,
  maxDimension = 1800,
  quality = 0.82,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxDimension / Math.max(w, h));
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

      ctx.drawImage(img, 0, 0, dw, dh);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Image compression failed'));
          resolve(blob);
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = dataUrl;
  });
}

/**
 * Upload an image (data URL or Blob) to /api/images.
 *
 * - If `src` is already an https:// URL, returns it unchanged (no upload needed).
 * - Compresses before uploading if `src` is a data URL.
 * - Never throws — on failure returns null so callers can fall back gracefully.
 */
export async function uploadImage(
  src: string,
  token: string,
  context: 'solo' | 'save' | 'multiplayer' | 'gallery' | 'profile' = 'solo',
  fileName = 'image.jpg',
): Promise<UploadResult | null> {
  // Already a remote URL — nothing to do
  if (src.startsWith('https://') || src.startsWith('http://')) {
    return { upload_id: null, image_url: src };
  }

  try {
    const blob = await compressImage(src);
    const formData = new FormData();
    formData.append('image', blob, fileName);

    const res = await fetch(`${API_URL}/api/images?context=${context}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[imageUpload] Upload failed:', err.error || res.status);
      return null;
    }

    return (await res.json()) as UploadResult;
  } catch (err) {
    console.warn('[imageUpload] Upload error (non-fatal):', err);
    return null;
  }
}

/**
 * Claim an upload — call after successfully saving a record or saved_game.
 * Non-throwing: failure here is not user-visible.
 */
export async function claimUpload(uploadId: string, token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/images/claim/${uploadId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Abandon an upload — call when user navigates away before completing.
 * Non-throwing: best-effort cleanup.
 */
export async function abandonUpload(uploadId: string, token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/images/${uploadId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Non-fatal
  }
}
