import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './ChallengeModal.css';

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface ChallengeModalProps {
  imageUrl: string;
  puzzleTitle: string;
  pieceCount: number;
  difficulty: string;
  completionTime: number;
  stars: number;
  onClose: () => void;
  onSent: () => void;
}

export default function ChallengeModal({
  imageUrl, puzzleTitle, pieceCount, difficulty, completionTime, stars, onClose, onSent,
}: ChallengeModalProps) {
  const { session } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<{
      sent: { status: string; addressee: { id: string; username: string; avatar_url: string | null } | null }[];
      received: { status: string; requester: { id: string; username: string; avatar_url: string | null } | null }[];
    }>('/api/friends', { token: session.access_token })
      .then((data) => {
        const accepted: Friend[] = [];
        data.sent.forEach((f) => { if (f.status === 'accepted' && f.addressee) accepted.push(f.addressee); });
        data.received.forEach((f) => { if (f.status === 'accepted' && f.requester) accepted.push(f.requester); });
        setFriends(accepted);
      })
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [session]);

  const handleChallenge = async (friendId: string) => {
    if (!session?.access_token) return;
    setSendingTo(friendId);
    setError(null);
    try {
      await apiFetch('/api/challenges', {
        method: 'POST',
        token: session.access_token,
        body: {
          opponent_id: friendId,
          image_url: imageUrl,
          puzzle_title: puzzleTitle,
          piece_count: pieceCount,
          difficulty,
          challenger_time_sec: completionTime,
          challenger_stars: stars,
        },
      });
      setSent((prev) => new Set(prev).add(friendId));
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send challenge');
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <div className="challenge-backdrop" onClick={onClose}>
      <div className="challenge-modal" onClick={(e) => e.stopPropagation()}>
        <button className="challenge-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </button>

        <h2 className="challenge-title">Challenge a Friend</h2>
        <p className="challenge-subtitle">
          Send this puzzle to a friend and see if they can beat your time!
        </p>

        <div className="challenge-your-stats">
          <span>Your result: {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span>
          <span>{Math.floor(completionTime / 60)}:{String(completionTime % 60).padStart(2, '0')}</span>
        </div>

        {error && <div className="challenge-error">{error}</div>}

        {loading ? (
          <div className="challenge-loading">Loading friends...</div>
        ) : friends.length === 0 ? (
          <div className="challenge-empty">No friends to challenge yet. Add friends from the leaderboard or search!</div>
        ) : (
          <div className="challenge-friends-list">
            {friends.map((friend) => (
              <div className="challenge-friend-row" key={friend.id}>
                <div className="challenge-friend-avatar">{friend.username.charAt(0).toUpperCase()}</div>
                <span className="challenge-friend-name">{friend.username}</span>
                {sent.has(friend.id) ? (
                  <span className="challenge-sent-badge">Sent!</span>
                ) : (
                  <button
                    type="button"
                    className="challenge-send-btn"
                    onClick={() => handleChallenge(friend.id)}
                    disabled={sendingTo === friend.id}
                  >
                    {sendingTo === friend.id ? '...' : 'Challenge'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
