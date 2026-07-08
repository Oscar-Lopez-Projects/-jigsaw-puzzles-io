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
}

export default function PendingChallenges({ onAcceptChallenge }: PendingChallengesProps) {
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

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) return null;

  const pending = challenges.received.filter((c) => c.status === 'pending');
  const completed = [
    ...challenges.sent.filter((c) => c.status === 'completed'),
    ...challenges.received.filter((c) => c.status === 'completed'),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);

  if (pending.length === 0 && completed.length === 0) return null;

  return (
    <div className="challenges-section">
      <h2 className="challenges-title">Challenges</h2>

      {/* Pending incoming */}
      {pending.length > 0 && pending.map((c) => (
        <div className="challenge-row" key={c.id}>
          <div className="challenge-row-info">
            <span className="challenge-row-title">{c.puzzle_title}</span>
            <span className="challenge-row-meta">
              {c.piece_count} pieces · {c.difficulty} · Beat {formatTime(c.challenger_time_sec)} {'★'.repeat(c.challenger_stars)}
            </span>
            <span className="challenge-row-opponent">from {c.challenger?.username || 'Unknown'}</span>
          </div>
          <div className="challenge-row-actions">
            <button type="button" className="challenge-accept-btn" onClick={() => onAcceptChallenge(c)}>
              Play
            </button>
            <button type="button" className="challenge-decline-btn" onClick={() => handleDecline(c.id)}>
              Decline
            </button>
          </div>
        </div>
      ))}

      {/* Recent completed */}
      {completed.length > 0 && completed.map((c) => {
        const isChallenger = c.challenger?.id === user?.id;
        const opponentName = isChallenger ? c.opponent?.username : c.challenger?.username;
        let resultLabel: string;
        let resultClass: string;
        if (c.winner === 'tie') { resultLabel = 'Tie'; resultClass = 'tie'; }
        else if ((c.winner === 'challenger' && isChallenger) || (c.winner === 'opponent' && !isChallenger)) {
          resultLabel = 'You Won'; resultClass = 'won';
        } else {
          resultLabel = 'You Lost'; resultClass = 'lost';
        }

        return (
          <div className="challenge-row" key={c.id}>
            <div className="challenge-row-info">
              <span className="challenge-row-title">{c.puzzle_title}</span>
              <span className="challenge-row-meta">
                vs {opponentName || 'Unknown'} · {c.piece_count} pieces
              </span>
            </div>
            <span className={`challenge-status-badge challenge-status-badge--${resultClass}`}>
              {resultLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
