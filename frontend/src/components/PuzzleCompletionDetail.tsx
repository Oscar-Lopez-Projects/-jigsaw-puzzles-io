import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { getGrid, generatePieces } from '../utils/puzzleUtils';
import './PuzzleCompletionDetail.css';

interface CompletionRecord {
  id: string;
  puzzle_id: string | null;
  piece_count: number;
  difficulty: string;
  completion_time_sec: number;
  stars: number;
  image_reference: string | null;
  image_url: string | null;
  completed_at: string;
}

interface PuzzleCompletionDetailProps {
  record: CompletionRecord;
  onBack: () => void;
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Composite all puzzle pieces onto one canvas at their solved positions.
 * Uses the exact same piece images from generatePieces — identical to what
 * the user saw during the game.
 *
 * Each piece canvas is (pieceW + 2*tabSize) × (pieceH + 2*tabSize) and its
 * correctX/Y already accounts for the tab offset, so we just draw each piece
 * at (correctX, correctY) on the composite canvas.
 */
async function buildCompletedCanvas(
  imageUrl: string,
  cols: number,
  rows: number,
): Promise<HTMLCanvasElement> {
  const pieces = await generatePieces(imageUrl, cols, rows);

  if (pieces.length === 0) throw new Error('No pieces generated');

  // The composite canvas size = the full image without tab overflow.
  // correctX of the last column's piece + pieceWidth (not canvasW) = imgW.
  // Easiest: load the image and use its natural size, then scale for display.
  const firstPiece  = pieces[0];
  const pw = firstPiece.pieceWidth;   // canvas width including tabs
  const ph = firstPiece.pieceHeight;  // canvas height including tabs

  // The tab offset is baked into correctX/Y (they are negative for col=0, row=0).
  // minX / minY tell us the top-left of the entire assembled puzzle in "world" coords.
  const minX = Math.min(...pieces.map((p) => p.correctX));
  const minY = Math.min(...pieces.map((p) => p.correctY));
  const maxX = Math.max(...pieces.map((p) => p.correctX + pw));
  const maxY = Math.max(...pieces.map((p) => p.correctY + ph));

  const totalW = maxX - minX;
  const totalH = maxY - minY;

  // Scale to fit screen
  const maxW = Math.min(960, window.innerWidth - 80);
  const maxH = Math.min(720, window.innerHeight - 260);
  const scale = Math.min(maxW / totalW, maxH / totalH, 1);

  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(totalW * scale);
  canvas.height = Math.round(totalH * scale);

  const ctx = canvas.getContext('2d')!;

  // Dark background matching the game board
  ctx.fillStyle = '#2f2d3e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw each piece at its correct position
  for (const piece of pieces) {
    const img = new Image();
    img.src = piece.imageUrl;
    // imageUrl is a data URL — already loaded synchronously by generatePieces
    const dx = Math.round((piece.correctX - minX) * scale);
    const dy = Math.round((piece.correctY - minY) * scale);
    const dw = Math.round(pw * scale);
    const dh = Math.round(ph * scale);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Green piece-outline highlight overlay — draw on top of composited image
  // Use the same tab proportion as generatePieces (18% of min side)
  const tabSize = Math.min(pw, ph) * 0.18 * scale;
  const cellW = (totalW / cols) * scale;
  const cellH = (totalH / rows) * scale;

  for (const piece of pieces) {
    const cx = Math.round((piece.correctX - minX) * scale) + tabSize;
    const cy = Math.round((piece.correctY - minY) * scale) + tabSize;

    ctx.save();
    // Clip to the piece canvas bounds so highlights don't bleed outside
    ctx.beginPath();
    ctx.rect(
      Math.round((piece.correctX - minX) * scale),
      Math.round((piece.correctY - minY) * scale),
      Math.round(pw * scale),
      Math.round(ph * scale),
    );
    ctx.clip();

    // Outer glow
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(cx, cy, cellW, cellH);

    // Sharp line
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, cellW, cellH);

    ctx.restore();
  }

  return canvas;
}

export default function PuzzleCompletionDetail({ record, onBack }: PuzzleCompletionDetailProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const builtCanvas   = useRef<HTMLCanvasElement | null>(null); // for download
  const [imageUrl, setImageUrl]       = useState<string | null>(record.image_url || null);
  const [puzzleTitle, setPuzzleTitle] = useState<string>(record.image_reference || 'Puzzle');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { cols, rows } = getGrid(record.piece_count as Parameters<typeof getGrid>[0]) ??
    { cols: Math.round(Math.sqrt(record.piece_count * 1.5)), rows: Math.round(Math.sqrt(record.piece_count / 1.5)) };

  // Fetch community puzzle image URL if not stored on the record
  useEffect(() => {
    if (imageUrl) { setLoading(false); return; }
    if (!record.puzzle_id) { setLoading(false); return; }

    apiFetch<{ image_url: string; title: string }>(`/api/puzzles/${record.puzzle_id}`)
      .then((data) => { setImageUrl(data.image_url); setPuzzleTitle(data.title); })
      .catch(() => setError('Could not load puzzle image.'))
      .finally(() => setLoading(false));
  }, [record.puzzle_id, imageUrl]);

  // Once we have the image URL, run generatePieces to get the exact piece shapes
  // and composite them onto the canvas.
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    buildCompletedCanvas(imageUrl, cols, rows)
      .then((built) => {
        if (cancelled || !canvasRef.current) return;
        builtCanvas.current = built;

        // Copy the built canvas onto the displayed canvas
        const display = canvasRef.current;
        display.width  = built.width;
        display.height = built.height;
        display.getContext('2d')!.drawImage(built, 0, 0);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not render puzzle.');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [imageUrl, cols, rows]);

  // Download the full-resolution completed puzzle as a PNG
  const handleDownload = useCallback(() => {
    if (!builtCanvas.current) return;
    setDownloading(true);
    try {
      const link = document.createElement('a');
      link.download = `${puzzleTitle.replace(/[^a-z0-9]/gi, '_')}_completed.png`;
      link.href = builtCanvas.current.toDataURL('image/png');
      link.click();
    } finally {
      setDownloading(false);
    }
  }, [puzzleTitle]);

  const stars = record.stars;

  return (
    <div className="pcd-page">
      {/* Header */}
      <div className="pcd-header">
        <button type="button" className="pcd-back-btn" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Dashboard
        </button>
        <div className="pcd-title-row">
          <h1 className="pcd-title">{puzzleTitle}</h1>
          <span className="pcd-completed-badge">✓ Completed</span>
        </div>
        <div className="pcd-meta-row">
          <span className="pcd-meta-pill">{record.piece_count} pieces</span>
          <span className="pcd-meta-pill">{record.difficulty}</span>
          <span className="pcd-meta-pill">⏱ {formatTime(record.completion_time_sec)}</span>
          <span className="pcd-meta-pill pcd-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span>
          <span className="pcd-meta-pill pcd-date">{formatDate(record.completed_at)}</span>
          {/* Download button — only show when canvas is ready */}
          {!loading && !error && imageUrl && (
            <button
              type="button"
              className="pcd-download-btn"
              onClick={handleDownload}
              disabled={downloading}
              title="Download completed puzzle as PNG"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div className="pcd-canvas-wrap">
        {loading && (
          <div className="pcd-loading">
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <span>Rendering puzzle…</span>
          </div>
        )}
        {error && <div className="pcd-error">{error}</div>}
        {!loading && !error && !imageUrl && (
          <div className="pcd-no-image">
            <span className="pcd-no-image-icon">🖼️</span>
            <p>Image not available for solo puzzles uploaded from your device.</p>
            <p>Future solo plays will show the completed image here.</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="pcd-canvas"
          style={{ display: loading || error || !imageUrl ? 'none' : 'block' }}
        />
      </div>
    </div>
  );
}
