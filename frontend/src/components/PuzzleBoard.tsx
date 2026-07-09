import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Text, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { playSnapSound, playWrongSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── layout constants ─────────────────────────────────────────
const SNAP_THRESHOLD  = 0.5;
const PANEL_GAP       = 6;
const BOARD_VH_TARGET = 0.60;
const WRONG_FLASH_MS  = 600;

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

// ─── PieceTile ────────────────────────────────────────────────
interface PieceTileProps {
  piece: PuzzlePiece;
  x: number;
  y: number;
  flashRed?: boolean;
  flashGreen?: boolean;
  onDragEnd: (id: string, wx: number, wy: number) => void;
}

function DraggablePieceTile({ piece, x, y, flashRed, flashGreen, onDragEnd }: PieceTileProps) {
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
      {/* Red flash on wrong drop */}
      {flashRed && (
        <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
          fill="rgba(220,38,38,0.55)"
          stroke="rgba(220,38,38,0.95)" strokeWidth={3}
          listening={false} />
      )}
      {/* Green hint glow on piece */}
      {flashGreen && (
        <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
          fill="rgba(34,197,94,0.35)"
          stroke="rgba(34,197,94,1)" strokeWidth={3}
          listening={false} />
      )}
      {/* Green highlight when correctly snapped */}
      {piece.snapped && (
        <>
          <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
            fill="rgba(34,197,94,0.25)" listening={false} />
          <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
            stroke="rgba(34,197,94,0.90)" strokeWidth={2} fill="transparent" listening={false} />
        </>
      )}
    </Group>
  );
}

// ─── SlotGrid ──────────────────────────────────────────────────
function SlotGrid({ cols, rows, pieceW, pieceH, ox, oy }: {
  cols: number; rows: number; pieceW: number; pieceH: number; ox: number; oy: number;
}) {
  const lines: React.ReactNode[] = [];
  for (let c = 1; c < cols; c++)
    lines.push(<Line key={`v${c}`}
      points={[ox + c * pieceW, oy, ox + c * pieceW, oy + rows * pieceH]}
      stroke="rgba(255,255,255,0.07)" strokeWidth={1} listening={false} />);
  for (let r = 1; r < rows; r++)
    lines.push(<Line key={`h${r}`}
      points={[ox, oy + r * pieceH, ox + cols * pieceW, oy + r * pieceH]}
      stroke="rgba(255,255,255,0.07)" strokeWidth={1} listening={false} />);
  return <>{lines}</>;
}

// ─── panel slot position helper ────────────────────────────────
function panelSlotPos(
  idx: number, panelOriginX: number, panelOriginY: number,
  panelW: number, pw: number, ph: number, gap: number
): { x: number; y: number } {
  const colW = pw + gap;
  const cols = Math.max(1, Math.floor((panelW + gap) / colW));
  return {
    x: panelOriginX + (idx % cols) * colW + gap,
    y: panelOriginY + Math.floor(idx / cols) * (ph + gap) + gap,
  };
}

// ─── how many slots fit in a panel ────────────────────────────
function panelCapacity(panelW: number, panelH: number, pw: number, ph: number, gap: number): number {
  const cols = Math.max(1, Math.floor((panelW + gap) / (pw + gap)));
  const rows = Math.max(1, Math.floor((panelH + gap) / (ph + gap)));
  return cols * rows;
}

// ─── HTML Tray Piece ───────────────────────────────────────────
interface TrayPieceProps {
  piece: PuzzlePiece;
  isNew: boolean;
  isHinted: boolean;
  onMoveToStaging: (id: string) => void;
}

function TrayPiece({ piece, isNew, isHinted, onMoveToStaging }: TrayPieceProps) {
  return (
    <div
      className={`tray-piece${isNew ? ' tray-piece--new' : ''}${isHinted ? ' tray-piece--hint' : ''}`}
      style={{ width: piece.pieceWidth, height: piece.pieceHeight, flexShrink: 0 }}
      onClick={() => onMoveToStaging(piece.id)}
      title="Click or drag to move back to staging area"
    >
      <img
        src={piece.imageUrl}
        alt={`Piece ${piece.id}`}
        style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
        draggable={false}
      />
    </div>
  );
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
  const wrapRef    = useRef<HTMLDivElement>(null);
  const trayRef    = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [viewportH,  setViewportH]  = useState(window.innerHeight);
  const [boardFlash, setBoardFlash] = useState(false);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  // track which tray piece was most recently added so we can animate it
  const [newestTrayId, setNewestTrayId] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fn = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const pw = pieces[0]?.pieceWidth  ?? 0;
  const ph = pieces[0]?.pieceHeight ?? 0;
  const boardW = cols * pw;
  const boardH = rows * ph;
  const ready  = pieces.length > 0 && containerW > 0 && pw > 0 && ph > 0;

  const scaleByH  = ready ? (viewportH * BOARD_VH_TARGET) / boardH : 1;
  const scaleByW  = ready ? containerW / boardW : 1;
  const scale     = Math.min(scaleByH, scaleByW);
  const safeScale = isFinite(scale) && scale > 0 ? scale : 1;

  const worldW       = ready ? containerW / safeScale : containerW;
  const boardOriginX = ready ? Math.max(0, (worldW - boardW) / 2) : 0;
  const boardOriginY = 0;
  const rightPanelX  = boardOriginX + boardW;
  const leftPanelW   = boardOriginX;
  const rightPanelW  = Math.max(0, worldW - rightPanelX);
  const worldH       = boardH;
  const stageH       = worldH * safeScale;

  const unsnapped  = pieces.filter((p) => !p.snapped);
  const snapped    = pieces.filter((p) =>  p.snapped);
  const trayPieces = unsnapped.filter((p) => p.zone === 'tray');
  const hintPiece  = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      // Check snap
      const pCX  = wx + pw / 2;
      const pCY  = wy + ph / 2;
      const sCX  = boardOriginX + piece.correctX + pw / 2;
      const sCY  = boardOriginY + piece.correctY + ph / 2;
      const dist = Math.hypot(pCX - sCX, pCY - sCY);

      if (dist <= pw * SNAP_THRESHOLD) {
        playSnapSound();
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, currentX: boardOriginX + piece.correctX, currentY: boardOriginY + piece.correctY, snapped: true, zone: 'free' as const }
            : p
        ));
        return;
      }

      // Dropped inside the board area but wrong slot — flash red on piece, send to tray
      const droppedOnBoard =
        wx >= boardOriginX && wx < boardOriginX + boardW &&
        wy >= boardOriginY && wy < boardOriginY + boardH;

      if (droppedOnBoard) {
        playWrongSound();
        // Flash the board red
        setBoardFlash(true);
        setTimeout(() => setBoardFlash(false), WRONG_FLASH_MS);

        // Flash the piece red (keep it visible at drop position briefly)
        setFlashingId(id);
        // After flash, move piece to tray
        setTimeout(() => {
          setFlashingId(null);
          setNewestTrayId(id);
          onPiecesChange(pieces.map((p) =>
            p.id === id
              ? { ...p, zone: 'tray' as const, slotIndex: trayPieces.length, currentX: wx, currentY: wy }
              : p
          ));
          // Scroll tray to the end so user sees the new piece
          setTimeout(() => {
            if (trayRef.current) {
              trayRef.current.scrollLeft = trayRef.current.scrollWidth;
            }
          }, 50);
          setTimeout(() => setNewestTrayId(null), 800);
        }, WRONG_FLASH_MS);
        return;
      }

      // Other zones — staging panels or free
      const inLeft  = leftPanelW > 0 && wx < boardOriginX && wy < worldH;
      const inRight = rightPanelW > 0 && wx >= rightPanelX && wy < worldH;

      if (inLeft) {
        const leftCap   = panelCapacity(leftPanelW, boardH, pw, ph, PANEL_GAP);
        const leftOccupied = pieces.filter((p) => p.id !== id && p.zone === 'left' && !p.snapped);
        if (leftOccupied.length >= leftCap) {
          // Panel full — send to tray
          setNewestTrayId(id);
          onPiecesChange(pieces.map((p) =>
            p.id === id ? { ...p, zone: 'tray' as const, slotIndex: trayPieces.length } : p
          ));
          setTimeout(() => {
            if (trayRef.current) trayRef.current.scrollLeft = trayRef.current.scrollWidth;
          }, 50);
          setTimeout(() => setNewestTrayId(null), 800);
          return;
        }
        const colW  = pw + PANEL_GAP;
        const pCols = Math.max(1, Math.floor((leftPanelW + PANEL_GAP) / colW));
        const col   = Math.max(0, Math.min(pCols - 1, Math.floor((wx - PANEL_GAP) / colW)));
        const row   = Math.max(0, Math.floor((wy - PANEL_GAP) / (ph + PANEL_GAP)));
        const targetSlot = row * pCols + col;
        // If slot already occupied, find next free slot
        const usedSlots = new Set(leftOccupied.map((p) => p.slotIndex));
        let finalSlot = targetSlot;
        if (usedSlots.has(targetSlot)) {
          for (let s = 0; s < leftCap; s++) {
            if (!usedSlots.has(s)) { finalSlot = s; break; }
          }
        }
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'left' as const, slotIndex: finalSlot } : p
        ));
      } else if (inRight) {
        const rightCap     = panelCapacity(rightPanelW, boardH, pw, ph, PANEL_GAP);
        const rightOccupied = pieces.filter((p) => p.id !== id && p.zone === 'right' && !p.snapped);
        if (rightOccupied.length >= rightCap) {
          // Panel full — send to tray
          setNewestTrayId(id);
          onPiecesChange(pieces.map((p) =>
            p.id === id ? { ...p, zone: 'tray' as const, slotIndex: trayPieces.length } : p
          ));
          setTimeout(() => {
            if (trayRef.current) trayRef.current.scrollLeft = trayRef.current.scrollWidth;
          }, 50);
          setTimeout(() => setNewestTrayId(null), 800);
          return;
        }
        const colW  = pw + PANEL_GAP;
        const pCols = Math.max(1, Math.floor((rightPanelW + PANEL_GAP) / colW));
        const col   = Math.max(0, Math.min(pCols - 1, Math.floor((wx - rightPanelX - PANEL_GAP) / colW)));
        const row   = Math.max(0, Math.floor((wy - PANEL_GAP) / (ph + PANEL_GAP)));
        const targetSlot = row * pCols + col;
        const usedSlots  = new Set(rightOccupied.map((p) => p.slotIndex));
        let finalSlot = targetSlot;
        if (usedSlots.has(targetSlot)) {
          for (let s = 0; s < rightCap; s++) {
            if (!usedSlots.has(s)) { finalSlot = s; break; }
          }
        }
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'right' as const, slotIndex: finalSlot } : p
        ));
      } else {
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'free' as const, currentX: wx, currentY: wy } : p
        ));
      }
    },
    [pieces, pw, ph, boardOriginX, boardOriginY, boardW, boardH, leftPanelW, rightPanelX, rightPanelW, worldH, trayPieces.length, onPiecesChange]
  );

  // When a tray piece is dragged via HTML drag, move it to staging if space available
  const handleTrayDragStart = useCallback((id: string) => {
    const leftOccupied = pieces.filter((p) => p.id !== id && p.zone === 'left' && !p.snapped);
    const leftCap = panelCapacity(leftPanelW, boardH, pw, ph, PANEL_GAP);

    if (leftPanelW > 0 && leftOccupied.length < leftCap) {
      // Find first free slot in left panel
      const usedSlots = new Set(leftOccupied.map((p) => p.slotIndex));
      let freeSlot = 0;
      for (let s = 0; s < leftCap; s++) {
        if (!usedSlots.has(s)) { freeSlot = s; break; }
      }
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, zone: 'left' as const, slotIndex: freeSlot } : p
      ));
      return;
    }

    // Left panel full — try right panel
    const rightOccupied = pieces.filter((p) => p.id !== id && p.zone === 'right' && !p.snapped);
    const rightCap = panelCapacity(rightPanelW, boardH, pw, ph, PANEL_GAP);

    if (rightPanelW > 0 && rightOccupied.length < rightCap) {
      const usedSlots = new Set(rightOccupied.map((p) => p.slotIndex));
      let freeSlot = 0;
      for (let s = 0; s < rightCap; s++) {
        if (!usedSlots.has(s)) { freeSlot = s; break; }
      }
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, zone: 'right' as const, slotIndex: freeSlot } : p
      ));
      return;
    }

    // Both panels full — keep in tray (do nothing)
  }, [pieces, onPiecesChange, leftPanelW, rightPanelW, boardH, pw, ph]);

  function getPiecePos(p: PuzzlePiece): { x: number; y: number } {
    switch (p.zone) {
      case 'left':  return panelSlotPos(p.slotIndex, 0, boardOriginY, leftPanelW, pw, ph, PANEL_GAP);
      case 'right': return panelSlotPos(p.slotIndex, rightPanelX, boardOriginY, rightPanelW, pw, ph, PANEL_GAP);
      default:      return { x: p.currentX, y: p.currentY };
    }
  }

  // Tray scroll buttons
  const scrollTray = (dir: 'left' | 'right') => {
    if (!trayRef.current) return;
    trayRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  if (!ready) {
    return <div className="puzzle-single-stage" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div className="puzzle-board-wrap" ref={wrapRef}>
      {/* ── Konva stage (board + staging panels only) ── */}
      <div className="puzzle-single-stage">
        <Stage width={containerW} height={stageH} scaleX={safeScale} scaleY={safeScale}>

          {/* Backgrounds */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={worldW} height={worldH} fill="#131120" />

            {leftPanelW > 0 && (
              <>
                <Rect x={0} y={0} width={leftPanelW} height={boardH} fill="#1e1b2e" />
                <Line points={[leftPanelW - 1, 0, leftPanelW - 1, boardH]}
                  stroke="rgba(255,255,255,0.10)" strokeWidth={1} dash={[6,6]} listening={false} />
                {leftPanelW > pw * 1.5 && (
                  <Text x={0} y={boardH - 22} width={leftPanelW} text="◀ staging area"
                    fontSize={10} fontStyle="bold" fill="rgba(255,255,255,0.20)"
                    align="center" listening={false} />
                )}
              </>
            )}

            {rightPanelW > 0 && (
              <>
                <Rect x={rightPanelX} y={0} width={rightPanelW} height={boardH} fill="#1e1b2e" />
                <Line points={[rightPanelX + 1, 0, rightPanelX + 1, boardH]}
                  stroke="rgba(255,255,255,0.10)" strokeWidth={1} dash={[6,6]} listening={false} />
                {rightPanelW > pw * 1.5 && (
                  <Text x={rightPanelX} y={boardH - 22} width={rightPanelW} text="staging area ▶"
                    fontSize={10} fontStyle="bold" fill="rgba(255,255,255,0.20)"
                    align="center" listening={false} />
                )}
              </>
            )}

            {/* Board background */}
            <Rect x={boardOriginX} y={boardOriginY} width={boardW} height={boardH}
              fill={boardFlash ? 'rgba(220,38,38,0.45)' : '#2a2740'} />
            <SlotGrid cols={cols} rows={rows} pieceW={pw} pieceH={ph} ox={boardOriginX} oy={boardOriginY} />
          </Layer>

          {/* Snapped pieces */}
          <Layer>
            {snapped.map((piece) => (
              <DraggablePieceTile key={piece.id} piece={piece}
                x={boardOriginX + piece.correctX} y={boardOriginY + piece.correctY}
                onDragEnd={handleDragEnd} />
            ))}
          </Layer>

          {/* Hint slot highlight — green pulse on the target board cell */}
          {hintPiece && (
            <Layer listening={false}>
              <Rect
                x={boardOriginX + hintPiece.correctX}
                y={boardOriginY + hintPiece.correctY}
                width={pw} height={ph}
                fill="rgba(34,197,94,0.22)"
                stroke="rgba(34,197,94,1)"
                strokeWidth={3}
                listening={false}
              />
            </Layer>
          )}

          {/* Unsnapped pieces (staging panels + free, NOT tray) */}
          <Layer>
            {unsnapped.filter((p) => p.zone !== 'tray').map((piece) => {
              const { x, y } = getPiecePos(piece);
              return (
                <DraggablePieceTile
                  key={piece.id}
                  piece={piece}
                  x={x} y={y}
                  flashRed={flashingId === piece.id}
                  flashGreen={hintPieceId === piece.id}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
          </Layer>

          {/* Flashing piece — stays visible on board during red flash before moving to tray */}
          {flashingId && (() => {
            const fp = pieces.find((p) => p.id === flashingId);
            if (!fp) return null;
            return (
              <Layer>
                <DraggablePieceTile
                  piece={fp}
                  x={fp.currentX} y={fp.currentY}
                  flashRed={true}
                  onDragEnd={handleDragEnd}
                />
              </Layer>
            );
          })()}

        </Stage>
      </div>

      {/* ── Piece Tray (HTML, horizontally scrollable) ── */}
      <div className="piece-tray-section">
        <div className="piece-tray-header">
          <span className="piece-tray-label">
            PIECE TRAY
            {trayPieces.length > 0 && (
              <span className="piece-tray-count">{trayPieces.length}</span>
            )}
          </span>
          <span className="piece-tray-hint">
            {trayPieces.length === 0
              ? 'Wrong placements will appear here'
              : 'Drag a piece back to the staging area or board'}
          </span>
        </div>

        <div className="piece-tray-row">
          {trayPieces.length > 0 && (
            <button
              className="tray-scroll-btn tray-scroll-btn--left"
              onClick={() => scrollTray('left')}
              aria-label="Scroll tray left"
            >
              ‹
            </button>
          )}

          <div
            className={`piece-tray-track${trayPieces.length === 0 ? ' piece-tray-track--empty' : ''}`}
            ref={trayRef}
          >
            {trayPieces.length === 0 ? (
              <span className="piece-tray-empty-msg">No pieces here yet</span>
            ) : (
              trayPieces.map((piece) => (
                <TrayPiece
                  key={piece.id}
                  piece={piece}
                  isNew={piece.id === newestTrayId}
                  isHinted={piece.id === hintPieceId}
                  onMoveToStaging={handleTrayDragStart}
                />
              ))
            )}
          </div>

          {trayPieces.length > 0 && (
            <button
              className="tray-scroll-btn tray-scroll-btn--right"
              onClick={() => scrollTray('right')}
              aria-label="Scroll tray right"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
