/**
 * imageUpload.ts — Client-side image compression + upload utility.
 *
 * Reusable across solo play, saved games, multiplayer, and gallery.
 * Compresses images to max 1800px on the long side at 82% JPEG quality
 * before uploading, keeping storage and bandwidth minimal.
 *
 * Race-condition safe: callers share a single Promise for a given upload
 * session. See UploadTask below.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface UploadResult {
  upload_id: string | null;
  image_url: string;
}

/**
 * UploadTask wraps a single in-flight upload Promise.
 *
 * Start an upload once with startUpload(). Then:
 *  - Call resolve() from the win/save handler to get the result (awaits if
 *    still in flight — guaranteed no second upload).
 *  - Call abandon() to wait for completion and delete the upload.
 *  - Call cancel() immediately (e.g. on unmount) to mark it abandoned so
 *    that the in-flight Promise's .then() disposes the result instead of
 *    writing it to refs.
 *
 * All methods are safe to call in any order and multiple times.
 */
export class UploadTask {
  private promise: Promise<UploadResult | null>;
  private _abandoned = false;
  private _token: string;

  constructor(promise: Promise<UploadResult | null>, token: string) {
    this.promise = promise;
    this._token = token;
  }

  /** True once abandon() or cancel() has been called. */
  get abandoned() { return this._abandoned; }

  /**
   * Await the upload result.
   * Returns null if the upload failed or the task was abandoned.
   * Safe to call multiple times — always returns the same Promise.
   */
  async resolve(): Promise<UploadResult | null> {
    if (this._abandoned) return null;
    return this.promise;
  }

  /**
   * Wait for the upload to finish, then delete it from storage.
   * Call this when the user abandons the puzzle.
   * Non-throwing.
   */
  async abandon(): Promise<void> {
    this._abandoned = true;
    try {
      const result = await this.promise;
      if (result?.upload_id) {
        await abandonUpload(result.upload_id, this._token);
      }
    } catch {
      // Non-fatal — the pending_uploads cleanup job will catch orphans
    }
  }

  /**
   * Synchronously mark as abandoned without waiting.
   * Use on component unmount where you can't await.
   * The in-flight .then() will check _abandoned and delete if needed.
   */
  cancel(): void {
    this._abandoned = true;
    // Wire up a detached cleanup — don't await, fire-and-forget
    this.promise.then((result) => {
      if (result?.upload_id) {
        abandonUpload(result.upload_id, this._token).catch(() => {});
      }
    }).catch(() => {});
  }
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
 * Start an image upload and return an UploadTask.
 *
 * - If `src` is already an https:// URL, resolves immediately with no upload.
 * - Compresses before uploading if `src` is a data URL.
 * - The returned UploadTask is the single shared handle for this upload session.
 *   Pass it to resolveUpload() and abandonUpload() — never start a second one.
 */
export function startUpload(
  src: string,
  token: string,
  context: 'solo' | 'save' | 'multiplayer' | 'gallery' | 'profile' = 'solo',
  fileName = 'image.jpg',
): UploadTask {
  // Already a remote URL — nothing to upload
  if (src.startsWith('https://') || src.startsWith('http://')) {
    const noop = Promise.resolve<UploadResult>({ upload_id: null, image_url: src });
    return new UploadTask(noop, token);
  }

  const promise = (async (): Promise<UploadResult | null> => {
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
  })();

  return new UploadTask(promise, token);
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
 * Abandon (delete) an upload by ID.
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
