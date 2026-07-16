import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { playSnapSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── layout constants ─────────────────────────────────────────
const SNAP_THRESHOLD  = 0.5;
const MARGIN_RATIO    = 0.25; // extra space around target for scattered pieces

// ─── useImage hook ─────────────────────────────────────────────
function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = new window.Image();
    el.onload = () => setImg(el);
    el.src = src;
  }, [src]);
  return img;
}

// ─── PieceTile (Konva draggable) ──────────────────────────────
interface PieceTileProps {
  piece: PuzzlePiece;
  x: number;
  y: number;
  onDragEnd: (id: string, wx: number, wy: number) => void;
}

function DraggablePieceTile({ piece, x, y, onDragEnd }: PieceTileProps) {
  const img = useImage(piece.imageUrl);

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.moveToTop();
    e.target.getStage()!.container().style.cursor = 'grabbing';
  }, []);

  const handleDragEndInner = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd(piece.id, e.target.x(), e.target.y());
      e.target.getStage()!.container().style.cursor = 'default';
    },
    [piece.id, onDragEnd]
  );

  if (!img) {
    return (
      <Rect x={x} y={y}
        width={piece.pieceWidth} height={piece.pieceHeight}
        fill="rgba(0,0,0,0)" listening={false}
      />
    );
  }

  return (
    <Group
      x={x} y={y}
      draggable={!piece.snapped}
      onDragStart={!piece.snapped ? handleDragStart : undefined}
      onDragEnd={!piece.snapped ? handleDragEndInner : undefined}
      onMouseEnter={(e) => {
        if (piece.snapped) return;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        if (piece.snapped) return;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
    >
      <KonvaImage
        image={img} x={0} y={0}
        width={piece.pieceWidth} height={piece.pieceHeight}
        listening={true}
      />
      {/* Green highlight when correctly snapped */}
      {piece.snapped && (
        <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
          stroke="rgba(34,197,94,0.70)" strokeWidth={2} fill="rgba(34,197,94,0.10)" listening={false} />
      )}
    </Group>
  );
}

// ─── SlotGrid (target area grid lines) ────────────────────────
function SlotGrid({ cols, rows, pieceW, pieceH, ox, oy }: {
  cols: number; rows: number; pieceW: number; pieceH: number; ox: number; oy: number;
}) {
  const lines: React.ReactNode[] = [];
  for (let c = 0; c <= cols; c++)
    lines.push(<Line key={`v${c}`}
      points={[ox + c * pieceW, oy, ox + c * pieceW, oy + rows * pieceH]}
      stroke="rgba(255,255,255,0.12)" strokeWidth={1} listening={false} />);
  for (let r = 0; r <= rows; r++)
    lines.push(<Line key={`h${r}`}
      points={[ox, oy + r * pieceH, ox + cols * pieceW, oy + r * pieceH]}
      stroke="rgba(255,255,255,0.12)" strokeWidth={1} listening={false} />);
  return <>{lines}</>;
}

// ─── PuzzleBoard ───────────────────────────────────────────────
interface PuzzleBoardProps {
  pieces: PuzzlePiece[];
  cols: number;
  rows: number;
  onPiecesChange: (pieces: PuzzlePiece[]) => void;
  hintPieceId?: string | null;
}

export default function PuzzleBoard({ pieces, cols, rows, onPiecesChange, hintPieceId }: PuzzleBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [hasScattered, setHasScattered] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pw = pieces[0]?.pieceWidth  ?? 0;
  const ph = pieces[0]?.pieceHeight ?? 0;

  // Derive grid cell size from piece correctX positions
  const piece0 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 0);
  const piece1 = pieces.find((p) => p.correctCol === 1 && p.correctRow === 0);
  const piece0r1 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 1);
  const gridCellW = piece0 && piece1 ? piece1.correctX - piece0.correctX : pw;
  const gridCellH = piece0 && piece0r1 ? piece0r1.correctY - piece0.correctY : ph;

  // Target area (where the puzzle image goes)
  const targetW = cols * gridCellW;
  const targetH = rows * gridCellH;

  // World dimensions: target area + margins for scattered pieces
  const marginX = Math.max(pw * 2, targetW * MARGIN_RATIO);
  const marginY = Math.max(ph * 2, targetH * MARGIN_RATIO);
  const worldW = targetW + marginX * 2;
  const worldH = targetH + marginY * 2;

  // Target area origin within the world (centered)
  const targetOX = marginX;
  const targetOY = marginY;

  const ready = pieces.length > 0 && containerW > 0 && pw > 0 && ph > 0;

  // Scale: always fill the full container width; height adjusts accordingly
  const safeScale = ready ? containerW / worldW : 1;
  const stageW = containerW;
  const stageH = worldH * safeScale;

  // Scatter pieces around the margins on first render
  useEffect(() => {
    if (!ready || hasScattered || pieces.some((p) => p.snapped)) return;

    // Only scatter if all pieces are at (0,0) — initial state
    const allAtOrigin = pieces.every((p) => p.currentX === 0 && p.currentY === 0 && !p.snapped);
    if (!allAtOrigin) return;

    const scattered = pieces.map((p) => {
      // Place randomly in the margins (around the target, not on top of it)
      let x: number, y: number;
      const side = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
      switch (side) {
        case 0: // top margin
          x = Math.random() * (worldW - pw);
          y = Math.random() * (marginY - ph);
          break;
        case 1: // right margin
          x = targetOX + targetW + Math.random() * (marginX - pw);
          y = Math.random() * (worldH - ph);
          break;
        case 2: // bottom margin
          x = Math.random() * (worldW - pw);
          y = targetOY + targetH + Math.random() * (marginY - ph);
          break;
        default: // left margin
          x = Math.random() * (marginX - pw);
          y = Math.random() * (worldH - ph);
          break;
      }
      return { ...p, currentX: Math.max(0, x), currentY: Math.max(0, y), zone: 'free' as const };
    });

    setHasScattered(true);
    onPiecesChange(scattered);
  }, [ready, hasScattered, pieces, worldW, worldH, targetOX, targetOY, targetW, targetH, marginX, marginY, pw, ph, onPiecesChange]);

  // Snapped pieces + unsnapped
  const snapped = pieces.filter((p) => p.snapped);
  const unsnapped = pieces.filter((p) => !p.snapped);
  const hintPiece = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  // Drag end: check snap, otherwise leave piece where it is
  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      // Snap check: piece correct position is relative to the target area origin
      const correctWorldX = targetOX + piece.correctX;
      const correctWorldY = targetOY + piece.correctY;

      const pCX = wx + pw / 2;
      const pCY = wy + ph / 2;
      const sCX = correctWorldX + pw / 2;
      const sCY = correctWorldY + ph / 2;
      const dist = Math.hypot(pCX - sCX, pCY - sCY);

      if (dist <= gridCellW * SNAP_THRESHOLD) {
        // Correct! Snap it
        playSnapSound();
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, currentX: correctWorldX, currentY: correctWorldY, snapped: true }
            : p
        ));
      } else {
        // Leave it where the user dropped it
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, currentX: wx, currentY: wy } : p
        ));
      }
    },
    [pieces, pw, ph, gridCellW, targetOX, targetOY, onPiecesChange]
  );

  if (!ready) {
    return <div className="puzzle-board-wrap" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div className="puzzle-board-wrap" ref={wrapRef}>
      <div className="puzzle-single-stage">
        <Stage width={stageW} height={stageH} scaleX={safeScale} scaleY={safeScale}>
          {/* Background */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={worldW} height={worldH} fill="#3d3b4a" />

            {/* Target area background (slightly different shade) */}
            <Rect x={targetOX} y={targetOY} width={targetW} height={targetH}
              fill="#2a2740" />

            {/* Grid lines in target area */}
            <SlotGrid cols={cols} rows={rows} pieceW={gridCellW} pieceH={gridCellH} ox={targetOX} oy={targetOY} />

            {/* Highlighted border around target area */}
            <Rect x={targetOX} y={targetOY} width={targetW} height={targetH}
              stroke="rgba(124, 58, 237, 0.6)" strokeWidth={3}
              fill="transparent" listening={false}
              dash={[10, 5]}
            />
          </Layer>

          {/* Snapped pieces (at their correct world positions) */}
          <Layer>
            {snapped.map((piece) => (
              <DraggablePieceTile key={piece.id} piece={piece}
                x={piece.currentX} y={piece.currentY}
                onDragEnd={handleDragEnd} />
            ))}
          </Layer>

          {/* Hint highlight */}
          {hintPiece && (
            <Layer listening={false}>
              <Rect
                x={targetOX + hintPiece.correctX}
                y={targetOY + hintPiece.correctY}
                width={pw} height={ph}
                fill="rgba(34,197,94,0.22)"
                stroke="rgba(34,197,94,1)"
                strokeWidth={3}
                listening={false}
              />
            </Layer>
          )}

          {/* Unsnapped pieces — freely draggable anywhere */}
          <Layer>
            {unsnapped.map((piece) => (
              <DraggablePieceTile
                key={piece.id}
                piece={piece}
                x={piece.currentX} y={piece.currentY}
                onDragEnd={handleDragEnd}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
