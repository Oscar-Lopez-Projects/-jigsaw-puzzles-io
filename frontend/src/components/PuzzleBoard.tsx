import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { playSnapSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── layout constants ─────────────────────────────────────────
const SNAP_THRESHOLD = 0.5;
const MARGIN_RATIO_X = 0.30; // default horizontal margin ratio (landscape / small counts)
const MARGIN_RATIO_Y = 0.12; // default vertical margin ratio

// For portrait images: no top/bottom margin (fills full height),
// side margins are computed dynamically from remaining screen width.

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

  // Keep the piece fully inside the world bounds while dragging
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
        listening={!piece.snapped}
        shadowColor={piece.snapped ? '#22c55e' : undefined}
        shadowBlur={piece.snapped ? 14 : 0}
        shadowOpacity={piece.snapped ? 1 : 0}
        shadowOffset={{ x: 0, y: 0 }}
      />
    </Group>
  );
}

// ─── Piece Group (multiple snapped pieces that move together) ──
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

  // Bounding size of the group (relative to its top-left offset)
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

  // Keep the whole group inside the world bounds while dragging
  const dragBound = useCallback(
    (pos: { x: number; y: number }) => {
      const maxX = Math.max(0, (worldW - groupW) * scale);
      const maxY = Math.max(0, (worldH - groupH) * scale);
      return {
        x: Math.max(0, Math.min(pos.x, maxX)),
        y: Math.max(0, Math.min(pos.y, maxY)),
      };
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
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
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
  return (
    <KonvaImage image={img} x={relX} y={relY} width={piece.pieceWidth} height={piece.pieceHeight} listening={true} />
  );
}

// ─── Hint overlay: shows the piece shape at its slot + glows the real piece ──
function HintOverlay({ piece, targetOX, targetOY }: { piece: PuzzlePiece; targetOX: number; targetOY: number }) {
  const img = useImage(piece.imageUrl);
  if (!img) return null;
  const targetX = targetOX + piece.correctX;
  const targetY = targetOY + piece.correctY;
  return (
    <>
      {/* Ghost of the piece at its correct board slot — shows the jigsaw shape */}
      <KonvaImage
        image={img}
        x={targetX} y={targetY}
        width={piece.pieceWidth} height={piece.pieceHeight}
        opacity={0.55}
        shadowColor="#22c55e"
        shadowBlur={18}
        shadowOpacity={1}
        shadowOffset={{ x: 0, y: 0 }}
        listening={false}
      />
      {/* Green glow around the actual piece so the player can find it */}
      <KonvaImage
        image={img}
        x={piece.currentX} y={piece.currentY}
        width={piece.pieceWidth} height={piece.pieceHeight}
        shadowColor="#22c55e"
        shadowBlur={24}
        shadowOpacity={1}
        shadowOffset={{ x: 0, y: 0 }}
        listening={false}
      />
    </>
  );
}

// ─── Helpers ───────────────────────────────────────────────────
/**
 * Lock any non-locked piece that is sitting exactly at its correct final
 * board position. This catches pieces placed directly on the board as well
 * as pieces/groups that connect to an already-locked piece.
 */
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

/** Next unused group id. */
function nextGroupId(arr: PuzzlePiece[]): number {
  return arr.reduce((m, p) => Math.max(m, p.groupId ?? 0), 0) + 1;
}

// ─── PuzzleBoard ───────────────────────────────────────────────
interface PuzzleBoardProps {
  pieces: PuzzlePiece[];
  cols: number;
  rows: number;
  onPiecesChange: (pieces: PuzzlePiece[]) => void;
  hintPieceId?: string | null;
}

export interface PuzzleBoardHandle {
  /** Capture the completed puzzle area as a PNG data URL. Returns null if not ready. */
  captureSnapshot: () => Promise<string | null>;
}

const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
function PuzzleBoard({ pieces, cols, rows, onPiecesChange, hintPieceId }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  // Keep current crop params in a ref so captureSnapshot always reads latest values
  const cropRef = useRef({ targetOX: 0, targetOY: 0, targetW: 0, targetH: 0, scale: 1 });

  // Expose captureSnapshot to parent via ref
  useImperativeHandle(ref, () => ({
    captureSnapshot: async () => {
      const stage = stageRef.current;
      if (!stage) {
        console.warn('[captureSnapshot] stageRef is null');
        return null;
      }
      try {
        const { targetOX, targetOY, targetW, targetH, scale } = cropRef.current;

        // Step 1: capture the full stage at screen scale (what's actually rendered)
        const fullDataUrl = stage.toDataURL({ pixelRatio: 1 });
        if (!fullDataUrl || fullDataUrl === 'data:,') return null;

        // Step 2: crop to just the target area using a temporary canvas
        // The stage is rendered at safeScale, so world coords → screen coords = * scale
        const sx = Math.round(targetOX * scale);
        const sy = Math.round(targetOY * scale);
        const sw = Math.round(targetW  * scale);
        const sh = Math.round(targetH  * scale);

        return new Promise<string | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const out = document.createElement('canvas');
            out.width  = sw;
            out.height = sh;
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
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // ── Side scrollbar state ───────────────────────────────────────
  // Tracks the vertical scroll ratio (0 = top, 1 = bottom) for the side panels.
  // Only relevant for portrait images where stageH > containerH.
  const [scrollRatio, setScrollRatio] = useState(0);
  const scrollDragging = useRef<{ side: 'left' | 'right'; startY: number; startRatio: number } | null>(null);

  const handleScrollThumbPointerDown = useCallback((e: React.PointerEvent, side: 'left' | 'right') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrollDragging.current = { side, startY: e.clientY, startRatio: scrollRatio };
  }, [scrollRatio]);

  const handleScrollThumbPointerMove = useCallback((_e: React.PointerEvent) => {
    if (!scrollDragging.current) return;
    // Will be handled by wrapRef's pointer move — no-op here since we use global handlers
  }, []);

  const handleScrollThumbPointerUp = useCallback(() => {
    scrollDragging.current = null;
  }, []);

  // Pan drag tracking — stored in a ref so pointer handlers don't go stale
  const panDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => Math.min(z + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => Math.max(z - 0.2, 0.4));
  }, []);

  const handleCenterBoard = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ── Portrait images: always max side space, no user toggle ─────
  // No expand state needed — determined purely by isPortrait below.

  // Pointer handlers for free-range pan (tracked on the whole wrap, no DOM clipping)
  const handlePanPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panDrag.current = { startX: e.clientX, startY: e.clientY, originX: panOffset.x, originY: panOffset.y };
  }, [panMode, panOffset]);

  const handlePanPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Handle scroll thumb dragging
    if (scrollDragging.current) {
      const dy = e.clientY - scrollDragging.current.startY;
      // Convert pixel drag to ratio change based on track height
      const trackH = (wrapRef.current?.clientHeight ?? 1) - 40; // minus thumb min height
      const deltaRatio = dy / trackH;
      const newRatio = Math.max(0, Math.min(1, scrollDragging.current.startRatio + deltaRatio));
      setScrollRatio(newRatio);
      return;
    }
    if (!panDrag.current) return;
    const dx = e.clientX - panDrag.current.startX;
    const dy = e.clientY - panDrag.current.startY;
    setPanOffset({ x: panDrag.current.originX + dx, y: panDrag.current.originY + dy });
  }, []);

  const handleWheelOnSide = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Scroll by moving panOffset.y
    setPanOffset((prev) => ({
      x: prev.x,
      y: prev.y - e.deltaY * 0.6,
    }));
  }, []);

  const handlePanPointerUp = useCallback(() => {
    panDrag.current = null;
  }, []);

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

  const pw = pieces[0]?.pieceWidth  ?? 0;
  const ph = pieces[0]?.pieceHeight ?? 0;

  // Derive grid cell size
  const piece0 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 0);
  const piece1 = pieces.find((p) => p.correctCol === 1 && p.correctRow === 0);
  const piece0r1 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 1);
  const gridCellW = piece0 && piece1 ? piece1.correctX - piece0.correctX : pw;
  const gridCellH = piece0 && piece0r1 ? piece0r1.correctY - piece0.correctY : ph;

  // Target area dimensions
  const targetW = cols * gridCellW;
  const targetH = rows * gridCellH;

  const ready = pieces.length > 0 && containerW > 0 && pw > 0 && ph > 0;

  // Portrait detection: by actual image dimensions, not grid shape.
  // An iPhone photo can be a 15×10 grid but still taller than wide.
  const isPortrait = ready ? targetH > targetW : rows > cols;

  // Portrait layout: fill full container height, use remaining width for side panels.
  // Step 1: scale the image to fill container height exactly (ignore side margins for now)
  const portraitScale = ready && containerH > 0 ? containerH / targetH : 1;
  // Step 2: how much horizontal space is left after the image
  const imageScreenW  = targetW * portraitScale;
  const leftoverW     = Math.max(containerW - imageScreenW, pw * 4); // at least 2 pieces per side
  const sideScreenW   = leftoverW / 2;
  // Step 3: convert back to world coords for marginX
  const portraitMarginX = sideScreenW / portraitScale;

  const marginX = isPortrait
    ? portraitMarginX
    : Math.max(pw * 3, targetW * MARGIN_RATIO_X);
  const marginY = isPortrait
    ? 0
    : Math.max(ph * 2, targetH * MARGIN_RATIO_Y);
  const worldW = targetW + marginX * 2;
  const worldH = targetH + marginY * 2;
  const targetOX = marginX;
  const targetOY = marginY;

  // Scale: portrait locks to container height (image fills full height).
  // Side margins are sized to fit the remaining width, so scaleByW = 1 exactly.
  // Landscape: standard fit-both.
  const scaleByW = ready ? containerW / worldW : 1;
  const scaleByH = ready && containerH > 0 ? containerH / worldH : scaleByW;
  const baseScale = isPortrait
    ? portraitScale                  // always fill height — sides are derived from this
    : Math.min(scaleByW, scaleByH);
  const safeScale = baseScale * zoomLevel;
  const stageW = worldW * safeScale;
  const stageH = worldH * safeScale;

  // Keep cropRef in sync so captureSnapshot always reads the latest values
  cropRef.current = { targetOX, targetOY, targetW, targetH, scale: safeScale };
  const safeScaleRef = useRef(safeScale);
  safeScaleRef.current = safeScale;

  // ── Scatter / redistribute ──────────────────────────────────────
  const prevWorldSize = useRef({ w: 0, h: 0 });
  useEffect(() => {
    if (!ready) return;

    const allAtOrigin = pieces.every((p) => p.currentX === 0 && p.currentY === 0 && !p.snapped);
    const worldChanged = worldW !== prevWorldSize.current.w || worldH !== prevWorldSize.current.h;
    prevWorldSize.current = { w: worldW, h: worldH };

    if (!allAtOrigin && !worldChanged) return;

    const tabSize = Math.round(pw * 0.132); // ≈ pieceW * 0.18 / 1.36
    const gap = Math.max(tabSize + 2, 12);  // safe inset from every edge
    const cW = pw + gap;
    const cH = ph + gap;

    // Right panel: subtract zoom controls width (52px screen space converted to world coords)
    const zoomControlsWorldW = Math.round(52 / safeScaleRef.current);
    const rightPanelEndX = worldW - zoomControlsWorldW - gap;

    // How many columns fit in each side panel
    const leftPanelW  = targetOX - gap;                 // left panel available width
    const rightPanelW = rightPanelEndX - (targetOX + targetW + gap); // right panel available width
    const leftCols  = Math.max(1, Math.floor(leftPanelW  / cW));
    const rightCols = Math.max(1, Math.floor(rightPanelW / cW));
    // How many rows fit vertically
    const rows_  = Math.max(1, Math.floor((worldH - gap * 2) / cH));

    const leftCapacity  = leftCols  * rows_;
    const rightCapacity = rightCols * rows_;
    const sideCapacity  = leftCapacity + rightCapacity;

    // Generate left slots: fill row by row (row-major so visual is left→right, top→bottom)
    const leftSlots: { x: number; y: number }[] = [];
    for (let row = 0; row < rows_; row++)
      for (let col = 0; col < leftCols; col++)
        leftSlots.push({ x: gap + col * cW, y: gap + row * cH });

    // Generate right slots: same but starting after target area
    const rightStartX = targetOX + targetW + gap;
    const rightSlots: { x: number; y: number }[] = [];
    for (let row = 0; row < rows_; row++)
      for (let col = 0; col < rightCols; col++) {
        const sx = rightStartX + col * cW;
        if (sx + pw <= rightPanelEndX) rightSlots.push({ x: sx, y: gap + row * cH });
      }

    // Interior slots for overflow
    const interiorSlots: { x: number; y: number }[] = [];
    for (let row = 0; row < Math.floor((targetH - gap * 2) / cH); row++)
      for (let col = 0; col < Math.floor((targetW - gap * 2) / cW); col++)
        interiorSlots.push({ x: targetOX + gap + col * cW, y: targetOY + gap + row * cH });

    // Split pieces into exactly left half and right half
    const unsnapped = allAtOrigin ? [...pieces] : pieces.filter((p) => !p.snapped);
    const shuffled = [...unsnapped].sort(() => Math.random() - 0.5);

    // Distribute: first leftCapacity pieces to left, next rightCapacity to right, rest to interior
    const leftPieces  = shuffled.slice(0, leftCapacity);
    const rightPieces = shuffled.slice(leftCapacity, sideCapacity);
    const overflow    = shuffled.slice(sideCapacity);

    const posMap = new Map<string, { x: number; y: number }>();
    leftPieces.forEach((p, i)  => posMap.set(p.id, leftSlots[i]));
    rightPieces.forEach((p, i) => posMap.set(p.id, rightSlots[i]));
    overflow.forEach((p, i)    => posMap.set(p.id, interiorSlots[i % Math.max(interiorSlots.length, 1)]));

    if (allAtOrigin) {
      const scattered = pieces.map((p) => {
        const pos = posMap.get(p.id) ?? { x: gap, y: gap };
        return { ...p, currentX: pos.x, currentY: pos.y, zone: 'free' as const };
      });
      onPiecesChange(scattered);
    } else {
      const updated = pieces.map((p) => {
        if (p.snapped) return p;
        const inBounds = p.currentX >= 0 && p.currentX + pw <= worldW &&
                         p.currentY >= 0 && p.currentY + ph <= worldH;
        if (inBounds) return p;
        const pos = posMap.get(p.id) ?? leftSlots[0] ?? { x: gap, y: gap };
        return { ...p, currentX: pos.x, currentY: pos.y };
      });
      onPiecesChange(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, worldW, worldH, targetOX, targetOY, targetW, targetH, pw, ph]);

  // Locked pieces (placed correctly on the board) — immovable, green outline
  const lockedPieces = pieces.filter((p) => p.snapped);

  // Non-locked pieces grouped by their permanent connection groupId
  const groupMap = new Map<number, PuzzlePiece[]>();
  for (const p of pieces) {
    if (!p.snapped && p.groupId != null) {
      const arr = groupMap.get(p.groupId) ?? [];
      arr.push(p);
      groupMap.set(p.groupId, arr);
    }
  }
  const groups = [...groupMap.entries()];

  // Free, unconnected, unlocked pieces
  const freePieces = pieces.filter((p) => !p.snapped && p.groupId == null);
  const hintPiece = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  // Single piece drag end — check board snap AND piece-to-piece snap
  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      // Clamp to world bounds — ensures no piece can ever escape the staging area
      const clampedWx = Math.max(0, Math.min(wx, worldW - piece.pieceWidth));
      const clampedWy = Math.max(0, Math.min(wy, worldH - piece.pieceHeight));

      // 1. Snap to the correct final board position → lock it
      const correctWorldX = targetOX + piece.correctX;
      const correctWorldY = targetOY + piece.correctY;
      const distToTarget = Math.hypot(
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

      // 2. Piece-to-piece snap — connect to an adjacent neighbor
      const neighbors = pieces.filter((other) => {
        if (other.id === id) return false;
        const colDiff = Math.abs(piece.correctCol - other.correctCol);
        const rowDiff = Math.abs(piece.correctRow - other.correctRow);
        return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
      });

      for (const neighbor of neighbors) {
        const expectedDx = (piece.correctCol - neighbor.correctCol) * gridCellW;
        const expectedDy = (piece.correctRow - neighbor.correctRow) * gridCellH;
        const expectedX = neighbor.currentX + expectedDx;
        const expectedY = neighbor.currentY + expectedDy;
        const snapDist = Math.hypot(clampedWx - expectedX, clampedWy - expectedY);

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

      // 3. No snap — drop at clamped position
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, currentX: clampedWx, currentY: clampedWy } : p
      ));
    },
    [pieces, pw, ph, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange]
  );

  // Group drag end: move all pieces in the group by the delta, then check snaps
  const handleGroupDragEnd = useCallback(
    (ids: string[], dx: number, dy: number) => {
      // Move every piece in the group by the drag delta
      let updated = pieces.map((p) =>
        ids.includes(p.id)
          ? { ...p, currentX: p.currentX + dx, currentY: p.currentY + dy }
          : p
      );

      const groupPieces = updated.filter((p) => ids.includes(p.id));

      // 1. Snap the whole group onto the board if ANY piece lands close enough
      //    to its correct board slot (the group is rigid, so aligning one aligns all).
      for (const gp of groupPieces) {
        const correctWX = targetOX + gp.correctX;
        const correctWY = targetOY + gp.correctY;
        const distToTarget = Math.hypot(gp.currentX - correctWX, gp.currentY - correctWY);
        if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
          const offX = correctWX - gp.currentX;
          const offY = correctWY - gp.currentY;
          playSnapSound();
          updated = updated.map((p) =>
            ids.includes(p.id)
              ? { ...p, currentX: p.currentX + offX, currentY: p.currentY + offY }
              : p
          );
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          onPiecesChange(updated);
          return;
        }
      }

      // 2. Connect the group to a neighboring piece/group outside it
      for (const gPiece of groupPieces) {
        const neighbors = updated.filter((other) => {
          if (ids.includes(other.id)) return false;
          const colDiff = Math.abs(gPiece.correctCol - other.correctCol);
          const rowDiff = Math.abs(gPiece.correctRow - other.correctRow);
          return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
        });

        for (const neighbor of neighbors) {
          const expectedDx = (gPiece.correctCol - neighbor.correctCol) * gridCellW;
          const expectedDy = (gPiece.correctRow - neighbor.correctRow) * gridCellH;
          const expectedX = neighbor.currentX + expectedDx;
          const expectedY = neighbor.currentY + expectedDy;
          const snapDist = Math.hypot(gPiece.currentX - expectedX, gPiece.currentY - expectedY);

          if (snapDist <= gridCellW * SNAP_THRESHOLD) {
            const offX = expectedX - gPiece.currentX;
            const offY = expectedY - gPiece.currentY;
            playSnapSound();
            // Merge this group and the neighbor's group under one permanent id
            const gid = gPiece.groupId ?? neighbor.groupId ?? nextGroupId(updated);
            const neighborGroupId = neighbor.groupId;
            updated = updated.map((p) => {
              if (ids.includes(p.id)) {
                return { ...p, currentX: p.currentX + offX, currentY: p.currentY + offY, groupId: gid };
              }
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

      // 3. No snap — clamp every piece in the group to world bounds then move
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
    [pieces, gridCellW, gridCellH, targetOX, targetOY, worldW, worldH, onPiecesChange]
  );

  if (!ready) {
    return <div className="puzzle-board-wrap" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div
      className={`puzzle-board-wrap${panMode ? ' puzzle-board-wrap--pan' : ''}`}
      ref={wrapRef}
      onPointerDown={handlePanPointerDown}
      onPointerMove={handlePanPointerMove}
      onPointerUp={handlePanPointerUp}
      onPointerLeave={handlePanPointerUp}
    >
      <div className="puzzle-board-inner">
        {/* Left scrollbar — only shown when stage taller than container */}
        {isPortrait && stageH > (containerH || 0) && (
          <div className="puzzle-scrollbar puzzle-scrollbar--left" onWheel={handleWheelOnSide}>
            <div
              className="puzzle-scrollbar-track"
              onPointerDown={(e) => handleScrollThumbPointerDown(e, 'left')}
              onPointerMove={handleScrollThumbPointerMove}
              onPointerUp={handleScrollThumbPointerUp}
            >
              <div
                className="puzzle-scrollbar-thumb"
                style={{
                  height: `${Math.max(30, (containerH / stageH) * 100)}%`,
                  top: `${Math.min(100 - Math.max(30, (containerH / stageH) * 100), Math.max(0, (-panOffset.y / Math.max(1, stageH - containerH)) * (100 - Math.max(30, (containerH / stageH) * 100))))}%`,
                }}
              />
            </div>
          </div>
        )}
        <div
          ref={stageWrapRef}
          className={`puzzle-single-stage${panMode ? ' puzzle-single-stage--pan' : ''}`}
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          <Stage
            ref={stageRef}
            width={stageW}
            height={stageH}
            scaleX={safeScale}
            scaleY={safeScale}
          >
          {/* Background — single uniform color, no borders */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={worldW} height={worldH} fill="#3d3b4a" />
            {/* Target area: slightly different shade so user knows where to build */}
            <Rect x={targetOX} y={targetOY} width={targetW} height={targetH}
              fill="#2f2d3e" cornerRadius={4} listening={false} />
          </Layer>

          {/* Locked pieces (correctly placed on board) — immovable, green glow */}
          <Layer>
            {lockedPieces.map((piece) => (
              <DraggablePieceTile key={piece.id} piece={piece}
                x={piece.currentX} y={piece.currentY}
                worldW={worldW} worldH={worldH} scale={safeScale}
                onDragEnd={handleDragEnd} />
            ))}
          </Layer>

          {/* Connected groups (move together, permanently linked) */}
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

          {/* Free, unconnected pieces */}
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

          {/* Hint overlay — drawn on top so the glow is visible */}
          {hintPiece && (
            <Layer listening={false}>
              <HintOverlay piece={hintPiece} targetOX={targetOX} targetOY={targetOY} />
            </Layer>
          )}
        </Stage>
        </div>

        {/* Right scrollbar */}
        {isPortrait && stageH > (containerH || 0) && (
          <div className="puzzle-scrollbar puzzle-scrollbar--right" onWheel={handleWheelOnSide}>
            <div
              className="puzzle-scrollbar-track"
              onPointerDown={(e) => handleScrollThumbPointerDown(e, 'right')}
              onPointerMove={handleScrollThumbPointerMove}
              onPointerUp={handleScrollThumbPointerUp}
            >
              <div
                className="puzzle-scrollbar-thumb"
                style={{
                  height: `${Math.max(30, (containerH / stageH) * 100)}%`,
                  top: `${Math.min(100 - Math.max(30, (containerH / stageH) * 100), Math.max(0, (-panOffset.y / Math.max(1, stageH - containerH)) * (100 - Math.max(30, (containerH / stageH) * 100))))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Zoom + pan controls — right side */}
        <div
          className="puzzle-zoom-controls"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Pan / hand toggle */}
          <button
            type="button"
            className={`puzzle-zoom-btn puzzle-pan-btn${panMode ? ' puzzle-zoom-btn--active' : ''}`}
            onClick={() => setPanMode((v) => !v)}
            aria-label={panMode ? 'Disable pan mode' : 'Enable pan mode — drag to move the board'}
            title={panMode ? 'Pan mode on — click to disable' : 'Pan mode — drag board to move'}
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M8 3.5V10M8 3.5a1.5 1.5 0 0 1 3 0V10M11 5a1.5 1.5 0 0 1 3 0v2M14 7a1.5 1.5 0 0 1 3 0v4c0 3-2 5-5 5H9c-1.5 0-2.8-.7-3.6-1.8L3 11.5a1.5 1.5 0 0 1 2.4-1.8L6.5 11V3.5a1.5 1.5 0 0 1 3 0"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Center / reset board position */}
          <button
            type="button"
            className="puzzle-zoom-btn"
            onClick={handleCenterBoard}
            aria-label="Reset board to center"
            title="Reset board to center"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M5.5 5.5l1.4 1.4M13.1 13.1l1.4 1.4M13.1 6.9l-1.4 1.4M6.9 13.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>

          {/* Divider */}
          <div className="puzzle-zoom-divider" />

          <button
            type="button"
            className="puzzle-zoom-btn"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 6.5v5M6.5 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <span className="puzzle-zoom-level">{Math.round(zoomLevel * 100)}%</span>
          <button
            type="button"
            className="puzzle-zoom-btn"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6.5 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

export default PuzzleBoard;
