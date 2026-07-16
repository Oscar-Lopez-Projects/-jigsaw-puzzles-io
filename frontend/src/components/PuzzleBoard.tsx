import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { PuzzlePiece } from '../types/puzzle';
import { playSnapSound } from '../lib/sounds';
import './PuzzleBoard.css';

// ─── layout constants ─────────────────────────────────────────
const SNAP_THRESHOLD = 0.5;
const MARGIN_RATIO   = 0.22;

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

  if (!img) return null;

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
    </Group>
  );
}

// ─── Piece Group (multiple snapped pieces that move together) ──
interface PieceGroupProps {
  groupPieces: PuzzlePiece[];
  offsetX: number;
  offsetY: number;
  onGroupDragEnd: (ids: string[], dx: number, dy: number) => void;
}

function DraggablePieceGroup({ groupPieces, offsetX, offsetY, onGroupDragEnd }: PieceGroupProps) {
  const startPos = useRef({ x: offsetX, y: offsetY });

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

  return (
    <Group
      x={offsetX} y={offsetY}
      draggable
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

// ─── Group detection: find connected snapped pieces ───────────
function findGroups(pieces: PuzzlePiece[], gridCellW: number, gridCellH: number): PuzzlePiece[][] {
  const snapped = pieces.filter((p) => p.snapped);
  if (snapped.length < 2) return [];

  const visited = new Set<string>();
  const groups: PuzzlePiece[][] = [];

  for (const piece of snapped) {
    if (visited.has(piece.id)) continue;

    // BFS to find connected pieces
    const group: PuzzlePiece[] = [];
    const queue = [piece];
    visited.add(piece.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      group.push(curr);

      // Find adjacent snapped pieces (share an edge in the grid)
      for (const other of snapped) {
        if (visited.has(other.id)) continue;
        const colDiff = Math.abs(curr.correctCol - other.correctCol);
        const rowDiff = Math.abs(curr.correctRow - other.correctRow);
        // Adjacent if exactly 1 cell apart in one direction
        if ((colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1)) {
          // Check they're actually placed correctly relative to each other
          const expectedDx = (other.correctCol - curr.correctCol) * gridCellW;
          const expectedDy = (other.correctRow - curr.correctRow) * gridCellH;
          const actualDx = other.currentX - curr.currentX;
          const actualDy = other.currentY - curr.currentY;
          if (Math.abs(actualDx - expectedDx) < 5 && Math.abs(actualDy - expectedDy) < 5) {
            visited.add(other.id);
            queue.push(other);
          }
        }
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  return groups;
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

  // Derive grid cell size
  const piece0 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 0);
  const piece1 = pieces.find((p) => p.correctCol === 1 && p.correctRow === 0);
  const piece0r1 = pieces.find((p) => p.correctCol === 0 && p.correctRow === 1);
  const gridCellW = piece0 && piece1 ? piece1.correctX - piece0.correctX : pw;
  const gridCellH = piece0 && piece0r1 ? piece0r1.correctY - piece0.correctY : ph;

  // Target area dimensions
  const targetW = cols * gridCellW;
  const targetH = rows * gridCellH;

  // World: target + margins
  const marginX = Math.max(pw * 3, targetW * MARGIN_RATIO);
  const marginY = Math.max(ph * 3, targetH * MARGIN_RATIO);
  const worldW = targetW + marginX * 2;
  const worldH = targetH + marginY * 2;
  const targetOX = marginX;
  const targetOY = marginY;

  const ready = pieces.length > 0 && containerW > 0 && pw > 0 && ph > 0;

  // Scale: fill full container width
  const safeScale = ready ? containerW / worldW : 1;
  const stageW = containerW;
  const stageH = worldH * safeScale;

  // Scatter pieces in a non-overlapping grid pattern around the margins
  useEffect(() => {
    if (!ready || hasScattered || pieces.some((p) => p.snapped)) return;
    const allAtOrigin = pieces.every((p) => p.currentX === 0 && p.currentY === 0 && !p.snapped);
    if (!allAtOrigin) return;

    // Lay out pieces in a grid pattern within the available margin space
    // Avoid the center target area
    const gap = 4;
    const cellW = pw + gap;
    const cellH = ph + gap;

    // Available positions: anywhere in worldW×worldH EXCEPT the target center
    const positions: { x: number; y: number }[] = [];

    // Top band
    for (let y = gap; y + ph < targetOY - gap; y += cellH) {
      for (let x = gap; x + pw < worldW - gap; x += cellW) {
        positions.push({ x, y });
      }
    }
    // Bottom band
    for (let y = targetOY + targetH + gap; y + ph < worldH - gap; y += cellH) {
      for (let x = gap; x + pw < worldW - gap; x += cellW) {
        positions.push({ x, y });
      }
    }
    // Left band (between top and bottom)
    for (let y = targetOY; y + ph < targetOY + targetH; y += cellH) {
      for (let x = gap; x + pw < targetOX - gap; x += cellW) {
        positions.push({ x, y });
      }
    }
    // Right band (between top and bottom)
    for (let y = targetOY; y + ph < targetOY + targetH; y += cellH) {
      for (let x = targetOX + targetW + gap; x + pw < worldW - gap; x += cellW) {
        positions.push({ x, y });
      }
    }

    // Shuffle positions and assign to pieces
    const shuffledPos = [...positions].sort(() => Math.random() - 0.5);

    const scattered = pieces.map((p, i) => {
      const pos = shuffledPos[i % shuffledPos.length];
      return { ...p, currentX: pos?.x ?? 0, currentY: pos?.y ?? 0, zone: 'free' as const };
    });

    setHasScattered(true);
    onPiecesChange(scattered);
  }, [ready, hasScattered, pieces, worldW, worldH, targetOX, targetOY, targetW, targetH, pw, ph, onPiecesChange]);

  // Groups of snapped pieces that should move together
  const groups = findGroups(pieces, gridCellW, gridCellH);
  const groupedIds = new Set(groups.flatMap((g) => g.map((p) => p.id)));

  // Snapped but not in a group (solo snapped)
  const soloSnapped = pieces.filter((p) => p.snapped && !groupedIds.has(p.id));
  const unsnapped = pieces.filter((p) => !p.snapped);
  const hintPiece = hintPieceId ? pieces.find((p) => p.id === hintPieceId && !p.snapped) ?? null : null;

  // Single piece drag end — check board snap AND piece-to-piece snap
  const handleDragEnd = useCallback(
    (id: string, wx: number, wy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;

      // 1. Check snap to target area (final board position)
      const correctWorldX = targetOX + piece.correctX;
      const correctWorldY = targetOY + piece.correctY;
      const pCX = wx + pw / 2;
      const pCY = wy + ph / 2;
      const sCX = correctWorldX + pw / 2;
      const sCY = correctWorldY + ph / 2;
      const distToTarget = Math.hypot(pCX - sCX, pCY - sCY);

      if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
        playSnapSound();
        onPiecesChange(pieces.map((p) =>
          p.id === id
            ? { ...p, currentX: correctWorldX, currentY: correctWorldY, snapped: true }
            : p
        ));
        return;
      }

      // 2. Check piece-to-piece snap (connect with any neighbor)
      // Find all other pieces (snapped or not) that are grid-adjacent to this one
      const neighbors = pieces.filter((other) => {
        if (other.id === id) return false;
        const colDiff = Math.abs(piece.correctCol - other.correctCol);
        const rowDiff = Math.abs(piece.correctRow - other.correctRow);
        return (colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1);
      });

      // Check if dropped position is close enough to any neighbor's expected relative position
      for (const neighbor of neighbors) {
        // Where should 'piece' be relative to 'neighbor' based on grid positions?
        const expectedDx = (piece.correctCol - neighbor.correctCol) * gridCellW;
        const expectedDy = (piece.correctRow - neighbor.correctRow) * gridCellH;
        const expectedX = neighbor.currentX + expectedDx;
        const expectedY = neighbor.currentY + expectedDy;

        const snapDist = Math.hypot(wx - expectedX, wy - expectedY);

        if (snapDist <= gridCellW * SNAP_THRESHOLD) {
          // Snap to the correct relative position next to this neighbor
          playSnapSound();
          onPiecesChange(pieces.map((p) =>
            p.id === id
              ? { ...p, currentX: expectedX, currentY: expectedY, snapped: true }
              : p
          ));
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
      // Calculate new positions for all pieces in the group
      const updatedPieces = pieces.map((p) =>
        ids.includes(p.id)
          ? { ...p, currentX: p.currentX + dx, currentY: p.currentY + dy }
          : p
      );

      // Check if any piece in the group is now at its correct board position
      const groupPieces = updatedPieces.filter((p) => ids.includes(p.id));
      const refPiece = groupPieces[0];
      if (refPiece) {
        const correctWorldX = targetOX + refPiece.correctX;
        const correctWorldY = targetOY + refPiece.correctY;
        const distToTarget = Math.hypot(refPiece.currentX - correctWorldX, refPiece.currentY - correctWorldY);

        if (distToTarget <= gridCellW * SNAP_THRESHOLD) {
          // Snap entire group to the board
          playSnapSound();
          const finalPieces = updatedPieces.map((p) => {
            if (!ids.includes(p.id)) return p;
            const correctWX = targetOX + p.correctX;
            const correctWY = targetOY + p.correctY;
            return { ...p, currentX: correctWX, currentY: correctWY, snapped: true };
          });
          onPiecesChange(finalPieces);
          return;
        }
      }

      // Check if any piece in this group can connect to a neighboring piece outside the group
      for (const gPiece of groupPieces) {
        const neighbors = updatedPieces.filter((other) => {
          if (ids.includes(other.id)) return false; // skip pieces in same group
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
            // Snap: move entire group so this piece aligns with the neighbor
            const offsetX = expectedX - gPiece.currentX;
            const offsetY = expectedY - gPiece.currentY;
            playSnapSound();
            const finalPieces = updatedPieces.map((p) => {
              if (!ids.includes(p.id)) return p;
              return { ...p, currentX: p.currentX + offsetX, currentY: p.currentY + offsetY, snapped: true };
            });
            // Also mark the neighbor as snapped so they form a group
            onPiecesChange(finalPieces.map((p) =>
              p.id === neighbor.id ? { ...p, snapped: true } : p
            ));
            return;
          }
        }
      }

      // No snap — just move
      onPiecesChange(updatedPieces);
    },
    [pieces, gridCellW, gridCellH, targetOX, targetOY, onPiecesChange]
  );

  if (!ready) {
    return <div className="puzzle-board-wrap" ref={wrapRef} style={{ minHeight: 200 }} />;
  }

  return (
    <div className="puzzle-board-wrap" ref={wrapRef}>
      <div className="puzzle-single-stage">
        <Stage width={stageW} height={stageH} scaleX={safeScale} scaleY={safeScale}>
          {/* Background — single uniform color, no borders */}
          <Layer listening={false}>
            <Rect x={0} y={0} width={worldW} height={worldH} fill="#3d3b4a" />
            {/* Target area: slightly different shade so user knows where to build */}
            <Rect x={targetOX} y={targetOY} width={targetW} height={targetH}
              fill="#2f2d3e" cornerRadius={4} listening={false} />
          </Layer>

          {/* Hint highlight */}
          {hintPiece && (
            <Layer listening={false}>
              <Rect
                x={targetOX + hintPiece.correctX}
                y={targetOY + hintPiece.correctY}
                width={pw} height={ph}
                fill="rgba(34,197,94,0.18)"
                stroke="rgba(34,197,94,0.8)"
                strokeWidth={2}
                listening={false}
              />
            </Layer>
          )}

          {/* Solo snapped pieces (not part of a group) */}
          <Layer>
            {soloSnapped.map((piece) => (
              <DraggablePieceTile key={piece.id} piece={piece}
                x={piece.currentX} y={piece.currentY}
                onDragEnd={handleDragEnd} />
            ))}
          </Layer>

          {/* Grouped snapped pieces (move together) */}
          <Layer>
            {groups.map((group, gi) => {
              const minX = Math.min(...group.map((p) => p.currentX));
              const minY = Math.min(...group.map((p) => p.currentY));
              return (
                <DraggablePieceGroup
                  key={`group-${gi}-${group[0].id}`}
                  groupPieces={group}
                  offsetX={minX}
                  offsetY={minY}
                  onGroupDragEnd={handleGroupDragEnd}
                />
              );
            })}
          </Layer>

          {/* Unsnapped pieces */}
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
