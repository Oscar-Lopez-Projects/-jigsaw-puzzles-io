/** Where an unsnapped piece currently lives. */
export type PieceZone = 'left' | 'right' | 'free' | 'tray';

/** A single rectangular puzzle piece. */
export interface PuzzlePiece {
  /** Unique identifier: "col-row" e.g. "3-7" */
  id: string;

  /** The piece's image data as a base64 data URL */
  imageUrl: string;

  /** Width of this piece in pixels */
  pieceWidth: number;

  /** Height of this piece in pixels */
  pieceHeight: number;

  /** Column index in the solved grid (0-based) */
  correctCol: number;

  /** Row index in the solved grid (0-based) */
  correctRow: number;

  /** X pixel position where the piece belongs in the solved board */
  correctX: number;

  /** Y pixel position where the piece belongs in the solved board */
  correctY: number;

  /**
   * Current world-coordinate X. Only meaningful when zone === 'free'.
   * For 'left', 'right', 'tray' the board computes position from slotIndex.
   */
  currentX: number;

  /**
   * Current world-coordinate Y. Only meaningful when zone === 'free'.
   */
  currentY: number;

  /**
   * Slot index within the piece's zone (left panel, right panel, or tray).
   * Used to lay out pieces that haven't been freely placed yet.
   */
  slotIndex: number;

  /** Which zone the piece currently lives in. */
  zone: PieceZone;

  /** True once the piece has been snapped to its correct slot on the board. */
  snapped: boolean;
}

/** Grid dimensions derived from the chosen piece count. */
export interface GridDimensions {
  cols: number;
  rows: number;
}
