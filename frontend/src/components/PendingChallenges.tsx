import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './PendingChallenges.css';

interface Challenge {
  id: string;
  puzzle_title: string;
  piece_count: number;
  difficulty: string;
  image_url: string;
  challenger_time_sec: number;
  challenger_stars: number;
  opponent_time_sec: number | null;
  opponent_stars: number | null;
  winner: string | null;
  status: string;
  created_at: string;
  challenger?: { id: string; username: string; avatar_url: string | null };
  opponent?: { id: string; username: string; avatar_url: string | null };
}

interface PendingChallengesProps {
  onAcceptChallenge: (challenge: Challenge) => void;
  onViewChallenge?: (challengeId: string) => void;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ChallengeRow({ challenge, isSentByMe, onAccept, onDecline, onView }: {
  challenge: Challenge;
  userId: string | undefined;
  isSentByMe: boolean;
  onAccept?: (c: Challenge) => void;
  onDecline?: (id: string) => void;
  onView?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isChallenger = isSentByMe;
  const opponentName = isChallenger ? challenge.opponent?.username : challenge.challenger?.username;
  const isPending = challenge.status === 'pending';
  const isCompleted = challenge.status === 'completed';
  const isIncoming = !isChallenger && isPending;

  let resultLabel = '';
  let resultClass = '';
  if (isCompleted) {
    if (challenge.winner === 'tie') { resultLabel = 'Tie'; resultClass = 'tie'; }
    else if ((challenge.winner === 'challenger' && isChallenger) || (challenge.winner === 'opponent' && !isChallenger)) {
      resultLabel = 'You Won'; resultClass = 'won';
    } else {
      resultLabel = 'You Lost'; resultClass = 'lost';
    }
  } else if (isPending && isChallenger) {
    resultLabel = 'Pending'; resultClass = 'pending';
  }

  return (
    <div className="challenge-row-wrap" style={{ cursor: isCompleted && onView ? 'pointer' : 'default' }} onClick={() => { if (isCompleted && onView) onView(challenge.id); }}>
      <div className="challenge-row">
        <div className="challenge-row-info">
          <span className="challenge-row-title">{challenge.puzzle_title}</span>
          <span className="challenge-row-meta">
            vs {opponentName || 'Unknown'} · {challenge.piece_count} pieces · {challenge.difficulty}
          </span>
        </div>

        {isIncoming && onAccept && onDecline && (
          <div className="challenge-row-actions">
            <button type="button" className="challenge-accept-btn" onClick={() => onAccept(challenge)}>Play</button>
            <button type="button" className="challenge-decline-btn" onClick={() => onDecline(challenge.id)}>Decline</button>
          </div>
        )}

        {!isIncoming && resultLabel && (
          <span className={`challenge-status-badge challenge-status-badge--${resultClass}`}>{resultLabel}</span>
        )}

        <button
          type="button"
          className={`challenge-expand-btn${expanded ? ' challenge-expand-btn--open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          aria-label="Show details"
        >
          <svg viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {expanded && (
        <div className="challenge-details">
          <div className="challenge-detail-row">
            <span className="challenge-detail-name">{challenge.challenger?.username || 'Challenger'}</span>
            <span className="challenge-detail-stars">{'★'.repeat(challenge.challenger_stars)}{'☆'.repeat(3 - challenge.challenger_stars)}</span>
            <span className="challenge-detail-time">{formatTime(challenge.challenger_time_sec)}</span>
          </div>
          {challenge.opponent_time_sec !== null && challenge.opponent_stars !== null ? (
            <div className="challenge-detail-row">
              <span className="challenge-detail-name">{challenge.opponent?.username || 'Opponent'}</span>
              <span className="challenge-detail-stars">{'★'.repeat(challenge.opponent_stars)}{'☆'.repeat(3 - challenge.opponent_stars)}</span>
              <span className="challenge-detail-time">{formatTime(challenge.opponent_time_sec)}</span>
            </div>
          ) : (
            <div className="challenge-detail-row challenge-detail-row--waiting">
              <span className="challenge-detail-name">{challenge.opponent?.username || 'Opponent'}</span>
              <span className="challenge-detail-waiting">Waiting for response...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PendingChallenges({ onAcceptChallenge, onViewChallenge }: PendingChallengesProps) {
  const { session, user } = useAuth();
  const [challenges, setChallenges] = useState<{ sent: Challenge[]; received: Challenge[] }>({ sent: [], received: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<{ sent: Challenge[]; received: Challenge[] }>('/api/challenges', { token: session.access_token })
      .then((data) => setChallenges(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  const handleDecline = async (id: string) => {
    if (!session?.access_token) return;
    await apiFetch(`/api/challenges/${id}/decline`, { method: 'PATCH', token: session.access_token }).catch(() => {});
    setChallenges((prev) => ({
      ...prev,
      received: prev.received.filter((c) => c.id !== id),
    }));
  };

  if (loading) return null;

  // All challenges sorted by date (incoming pending first, then sent pending, then completed)
  const incomingPending = challenges.received.filter((c) => c.status === 'pending');
  const sentPending = challenges.sent.filter((c) => c.status === 'pending');
  const completed = [
    ...challenges.sent.filter((c) => c.status === 'completed'),
    ...challenges.received.filter((c) => c.status === 'completed'),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  const totalCount = incomingPending.length + sentPending.length + completed.length;
  if (totalCount === 0) return null;

  return (
    <div className="challenges-section">
      <h2 className="challenges-title">Challenges ({totalCount})</h2>

      {incomingPending.length > 0 && (
        <div className="challenges-group">
          <span className="challenges-group-label">Incoming</span>
          {incomingPending.map((c) => (
            <ChallengeRow key={c.id} challenge={c} userId={user?.id} isSentByMe={false} onAccept={onAcceptChallenge} onDecline={handleDecline} onView={onViewChallenge} />
          ))}
        </div>
      )}

      {sentPending.length > 0 && (
        <div className="challenges-group">
          <span className="challenges-group-label">Sent (waiting)</span>
          {sentPending.map((c) => (
            <ChallengeRow key={c.id} challenge={c} userId={user?.id} isSentByMe={true} onView={onViewChallenge} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="challenges-group">
          <span className="challenges-group-label">Completed</span>
          {completed.map((c) => {
            const sentByMe = challenges.sent.some((s) => s.id === c.id);
            return <ChallengeRow key={c.id} challenge={c} userId={user?.id} isSentByMe={sentByMe} onView={onViewChallenge} />;
          })}
        </div>
      )}
    </div>
  );
}
