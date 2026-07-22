import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { playSnapSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── constants ────────────────────────────────────────────────
const SNAP_THRESHOLD = 0.5;

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

// ─── Slot helpers ──────────────────────────────────────────────
const TRAY_GAP    = 12;  // gap between pieces and from edges (in world coords)
const TRAY_COLS   = 4;   // target columns per tray — scale is derived from this

// Compute the tray scale so TRAY_COLS fit within the visible tray pixel width.
// All slot coords use world units; the Stage scaleX/Y converts to screen pixels.
function computeTrayScale(trayPixelW: number, pw: number): number {
  const totalColWidth = TRAY_COLS * pw + (TRAY_COLS + 1) * TRAY_GAP;
  return Math.max(0.1, trayPixelW / totalColWidth);
}

function computeTrayLayout(pw: number, ph: number, pieceCount: number) {
  const colCount = TRAY_COLS;
  const rowCount = Math.ceil(pieceCount / colCount);
  // Content height in world coords
  const contentH = rowCount * (ph + TRAY_GAP) + TRAY_GAP;
  return { colCount, rowCount, contentH };
}

function slotCoords(index: number, colCount: number, pw: number, ph: number) {
  const col = index % colCount;
  const row = Math.floor(index / colCount);
  return {
    x: TRAY_GAP + col * (pw + TRAY_GAP),
    y: TRAY_GAP + row * (ph + TRAY_GAP),
  };
}

// ─── PieceTile (Konva draggable single piece) ─────────────────
interface PieceTileProps {
  piece: PuzzlePiece;
  x: number;
  y: number;
  worldW: number;
  worldH: number;
  scale: number;
  onDragEnd: (id: string, wx: number, wy: number) => void;
}

function DraggablePieceTile({ piece, x, y, worldW, worldH, scale, onDragEnd }: PieceTileProps) {
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

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => {
      const maxX = Math.max(0, (worldW - piece.pieceWidth) * scale);
      const maxY = Math.max(0, (worldH - piece.pieceHeight) * scale);
      return {
        x: Math.max(0, Math.min(pos.x, maxX)),
        y: Math.max(0, Math.min(pos.y, maxY)),
      };
    },
    [worldW, worldH, scale, piece.pieceWidth, piece.pieceHeight]
  );

  if (!img) return null;
  return (
    <Group
      x={x} y={y}
      draggable={!piece.snapped}
      dragBoundFunc={!piece.snapped ? dragBound : undefined}
      onDragStart={!piece.snapped ? handleDragStart : undefined}
      onDragEnd={!piece.snapped ? handleDragEndInner : undefined}
      onMouseEnter={(e) => { if (piece.snapped) return; const s = e.target.getStage(); if (s) s.container().style.cursor = 'grab'; }}
      onMouseLeave={(e) => { if (piece.snapped) return; const s = e.target.getStage(); if (s) s.container().style.cursor = 'default'; }}
    >
      <KonvaImage
        image={img} x={0} y={0}
        width={piece.pieceWidth} height={piece.pieceHeight}
        listening={!piece.snapped}
        shadowColor={piece.snapped ? '#22c55e' : undefined}
        shadowBlur={piece.snapped ? 14 : 0}
        shadowOpacity={piece.snapped ? 1 : 0}
        shadowOffset={{ x: 0, y: 0 }}
      />
    </Group>
  );
}

// ─── Piece Group ───────────────────────────────────────────────
interface PieceGroupProps {
  groupPieces: PuzzlePiece[];
  offsetX: number;
  offsetY: number;
  worldW: number;
  worldH: number;
  scale: number;
  onGroupDragEnd: (ids: string[], dx: number, dy: number) => void;
}

function DraggablePieceGroup({ groupPieces, offsetX, offsetY, worldW, worldH, scale, onGroupDragEnd }: PieceGroupProps) {
  const startPos = useRef({ x: offsetX, y: offsetY });
  const groupW = Math.max(...groupPieces.map((p) => p.currentX - offsetX + p.pieceWidth));
  const groupH = Math.max(...groupPieces.map((p) => p.currentY - offsetY + p.pieceHeight));

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    startPos.current = { x: e.target.x(), y: e.target.y() };
    e.target.moveToTop();
    e.target.getStage()!.container().style.cursor = 'grabbing';
  }, []);

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const dx = e.target.x() - startPos.current.x;
    const dy = e.target.y() - startPos.current.y;
    onGroupDragEnd(groupPieces.map((p) => p.id), dx, dy);
    e.target.getStage()!.container().style.cursor = 'default';
  }, [groupPieces, onGroupDragEnd]);

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => {
      const maxX = Math.max(0, (worldW - groupW) * scale);
      const maxY = Math.max(0, (worldH - groupH) * scale);
      return { x: Math.max(0, Math.min(pos.x, maxX)), y: Math.max(0, Math.min(pos.y, maxY)) };
    },
    [worldW, worldH, scale, groupW, groupH]
  );

  return (
    <Group
      x={offsetX} y={offsetY}
      draggable
      dragBoundFunc={dragBound}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'grab'; }}
      onMouseLeave={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'default'; }}
    >
      {groupPieces.map((piece) => (
        <PieceImage key={piece.id} piece={piece} relX={piece.currentX - offsetX} relY={piece.currentY - offsetY} />
      ))}
    </Group>
  );
}

function PieceImage({ piece, relX, relY }: { piece: PuzzlePiece; relX: number; relY: number }) {
  const img = useImage(piece.imageUrl);
  if (!img) return null;
  return <KonvaImage image={img} x={relX} y={relY} width={piece.pieceWidth} height={piece.pieceHeight} listening={true} />;
}

// ─── HintOverlay ───────────────────────────────────────────────
function HintOverlay({ piece, targetOX, targetOY }: { piece: PuzzlePiece; targetOX: number; targetOY: number }) {
  const img = useImage(piece.imageUrl);
  if (!img) return null;
  const targetX = targetOX + piece.correctX;
  const targetY = targetOY + piece.correctY;
  return (
    <>
      <KonvaImage image={img} x={targetX} y={targetY}
        width={piece.pieceWidth} height={piece.pieceHeight}
        opacity={0.55} shadowColor="#22c55e" shadowBlur={18} shadowOpacity={1}
        shadowOffset={{ x: 0, y: 0 }} listening={false} />
      <KonvaImage image={img} x={piece.currentX} y={piece.currentY}
        width={piece.pieceWidth} height={piece.pieceHeight}
        shadowColor="#22c55e" shadowBlur={24} shadowOpacity={1}
        shadowOffset={{ x: 0, y: 0 }} listening={false} />
    </>
  );
}

// ─── TrayPieceTile (Konva piece inside a tray stage) ──────────
interface TrayPieceTileProps {
  piece: PuzzlePiece;
  trayX: number; // tray-local X
  trayY: number; // tray-local Y
  trayW: number; // tray content width
  contentH: number; // tray content height
  onDragOutOfTray: (id: string, pointerClientX: number, pointerClientY: number) => void;
}

function TrayPieceTile({ piece, trayX, trayY, trayW, contentH, onDragOutOfTray }: TrayPieceTileProps) {
  const img = useImage(piece.imageUrl);
  const isDragging = useRef(false);

  if (!img) return null;

  return (
    <Group
      x={trayX} y={trayY}
      draggable
      dragBoundFunc={(pos) => {
        // Allow free movement while in the tray stage — clamped to content area
        const maxX = Math.max(0, trayW - piece.pieceWidth);
        const maxY = Math.max(0, contentH - piece.pieceHeight);
        return { x: Math.max(0, Math.min(pos.x, maxX)), y: Math.max(0, Math.min(pos.y, maxY)) };
      }}
      onDragStart={(e) => {
        isDragging.current = true;
        e.target.moveToTop();
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grabbing';
      }}
      onDragEnd={(e) => {
        isDragging.current = false;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
        // Get the pointer position in client coordinates at drag end
        const container = stage?.container();
        if (!container) return;
        const rect = container.getBoundingClientRect();
        // Use the piece's screen position
        const pieceScreenX = rect.left + e.target.x();
        const pieceScreenY = rect.top + e.target.y();
        onDragOutOfTray(piece.id, pieceScreenX + piece.pieceWidth / 2, pieceScreenY + piece.pieceHeight / 2);
      }}
      onMouseEnter={(e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = 'grab'; }}
      onMouseLeave={(e) => { if (isDragging.current) return; const s = e.target.getStage(); if (s) s.container().style.cursor = 'default'; }}
    >
      <KonvaImage image={img} x={0} y={0} width={piece.pieceWidth} height={piece.pieceHeight} />
    </Group>
  );
}

// ─── Helpers ───────────────────────────────────────────────────
function lockCorrectPieces(arr: PuzzlePiece[], targetOX: number, targetOY: number): PuzzlePiece[] {
  return arr.map((p) => {
    if (p.snapped) return p;
    const cwx = targetOX + p.correctX;
    const cwy = targetOY + p.correctY;
    if (Math.abs(p.currentX - cwx) < 1 && Math.abs(p.currentY - cwy) < 1) {
      return { ...p, snapped: true };
    }
    return p;
  });
}

function nextGroupId(arr: PuzzlePiece[]): number {
  return arr.reduce((m, p) => Math.max(m, p.groupId ?? 0), 0) + 1;
}

// ─── Scrollable Tray component ────────────────────────────────
interface TrayProps {
  side: 'left' | 'right';
  pieces: PuzzlePiece[];
  trayW: number;       // pixel width of the visible tray
  trayH: number;       // pixel height of the visible tray
  pw: number;          // piece width
  ph: number;          // piece height
  scrollY: number;
  onScrollY: (y: number) => void;
  onDragOutOfTray: (id: string, pointerClientX: number, pointerClientY: number) => void;
}

function ScrollableTray({ side, pieces, trayW, trayH, pw, ph, scrollY, onScrollY, onDragOutOfTray }: TrayProps) {
  const trayScale = computeTrayScale(trayW, pw);
  const { colCount, contentH } = computeTrayLayout(pw, ph, pieces.length);
  // contentH is in world coords; convert to screen pixels for scrolling
  const contentHScreen = contentH * trayScale;
  const maxScrollY = Math.max(0, contentHScreen - trayH);
  const clampedScrollY = Math.min(scrollY, maxScrollY);

  const trackH = trayH;
  const thumbH = Math.max(40, (trayH / Math.max(contentHScreen, trayH)) * trackH);
  const thumbTop = maxScrollY > 0 ? (clampedScrollY / maxScrollY) * (trackH - thumbH) : 0;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onScrollY(Math.max(0, Math.min(clampedScrollY + e.deltaY, maxScrollY)));
  }, [clampedScrollY, maxScrollY, onScrollY]);

  const thumbDrag = useRef<{ startY: number; startScrollY: number } | null>(null);
  const handleThumbPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    thumbDrag.current = { startY: e.clientY, startScrollY: clampedScrollY };
  };
  const handleThumbPointerMove = (e: React.PointerEvent) => {
    if (!thumbDrag.current) return;
    const dy = e.clientY - thumbDrag.current.startY;
    const ratio = dy / (trackH - thumbH);
    onScrollY(Math.max(0, Math.min(thumbDrag.current.startScrollY + ratio * maxScrollY, maxScrollY)));
  };
  const handleThumbPointerUp = () => { thumbDrag.current = null; };

  const SCROLLBAR_W = 8;
  // Stage world dimensions
  const stageWorldW = TRAY_COLS * (pw + TRAY_GAP) + TRAY_GAP;

  return (
    <div
      className={`puzzle-tray puzzle-tray--${side}`}
      style={{ width: trayW, height: trayH, position: 'relative', overflow: 'hidden', flexShrink: 0 }}
      onWheel={handleWheel}
    >
      {/* Stage offset by scroll — translateY moves content up */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: trayW, height: contentHScreen, transform: `translateY(${-clampedScrollY}px)` }}>
        <Stage width={trayW} height={contentHScreen} scaleX={trayScale} scaleY={trayScale}>
          <Layer>
            <Rect x={0} y={0} width={stageWorldW} height={contentH} fill="#2a2838" />
          </Layer>
          <Layer>
            {pieces.map((piece, i) => {
              const { x, y } = slotCoords(i, colCount, pw, ph);
              return (
                <TrayPieceTile
                  key={piece.id}
                  piece={piece}
                  trayX={x}
                  trayY={y}
                  trayW={stageWorldW}
                  contentH={contentH}
                  onDragOutOfTray={(id, cx, cy) => {
                    // Adjust pointer coords: tray stage has trayScale applied
                    onDragOutOfTray(id, cx, cy);
                  }}
                />
              );
            })}
          </Layer>
        </Stage>
      </div>
      {/* Custom scrollbar */}
      <div
        className={`puzzle-tray-scrollbar puzzle-tray-scrollbar--${side}`}
        style={{ position: 'absolute', top: 0, [side === 'left' ? 'left' : 'right']: 0, width: SCROLLBAR_W, height: trayH, background: 'rgba(0,0,0,0.25)', zIndex: 10 }}
      >
        <div
          className="puzzle-tray-thumb"
          style={{ position: 'absolute', top: thumbTop, left: 0, width: SCROLLBAR_W, height: thumbH, borderRadius: 4, background: '#7c3aed', cursor: 'pointer', opacity: maxScrollY > 0 ? 1 : 0.3 }}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerUp}
          onPointerLeave={handleThumbPointerUp}
        />
      </div>
    </div>
  );
}

// ─── PuzzleBoard types ─────────────────────────────────────────
interface PuzzleBoardProps {
  pieces: PuzzlePiece[];
  cols: number;
  rows: number;
  onPiecesChange: (pieces: PuzzlePiece[]) => void;
  hintPieceId?: string | null;
}

export interface PuzzleBoardHandle {
  captureSnapshot: () => Promise<string | null>;
}

// ─── PuzzleBoard ───────────────────────────────────────────────
const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
function PuzzleBoard({ pieces, cols, rows, onPiecesChange, hintPieceId }, ref) {
  const wrapRef      = useRef<HTMLDivElement>(null);
  const stageRef     = useRef<Konva.Stage>(null);
  const cropRef      = useRef({ targetOX: 0, targetOY: 0, targetW: 0, targetH: 0, scale: 1 });

  // ── captureSnapshot ─────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    captureSnapshot: async () => {
      const stage = stageRef.current;
      if (!stage) return null;
      try {
        const { targetOX, targetOY, targetW, targetH, scale } = cropRef.current;
        const fullDataUrl = stage.toDataURL({ pixelRatio: 1 });
        if (!fullDataUrl || fullDataUrl === 'data:,') return null;
        const sx = Math.round(targetOX * scale);
        const sy = Math.round(targetOY * scale);
        const sw = Math.round(targetW  * scale);
        const sh = Math.round(targetH  * scale);
        return new Promise<string | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const out = document.createElement('canvas');
            out.width = sw; out.height = sh;
            const ctx = out.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            resolve(out.toDataURL('image/png'));
          };
          img.onerror = () => resolve(null);
          img.src = fullDataUrl;
        });
      } catch (err) {
        console.warn('[captureSnapshot] failed:', err);
        return null;
      }
    },
  }));

  // ── Container size ──────────────────────────────────────────
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.clientWidth);
      setContainerH(el.clientHeight || window.innerHeight - 80);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    setContainerH(el.clientHeight || window.innerHeight - 80);
    return () => ro.disconnect();
  }, []);

  // ── Zoom / pan ──────────────────────────────────────────────
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handleZoomIn  = useCallback(() => setZoomLevel((z) => Math.min(z + 0.2, 3)), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(z - 0.2, 0.4)), []);
  const handleCenterBoard = useCallback(() => setPanOffset({ x: 0, y: 0 }), []);

  const handlePanPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panDrag.current = { startX: e.clientX, startY: e.clientY, originX: panOffset.x, originY: panOffset.y };
  }, [panMode, panOffset]);

  const handlePanPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panDrag.current) return;
    const dx = e.clientX - panDrag.current.startX;
    const dy = e.clientY - panDrag.current.startY;
    setPanOffset({ x: panDrag.current.originX + dx, y: panDrag.current.originY + dy });
  }, []);

  const handlePanPointerUp = useCallback(() => { panDrag.current = null; }, []);

  // ── Tray scroll state ──────────────────────────────────────
  const [leftScrollY,  setLeftScrollY]  = useState(0);
  const [rightScrollY, setRightScrollY] = useState(0);

  // ── Piece dimensions ────────────────────────────────────────
  const pw = pieces[0]?.pieceWidth  ?? 0;
  const ph = pieces[0]?.pieceHeight ?? 0;

  const piece0   = pieces.find((p) => p.correctCol === 0 && p.correctRow === 0);
  const piece1   = pieces.find((p) => p.correctCol === 1 && p.correctRow === 0);
  const piece0r1 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 1);
  const gridCellW = piece0 && piece1   ? piece1.correctX  - piece0.correctX  : pw;
  const gridCellH = piece0 && piece0r1 ? piece0r1.correctY - piece0.correctY : ph;

  const targetW = cols * gridCellW;
  const targetH = rows * gridCellH;

  const ready = pieces.length > 0 && containerW > 0 && pw > 0 && ph > 0;

  // ── Three-column layout calculations ───────────────────────
  // Column percentages: 29% left tray, 42% board, 29% right tray
  const TRAY_FRAC  = 0.29;
  const BOARD_FRAC = 0.42;

  const trayPixelW  = Math.floor(containerW * TRAY_FRAC);
  const boardPixelW = Math.max(containerW - trayPixelW * 2, containerW * BOARD_FRAC);
  const trayH       = containerH;

  // Board world dimensions = just the target area + small margins
  const marginX = Math.max(pw, 20);
  const marginY = Math.max(ph, 20);
  const worldW  = targetW + marginX * 2;
  const worldH  = targetH + marginY * 2;
  const targetOX = marginX;
  const targetOY = marginY;

  const scaleByW  = ready ? boardPixelW / worldW : 1;
  const scaleByH  = ready && containerH > 0 ? containerH / worldH : scaleByW;
  const baseScale = Math.min(scaleByW, scaleByH);
  const safeScale = baseScale * zoomLevel;
  const stageW    = worldW * safeScale;
  const stageH    = worldH * safeScale;

  cropRef.current = { targetOX, targetOY, targetW, targetH, scale: safeScale };
  const safeScaleRef = useRef(safeScale);
  safeScaleRef.current = safeScale;

  // ── Partition pieces: tray left/right and board (free) ─────
  const leftTrayPieces  = pieces.filter((p) => !p.snapped && p.zone === 'left');
  const rightTrayPieces = pieces.filter((p) => !p.snapped && p.zone === 'right');
  const boardPieces     = pieces.filter((p) => p.snapped || p.zone === 'free');

  const lockedPieces = boardPieces.filter((p) => p.snapped);
  const groupMap = new Map<number, PuzzlePiece[]>();
  for (const p of boardPieces) {
    if (!p.snapped && p.groupId != null) {
      const arr = groupMap.get(p.groupId) ?? [];
      arr.push(p);
      groupMap.set(p.groupId, arr);
    }
  }
  const groups      = [...groupMap.entries()];
  const freePieces  = boardPieces.filter((p) => !p.snapped && p.groupId == null);
  const hintPiece   = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  // ── Scatter / redistribute into trays on reset ─────────────
  const prevPieceCount = useRef(0);
  useEffect(() => {
    if (!ready) return;

    const allAtOrigin = pieces.every((p) => p.currentX === 0 && p.currentY === 0 && !p.snapped);
    const countChanged = pieces.length !== prevPieceCount.current;
    prevPieceCount.current = pieces.length;

    if (!allAtOrigin && !countChanged) return;

    // Reset tray scrolls
    setLeftScrollY(0);
    setRightScrollY(0);

    // Split unsnapped pieces evenly into left/right trays
    const unsnapped = pieces.filter((p) => !p.snapped);
    const shuffled  = [...unsnapped].sort(() => Math.random() - 0.5);
    const half      = Math.ceil(shuffled.length / 2);

    const updated = pieces.map((p) => {
      if (p.snapped) return p;
      const idx = shuffled.findIndex((s) => s.id === p.id);
      if (idx < half) {
        return { ...p, zone: 'left'  as const, slotIndex: idx,        currentX: 0, currentY: 0 };
      } else {
        return { ...p, zone: 'right' as const, slotIndex: idx - half, currentX: 0, currentY: 0 };
      }
    });
    onPiecesChange(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pieces.length]);

  // ── Handle piece dragged out of tray onto board ─────────────
  // This receives the pointer's client X/Y at drag-end from the tray stage.
  // We convert it to board world coords and treat it like a board drag-end.
  const boardWrapRef = useRef<HTMLDivElement>(null);

  const handleDragOutOfTray = useCallback((id: string, pointerClientX: number, pointerClientY: number) => {
    const piece = pieces.find((p) => p.id === id);
    if (!piece) return;

    // Get board stage position on screen
    const boardRect = boardWrapRef.current?.getBoundingClientRect();
    if (!boardRect) return;

    // Convert pointer position to board world coords
    const screenX = pointerClientX - boardRect.left;
    const screenY = pointerClientY - boardRect.top;

    // Check if the pointer is actually over the board area
    const overBoard = screenX >= 0 && screenX <= boardRect.width && screenY >= 0 && screenY <= boardRect.height;

    if (overBoard) {
      // Convert screen coords to world coords
      const wx = screenX / safeScaleRef.current - piece.pieceWidth / 2;
      const wy = screenY / safeScaleRef.current - piece.pieceHeight / 2;
      const clampedWx = Math.max(0, Math.min(wx, worldW - piece.pieceWidth));
      const clampedWy = Math.max(0, Math.min(wy, worldH - piece.pieceHeight));

      // Check snap to final position
      const correctWorldX = targetOX + piece.correctX;
      const correctWorldY = targetOY + piece.correctY;
      const distToTarget  = Math.hypot(
        (clampedWx + pw / 2) - (correctWorldX + pw / 2),
        (clampedWy + ph / 2) - (correctWorldY + ph / 2)
      );

      if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
        playSnapSound();
        let updated = pieces.map((p) =>
          p.id === id ? { ...p, currentX: correctWorldX, currentY: correctWorldY, zone: 'free' as const } : p
        );
        updated = lockCorrectPieces(updated, targetOX, targetOY);
        onPiecesChange(updated);
        return;
      }

      // Check piece-to-piece snap
      const neighbors = pieces.filter((other) => {
        if (other.id === id || other.zone !== 'free') return false;
        const colDiff = Math.abs(piece.correctCol - other.correctCol);
        const rowDiff = Math.abs(piece.correctRow - other.correctRow);
        return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
      });
      for (const neighbor of neighbors) {
        const expectedDx = (piece.correctCol - neighbor.correctCol) * gridCellW;
        const expectedDy = (piece.correctRow - neighbor.correctRow) * gridCellH;
        const expectedX  = neighbor.currentX + expectedDx;
        const expectedY  = neighbor.currentY + expectedDy;
        const snapDist   = Math.hypot(clampedWx - expectedX, clampedWy - expectedY);
        if (snapDist <= gridCellW * SNAP_THRESHOLD) {
          playSnapSound();
          const gid = neighbor.groupId ?? nextGroupId(pieces);
          let updated = pieces.map((p) => {
            if (p.id === id)       return { ...p, currentX: expectedX, currentY: expectedY, groupId: gid, zone: 'free' as const };
            if (p.id === neighbor.id && p.groupId == null) return { ...p, groupId: gid };
            return p;
          });
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          onPiecesChange(updated);
          return;
        }
      }

      // No snap — place freely on board
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, currentX: clampedWx, currentY: clampedWy, zone: 'free' as const } : p
      ));
    } else {
      // Dropped back on a tray side — return to nearest tray slot
      const isLeftSide = pointerClientX < (boardRect.left); // left of board
      const targetZone = isLeftSide ? 'left' : 'right';
      const trayPieces = pieces.filter((p) => p.id !== id && p.zone === targetZone && !p.snapped);
      const newSlotIndex = trayPieces.length; // append at end
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, zone: targetZone, slotIndex: newSlotIndex, currentX: 0, currentY: 0 } : p
      ));
    }
  }, [pieces, pw, ph, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange]);

  // ── Board drag end (pieces already on the board) ────────────
  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      const clampedWx = Math.max(0, Math.min(wx, worldW - piece.pieceWidth));
      const clampedWy = Math.max(0, Math.min(wy, worldH - piece.pieceHeight));

      // 1. Snap to correct final board position
      const correctWorldX = targetOX + piece.correctX;
      const correctWorldY = targetOY + piece.correctY;
      const distToTarget  = Math.hypot(
        (clampedWx + pw / 2) - (correctWorldX + pw / 2),
        (clampedWy + ph / 2) - (correctWorldY + ph / 2)
      );
      if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
        playSnapSound();
        let updated = pieces.map((p) =>
          p.id === id ? { ...p, currentX: correctWorldX, currentY: correctWorldY } : p
        );
        updated = lockCorrectPieces(updated, targetOX, targetOY);
        onPiecesChange(updated);
        return;
      }

      // 2. Piece-to-piece snap
      const neighbors = pieces.filter((other) => {
        if (other.id === id || other.zone !== 'free') return false;
        const colDiff = Math.abs(piece.correctCol - other.correctCol);
        const rowDiff = Math.abs(piece.correctRow - other.correctRow);
        return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
      });
      for (const neighbor of neighbors) {
        const expectedDx = (piece.correctCol - neighbor.correctCol) * gridCellW;
        const expectedDy = (piece.correctRow - neighbor.correctRow) * gridCellH;
        const expectedX  = neighbor.currentX + expectedDx;
        const expectedY  = neighbor.currentY + expectedDy;
        const snapDist   = Math.hypot(clampedWx - expectedX, clampedWy - expectedY);
        if (snapDist <= gridCellW * SNAP_THRESHOLD) {
          playSnapSound();
          const gid = neighbor.groupId ?? nextGroupId(pieces);
          let updated = pieces.map((p) => {
            if (p.id === id) return { ...p, currentX: expectedX, currentY: expectedY, groupId: gid };
            if (p.id === neighbor.id && p.groupId == null) return { ...p, groupId: gid };
            return p;
          });
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          onPiecesChange(updated);
          return;
        }
      }

      // 3. No snap — drop freely
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, currentX: clampedWx, currentY: clampedWy } : p
      ));
    },
    [pieces, pw, ph, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange]
  );

  // ── Group drag end ──────────────────────────────────────────
  const handleGroupDragEnd = useCallback(
    (ids: string[], dx: number, dy: number) => {
      let updated = pieces.map((p) =>
        ids.includes(p.id) ? { ...p, currentX: p.currentX + dx, currentY: p.currentY + dy } : p
      );
      const groupPieces = updated.filter((p) => ids.includes(p.id));

      // 1. Snap group onto board
      for (const gp of groupPieces) {
        const correctWX    = targetOX + gp.correctX;
        const correctWY    = targetOY + gp.correctY;
        const distToTarget = Math.hypot(gp.currentX - correctWX, gp.currentY - correctWY);
        if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
          const offX = correctWX - gp.currentX;
          const offY = correctWY - gp.currentY;
          playSnapSound();
          updated = updated.map((p) =>
            ids.includes(p.id) ? { ...p, currentX: p.currentX + offX, currentY: p.currentY + offY } : p
          );
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          onPiecesChange(updated);
          return;
        }
      }

      // 2. Connect to neighboring piece/group
      for (const gPiece of groupPieces) {
        const neighbors = updated.filter((other) => {
          if (ids.includes(other.id) || other.zone !== 'free') return false;
          const colDiff = Math.abs(gPiece.correctCol - other.correctCol);
          const rowDiff = Math.abs(gPiece.correctRow - other.correctRow);
          return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
        });
        for (const neighbor of neighbors) {
          const expectedDx      = (gPiece.correctCol - neighbor.correctCol) * gridCellW;
          const expectedDy      = (gPiece.correctRow - neighbor.correctRow) * gridCellH;
          const expectedX       = neighbor.currentX + expectedDx;
          const expectedY       = neighbor.currentY + expectedDy;
          const snapDist        = Math.hypot(gPiece.currentX - expectedX, gPiece.currentY - expectedY);
          if (snapDist <= gridCellW * SNAP_THRESHOLD) {
            const offX          = expectedX - gPiece.currentX;
            const offY          = expectedY - gPiece.currentY;
            playSnapSound();
            const gid           = gPiece.groupId ?? neighbor.groupId ?? nextGroupId(updated);
            const neighborGroupId = neighbor.groupId;
            updated = updated.map((p) => {
              if (ids.includes(p.id)) return { ...p, currentX: p.currentX + offX, currentY: p.currentY + offY, groupId: gid };
              if (p.id === neighbor.id) return { ...p, groupId: gid };
              if (neighborGroupId != null && p.groupId === neighborGroupId) return { ...p, groupId: gid };
              return p;
            });
            updated = lockCorrectPieces(updated, targetOX, targetOY);
            onPiecesChange(updated);
            return;
          }
        }
      }

      // 3. No snap — clamp to world bounds
      updated = updated.map((p) => {
        if (!ids.includes(p.id)) return p;
        return { ...p, currentX: Math.max(0, Math.min(p.currentX, worldW - p.pieceWidth)), currentY: Math.max(0, Math.min(p.currentY, worldH - p.pieceHeight)) };
      });
      onPiecesChange(updated);
    },
    [pieces, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange]
  );

  if (!ready) {
    return <div className="puzzle-layout-wrap" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div className="puzzle-layout-wrap" ref={wrapRef}>
      {/* ── Left tray ── */}
      <ScrollableTray
        side="left"
        pieces={leftTrayPieces}
        trayW={trayPixelW}
        trayH={trayH}
        pw={pw}
        ph={ph}
        scrollY={leftScrollY}
        onScrollY={setLeftScrollY}
        onDragOutOfTray={handleDragOutOfTray}
      />

      {/* ── Center board ── */}
      <div
        className={`puzzle-board-center${panMode ? ' puzzle-board-center--pan' : ''}`}
        ref={boardWrapRef}
        style={{ width: boardPixelW, height: containerH, position: 'relative', flexShrink: 0, overflow: 'hidden' }}
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={handlePanPointerUp}
        onPointerLeave={handlePanPointerUp}
      >
        <div
          className="puzzle-board-stage-wrap"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
        >
          <Stage
            ref={stageRef}
            width={stageW}
            height={stageH}
            scaleX={safeScale}
            scaleY={safeScale}
          >
            <Layer listening={false}>
              <Rect x={0} y={0} width={worldW} height={worldH} fill="#3d3b4a" />
              <Rect x={targetOX} y={targetOY} width={targetW} height={targetH} fill="#2f2d3e" cornerRadius={4} listening={false} />
            </Layer>
            <Layer>
              {lockedPieces.map((piece) => (
                <DraggablePieceTile key={piece.id} piece={piece}
                  x={piece.currentX} y={piece.currentY}
                  worldW={worldW} worldH={worldH} scale={safeScale}
                  onDragEnd={handleDragEnd} />
              ))}
            </Layer>
            <Layer>
              {groups.map(([gid, group]) => {
                const minX = Math.min(...group.map((p) => p.currentX));
                const minY = Math.min(...group.map((p) => p.currentY));
                return (
                  <DraggablePieceGroup
                    key={`group-${gid}`}
                    groupPieces={group}
                    offsetX={minX}
                    offsetY={minY}
                    worldW={worldW} worldH={worldH} scale={safeScale}
                    onGroupDragEnd={handleGroupDragEnd}
                  />
                );
              })}
            </Layer>
            <Layer>
              {freePieces.map((piece) => (
                <DraggablePieceTile
                  key={piece.id}
                  piece={piece}
                  x={piece.currentX} y={piece.currentY}
                  worldW={worldW} worldH={worldH} scale={safeScale}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </Layer>
            {hintPiece && (
              <Layer listening={false}>
                <HintOverlay piece={hintPiece} targetOX={targetOX} targetOY={targetOY} />
              </Layer>
            )}
          </Stage>
        </div>

        {/* Zoom + pan controls — attached to right edge of center board */}
        <div className="puzzle-zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button"
            className={`puzzle-zoom-btn puzzle-pan-btn${panMode ? ' puzzle-zoom-btn--active' : ''}`}
            onClick={() => setPanMode((v) => !v)}
            aria-label={panMode ? 'Disable pan mode' : 'Enable pan mode'}
            title={panMode ? 'Pan mode on — click to disable' : 'Pan mode — drag to move'}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M8 3.5V10M8 3.5a1.5 1.5 0 0 1 3 0V10M11 5a1.5 1.5 0 0 1 3 0v2M14 7a1.5 1.5 0 0 1 3 0v4c0 3-2 5-5 5H9c-1.5 0-2.8-.7-3.6-1.8L3 11.5a1.5 1.5 0 0 1 2.4-1.8L6.5 11V3.5a1.5 1.5 0 0 1 3 0"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="puzzle-zoom-btn" onClick={handleCenterBoard}
            aria-label="Reset board to center" title="Reset board to center">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M5.5 5.5l1.4 1.4M13.1 13.1l1.4 1.4M13.1 6.9l-1.4 1.4M6.9 13.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <div className="puzzle-zoom-divider" />
          <button type="button" className="puzzle-zoom-btn" onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 6.5v5M6.5 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <span className="puzzle-zoom-level">{Math.round(zoomLevel * 100)}%</span>
          <button type="button" className="puzzle-zoom-btn" onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6.5 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Right tray ── */}
      <ScrollableTray
        side="right"
        pieces={rightTrayPieces}
        trayW={trayPixelW}
        trayH={trayH}
        pw={pw}
        ph={ph}
        scrollY={rightScrollY}
        onScrollY={setRightScrollY}
        onDragOutOfTray={handleDragOutOfTray}
      />
    </div>
  );
});

export default PuzzleBoard;
