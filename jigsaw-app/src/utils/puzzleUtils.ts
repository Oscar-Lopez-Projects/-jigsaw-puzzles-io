import type { PuzzlePiece, GridDimensions } from '../types/puzzle';

// ── Grid sizing ───────────────────────────────────────────────

export function getGrid(pieceCount: 25 | 50 | 100 | 150): GridDimensions {
  const presets: Record<number, GridDimensions> = {
    25:  { cols: 5,  rows: 5  },
    50:  { cols: 10, rows: 5  },
    100: { cols: 10, rows: 10 },
    150: { cols: 15, rows: 10 },
  };
  return presets[pieceCount];
}

// ── Fisher-Yates shuffle ──────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Canvas-based image slicer ────────────────────────────────

/**
 * Slices the image into cols×rows tiles.
 * After shuffling, splits pieces evenly: first half → left panel,
 * second half → right panel. Each gets a slotIndex within its panel.
 */
export function generatePieces(
  imageDataUrl: string,
  cols: number,
  rows: number
): Promise<PuzzlePiece[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        if (imgW === 0 || imgH === 0) {
          reject(new Error('Image dimensions are too small to generate pieces.'));
          return;
        }

        const pieceW = Math.floor(imgW / cols);
        const pieceH = Math.floor(imgH / rows);

        const base: Omit<PuzzlePiece, 'currentX' | 'currentY' | 'snapped' | 'zone' | 'slotIndex'>[] = [];

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const canvas = document.createElement('canvas');
            canvas.width  = pieceW;
            canvas.height = pieceH;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get 2D context');
            ctx.drawImage(img, col * pieceW, row * pieceH, pieceW, pieceH, 0, 0, pieceW, pieceH);

            base.push({
              id: `${col}-${row}`,
              imageUrl: canvas.toDataURL('image/jpeg', 0.92),
              pieceWidth:  pieceW,
              pieceHeight: pieceH,
              correctCol: col,
              correctRow: row,
              correctX: col * pieceW,
              correctY: row * pieceH,
            });
          }
        }

        const shuffled = shuffle(base);
        const half     = Math.ceil(shuffled.length / 2);

        const finalPieces: PuzzlePiece[] = shuffled.map((piece, i) => ({
          ...piece,
          currentX:   0,
          currentY:   0,
          snapped:    false,
          zone:       i < half ? 'left' : 'right',
          slotIndex:  i < half ? i : i - half,
        }));

        resolve(finalPieces);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load the image for slicing.'));
    img.src = imageDataUrl;
  });
}

// ── Reshuffle existing pieces ─────────────────────────────────

/**
 * Un-snaps all pieces and redistributes them evenly between
 * left and right panels.
 */
export function reshufflePieces(pieces: PuzzlePiece[]): PuzzlePiece[] {
  const shuffled = shuffle(pieces.map((p) => ({ ...p, snapped: false })));
  const half     = Math.ceil(shuffled.length / 2);
  return shuffled.map((p, i) => ({
    ...p,
    zone:      i < half ? 'left' : 'right',
    slotIndex: i < half ? i : i - half,
    currentX:  0,
    currentY:  0,
  }));
}
