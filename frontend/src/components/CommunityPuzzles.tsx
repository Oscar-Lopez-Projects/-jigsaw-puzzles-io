import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import UploadPuzzleForm from './UploadPuzzleForm';
import './CommunityPuzzles.css';

interface Puzzle {
  id: string;
  title: string;
  image_url: string;
  piece_count: number;
  plays: number;
  created_at: string;
  user_id: string;
  users: { username: string } | null;
}

interface LeaderboardEntry {
  user_id: string;
  completion_time_sec: number;
  stars: number;
  users: { username: string; avatar_url: string | null } | null;
}

interface CommunityPuzzlesProps {
  onBack: () => void;
  onPlayPuzzle: (imageUrl: string, title: string, pieceCount: number, puzzleId: string) => void;
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function PuzzleCard({ puzzle, onPlay }: { puzzle: Puzzle; onPlay: () => void }) {
  const [showScore, setShowScore] = useState(false);
  const [topScore, setTopScore] = useState<LeaderboardEntry | null>(null);
  const [loadingScore, setLoadingScore] = useState(false);
  const [fetched, setFetched] = useState(false);

  const toggleScore = () => {
    if (!fetched) {
      setLoadingScore(true);
      apiFetch<LeaderboardEntry[]>(`/api/leaderboard/puzzle/${puzzle.id}?limit=1`)
        .then((data) => setTopScore(data.length > 0 ? data[0] : null))
        .catch(() => setTopScore(null))
        .finally(() => { setLoadingScore(false); setFetched(true); });
    }
    setShowScore((v) => !v);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="puzzle-card">
      <div className="puzzle-card-img-wrap">
        <img src={puzzle.image_url} alt={puzzle.title} className="puzzle-card-img" loading="lazy" />
      </div>
      <div className="puzzle-card-body">
        <span className="puzzle-card-title">{puzzle.title}</span>
        <span className="puzzle-card-meta">
          {puzzle.piece_count} pieces · {puzzle.plays || 0} plays · by {puzzle.users?.username || 'Unknown'}
        </span>
        <span className="puzzle-card-date">{formatDate(puzzle.created_at)}</span>
      </div>

      <div className="puzzle-card-actions">
        <button type="button" className="puzzle-card-play" onClick={onPlay}>
          Play
        </button>
        <button
          type="button"
          className={`puzzle-card-scores-btn${showScore ? ' puzzle-card-scores-btn--active' : ''}`}
          onClick={toggleScore}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1l2 4h4l-3.5 3 1.5 4.5L8 10l-4 2.5L5.5 8 2 5h4l2-4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          Highest Score
          <svg className={`scores-chevron${showScore ? ' scores-chevron--open' : ''}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {showScore && (
        <div className="puzzle-card-scoreboard">
          {loadingScore ? (
            <span className="scoreboard-loading">Loading...</span>
          ) : !topScore ? (
            <span className="scoreboard-empty">No scores yet — be the first!</span>
          ) : (
            <div className="scoreboard-entry scoreboard-entry--top">
              <span className="scoreboard-rank">#1</span>
              <span className="scoreboard-user">{topScore.users?.username || 'Unknown'}</span>
              <span className="scoreboard-stars">{'★'.repeat(topScore.stars)}{'☆'.repeat(3 - topScore.stars)}</span>
              <span className="scoreboard-time">{formatTime(topScore.completion_time_sec)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CommunityPuzzles({ onBack, onPlayPuzzle }: CommunityPuzzlesProps) {
  const { session } = useAuth();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchPuzzles = () => {
    setLoading(true);
    apiFetch<Puzzle[]>('/api/puzzles')
      .then((data) => { setPuzzles(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPuzzles(); }, []);

  const handlePlay = (puzzle: Puzzle) => {
    apiFetch(`/api/puzzles/${puzzle.id}/play`, { method: 'POST' }).catch(() => {});
    onPlayPuzzle(puzzle.image_url, puzzle.title, puzzle.piece_count, puzzle.id);
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    fetchPuzzles();
  };

  return (
    <div className="community">
      <div className="community-header">
        <button type="button" className="community-back" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <h1 className="community-title">Community Puzzles</h1>
        {session?.access_token && (
          <button type="button" className="community-upload-btn" onClick={() => setShowUpload(true)}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            Upload Puzzle
          </button>
        )}
      </div>

      {showUpload && (
        <UploadPuzzleForm
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {loading && (
        <div className="community-loading">
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span>Loading puzzles...</span>
        </div>
      )}

      {error && <div className="community-error" role="alert">{error}</div>}

      {!loading && !error && puzzles.length === 0 && (
        <div className="community-empty">
          <p>No community puzzles yet. Be the first to upload one!</p>
        </div>
      )}

      {!loading && !error && puzzles.length > 0 && (
        <div className="community-grid">
          {puzzles.map((puzzle) => (
            <PuzzleCard key={puzzle.id} puzzle={puzzle} onPlay={() => handlePlay(puzzle)} />
          ))}
        </div>
      )}
    </div>
  );
}
