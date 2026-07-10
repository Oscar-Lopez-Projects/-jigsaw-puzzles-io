import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './ChallengeDetails.css';

interface ChallengeData {
  id: string;
  puzzle_title: string;
  piece_count: number;
  difficulty: string;
  challenger_time_sec: number;
  challenger_stars: number;
  opponent_time_sec: number | null;
  opponent_stars: number | null;
  winner: string | null;
  status: string;
  created_at: string;
  challenger: { id: string; username: string; avatar_url: string | null } | null;
  opponent: { id: string; username: string; avatar_url: string | null } | null;
  comments: { id: string; content: string; created_at: string; user: { id: string; username: string; avatar_url: string | null } | null }[];
  likes_count: number;
}

interface ChallengeDetailsProps {
  challengeId: string;
  onBack: () => void;
}

function formatTime(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ChallengeDetails({ challengeId, onBack }: ChallengeDetailsProps) {
  const { session, user } = useAuth();
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<ChallengeData>(`/api/challenges/${challengeId}/details`)
      .then((d) => { setData(d); setLikesCount(d.likes_count); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [challengeId]);

  // Check if user liked
  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<{ liked: boolean }>(`/api/challenges/${challengeId}/liked`, { token: session.access_token })
      .then((d) => setLiked(d.liked))
      .catch(() => {});
  }, [challengeId, session]);

  const handleLike = async () => {
    if (!session?.access_token) return;
    const res = await apiFetch<{ liked: boolean }>(`/api/challenges/${challengeId}/like`, { method: 'POST', token: session.access_token }).catch(() => null);
    if (res) {
      setLiked(res.liked);
      setLikesCount((c) => res.liked ? c + 1 : c - 1);
    }
  };

  const handleComment = async () => {
    if (!session?.access_token || !comment.trim()) return;
    setSubmitting(true);
    try {
      const newComment = await apiFetch<ChallengeData['comments'][0]>(`/api/challenges/${challengeId}/comments`, {
        method: 'POST', token: session.access_token, body: { content: comment.trim() },
      });
      setData((prev) => prev ? { ...prev, comments: [...prev.comments, newComment] } : prev);
      setComment('');
    } catch {}
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="cd-page"><div className="cd-loading"><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /> Loading...</div></div>;
  if (error || !data) return <div className="cd-page"><button className="cd-back" onClick={onBack}>← Back</button><div className="cd-error">{error || 'Not found'}</div></div>;

  const isChallenger = user?.id === data.challenger?.id;
  const youWon = (data.winner === 'challenger' && isChallenger) || (data.winner === 'opponent' && !isChallenger);
  const isTie = data.winner === 'tie';

  return (
    <div className="cd-page">
      <button className="cd-back" onClick={onBack}>← Back</button>

      <div className="cd-result-card">
        <div className="cd-result-emoji">{isTie ? '🤝' : youWon ? '🏆' : '😤'}</div>
        <h2 className="cd-result-title">{isTie ? "It's a Tie!" : youWon ? 'You Won!' : 'You Lost!'}</h2>
        <p className="cd-result-puzzle">{data.puzzle_title} · {data.piece_count} pieces · {data.difficulty}</p>

        <div className="cd-vs">
          <div className={`cd-player${data.winner === 'challenger' ? ' cd-player--winner' : ''}`}>
            <div className="cd-player-avatar">
              {data.challenger?.avatar_url ? <img src={data.challenger.avatar_url} alt="" /> : (data.challenger?.username?.charAt(0).toUpperCase() || '?')}
            </div>
            <span className="cd-player-name">{data.challenger?.username || 'Unknown'}</span>
            <span className="cd-player-stars">{'★'.repeat(data.challenger_stars)}{'☆'.repeat(3 - data.challenger_stars)}</span>
            <span className="cd-player-time">{formatTime(data.challenger_time_sec)}</span>
            {data.winner === 'challenger' && <span className="cd-player-label">👑 Winner</span>}
          </div>

          <span className="cd-vs-divider">VS</span>

          <div className={`cd-player${data.winner === 'opponent' ? ' cd-player--winner' : ''}`}>
            <div className="cd-player-avatar">
              {data.opponent?.avatar_url ? <img src={data.opponent.avatar_url} alt="" /> : (data.opponent?.username?.charAt(0).toUpperCase() || '?')}
            </div>
            <span className="cd-player-name">{data.opponent?.username || 'Unknown'}</span>
            {data.opponent_stars !== null && <span className="cd-player-stars">{'★'.repeat(data.opponent_stars)}{'☆'.repeat(3 - data.opponent_stars)}</span>}
            {data.opponent_time_sec !== null && <span className="cd-player-time">{formatTime(data.opponent_time_sec)}</span>}
            {data.winner === 'opponent' && <span className="cd-player-label">👑 Winner</span>}
          </div>
        </div>

        {/* Like */}
        <div className="cd-actions">
          <button type="button" className={`cd-like-btn ${liked ? 'cd-like-btn--active' : 'cd-like-btn--inactive'}`} onClick={handleLike}>
            {liked ? '❤️' : '🤍'} {liked ? 'Liked' : 'Like'}
          </button>
          <span className="cd-likes-count">{likesCount} {likesCount === 1 ? 'like' : 'likes'}</span>
        </div>
      </div>

      {/* Comments */}
      <div className="cd-comments">
        <div className="cd-comments-header">Comments ({data.comments.length})</div>

        {session?.access_token && (
          <div className="cd-comment-form">
            <textarea
              className="cd-comment-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment..."
              maxLength={500}
            />
            <button type="button" className="cd-comment-submit" onClick={handleComment} disabled={submitting || !comment.trim()}>
              {submitting ? '...' : 'Post'}
            </button>
          </div>
        )}

        {data.comments.length === 0 ? (
          <div className="cd-no-comments">No comments yet. Be the first to say something!</div>
        ) : (
          <div className="cd-comment-list">
            {data.comments.map((c) => (
              <div className="cd-comment" key={c.id}>
                <div className="cd-comment-avatar">
                  {c.user?.avatar_url ? <img src={c.user.avatar_url} alt="" /> : (c.user?.username?.charAt(0).toUpperCase() || '?')}
                </div>
                <div className="cd-comment-body">
                  <span className="cd-comment-user">{c.user?.username || 'Unknown'}<span className="cd-comment-time">{timeAgo(c.created_at)}</span></span>
                  <p className="cd-comment-text">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
