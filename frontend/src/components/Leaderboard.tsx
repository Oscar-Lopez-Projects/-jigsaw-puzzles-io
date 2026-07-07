import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import './Leaderboard.css';

interface EloEntry {
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  users: { username: string; avatar_url: string | null } | null;
}

interface LeaderboardProps {
  onBack: () => void;
}

export default function Leaderboard({ onBack }: LeaderboardProps) {
  const [entries, setEntries] = useState<EloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EloEntry[]>('/api/leaderboard?limit=50')
      .then((data) => setEntries(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <button type="button" className="leaderboard-back" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <h1 className="leaderboard-title">Leaderboard</h1>
      </div>

      {loading && (
        <div className="leaderboard-loading">
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span>Loading rankings...</span>
        </div>
      )}

      {error && <div className="leaderboard-error" role="alert">{error}</div>}

      {!loading && !error && entries.length === 0 && (
        <div className="leaderboard-empty">
          <p>No players ranked yet. Complete puzzles to climb the leaderboard!</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="leaderboard-table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th className="lb-col-rank">#</th>
                <th className="lb-col-user">Player</th>
                <th className="lb-col-rating">ELO</th>
                <th className="lb-col-wins">Wins</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.user_id} className={i < 3 ? `lb-row--top${i + 1}` : ''}>
                  <td className="lb-rank">{i + 1}</td>
                  <td className="lb-user">{entry.users?.username || 'Unknown'}</td>
                  <td className="lb-rating">{entry.rating}</td>
                  <td className="lb-wins">{entry.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
