import { useState } from 'react';
import './WinOverlay.css';

interface WinOverlayProps {
  pieceCount: number;
  completionTime: number;
  puzzleName: string;
  formatTime: (sec: number) => string;
  isLoggedIn: boolean;
  onDashboard: () => void;
  onPlayAgain: () => void;
  onCreateAccount: () => void;
  debugMsg?: string;
}

export default function WinOverlay({
  pieceCount, completionTime, puzzleName, formatTime, isLoggedIn, onDashboard, onPlayAgain, onCreateAccount, debugMsg,
}: WinOverlayProps) {
  const [copied, setCopied] = useState(false);

  const expectedTime = pieceCount * 3;
  let stars: number;
  if (completionTime <= expectedTime) stars = 3;
  else if (completionTime <= expectedTime * 2) stars = 2;
  else stars = 1;

  const starsText = '\u2B50'.repeat(stars);
  const timeText = formatTime(completionTime);
  const shareText = `I solved "${puzzleName}" (${pieceCount} pieces) in ${timeText} ${starsText} on Jigsaw Puzzles I.O!`;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          <span className="win-time-value">{timeText}</span>
        </div>

        <div className="win-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>

        {!isLoggedIn && (
          <p className="win-guest-notice">Playing without an account does not save your progress.</p>
        )}

        {debugMsg && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', color: '#aaa', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto' }}>
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

          <button type="button" className="win-btn win-btn--share" onClick={handleShare}>
            {copied ? <>Copied!</> : (
              <>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 8V13a1 1 0 001 1h6a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Share Result
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
