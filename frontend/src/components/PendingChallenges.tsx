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
          <span className="challenge-row-title" title={challenge.puzzle_title}>
            {challenge.puzzle_title.length > 20 ? challenge.puzzle_title.slice(0, 20) + '…' : challenge.puzzle_title}
          </span>
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
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
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
  const [page, setPage] = useState(1);
  const PER_PAGE = 5;

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
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Combine all into one flat list for pagination: incoming first, then sent, then completed
  const allItems: { challenge: Challenge; isSentByMe: boolean; group: 'incoming' | 'sent' | 'completed' }[] = [
    ...incomingPending.map((c) => ({ challenge: c, isSentByMe: false as const, group: 'incoming' as const })),
    ...sentPending.map((c) => ({ challenge: c, isSentByMe: true as const, group: 'sent' as const })),
    ...completed.map((c) => {
      const sentByMe = challenges.sent.some((s) => s.id === c.id);
      return { challenge: c, isSentByMe: sentByMe, group: 'completed' as const };
    }),
  ];

  const totalCount = allItems.length;
  if (totalCount === 0) return null;

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const pageItems = allItems.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="challenges-section">
      <h2 className="challenges-title">Challenges ({totalCount})</h2>

      {pageItems.map((item) => (
        <ChallengeRow
          key={item.challenge.id}
          challenge={item.challenge}
          userId={user?.id}
          isSentByMe={item.isSentByMe}
          onAccept={item.group === 'incoming' ? onAcceptChallenge : undefined}
          onDecline={item.group === 'incoming' ? handleDecline : undefined}
          onView={onViewChallenge}
        />
      ))}

      {totalPages > 1 && (
        <div className="challenges-pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="challenges-pagination-info">Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
