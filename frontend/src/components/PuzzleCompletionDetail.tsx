import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getGrid } from '../utils/puzzleUtils';
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

/** Draw the solved jigsaw grid on a canvas: the full image with glowing piece outlines. */
function drawCompletedPuzzle(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  cols: number,
  rows: number
) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  // Scale to fit within 900×700 max, maintaining aspect ratio
  const maxW = Math.min(900, window.innerWidth - 80);
  const maxH = Math.min(700, window.innerHeight - 260);
  const scale = Math.min(maxW / W, maxH / H, 1);
  const dW = Math.round(W * scale);
  const dH = Math.round(H * scale);

  canvas.width = dW;
  canvas.height = dH;

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, dW, dH);

  // Draw full image
  ctx.drawImage(img, 0, 0, dW, dH);

  // Draw a slight dark vignette over the image to make the piece lines pop
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, dW, dH);

  // Draw full image again with slight brightness so it shows through
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, 0, 0, dW, dH);
  ctx.globalAlpha = 1;

  const cellW = dW / cols;
  const cellH = dH / rows;
  const tabSize = Math.floor(Math.min(cellW, cellH) * 0.18);

  // Draw each piece outline using the same jigsaw path logic
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW;
      const y = row * cellH;

      ctx.save();
      ctx.beginPath();

      // Top edge
      const topDir = row === 0 ? 0 : (((col * rows + row) % 2 === 0) ? 1 : -1);
      // Right edge
      const rightDir = col === cols - 1 ? 0 : (((col * rows + row + 1) % 2 === 0) ? 1 : -1);
      // Bottom edge
      const bottomDir = row === rows - 1 ? 0 : (-topDir || ((col * rows + row + 2) % 2 === 0 ? 1 : -1));
      // Left edge
      const leftDir = col === 0 ? 0 : (-rightDir || ((col * rows + row + 3) % 2 === 0 ? 1 : -1));

      drawPiecePath(ctx, x, y, cellW, cellH, tabSize, topDir as 0|1|-1, rightDir as 0|1|-1, bottomDir as 0|1|-1, leftDir as 0|1|-1);

      // Glow effect: thick semi-transparent outer stroke
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Sharp inner line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    }
  }
}

function drawPiecePath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  tabSize: number,
  top: 0|1|-1, right: 0|1|-1, bottom: 0|1|-1, left: 0|1|-1
) {
  const tabH = tabSize * 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);

  // Top edge
  if (top === 0) {
    ctx.lineTo(x + w, y);
  } else {
    ctx.lineTo(x + w * 0.35, y);
    ctx.bezierCurveTo(x + w*0.35, y - top*tabH*0.1, x + w*0.38, y - top*tabH*0.8, x + w*0.44, y - top*tabH);
    ctx.bezierCurveTo(x + w*0.50, y - top*tabH*1.1, x + w*0.56, y - top*tabH*1.1, x + w*0.56, y - top*tabH);
    ctx.bezierCurveTo(x + w*0.62, y - top*tabH*0.8, x + w*0.65, y - top*tabH*0.1, x + w*0.65, y);
    ctx.lineTo(x + w, y);
  }

  // Right edge
  if (right === 0) {
    ctx.lineTo(x + w, y + h);
  } else {
    ctx.lineTo(x + w, y + h*0.35);
    ctx.bezierCurveTo(x+w+right*tabH*0.1, y+h*0.35, x+w+right*tabH*0.8, y+h*0.38, x+w+right*tabH, y+h*0.44);
    ctx.bezierCurveTo(x+w+right*tabH*1.1, y+h*0.50, x+w+right*tabH*1.1, y+h*0.56, x+w+right*tabH, y+h*0.56);
    ctx.bezierCurveTo(x+w+right*tabH*0.8, y+h*0.62, x+w+right*tabH*0.1, y+h*0.65, x+w, y+h*0.65);
    ctx.lineTo(x + w, y + h);
  }

  // Bottom edge (right to left)
  if (bottom === 0) {
    ctx.lineTo(x, y + h);
  } else {
    ctx.lineTo(x + w*0.65, y + h);
    ctx.bezierCurveTo(x+w*0.65, y+h+bottom*tabH*0.1, x+w*0.62, y+h+bottom*tabH*0.8, x+w*0.56, y+h+bottom*tabH);
    ctx.bezierCurveTo(x+w*0.50, y+h+bottom*tabH*1.1, x+w*0.44, y+h+bottom*tabH*1.1, x+w*0.44, y+h+bottom*tabH);
    ctx.bezierCurveTo(x+w*0.38, y+h+bottom*tabH*0.8, x+w*0.35, y+h+bottom*tabH*0.1, x+w*0.35, y+h);
    ctx.lineTo(x, y + h);
  }

  // Left edge (bottom to top)
  if (left === 0) {
    ctx.lineTo(x, y);
  } else {
    ctx.lineTo(x, y + h*0.65);
    ctx.bezierCurveTo(x-left*tabH*0.1, y+h*0.65, x-left*tabH*0.8, y+h*0.62, x-left*tabH, y+h*0.56);
    ctx.bezierCurveTo(x-left*tabH*1.1, y+h*0.50, x-left*tabH*1.1, y+h*0.44, x-left*tabH, y+h*0.44);
    ctx.bezierCurveTo(x-left*tabH*0.8, y+h*0.38, x-left*tabH*0.1, y+h*0.35, x, y+h*0.35);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
}

export default function PuzzleCompletionDetail({ record, onBack }: PuzzleCompletionDetailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(record.image_url || null);
  const [puzzleTitle, setPuzzleTitle] = useState<string>(record.image_reference || 'Puzzle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // If it's a community puzzle and we don't have the image URL, fetch it
  useEffect(() => {
    if (imageUrl) { setLoading(false); return; }
    if (!record.puzzle_id) { setLoading(false); return; }

    apiFetch<{ image_url: string; title: string }>(`/api/puzzles/${record.puzzle_id}`)
      .then((data) => {
        setImageUrl(data.image_url);
        setPuzzleTitle(data.title);
      })
      .catch(() => setError('Could not load puzzle image.'))
      .finally(() => setLoading(false));
  }, [record.puzzle_id, imageUrl]);

  // Draw the completed puzzle on the canvas once the image is ready
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!canvasRef.current) return;
      const { cols, rows } = getGrid(record.piece_count as Parameters<typeof getGrid>[0]) ||
        { cols: Math.round(Math.sqrt(record.piece_count * 1.5)), rows: Math.round(Math.sqrt(record.piece_count / 1.5)) };
      drawCompletedPuzzle(canvasRef.current, img, cols, rows);
    };
    img.onerror = () => setError('Could not render puzzle image.');
    img.src = imageUrl;
  }, [imageUrl, record.piece_count]);

  const stars = record.stars;

  return (
    <div className="pcd-page">
      {/* Header */}
      <div className="pcd-header">
        <button type="button" className="pcd-back-btn" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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
        </div>
      </div>

      {/* Canvas area */}
      <div className="pcd-canvas-wrap">
        {loading && (
          <div className="pcd-loading">
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <span>Loading puzzle…</span>
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
        {imageUrl && <canvas ref={canvasRef} className="pcd-canvas" />}
      </div>
    </div>
  );
}
