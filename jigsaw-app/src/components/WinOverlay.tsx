import './WinOverlay.css';

interface WinOverlayProps {
  pieceCount: number;
  onPlayAgain: () => void;
  onNewPuzzle: () => void;
}

export default function WinOverlay({ pieceCount, onPlayAgain, onNewPuzzle }: WinOverlayProps) {
  return (
    <div className="win-overlay" role="dialog" aria-modal="true" aria-label="Puzzle complete">
      <div className="win-card">
        <div className="win-emoji" aria-hidden="true">🎉</div>
        <h2 className="win-title">Puzzle Complete!</h2>
        <p className="win-sub">
          You placed all {pieceCount} pieces correctly.
        </p>
        <div className="win-actions">
          <button type="button" className="win-btn win-btn--primary" onClick={onPlayAgain}>
            Play Again
          </button>
          <button type="button" className="win-btn win-btn--secondary" onClick={onNewPuzzle}>
            New Puzzle
          </button>
        </div>
      </div>
    </div>
  );
}
