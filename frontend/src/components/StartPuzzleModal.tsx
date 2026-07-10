import './StartPuzzleModal.css';

interface StartPuzzleModalProps {
  onSoloPlay: () => void;
  onFeaturedPuzzle: () => void;
  onClose: () => void;
}

export default function StartPuzzleModal({ onSoloPlay, onFeaturedPuzzle, onClose }: StartPuzzleModalProps) {
  return (
    <div className="spm-backdrop" onClick={onClose}>
      <div className="spm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="spm-close" onClick={onClose}>✕</button>

        <h2 className="spm-title">Start a Puzzle</h2>
        <p className="spm-subtitle">Choose how you want to play:</p>

        <div className="spm-options">
          <div className="spm-option" onClick={onSoloPlay}>
            <span className="spm-option-icon">🎯</span>
            <div className="spm-option-text">
              <span className="spm-option-title">Solo Play</span>
              <span className="spm-option-desc">Upload your own image, pick difficulty, play privately. Your records are saved but not on any public leaderboard.</span>
            </div>
          </div>

          <div className="spm-option" onClick={onFeaturedPuzzle}>
            <span className="spm-option-icon">🏆</span>
            <div className="spm-option-text">
              <span className="spm-option-title">Featured Puzzle</span>
              <span className="spm-option-desc">Browse community puzzles. Scores are tracked on public leaderboards. Compete for the fastest time!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
