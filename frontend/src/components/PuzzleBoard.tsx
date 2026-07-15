import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { usePuzzleLayout } from '../context/PuzzleLayoutContext';
import { playSnapSound, playWrongSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── layout constants ─────────────────────────────────────────
const SNAP_THRESHOLD  = 0.5;
const BOARD_VH_TARGET = 0.62;
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

// ─── PieceTile (Konva draggable) ──────────────────────────────
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
      {flashRed && (
        <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
          fill="rgba(220,38,38,0.55)"
          stroke="rgba(220,38,38,0.95)" strokeWidth={3}
          listening={false} />
      )}
      {flashGreen && (
        <Rect x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight}
          fill="rgba(34,197,94,0.35)"
          stroke="rgba(34,197,94,1)" strokeWidth={3}
          listening={false} />
      )}
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

// ─── HTML Staging Piece ────────────────────────────────────────
interface StagingPieceProps {
  piece: PuzzlePiece;
  isHinted: boolean;
  onSendToBoard: (id: string) => void;
  onSendToTray: (id: string) => void;
}

function StagingPiece({ piece, isHinted, onSendToBoard, onSendToTray }: StagingPieceProps) {
  return (
    <div
      className={`staging-piece${isHinted ? ' staging-piece--hint' : ''}`}
      style={{ width: piece.pieceWidth, height: piece.pieceHeight }}
      onClick={() => onSendToBoard(piece.id)}
      onContextMenu={(e) => { e.preventDefault(); onSendToTray(piece.id); }}
      title="Click to place on board · Right-click to send to tray"
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
      title="Click to move to staging area"
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
  const { prefs } = usePuzzleLayout();
  const boardRef   = useRef<HTMLDivElement>(null);
  const trayRef    = useRef<HTMLDivElement>(null);
  const [boardContainerW, setBoardContainerW] = useState(0);
  const [viewportH, setViewportH] = useState(window.innerHeight);
  const [boardFlash, setBoardFlash] = useState(false);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const [newestTrayId, setNewestTrayId] = useState<string | null>(null);

  // Observe board panel width
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoardContainerW(el.clientWidth));
    ro.observe(el);
    setBoardContainerW(el.clientWidth);
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
  const ready  = pieces.length > 0 && boardContainerW > 0 && pw > 0 && ph > 0;

  // Scale board to fit its container
  const scaleByH  = ready ? (viewportH * BOARD_VH_TARGET) / boardH : 1;
  const scaleByW  = ready ? boardContainerW / boardW : 1;
  const scale     = Math.min(scaleByH, scaleByW);
  const safeScale = isFinite(scale) && scale > 0 ? scale : 1;
  const stageW    = boardW * safeScale;
  const stageH    = boardH * safeScale;

  // Piece categories
  const snapped    = pieces.filter((p) => p.snapped);
  const staging    = pieces.filter((p) => !p.snapped && (p.zone === 'left' || p.zone === 'right' || p.zone === 'free'));
  const trayPieces = pieces.filter((p) => !p.snapped && p.zone === 'tray');
  const hintPiece  = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  // ── Board drag-end handler (only handles snap or wrong) ──────
  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      // Check snap (correct position)
      const pCX  = wx + pw / 2;
      const pCY  = wy + ph / 2;
      const sCX  = piece.correctX + pw / 2;
      const sCY  = piece.correctY + ph / 2;
      const dist = Math.hypot(pCX - sCX, pCY - sCY);

      if (dist <= pw * SNAP_THRESHOLD) {
        playSnapSound();
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, currentX: piece.correctX, currentY: piece.correctY, snapped: true, zone: 'free' as const }
            : p
        ));
        return;
      }

      // Wrong placement — flash red, then send to tray
      playWrongSound();
      setBoardFlash(true);
      setTimeout(() => setBoardFlash(false), WRONG_FLASH_MS);

      setFlashingId(id);
      setTimeout(() => {
        setFlashingId(null);
        setNewestTrayId(id);
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, zone: 'tray' as const, slotIndex: trayPieces.length, currentX: wx, currentY: wy }
            : p
        ));
        setTimeout(() => {
          if (trayRef.current) trayRef.current.scrollLeft = trayRef.current.scrollWidth;
        }, 50);
        setTimeout(() => setNewestTrayId(null), 800);
      }, WRONG_FLASH_MS);
    },
    [pieces, pw, ph, trayPieces.length, onPiecesChange]
  );

  // ── Move staging piece to board (place as free piece at random position near center) ──
  const handleSendToBoard = useCallback((id: string) => {
    // Place piece at a random position on the board so user can drag to correct spot
    const randX = Math.random() * Math.max(0, boardW - pw);
    const randY = Math.random() * Math.max(0, boardH - ph);
    onPiecesChange(pieces.map((p) =>
      p.id === id ? { ...p, zone: 'free' as const, currentX: randX, currentY: randY } : p
    ));
  }, [pieces, onPiecesChange, boardW, boardH, pw, ph]);

  // ── Move piece to tray ──
  const handleSendToTray = useCallback((id: string) => {
    const currentTrayCount = pieces.filter((p) => p.zone === 'tray' && !p.snapped && p.id !== id).length;
    setNewestTrayId(id);
    onPiecesChange(pieces.map((p) =>
      p.id === id ? { ...p, zone: 'tray' as const, slotIndex: currentTrayCount } : p
    ));
    setTimeout(() => {
      if (trayRef.current) trayRef.current.scrollLeft = trayRef.current.scrollWidth;
    }, 50);
    setTimeout(() => setNewestTrayId(null), 800);
  }, [pieces, onPiecesChange]);

  // ── Move tray piece to staging ──
  const handleTrayToStaging = useCallback((id: string) => {
    onPiecesChange(pieces.map((p) =>
      p.id === id ? { ...p, zone: 'left' as const, slotIndex: 0 } : p
    ));
  }, [pieces, onPiecesChange]);

  // Tray scroll
  const scrollTray = (dir: 'left' | 'right') => {
    if (!trayRef.current) return;
    trayRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  if (!ready) {
    return <div className="puzzle-board-wrap" ref={boardRef} style={{ minHeight: 200 }} />;
  }

  // Determine panel order based on layout preference
  const boardPanel = (
    <div className="pb-board-panel" ref={boardRef}>
      <div className="puzzle-single-stage" style={{ width: stageW, height: stageH }}>
        <Stage width={stageW} height={stageH} scaleX={safeScale} scaleY={safeScale}>
          {/* Board background */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={boardW} height={boardH}
              fill={boardFlash ? 'rgba(220,38,38,0.45)' : '#2a2740'} />
            <SlotGrid cols={cols} rows={rows} pieceW={pw} pieceH={ph} ox={0} oy={0} />
          </Layer>

          {/* Snapped pieces */}
          <Layer>
            {snapped.map((piece) => (
              <DraggablePieceTile key={piece.id} piece={piece}
                x={piece.correctX} y={piece.correctY}
                onDragEnd={handleDragEnd} />
            ))}
          </Layer>

          {/* Hint slot highlight */}
          {hintPiece && (
            <Layer listening={false}>
              <Rect
                x={hintPiece.correctX}
                y={hintPiece.correctY}
                width={pw} height={ph}
                fill="rgba(34,197,94,0.22)"
                stroke="rgba(34,197,94,1)"
                strokeWidth={3}
                listening={false}
              />
            </Layer>
          )}

          {/* Free pieces on board (draggable) */}
          <Layer>
            {pieces.filter((p) => !p.snapped && p.zone === 'free').map((piece) => (
              <DraggablePieceTile
                key={piece.id}
                piece={piece}
                x={piece.currentX} y={piece.currentY}
                flashRed={flashingId === piece.id}
                flashGreen={hintPieceId === piece.id}
                onDragEnd={handleDragEnd}
              />
            ))}
          </Layer>

          {/* Flashing piece during wrong animation */}
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
    </div>
  );

  const stagingPanel = (
    <div className="pb-staging-panel">
      <div className="pb-staging-header">
        <span className="pb-staging-title">STAGING AREA</span>
        <span className="pb-staging-subtitle">Drag pieces here to organize and build sections</span>
      </div>
      <div className="pb-staging-grid">
        {staging.length === 0 ? (
          <div className="pb-staging-empty">
            <span>Click pieces from the tray to move them here</span>
          </div>
        ) : (
          staging.map((piece) => (
            <StagingPiece
              key={piece.id}
              piece={piece}
              isHinted={piece.id === hintPieceId}
              onSendToBoard={handleSendToBoard}
              onSendToTray={handleSendToTray}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="puzzle-board-wrap">
      {/* Two-panel layout: board + staging */}
      <div className={`pb-layout${prefs.boardPosition === 'right' ? ' pb-layout--reversed' : ''}`}>
        {boardPanel}
        {stagingPanel}
      </div>

      {/* ── Piece Tray (HTML, horizontally scrollable) ── */}
      <div className="piece-tray-section">
        <div className="piece-tray-header">
          <span className="piece-tray-label">PIECE TRAY</span>
          <div className="piece-tray-remaining">
            <span className="piece-tray-remaining-label">Remaining</span>
            <span className="piece-tray-remaining-num">{trayPieces.length}</span>
          </div>
          <button type="button" className="piece-tray-sort-btn" disabled>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Sort
          </button>
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
                  onMoveToStaging={handleTrayToStaging}
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
