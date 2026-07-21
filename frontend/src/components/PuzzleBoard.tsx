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
    if (!panDrag.current) return;
    const dx = e.clientX - panDrag.current.startX;
    const dy = e.clientY - panDrag.current.startY;
    setPanOffset({ x: panDrag.current.originX + dx, y: panDrag.current.originY + dy });
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

  // Scatter pieces into the border zones on initial load / after Reset.
  useEffect(() => {
    if (!ready) return;
    const allAtOrigin = pieces.every((p) => p.currentX === 0 && p.currentY === 0 && !p.snapped);
    if (!allAtOrigin) return;

    const gap = 6;
    const cellW = pw + gap;
    const cellH = ph + gap;

    const targetLeft   = targetOX;
    const targetRight  = targetOX + targetW;
    const targetTop    = targetOY;
    const targetBottom = targetOY + targetH;

    // All slots across the world
    const border: { x: number; y: number }[] = [];
    const interior: { x: number; y: number }[] = [];

    for (let y = gap; y + ph < worldH - gap; y += cellH) {
      for (let x = gap; x + pw < worldW - gap; x += cellW) {
        const cx = x + pw / 2;
        const cy = y + ph / 2;
        const insideTarget =
          cx > targetLeft && cx < targetRight && cy > targetTop && cy < targetBottom;
        if (insideTarget) interior.push({ x, y });
        else border.push({ x, y });
      }
    }

    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
    const ordered = [...shuffle(border), ...shuffle(interior)];

    const scattered = pieces.map((p, i) => {
      const pos = ordered[i % ordered.length];
      return { ...p, currentX: pos?.x ?? 0, currentY: pos?.y ?? 0, zone: 'free' as const };
    });
    onPiecesChange(scattered);
  }, [ready, worldW, worldH, pw, ph, targetOX, targetOY, targetW, targetH]); // eslint-disable-line

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

      // 1. Snap to the correct final board position → lock it
      const correctWorldX = targetOX + piece.correctX;
      const correctWorldY = targetOY + piece.correctY;
      const distToTarget = Math.hypot(
        (wx + pw / 2) - (correctWorldX + pw / 2),
        (wy + ph / 2) - (correctWorldY + ph / 2)
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
        const snapDist = Math.hypot(wx - expectedX, wy - expectedY);

        if (snapDist <= gridCellW * SNAP_THRESHOLD) {
          playSnapSound();
          // Merge into the neighbor's group (or start a new one) — permanent
          const gid = neighbor.groupId ?? nextGroupId(pieces);
          let updated = pieces.map((p) => {
            if (p.id === id) return { ...p, currentX: expectedX, currentY: expectedY, groupId: gid };
            if (p.id === neighbor.id && p.groupId == null) return { ...p, groupId: gid };
            return p;
          });
          // If connecting placed the piece exactly on its board slot (e.g. neighbor
          // was already locked), lock it (and any others now correct).
          updated = lockCorrectPieces(updated, targetOX, targetOY);
          onPiecesChange(updated);
          return;
        }
      }

      // 3. No snap — leave piece where dropped
      onPiecesChange(pieces.map((p) =>
        p.id === id ? { ...p, currentX: wx, currentY: wy } : p
      ));
    },
    [pieces, pw, ph, gridCellW, gridCellH, targetOX, targetOY, onPiecesChange]
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

      // 3. No snap — just move
      onPiecesChange(updated);
    },
    [pieces, gridCellW, gridCellH, targetOX, targetOY, onPiecesChange]
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
