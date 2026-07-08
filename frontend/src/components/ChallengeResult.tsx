import './ChallengeResult.css';

interface ChallengeResultProps {
  challengerName: string;
  opponentName: string;
  challengerTime: number;
  challengerStars: number;
  opponentTime: number;
  opponentStars: number;
  winner: 'challenger' | 'opponent' | 'tie';
  isChallenger: boolean;
  onClose: () => void;
}

export default function ChallengeResult({
  challengerName, opponentName, challengerTime, challengerStars, opponentTime, opponentStars, winner, isChallenger, onClose,
}: ChallengeResultProps) {
  const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const youWon = (winner === 'challenger' && isChallenger) || (winner === 'opponent' && !isChallenger);
  const isTie = winner === 'tie';

  return (
    <div className="challenge-result-overlay">
      <div className="challenge-result-card">
        <div className="challenge-result-emoji">
          {isTie ? '🤝' : youWon ? '🏆' : '😤'}
        </div>
        <h2 className="challenge-result-title">
          {isTie ? "It's a Tie!" : youWon ? 'You Won!' : 'You Lost!'}
        </h2>
        <p className="challenge-result-subtitle">
          {isTie
            ? 'Incredible — you both finished with the same result!'
            : youWon
            ? 'You solved it faster. Nice work!'
            : 'Your opponent was faster this time. Try again!'}
        </p>

        <div className="challenge-result-vs">
          <div className={`challenge-result-player${winner === 'challenger' ? ' challenge-result-player--winner' : ''}`}>
            <span className="challenge-result-player-name">{challengerName}</span>
            <span className="challenge-result-player-time">{formatTime(challengerTime)}</span>
            <span className="challenge-result-player-stars">{'★'.repeat(challengerStars)}{'☆'.repeat(3 - challengerStars)}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', fontSize: 18, fontWeight: 800, color: 'var(--text-muted)' }}>vs</div>

          <div className={`challenge-result-player${winner === 'opponent' ? ' challenge-result-player--winner' : ''}`}>
            <span className="challenge-result-player-name">{opponentName}</span>
            <span className="challenge-result-player-time">{formatTime(opponentTime)}</span>
            <span className="challenge-result-player-stars">{'★'.repeat(opponentStars)}{'☆'.repeat(3 - opponentStars)}</span>
          </div>
        </div>

        <button type="button" className="challenge-result-close" onClick={onClose}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
