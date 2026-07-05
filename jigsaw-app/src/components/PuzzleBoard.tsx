import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Text, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import './PuzzleBoard.css';

// ─── layout constants ─────────────────────────────────────────
const SNAP_THRESHOLD  = 0.5;
const PANEL_GAP       = 6;
const TRAY_GAP        = 6;
const BOARD_VH_TARGET = 0.60;
const TRAY_LABEL_H    = 26;
const DIVIDER_H       = 14;
const WRONG_FLASH_MS  = 600; // how long the red board flash lasts

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

// ─── PuzzleBoard ───────────────────────────────────────────────
interface PuzzleBoardProps {
  pieces: PuzzlePiece[];
  cols: number;
  rows: number;
  onPiecesChange: (pieces: PuzzlePiece[]) => void;
}

export default function PuzzleBoard({ pieces, cols, rows, onPiecesChange }: PuzzleBoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [viewportH,  setViewportH]  = useState(window.innerHeight);
  const [boardFlash, setBoardFlash] = useState(false); // true = show red flash

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
  const trayOriginY  = boardOriginY + boardH + DIVIDER_H + TRAY_LABEL_H;
  const trayColW     = pw + TRAY_GAP;
  const trayCols     = ready ? Math.max(1, Math.floor(worldW / trayColW)) : 1;

  const unsnapped  = pieces.filter((p) => !p.snapped);
  const snapped    = pieces.filter((p) =>  p.snapped);
  const trayPieces = unsnapped.filter((p) => p.zone === 'tray');
  const trayRows   = Math.max(1, Math.ceil(trayPieces.length / trayCols));
  const trayH      = trayRows * (ph + TRAY_GAP) + TRAY_GAP;
  const worldH     = trayOriginY + trayH;
  const stageH     = worldH * safeScale;

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
        // Correct slot — snap and lock
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, currentX: boardOriginX + piece.correctX, currentY: boardOriginY + piece.correctY, snapped: true, zone: 'free' as const }
            : p
        ));
        return;
      }

      // Dropped inside the board area but wrong slot — flash red and return to left panel
      const droppedOnBoard =
        wx >= boardOriginX && wx < boardOriginX + boardW &&
        wy >= boardOriginY && wy < boardOriginY + boardH;

      if (droppedOnBoard) {
        // Flash the board red
        setBoardFlash(true);
        setTimeout(() => setBoardFlash(false), WRONG_FLASH_MS);

        // Return piece to left panel at the next available slot
        const leftPieces = pieces.filter((p) => p.id !== id && p.zone === 'left');
        const nextSlot   = leftPieces.length;
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'left' as const, slotIndex: nextSlot } : p
        ));
        return;
      }

      // Other zones — just remember where it was dropped
      const inLeft  = leftPanelW > 0 && wx < boardOriginX && wy < trayOriginY;
      const inRight = rightPanelW > 0 && wx >= rightPanelX && wy < trayOriginY;
      const inTray  = wy >= trayOriginY;

      if (inLeft) {
        const colW  = pw + PANEL_GAP;
        const pCols = Math.max(1, Math.floor((leftPanelW + PANEL_GAP) / colW));
        const col   = Math.max(0, Math.min(pCols - 1, Math.floor((wx - PANEL_GAP) / colW)));
        const row   = Math.max(0, Math.floor((wy - PANEL_GAP) / (ph + PANEL_GAP)));
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'left' as const, slotIndex: row * pCols + col } : p
        ));
      } else if (inRight) {
        const colW  = pw + PANEL_GAP;
        const pCols = Math.max(1, Math.floor((rightPanelW + PANEL_GAP) / colW));
        const col   = Math.max(0, Math.min(pCols - 1, Math.floor((wx - rightPanelX - PANEL_GAP) / colW)));
        const row   = Math.max(0, Math.floor((wy - PANEL_GAP) / (ph + PANEL_GAP)));
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'right' as const, slotIndex: row * pCols + col } : p
        ));
      } else if (inTray) {
        const col = Math.max(0, Math.min(trayCols - 1, Math.floor(wx / trayColW)));
        const row = Math.max(0, Math.floor((wy - trayOriginY) / (ph + TRAY_GAP)));
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'tray' as const, slotIndex: row * trayCols + col } : p
        ));
      } else {
        onPiecesChange(pieces.map((p) =>
          p.id === id ? { ...p, zone: 'free' as const, currentX: wx, currentY: wy } : p
        ));
      }
    },
    [pieces, pw, ph, boardOriginX, boardOriginY, boardW, boardH, leftPanelW, rightPanelX, rightPanelW, trayOriginY, trayCols, trayColW, onPiecesChange]
  );

  function getPiecePos(p: PuzzlePiece): { x: number; y: number } {
    switch (p.zone) {
      case 'left':  return panelSlotPos(p.slotIndex, 0, boardOriginY, leftPanelW, pw, ph, PANEL_GAP);
      case 'right': return panelSlotPos(p.slotIndex, rightPanelX, boardOriginY, rightPanelW, pw, ph, PANEL_GAP);
      case 'tray': {
        const tIdx = trayPieces.findIndex((t) => t.id === p.id);
        const col  = tIdx % trayCols;
        const row  = Math.floor(tIdx / trayCols);
        return { x: col * trayColW + TRAY_GAP, y: trayOriginY + row * (ph + TRAY_GAP) + TRAY_GAP };
      }
      default: return { x: p.currentX, y: p.currentY };
    }
  }

  if (!ready) {
    return <div className="puzzle-single-stage" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div className="puzzle-single-stage" ref={wrapRef}>
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

          {/* Board background — red flash on wrong drop, normal otherwise */}
          <Rect x={boardOriginX} y={boardOriginY} width={boardW} height={boardH}
            fill={boardFlash ? 'rgba(220,38,38,0.45)' : '#2a2740'} />
          <SlotGrid cols={cols} rows={rows} pieceW={pw} pieceH={ph} ox={boardOriginX} oy={boardOriginY} />

          <Text x={TRAY_GAP} y={boardOriginY + boardH + DIVIDER_H}
            text={`PIECE TRAY  ·  ${unsnapped.length} remaining`}
            fontSize={11} fontStyle="bold" fill="rgba(255,255,255,0.35)"
            letterSpacing={0.8} listening={false} />
          <Rect x={0} y={trayOriginY} width={worldW} height={trayH} fill="#1c192c" />
        </Layer>

        {/* Snapped pieces */}
        <Layer>
          {snapped.map((piece) => (
            <DraggablePieceTile key={piece.id} piece={piece}
              x={boardOriginX + piece.correctX} y={boardOriginY + piece.correctY}
              onDragEnd={handleDragEnd} />
          ))}
        </Layer>

        {/* Unsnapped pieces */}
        <Layer>
          {unsnapped.map((piece) => {
            const { x, y } = getPiecePos(piece);
            return <DraggablePieceTile key={piece.id} piece={piece} x={x} y={y} onDragEnd={handleDragEnd} />;
          })}
        </Layer>

      </Stage>
    </div>
  );
}
