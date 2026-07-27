import {
  useEffect, useRef, useState, useCallback,
  useImperativeHandle, forwardRef,
} from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { playSnapSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── constants ────────────────────────────────────────────────
const SNAP_THRESHOLD = 0.5;
const TRAY_GAP       = 12;   // world-coord gap between pieces in tray grid
const SCROLLBAR_W    = 8;

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

// ─── Tray layout helpers ───────────────────────────────────────
function computeTrayColCount(trayPixelW: number, pw: number, scale: number): number {
  const pxSize = pw * scale;
  const pxGap  = TRAY_GAP * scale;
  return Math.max(1, Math.floor((trayPixelW - pxGap) / (pxSize + pxGap)));
}

function computeTrayContentH(pieceCount: number, colCount: number, ph: number): number {
  const rowCount = Math.ceil(pieceCount / colCount);
  return rowCount * (ph + TRAY_GAP) + TRAY_GAP;
}

/** Slot position in *world* (tray-local) coords */
function slotCoords(index: number, colCount: number, pw: number, ph: number) {
  const col = index % colCount;
  const row = Math.floor(index / colCount);
  return {
    x: TRAY_GAP + col * (pw + TRAY_GAP),
    y: TRAY_GAP + row * (ph + TRAY_GAP),
  };
}

// ─── Piece image (simple, no drag) ────────────────────────────
function PieceImage({ piece, relX, relY }: { piece: PuzzlePiece; relX: number; relY: number }) {
  const img = useImage(piece.imageUrl);
  if (!img) return null;
  return (
    <KonvaImage
      image={img} x={relX} y={relY}
      width={piece.pieceWidth} height={piece.pieceHeight}
      listening
    />
  );
}

// ─── DraggablePieceTile — single piece on board ───────────────
interface PieceTileProps {
  piece: PuzzlePiece;
  x: number;
  y: number;
  worldW: number;
  worldH: number;
  onDragEnd: (id: string, wx: number, wy: number) => void;
}

function DraggablePieceTile({ piece, x, y, worldW, worldH, onDragEnd }: PieceTileProps) {
  const img = useImage(piece.imageUrl);

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.moveToTop();
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'grabbing';
  }, []);

  const handleDragEndInner = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd(piece.id, e.target.x(), e.target.y());
      const c = e.target.getStage()?.container();
      if (c) c.style.cursor = 'default';
    },
    [piece.id, onDragEnd],
  );

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => {
      const maxX = Math.max(0, worldW - piece.pieceWidth);
      const maxY = Math.max(0, worldH - piece.pieceHeight);
      return { x: Math.max(0, Math.min(pos.x, maxX)), y: Math.max(0, Math.min(pos.y, maxY)) };
    },
    [worldW, worldH, piece.pieceWidth, piece.pieceHeight],
  );

  if (!img) return null;
  return (
    <Group
      x={x} y={y}
      draggable={!piece.snapped}
      dragBoundFunc={!piece.snapped ? dragBound : undefined}
      onDragStart={!piece.snapped ? handleDragStart : undefined}
      onDragEnd={!piece.snapped ? handleDragEndInner : undefined}
      onMouseEnter={(e) => { if (!piece.snapped) { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab'; } }}
      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default'; }}
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

// ─── DraggablePieceGroup — connected group on board ──────────
interface PieceGroupProps {
  groupPieces: PuzzlePiece[];
  offsetX: number;
  offsetY: number;
  worldW: number;
  worldH: number;
  onGroupDragEnd: (ids: string[], dx: number, dy: number) => void;
}

function DraggablePieceGroup({
  groupPieces, offsetX, offsetY, worldW, worldH, onGroupDragEnd,
}: PieceGroupProps) {
  const startPos = useRef({ x: offsetX, y: offsetY });
  const groupW = Math.max(...groupPieces.map((p) => p.currentX - offsetX + p.pieceWidth));
  const groupH = Math.max(...groupPieces.map((p) => p.currentY - offsetY + p.pieceHeight));

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    startPos.current = { x: e.target.x(), y: e.target.y() };
    e.target.moveToTop();
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'grabbing';
  }, []);

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const dx = e.target.x() - startPos.current.x;
    const dy = e.target.y() - startPos.current.y;
    onGroupDragEnd(groupPieces.map((p) => p.id), dx, dy);
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'default';
  }, [groupPieces, onGroupDragEnd]);

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(pos.x, worldW - groupW)),
      y: Math.max(0, Math.min(pos.y, worldH - groupH)),
    }),
    [worldW, worldH, groupW, groupH],
  );

  return (
    <Group
      x={offsetX} y={offsetY}
      draggable
      dragBoundFunc={dragBound}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab'; }}
      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default'; }}
    >
      {groupPieces.map((piece) => (
        <PieceImage
          key={piece.id} piece={piece}
          relX={piece.currentX - offsetX}
          relY={piece.currentY - offsetY}
        />
      ))}
    </Group>
  );
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

// ─── helpers ──────────────────────────────────────────────────
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

// ─── TrayPieceTile — draggable single piece inside a tray ─────
// Coordinates are in STAGE SCREEN SPACE (already includes tray offset + scale).
interface TrayPieceTileProps {
  piece: PuzzlePiece;
  /** Stage-screen x (left edge of piece) */
  stageX: number;
  /** Stage-screen y (left edge of piece, accounting for scroll) */
  stageY: number;
  scale: number;
  trayRegionMinX: number;
  trayRegionMaxX: number;
  containerH: number;
  onTrayDragEnd: (id: string, stageX: number, stageY: number) => void;
}

function TrayPieceTile({
  piece, stageX, stageY, scale,
  trayRegionMinX, trayRegionMaxX, containerH,
  onTrayDragEnd,
}: TrayPieceTileProps) {
  const img = useImage(piece.imageUrl);
  const pw = piece.pieceWidth  * scale;
  const ph = piece.pieceHeight * scale;

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => {
      // Clamp to tray region horizontally, full stage vertically
      return {
        x: Math.max(trayRegionMinX, Math.min(pos.x, trayRegionMaxX - pw)),
        y: Math.max(0, Math.min(pos.y, containerH - ph)),
      };
    },
    [trayRegionMinX, trayRegionMaxX, pw, ph, containerH],
  );

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.target.moveToTop();
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'grabbing';
  }, []);

  const handleDragEndInner = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onTrayDragEnd(piece.id, e.target.x(), e.target.y());
      const c = e.target.getStage()?.container();
      if (c) c.style.cursor = 'default';
    },
    [piece.id, onTrayDragEnd],
  );

  if (!img) return null;
  return (
    <Group
      x={stageX} y={stageY}
      scaleX={scale} scaleY={scale}
      draggable
      dragBoundFunc={dragBound}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEndInner}
      onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab'; }}
      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default'; }}
    >
      <KonvaImage
        image={img} x={0} y={0}
        width={piece.pieceWidth} height={piece.pieceHeight}
      />
    </Group>
  );
}

// ─── TrayGroupTile — draggable connected group inside a tray ──
interface TrayGroupTileProps {
  groupPieces: PuzzlePiece[];
  scale: number;
  trayRegionMinX: number;
  trayRegionMaxX: number;
  containerH: number;
  onTrayGroupDragEnd: (ids: string[], stageX: number, stageY: number, dx: number, dy: number) => void;
}

function TrayGroupTile({
  groupPieces, scale,
  trayRegionMinX, trayRegionMaxX, containerH,
  onTrayGroupDragEnd,
}: TrayGroupTileProps) {
  // Group anchor = min coords of all pieces (in stage screen space)
  const minX = Math.min(...groupPieces.map((p) => p.currentX));
  const minY = Math.min(...groupPieces.map((p) => p.currentY));
  const groupW = (Math.max(...groupPieces.map((p) => p.currentX - minX + p.pieceWidth  * scale)));
  const groupH = (Math.max(...groupPieces.map((p) => p.currentY - minY + p.pieceHeight * scale)));

  const startPos = useRef({ x: minX, y: minY });

  const dragBound = useCallback(
    (pos: { x: number; y: number }) => ({
      x: Math.max(trayRegionMinX, Math.min(pos.x, trayRegionMaxX - groupW)),
      y: Math.max(0, Math.min(pos.y, containerH - groupH)),
    }),
    [trayRegionMinX, trayRegionMaxX, groupW, groupH, containerH],
  );

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    startPos.current = { x: e.target.x(), y: e.target.y() };
    e.target.moveToTop();
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'grabbing';
  }, []);

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const dx = e.target.x() - startPos.current.x;
    const dy = e.target.y() - startPos.current.y;
    onTrayGroupDragEnd(groupPieces.map((p) => p.id), e.target.x(), e.target.y(), dx, dy);
    const c = e.target.getStage()?.container();
    if (c) c.style.cursor = 'default';
  }, [groupPieces, onTrayGroupDragEnd]);

  return (
    <Group
      x={minX} y={minY}
      draggable
      dragBoundFunc={dragBound}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'grab'; }}
      onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default'; }}
    >
      {groupPieces.map((piece) => {
        const relX = piece.currentX - minX;
        const relY = piece.currentY - minY;
        return (
          <TrayGroupPieceImage key={piece.id} piece={piece} relX={relX} relY={relY} scale={scale} />
        );
      })}
    </Group>
  );
}

function TrayGroupPieceImage({
  piece, relX, relY, scale,
}: { piece: PuzzlePiece; relX: number; relY: number; scale: number }) {
  const img = useImage(piece.imageUrl);
  if (!img) return null;
  return (
    <KonvaImage
      image={img}
      x={relX / scale} y={relY / scale}
      scaleX={scale} scaleY={scale}
      width={piece.pieceWidth} height={piece.pieceHeight}
    />
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
  const wrapRef  = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const cropRef  = useRef({ trayW: 0, boardOffsetY: 0, targetW: 0, targetH: 0, scale: 1 });

  // ── captureSnapshot ─────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    captureSnapshot: async () => {
      const stage = stageRef.current;
      if (!stage) return null;
      try {
        const { trayW, boardOffsetY, targetW, targetH, scale } = cropRef.current;
        const fullDataUrl = stage.toDataURL({ pixelRatio: 1 });
        if (!fullDataUrl || fullDataUrl === 'data:,') return null;
        const sx = Math.round(trayW  * scale);
        const sy = Math.round(boardOffsetY * scale);
        const sw = Math.round(targetW * scale);
        const sh = Math.round(targetH * scale);
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

  const handleZoomIn      = useCallback(() => setZoomLevel((z) => Math.min(z + 0.2, 3)), []);
  const handleZoomOut     = useCallback(() => setZoomLevel((z) => Math.max(z - 0.2, 0.4)), []);
  const handleCenterBoard = useCallback(() => setPanOffset({ x: 0, y: 0 }), []);

  // ── Tray scroll state ──────────────────────────────────────
  const [leftScrollY,  setLeftScrollY]  = useState(0);
  const [rightScrollY, setRightScrollY] = useState(0);
  const leftScrollYRef  = useRef(0);
  const rightScrollYRef = useRef(0);
  leftScrollYRef.current  = leftScrollY;
  rightScrollYRef.current = rightScrollY;

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

  // ── Single-Stage layout ─────────────────────────────────────
  // trayW = 29% of containerW; boardW fills the rest
  const trayW  = Math.floor(containerW * 0.29);
  const boardW = containerW - trayW * 2;

  // Scale: fit puzzle in boardW × containerH
  const baseScaleW = ready ? boardW  / targetW : 1;
  const baseScaleH = ready ? containerH / targetH : baseScaleW;
  const baseScale  = Math.min(baseScaleW, baseScaleH);
  const safeScale  = baseScale * zoomLevel;

  // Board group origin inside the single stage
  const boardOffsetY = (containerH - targetH * safeScale) / 2;

  // Keep cropRef up to date for snapshot
  cropRef.current = { trayW, boardOffsetY, targetW, targetH, scale: safeScale };
  const safeScaleRef    = useRef(safeScale);
  safeScaleRef.current  = safeScale;
  const boardOffsetYRef = useRef(boardOffsetY);
  boardOffsetYRef.current = boardOffsetY;
  const trayWRef = useRef(trayW);
  trayWRef.current = trayW;

  // ── World coords for board pieces (board-local, 0..targetW/H) ─
  const worldW = targetW;
  const worldH = targetH;
  const targetOX = 0;
  const targetOY = 0;

  // ── Tray column counts ──────────────────────────────────────
  const trayColCount = computeTrayColCount(trayW, pw, safeScale);

  // ── Partition pieces ────────────────────────────────────────
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
  const groups     = [...groupMap.entries()];
  const freePieces = boardPieces.filter((p) => !p.snapped && p.groupId == null);
  const hintPiece  = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  // ── Tray group maps ─────────────────────────────────────────
  const leftTrayGroupMap  = new Map<number, PuzzlePiece[]>();
  const rightTrayGroupMap = new Map<number, PuzzlePiece[]>();
  for (const p of leftTrayPieces) {
    if (p.groupId != null) {
      const arr = leftTrayGroupMap.get(p.groupId) ?? [];
      arr.push(p); leftTrayGroupMap.set(p.groupId, arr);
    }
  }
  for (const p of rightTrayPieces) {
    if (p.groupId != null) {
      const arr = rightTrayGroupMap.get(p.groupId) ?? [];
      arr.push(p); rightTrayGroupMap.set(p.groupId, arr);
    }
  }

  // ── Tray scroll content heights ─────────────────────────────
  const leftUnGrouped  = leftTrayPieces.filter((p) => p.groupId == null);
  const rightUnGrouped = rightTrayPieces.filter((p) => p.groupId == null);
  const leftContentH   = computeTrayContentH(leftUnGrouped.length,  trayColCount, ph) * safeScale;
  const rightContentH  = computeTrayContentH(rightUnGrouped.length, trayColCount, ph) * safeScale;
  const leftMaxScrollY  = Math.max(0, leftContentH  - containerH);
  const rightMaxScrollY = Math.max(0, rightContentH - containerH);
  const leftScrollClamped  = Math.min(leftScrollY,  leftMaxScrollY);
  const rightScrollClamped = Math.min(rightScrollY, rightMaxScrollY);

  // ── Tray slot → stage coords ────────────────────────────────
  // Left tray slots start at stage x=0. Right tray slots start at stage x=trayW+boardW.
  function leftSlotToStage(slotIdx: number) {
    const { x, y } = slotCoords(slotIdx, trayColCount, pw, ph);
    return {
      sx: x * safeScale,
      sy: y * safeScale - leftScrollClamped,
    };
  }
  function rightSlotToStage(slotIdx: number) {
    const { x, y } = slotCoords(slotIdx, trayColCount, pw, ph);
    return {
      sx: trayW + boardW + x * safeScale,
      sy: y * safeScale - rightScrollClamped,
    };
  }

  // ── Scatter / redistribute into trays on reset ─────────────
  const prevPieceCount = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const allAtOrigin = pieces.every((p) => p.currentX === 0 && p.currentY === 0 && !p.snapped);
    const countChanged = pieces.length !== prevPieceCount.current;
    prevPieceCount.current = pieces.length;
    if (!allAtOrigin && !countChanged) return;

    setLeftScrollY(0);
    setRightScrollY(0);

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

  // ── Wheel events for tray scrolling ─────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Check pointer position inside the wrapper to decide which tray
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const localX = e.clientX - rect.left;
    if (localX < trayWRef.current) {
      // Left tray
      setLeftScrollY((prev) => {
        const max = Math.max(0, leftContentH - containerH);
        return Math.max(0, Math.min(prev + e.deltaY, max));
      });
    } else if (localX > trayWRef.current + boardW) {
      // Right tray
      setRightScrollY((prev) => {
        const max = Math.max(0, rightContentH - containerH);
        return Math.max(0, Math.min(prev + e.deltaY, max));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftContentH, rightContentH, containerH, boardW]);

  // ── Snap helpers (board world space) ─────────────────────────
  const trySnapToFinal = useCallback(
    (id: string, wx: number, wy: number, piecesArr: PuzzlePiece[], threshold = SNAP_THRESHOLD) => {
      const piece = piecesArr.find((p) => p.id === id);
      if (!piece) return null;
      const correctWX = targetOX + piece.correctX;
      const correctWY = targetOY + piece.correctY;
      const dist = Math.hypot(
        (wx + pw / 2) - (correctWX + pw / 2),
        (wy + ph / 2) - (correctWY + ph / 2),
      );
      if (dist <= gridCellW * threshold * 3) {
        playSnapSound();
        let updated = piecesArr.map((p) =>
          p.id === id ? { ...p, currentX: correctWX, currentY: correctWY, zone: 'free' as const } : p,
        );
        updated = lockCorrectPieces(updated, targetOX, targetOY);
        return updated;
      }
      return null;
    },
    [pw, ph, gridCellW, targetOX, targetOY],
  );

  const trySnapToPiece = useCallback(
    (id: string, wx: number, wy: number, piecesArr: PuzzlePiece[], threshold = SNAP_THRESHOLD) => {
      const piece = piecesArr.find((p) => p.id === id);
      if (!piece) return null;
      const neighbors = piecesArr.filter((other) => {
        if (other.id === id || (other.zone !== 'free' && !other.snapped)) return false;
        const colDiff = Math.abs(piece.correctCol - other.correctCol);
        const rowDiff = Math.abs(piece.correctRow - other.correctRow);
        return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
      });
      for (const neighbor of neighbors) {
        const expectedDx = (piece.correctCol - neighbor.correctCol) * gridCellW;
        const expectedDy = (piece.correctRow - neighbor.correctRow) * gridCellH;
        const expectedX  = neighbor.currentX + expectedDx;
        const expectedY  = neighbor.currentY + expectedDy;
        const snapDist   = Math.hypot(wx - expectedX, wy - expectedY);
        if (snapDist <= gridCellW * threshold * 3) {
          playSnapSound();
          const gid = neighbor.groupId ?? nextGroupId(piecesArr);
          let updated = piecesArr.map((p) => {
            if (p.id === id) return { ...p, currentX: expectedX, currentY: expectedY, groupId: gid, zone: 'free' as const };
            if (p.id === neighbor.id && p.groupId == null) return { ...p, groupId: gid };
            return p;
          });
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          return updated;
        }
      }
      return null;
    },
    [gridCellW, gridCellH, targetOX, targetOY],
  );

  // ── Tray piece drag end ─────────────────────────────────────
  // stageX/stageY are the top-left of the piece GROUP in stage screen coords
  const handleTrayDragEnd = useCallback(
    (id: string, stageX: number, stageY: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      const curTrayW     = trayWRef.current;
      const curBoardOY   = boardOffsetYRef.current;
      const curScale     = safeScaleRef.current;
      const rightStart   = curTrayW + boardW;

      const isOverBoard = stageX >= curTrayW && stageX < rightStart;

      if (isOverBoard) {
        // Convert stage coords to board world coords
        const boardWx = (stageX - curTrayW) / curScale;
        const boardWy = (stageY - curBoardOY) / curScale;
        const clampedWx = Math.max(0, Math.min(boardWx, worldW - piece.pieceWidth));
        const clampedWy = Math.max(0, Math.min(boardWy, worldH - piece.pieceHeight));

        // Try final snap
        const r1 = trySnapToFinal(id, clampedWx, clampedWy, pieces, SNAP_THRESHOLD);
        if (r1) { onPiecesChange(r1); return; }

        // Try piece-to-piece snap
        const r2 = trySnapToPiece(id, clampedWx, clampedWy, pieces, SNAP_THRESHOLD);
        if (r2) { onPiecesChange(r2); return; }

        // Drop freely on board
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, currentX: clampedWx, currentY: clampedWy, zone: 'free' as const }
            : p,
        ));
      } else {
        // Stayed in tray — store stage screen coords directly
        const isLeft     = stageX < curTrayW;
        const targetZone = (isLeft ? 'left' : 'right') as import('../types/puzzle').PieceZone;
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, zone: targetZone, currentX: stageX, currentY: stageY, groupId: null }
            : p,
        ));
      }
    },
    [pieces, boardW, worldW, worldH, trySnapToFinal, trySnapToPiece, onPiecesChange],
  );

  // ── Tray group drag end ─────────────────────────────────────
  const handleTrayGroupDragEnd = useCallback(
    (ids: string[], stageX: number, stageY: number, dx: number, dy: number) => {
      const groupPieces = pieces.filter((p) => ids.includes(p.id));
      if (groupPieces.length === 0) return;

      const curTrayW   = trayWRef.current;
      const curBoardOY = boardOffsetYRef.current;
      const curScale   = safeScaleRef.current;
      const rightStart = curTrayW + boardW;

      const isOverBoard = stageX >= curTrayW && stageX < rightStart;

      if (isOverBoard) {
        // Convert the anchor (first piece) to board world coords
        const boardWx = (stageX - curTrayW) / curScale;
        const boardWy = (stageY - curBoardOY) / curScale;

        // The anchor is minX/minY of the group; place all pieces relative to it
        const minCX = Math.min(...groupPieces.map((p) => p.currentX));
        const minCY = Math.min(...groupPieces.map((p) => p.currentY));

        const updated = pieces.map((p) => {
          if (!ids.includes(p.id)) return p;
          const relX = (p.currentX - minCX) / curScale;
          const relY = (p.currentY - minCY) / curScale;
          return {
            ...p,
            currentX: Math.max(0, Math.min(boardWx + relX, worldW - p.pieceWidth)),
            currentY: Math.max(0, Math.min(boardWy + relY, worldH - p.pieceHeight)),
            zone: 'free' as const,
          };
        });
        onPiecesChange(updated);
      } else {
        // Stayed in tray — update positions by delta
        const isLeft     = stageX < curTrayW;
        const targetZone = (isLeft ? 'left' : 'right') as import('../types/puzzle').PieceZone;
        onPiecesChange(pieces.map((p) => {
          if (!ids.includes(p.id)) return p;
          return { ...p, zone: targetZone, currentX: p.currentX + dx, currentY: p.currentY + dy };
        }));
      }
    },
    [pieces, boardW, worldW, worldH, onPiecesChange],
  );

  // ── Board piece drag end ─────────────────────────────────────
  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;
      const clampedWx = Math.max(0, Math.min(wx, worldW - piece.pieceWidth));
      const clampedWy = Math.max(0, Math.min(wy, worldH - piece.pieceHeight));

      // 1. Snap to final
      const correctWX = targetOX + piece.correctX;
      const correctWY = targetOY + piece.correctY;
      const dist = Math.hypot(
        (clampedWx + pw / 2) - (correctWX + pw / 2),
        (clampedWy + ph / 2) - (correctWY + ph / 2),
      );
      if (dist <= gridCellW * SNAP_THRESHOLD) {
        playSnapSound();
        let updated = pieces.map((p) =>
          p.id === id ? { ...p, currentX: correctWX, currentY: correctWY } : p,
        );
        updated = lockCorrectPieces(updated, targetOX, targetOY);
        onPiecesChange(updated);
        return;
      }

      // 2. Piece-to-piece snap
      const neighbors = pieces.filter((other) => {
        if (other.id === id || (other.zone !== 'free' && !other.snapped)) return false;
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

      // 3. Free drop
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, currentX: clampedWx, currentY: clampedWy } : p,
      ));
    },
    [pieces, pw, ph, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange],
  );

  // ── Board group drag end ─────────────────────────────────────
  const handleGroupDragEnd = useCallback(
    (ids: string[], dx: number, dy: number) => {
      let updated = pieces.map((p) =>
        ids.includes(p.id) ? { ...p, currentX: p.currentX + dx, currentY: p.currentY + dy } : p,
      );
      const groupPieces = updated.filter((p) => ids.includes(p.id));

      // 1. Snap group onto board
      for (const gp of groupPieces) {
        const correctWX = targetOX + gp.correctX;
        const correctWY = targetOY + gp.correctY;
        const distToTarget = Math.hypot(gp.currentX - correctWX, gp.currentY - correctWY);
        if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
          const offX = correctWX - gp.currentX;
          const offY = correctWY - gp.currentY;
          playSnapSound();
          updated = updated.map((p) =>
            ids.includes(p.id) ? { ...p, currentX: p.currentX + offX, currentY: p.currentY + offY } : p,
          );
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          onPiecesChange(updated);
          return;
        }
      }

      // 2. Connect to neighboring piece/group
      for (const gPiece of groupPieces) {
        const neighbors = updated.filter((other) => {
          if (ids.includes(other.id) || (other.zone !== 'free' && !other.snapped)) return false;
          const colDiff = Math.abs(gPiece.correctCol - other.correctCol);
          const rowDiff = Math.abs(gPiece.correctRow - other.correctRow);
          return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
        });
        for (const neighbor of neighbors) {
          const expectedDx = (gPiece.correctCol - neighbor.correctCol) * gridCellW;
          const expectedDy = (gPiece.correctRow - neighbor.correctRow) * gridCellH;
          const expectedX  = neighbor.currentX + expectedDx;
          const expectedY  = neighbor.currentY + expectedDy;
          const snapDist   = Math.hypot(gPiece.currentX - expectedX, gPiece.currentY - expectedY);
          if (snapDist <= gridCellW * SNAP_THRESHOLD) {
            const offX = expectedX - gPiece.currentX;
            const offY = expectedY - gPiece.currentY;
            playSnapSound();
            const gid = gPiece.groupId ?? neighbor.groupId ?? nextGroupId(updated);
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

      // 3. No snap — clamp
      updated = updated.map((p) => {
        if (!ids.includes(p.id)) return p;
        return {
          ...p,
          currentX: Math.max(0, Math.min(p.currentX, worldW - p.pieceWidth)),
          currentY: Math.max(0, Math.min(p.currentY, worldH - p.pieceHeight)),
        };
      });
      onPiecesChange(updated);
    },
    [pieces, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange],
  );

  // ── Pan pointer handlers on the outer wrapper ───────────────
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

  // ── Scrollbar thumbs ─────────────────────────────────────────
  const leftThumbH   = Math.max(40, (containerH / Math.max(leftContentH,  containerH)) * containerH);
  const rightThumbH  = Math.max(40, (containerH / Math.max(rightContentH, containerH)) * containerH);
  const leftThumbTop = leftMaxScrollY  > 0 ? (leftScrollClamped  / leftMaxScrollY)  * (containerH - leftThumbH)  : 0;
  const rightThumbTop = rightMaxScrollY > 0 ? (rightScrollClamped / rightMaxScrollY) * (containerH - rightThumbH) : 0;

  const leftThumbDrag  = useRef<{ startY: number; startScroll: number } | null>(null);
  const rightThumbDrag = useRef<{ startY: number; startScroll: number } | null>(null);

  const makeThumbHandlers = (
    side: 'left' | 'right',
    clampedScroll: number,
    maxScroll: number,
    thumbH: number,
    setScroll: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    const dragRef = side === 'left' ? leftThumbDrag : rightThumbDrag;
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startY: e.clientY, startScroll: clampedScroll };
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const dy = e.clientY - dragRef.current.startY;
        const ratio = dy / (containerH - thumbH);
        setScroll(Math.max(0, Math.min(dragRef.current.startScroll + ratio * maxScroll, maxScroll)));
      },
      onPointerUp: () => { dragRef.current = null; },
      onPointerLeave: () => { dragRef.current = null; },
    };
  };

  const leftScrollbarHandlers  = makeThumbHandlers('left',  leftScrollClamped,  leftMaxScrollY,  leftThumbH,  setLeftScrollY);
  const rightScrollbarHandlers = makeThumbHandlers('right', rightScrollClamped, rightMaxScrollY, rightThumbH, setRightScrollY);

  if (!ready) {
    return <div className="puzzle-layout-wrap" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      className="puzzle-layout-wrap"
      ref={wrapRef}
      style={{ position: 'relative', cursor: panMode ? (panDrag.current ? 'grabbing' : 'grab') : 'default' }}
      onWheel={handleWheel}
      onPointerDown={handlePanPointerDown}
      onPointerMove={handlePanPointerMove}
      onPointerUp={handlePanPointerUp}
      onPointerLeave={handlePanPointerUp}
    >
      {/* ── Single unified Konva Stage ── */}
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          width: containerW,
          height: containerH,
          pointerEvents: panMode ? 'none' : 'auto',
        }}
      >
        <Stage ref={stageRef} width={containerW} height={containerH}>

          {/* Background */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={containerW} height={containerH} fill="#2f2d3e" />
            {/* Board area highlight */}
            <Rect
              x={trayW} y={boardOffsetY}
              width={targetW * safeScale} height={targetH * safeScale}
              fill="#3a3850" cornerRadius={4} listening={false}
            />
          </Layer>

          {/* Left tray ungrouped pieces (clipped) */}
          <Layer>
            <Group
              clipX={0} clipY={0} clipWidth={trayW} clipHeight={containerH}
            >
              {(() => {
                let slotIdx = 0;
                return leftUnGrouped.map((piece) => {
                  const { sx, sy } = leftSlotToStage(slotIdx++);
                  return (
                    <TrayPieceTile
                      key={piece.id}
                      piece={piece}
                      stageX={sx} stageY={sy}
                      scale={safeScale}
                      trayRegionMinX={0} trayRegionMaxX={trayW}
                      containerH={containerH}
                      onTrayDragEnd={handleTrayDragEnd}
                    />
                  );
                });
              })()}
            </Group>
          </Layer>

          {/* Left tray grouped pieces (clipped) */}
          <Layer>
            <Group clipX={0} clipY={0} clipWidth={trayW} clipHeight={containerH}>
              {[...leftTrayGroupMap.entries()].map(([gid, gPieces]) => (
                <TrayGroupTile
                  key={`ltg-${gid}`}
                  groupPieces={gPieces}
                  scale={safeScale}
                  trayRegionMinX={0} trayRegionMaxX={trayW}
                  containerH={containerH}
                  onTrayGroupDragEnd={handleTrayGroupDragEnd}
                />
              ))}
            </Group>
          </Layer>

          {/* Right tray ungrouped pieces (clipped) */}
          <Layer>
            <Group
              clipX={trayW + boardW} clipY={0}
              clipWidth={trayW} clipHeight={containerH}
            >
              {(() => {
                let slotIdx = 0;
                return rightUnGrouped.map((piece) => {
                  const { sx, sy } = rightSlotToStage(slotIdx++);
                  return (
                    <TrayPieceTile
                      key={piece.id}
                      piece={piece}
                      stageX={sx} stageY={sy}
                      scale={safeScale}
                      trayRegionMinX={trayW + boardW} trayRegionMaxX={containerW}
                      containerH={containerH}
                      onTrayDragEnd={handleTrayDragEnd}
                    />
                  );
                });
              })()}
            </Group>
          </Layer>

          {/* Right tray grouped pieces (clipped) */}
          <Layer>
            <Group clipX={trayW + boardW} clipY={0} clipWidth={trayW} clipHeight={containerH}>
              {[...rightTrayGroupMap.entries()].map(([gid, gPieces]) => (
                <TrayGroupTile
                  key={`rtg-${gid}`}
                  groupPieces={gPieces}
                  scale={safeScale}
                  trayRegionMinX={trayW + boardW} trayRegionMaxX={containerW}
                  containerH={containerH}
                  onTrayGroupDragEnd={handleTrayGroupDragEnd}
                />
              ))}
            </Group>
          </Layer>

          {/* Board locked pieces */}
          <Layer>
            <Group x={trayW} y={boardOffsetY} scaleX={safeScale} scaleY={safeScale}>
              {lockedPieces.map((piece) => (
                <DraggablePieceTile
                  key={piece.id} piece={piece}
                  x={piece.currentX} y={piece.currentY}
                  worldW={worldW} worldH={worldH}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </Group>
          </Layer>

          {/* Board groups */}
          <Layer>
            <Group x={trayW} y={boardOffsetY} scaleX={safeScale} scaleY={safeScale}>
              {groups.map(([gid, group]) => {
                const minX = Math.min(...group.map((p) => p.currentX));
                const minY = Math.min(...group.map((p) => p.currentY));
                return (
                  <DraggablePieceGroup
                    key={`group-${gid}`}
                    groupPieces={group}
                    offsetX={minX} offsetY={minY}
                    worldW={worldW} worldH={worldH}
                    onGroupDragEnd={handleGroupDragEnd}
                  />
                );
              })}
            </Group>
          </Layer>

          {/* Board free pieces */}
          <Layer>
            <Group x={trayW} y={boardOffsetY} scaleX={safeScale} scaleY={safeScale}>
              {freePieces.map((piece) => (
                <DraggablePieceTile
                  key={piece.id} piece={piece}
                  x={piece.currentX} y={piece.currentY}
                  worldW={worldW} worldH={worldH}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </Group>
          </Layer>

          {/* Hint overlay */}
          {hintPiece && (
            <Layer listening={false}>
              <Group x={trayW} y={boardOffsetY} scaleX={safeScale} scaleY={safeScale}>
                <HintOverlay piece={hintPiece} targetOX={targetOX} targetOY={targetOY} />
              </Group>
            </Layer>
          )}
        </Stage>
      </div>

      {/* ── HTML overlay: scrollbars ── */}
      {/* Left scrollbar */}
      <div
        className="puzzle-tray-scrollbar puzzle-tray-scrollbar--left"
        style={{
          position: 'absolute', top: 0, left: 0,
          width: SCROLLBAR_W, height: containerH,
          background: 'rgba(0,0,0,0.25)', zIndex: 10, pointerEvents: 'auto',
        }}
      >
        <div
          className="puzzle-tray-thumb"
          style={{
            position: 'absolute', top: leftThumbTop, left: 0,
            width: SCROLLBAR_W, height: leftThumbH,
            borderRadius: 4, background: '#7c3aed', cursor: 'pointer',
            opacity: leftMaxScrollY > 0 ? 1 : 0.3,
          }}
          {...leftScrollbarHandlers}
        />
      </div>

      {/* Right scrollbar */}
      <div
        className="puzzle-tray-scrollbar puzzle-tray-scrollbar--right"
        style={{
          position: 'absolute', top: 0, right: 0,
          width: SCROLLBAR_W, height: containerH,
          background: 'rgba(0,0,0,0.25)', zIndex: 10, pointerEvents: 'auto',
        }}
      >
        <div
          className="puzzle-tray-thumb"
          style={{
            position: 'absolute', top: rightThumbTop, left: 0,
            width: SCROLLBAR_W, height: rightThumbH,
            borderRadius: 4, background: '#7c3aed', cursor: 'pointer',
            opacity: rightMaxScrollY > 0 ? 1 : 0.3,
          }}
          {...rightScrollbarHandlers}
        />
      </div>

      {/* ── Zoom / pan controls ── */}
      <div
        className="puzzle-zoom-controls"
        style={{ right: trayW + 12 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
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
  );
});

export default PuzzleBoard;
