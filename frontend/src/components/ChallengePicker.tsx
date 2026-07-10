import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import './ChallengePicker.css';

interface Puzzle {
  id: string;
  title: string;
  image_url: string;
  piece_count: number;
  category: string;
  users: { username: string } | null;
}

interface ChallengePickerProps {
  opponent: { id: string; username: string };
  onSelectPuzzle: (imageUrl: string, title: string, pieceCount: number, puzzleId: string) => void;
  onClose: () => void;
}

export default function ChallengePicker({ opponent, onSelectPuzzle, onClose }: ChallengePickerProps) {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Puzzle[]>('/api/puzzles?limit=10')
      .then((data) => setPuzzles(data))
      .catch(() => setPuzzles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-close" onClick={onClose}>✕</button>

        <h2 className="cp-title">⚔️ Challenge a Friend</h2>
        <p className="cp-subtitle">Pick a puzzle to play. After you complete it, the challenge will be sent!</p>

        <div className="cp-opponent">
          <div className="cp-opponent-avatar">{opponent.username.charAt(0).toUpperCase()}</div>
          <div>
            <div className="cp-opponent-name">{opponent.username}</div>
            <div className="cp-opponent-label">Your Opponent</div>
          </div>
        </div>

        <div className="cp-section-title">Choose a Puzzle from Featured</div>

        {loading && <div className="cp-loading">Loading puzzles...</div>}

        {!loading && puzzles.length === 0 && (
          <div className="cp-empty">No puzzles available. Upload one first!</div>
        )}

        {!loading && puzzles.length > 0 && (
          <div className="cp-puzzle-list">
            {puzzles.map((p) => (
              <div className="cp-puzzle-item" key={p.id}>
                <img src={p.image_url} alt={p.title} className="cp-puzzle-thumb" loading="lazy" />
                <div className="cp-puzzle-info">
                  <span className="cp-puzzle-name">{p.title}</span>
                  <span className="cp-puzzle-meta">{p.piece_count} pieces · {p.category} · by {p.users?.username || 'Unknown'}</span>
                </div>
                <button
                  type="button"
                  className="cp-puzzle-play"
                  onClick={() => { onSelectPuzzle(p.image_url, p.title, p.piece_count, p.id); onClose(); }}
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
