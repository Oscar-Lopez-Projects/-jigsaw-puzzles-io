import type { PuzzlePiece, GridDimensions } from '../types/puzzle';

// ── Grid sizing ───────────────────────────────────────────────

export function getGrid(pieceCount: 10 | 25 | 50 | 100 | 150 | 300): GridDimensions {
  const presets: Record<number, GridDimensions> = {
    10:  { cols: 5,  rows: 2  },
    25:  { cols: 5,  rows: 5  },
    50:  { cols: 10, rows: 5  },
    100: { cols: 10, rows: 10 },
    150: { cols: 15, rows: 10 },
    300: { cols: 20, rows: 15 },
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

// ── Jigsaw edge types ─────────────────────────────────────────
// 0 = flat (border edge), 1 = tab (protruding outward), -1 = blank (indented)

interface PieceEdges {
  top: 0 | 1 | -1;
  right: 0 | 1 | -1;
  bottom: 0 | 1 | -1;
  left: 0 | 1 | -1;
}

/**
 * Generate the edge map for the entire grid.
 * Each internal edge is randomly a tab or blank; adjacent pieces get the opposite.
 */
function generateEdgeMap(cols: number, rows: number): PieceEdges[][] {
  // Horizontal edges (between rows): [row][col] — there are (rows-1) rows of horizontal edges
  const hEdges: (1 | -1)[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    hEdges.push([]);
    for (let c = 0; c < cols; c++) {
      hEdges[r].push(Math.random() > 0.5 ? 1 : -1);
    }
  }

  // Vertical edges (between cols): [row][col] — there are (cols-1) columns of vertical edges
  const vEdges: (1 | -1)[][] = [];
  for (let r = 0; r < rows; r++) {
    vEdges.push([]);
    for (let c = 0; c < cols - 1; c++) {
      vEdges[r].push(Math.random() > 0.5 ? 1 : -1);
    }
  }

  const map: PieceEdges[][] = [];
  for (let r = 0; r < rows; r++) {
    map.push([]);
    for (let c = 0; c < cols; c++) {
      map[r].push({
        top:    r === 0 ? 0 : (-hEdges[r - 1][c] as 1 | -1),
        bottom: r === rows - 1 ? 0 : hEdges[r][c],
        left:   c === 0 ? 0 : (-vEdges[r][c - 1] as 1 | -1),
        right:  c === cols - 1 ? 0 : vEdges[r][c],
      });
    }
  }

  return map;
}

/**
 * Draw the full jigsaw outline path for a piece.
 * The piece canvas is (pieceW + 2*tabSize) × (pieceH + 2*tabSize).
 * The "body" of the piece sits at offset (tabSize, tabSize) within the canvas.
 */
function drawJigsawPath(
  ctx: CanvasRenderingContext2D,
  pieceW: number,
  pieceH: number,
  tabSize: number,
  edges: PieceEdges
) {
  const ox = tabSize; // offset X (to account for left tab space)
  const oy = tabSize; // offset Y (to account for top tab space)

  ctx.beginPath();
  ctx.moveTo(ox, oy);

  // Top edge (left to right)
  drawEdgePath(ctx, ox, oy, pieceW, tabSize, edges.top, 'top');

  // Right edge (top to bottom)
  drawEdgePath(ctx, ox + pieceW, oy, pieceH, tabSize, edges.right, 'right');

  // Bottom edge (right to left)
  drawEdgePath(ctx, ox + pieceW, oy + pieceH, pieceW, tabSize, edges.bottom, 'bottom');

  // Left edge (bottom to top)
  drawEdgePath(ctx, ox, oy + pieceH, pieceH, tabSize, edges.left, 'left');

  ctx.closePath();
}

/**
 * Draw one edge of the jigsaw piece using bezier curves.
 * direction: 0=flat, 1=tab outward, -1=blank inward
 */
function drawEdgePath(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  length: number,
  tabSize: number,
  direction: 0 | 1 | -1,
  side: 'top' | 'right' | 'bottom' | 'left'
) {
  if (direction === 0) {
    // Flat: straight line to the end
    switch (side) {
      case 'top':    ctx.lineTo(startX + length, startY); break;
      case 'right':  ctx.lineTo(startX, startY + length); break;
      case 'bottom': ctx.lineTo(startX - length, startY); break;
      case 'left':   ctx.lineTo(startX, startY - length); break;
    }
    return;
  }

  // Tab/blank: draw with bezier curves
  const d = direction; // 1 = outward, -1 = inward
  const tabH = tabSize * 0.8; // how far the tab protrudes

  switch (side) {
    case 'top': {
      // Moving left → right along the top
      const segLen = length;
      ctx.lineTo(startX + segLen * 0.35, startY);
      ctx.bezierCurveTo(
        startX + segLen * 0.35, startY - d * tabH * 0.1,
        startX + segLen * 0.38, startY - d * tabH * 0.8,
        startX + segLen * 0.44, startY - d * tabH
      );
      ctx.bezierCurveTo(
        startX + segLen * 0.50, startY - d * tabH * 1.1,
        startX + segLen * 0.56, startY - d * tabH * 1.1,
        startX + segLen * 0.56, startY - d * tabH
      );
      ctx.bezierCurveTo(
        startX + segLen * 0.62, startY - d * tabH * 0.8,
        startX + segLen * 0.65, startY - d * tabH * 0.1,
        startX + segLen * 0.65, startY
      );
      ctx.lineTo(startX + segLen, startY);
      break;
    }
    case 'right': {
      // Moving top → bottom along the right
      const segLen = length;
      ctx.lineTo(startX, startY + segLen * 0.35);
      ctx.bezierCurveTo(
        startX + d * tabH * 0.1, startY + segLen * 0.35,
        startX + d * tabH * 0.8, startY + segLen * 0.38,
        startX + d * tabH, startY + segLen * 0.44
      );
      ctx.bezierCurveTo(
        startX + d * tabH * 1.1, startY + segLen * 0.50,
        startX + d * tabH * 1.1, startY + segLen * 0.56,
        startX + d * tabH, startY + segLen * 0.56
      );
      ctx.bezierCurveTo(
        startX + d * tabH * 0.8, startY + segLen * 0.62,
        startX + d * tabH * 0.1, startY + segLen * 0.65,
        startX, startY + segLen * 0.65
      );
      ctx.lineTo(startX, startY + segLen);
      break;
    }
    case 'bottom': {
      // Moving right → left along the bottom
      const segLen = length;
      ctx.lineTo(startX - segLen * 0.35, startY);
      ctx.bezierCurveTo(
        startX - segLen * 0.35, startY + d * tabH * 0.1,
        startX - segLen * 0.38, startY + d * tabH * 0.8,
        startX - segLen * 0.44, startY + d * tabH
      );
      ctx.bezierCurveTo(
        startX - segLen * 0.50, startY + d * tabH * 1.1,
        startX - segLen * 0.56, startY + d * tabH * 1.1,
        startX - segLen * 0.56, startY + d * tabH
      );
      ctx.bezierCurveTo(
        startX - segLen * 0.62, startY + d * tabH * 0.8,
        startX - segLen * 0.65, startY + d * tabH * 0.1,
        startX - segLen * 0.65, startY
      );
      ctx.lineTo(startX - segLen, startY);
      break;
    }
    case 'left': {
      // Moving bottom → top along the left
      const segLen = length;
      ctx.lineTo(startX, startY - segLen * 0.35);
      ctx.bezierCurveTo(
        startX - d * tabH * 0.1, startY - segLen * 0.35,
        startX - d * tabH * 0.8, startY - segLen * 0.38,
        startX - d * tabH, startY - segLen * 0.44
      );
      ctx.bezierCurveTo(
        startX - d * tabH * 1.1, startY - segLen * 0.50,
        startX - d * tabH * 1.1, startY - segLen * 0.56,
        startX - d * tabH, startY - segLen * 0.56
      );
      ctx.bezierCurveTo(
        startX - d * tabH * 0.8, startY - segLen * 0.62,
        startX - d * tabH * 0.1, startY - segLen * 0.65,
        startX, startY - segLen * 0.65
      );
      ctx.lineTo(startX, startY - segLen);
      break;
    }
  }
}

// ── Canvas-based jigsaw image slicer ─────────────────────────

/**
 * Slices the image into jigsaw-shaped pieces with interlocking tabs and blanks.
 * Each piece canvas is larger than the grid cell to accommodate protruding tabs.
 */
export function generatePieces(
  imageDataUrl: string,
  cols: number,
  rows: number
): Promise<PuzzlePiece[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
        const tabSize = Math.floor(Math.min(pieceW, pieceH) * 0.18); // tab protrusion size (kept small)

        // Generate random edge map
        const edgeMap = generateEdgeMap(cols, rows);

        // The piece canvas includes extra space for tabs on all sides
        const canvasW = pieceW + tabSize * 2;
        const canvasH = pieceH + tabSize * 2;

        const base: Omit<PuzzlePiece, 'currentX' | 'currentY' | 'snapped' | 'zone' | 'slotIndex'>[] = [];

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const canvas = document.createElement('canvas');
            canvas.width  = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get 2D context');

            const edges = edgeMap[row][col];

            // Draw the jigsaw clip path
            drawJigsawPath(ctx, pieceW, pieceH, tabSize, edges);
            ctx.clip();

            // Draw the image portion — offset to account for tab space
            // Source: the area of the image for this cell, expanded by tabSize on each side
            const srcX = col * pieceW - tabSize;
            const srcY = row * pieceH - tabSize;
            ctx.drawImage(img, srcX, srcY, canvasW, canvasH, 0, 0, canvasW, canvasH);

            // Draw a subtle border along the jigsaw path for visibility
            drawJigsawPath(ctx, pieceW, pieceH, tabSize, edges);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            base.push({
              id: `${col}-${row}`,
              imageUrl: canvas.toDataURL('image/png'),
              pieceWidth:  canvasW,
              pieceHeight: canvasH,
              correctCol: col,
              correctRow: row,
              // correctX/Y accounts for the tab offset — the piece's top-left
              // on the board is shifted by -tabSize from the grid cell
              correctX: col * pieceW - tabSize,
              correctY: row * pieceH - tabSize,
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
  const shuffled = shuffle(pieces.map((p) => ({ ...p, snapped: false, groupId: null })));
  const half     = Math.ceil(shuffled.length / 2);
  return shuffled.map((p, i) => ({
    ...p,
    zone:      i < half ? 'left' : 'right',
    slotIndex: i < half ? i : i - half,
    currentX:  0,
    currentY:  0,
  }));
}
