/**
 * Image dimension requirements for puzzle generation.
 * Ensures pieces are large enough to be recognizable at all grid sizes.
 */
export const MIN_LONG_SIDE = 800;
export const MIN_SHORT_SIDE = 600;
export const MAX_FILE_SIZE_MB = 10;

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Validates that an image meets minimum dimension requirements.
 * Rule: min(width, height) >= 600 AND max(width, height) >= 800
 */
export function validateImageDimensions(dims: ImageDimensions): { valid: boolean; error?: string } {
  const shortSide = Math.min(dims.width, dims.height);
  const longSide = Math.max(dims.width, dims.height);

  if (longSide < MIN_LONG_SIDE || shortSide < MIN_SHORT_SIDE) {
    return {
      valid: false,
      error: `Image is too small (${dims.width}×${dims.height}). Minimum size is ${MIN_LONG_SIDE}×${MIN_SHORT_SIDE}px (or ${MIN_SHORT_SIDE}×${MIN_LONG_SIDE}px for portrait).`,
    };
  }

  return { valid: true };
}

/**
 * Loads an image from a data URL or object URL and returns its natural dimensions.
 */
export function getImageDimensions(src: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image for dimension check'));
    img.src = src;
  });
}
