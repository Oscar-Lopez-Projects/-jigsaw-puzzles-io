import './WinOverlay.css';

interface WinOverlayProps {
  pieceCount: number;
  completionTime: number;
  formatTime: (sec: number) => string;
  isLoggedIn: boolean;
  onDashboard: () => void;
  onPlayAgain: () => void;
  onCreateAccount: () => void;
  debugMsg?: string;
}

export default function WinOverlay({
  pieceCount, completionTime, formatTime, isLoggedIn, onDashboard, onPlayAgain, onCreateAccount, debugMsg,
}: WinOverlayProps) {
  return (
    <div className="win-overlay" role="dialog" aria-modal="true" aria-label="Puzzle complete">
      <div className="win-card">
        <div className="win-emoji" aria-hidden="true">🎉</div>
        <h2 className="win-title">Puzzle Complete!</h2>
        <p className="win-sub">You placed all {pieceCount} pieces correctly.</p>

        <div className="win-time">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 6v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.5 2h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="win-time-label">Time</span>
          <span className="win-time-value">{formatTime(completionTime)}</span>
        </div>

        {!isLoggedIn && (
          <p className="win-guest-notice">Playing without an account does not save your progress.</p>
        )}

        {debugMsg && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', color: '#aaa', wordBreak: 'break-all', maxHeight: 100, overflow: 'auto' }}>
            {debugMsg}
          </div>
        )}

        <div className="win-actions">
          {isLoggedIn ? (
            <button type="button" className="win-btn win-btn--primary" onClick={onDashboard}>View Dashboard</button>
          ) : (
            <>
              <button type="button" className="win-btn win-btn--primary" onClick={onCreateAccount}>Create Account</button>
              <button type="button" className="win-btn win-btn--secondary" onClick={onPlayAgain}>Play Again</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
