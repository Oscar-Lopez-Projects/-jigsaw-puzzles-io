import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import FriendsList from './FriendsList';
import PendingChallenges from './PendingChallenges';
import './Dashboard.css';

interface PuzzleRecord {
  id: string;
  piece_count: number;
  difficulty: string;
  completion_time_sec: number;
  stars: number;
  image_reference: string | null;
  completed_at: string;
}

interface DashboardProps {
  onBack: () => void;
  onViewProfile: (userId: string) => void;
  onAcceptChallenge?: (challenge: { id: string; image_url: string; puzzle_title: string; piece_count: number; difficulty: string; challenger_time_sec: number; challenger_stars: number }) => void;
}

export default function Dashboard({ onBack, onViewProfile, onAcceptChallenge }: DashboardProps) {
  const { user, session, logout } = useAuth();
  const [records, setRecords] = useState<PuzzleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<PuzzleRecord[]>('/api/records', { token: session.access_token })
      .then((data) => setRecords(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [session]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderStars = (count: number) => '★'.repeat(count) + '☆'.repeat(3 - count);

  const totalPuzzles = records.length;
  const totalTime = records.reduce((sum, r) => sum + r.completion_time_sec, 0);
  const bestTime = records.length > 0 ? Math.min(...records.map((r) => r.completion_time_sec)) : 0;
  const avgStars = records.length > 0 ? (records.reduce((sum, r) => sum + r.stars, 0) / records.length) : 0;
  const threeStarCount = records.filter((r) => r.stars === 3).length;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <button type="button" className="dashboard-start-btn" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6.5 5.5l4 2.5-4 2.5V5.5Z" fill="currentColor" />
          </svg>
          Start a Puzzle
        </button>
        <h1 className="dashboard-title">
          {user?.username ? `${user.username}'s Dashboard` : 'Dashboard'}
        </h1>
      </div>

      {loading && (
        <div className="dashboard-loading">
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span>Loading your records...</span>
        </div>
      )}

      {error && <div className="dashboard-error" role="alert">{error}</div>}

      {!loading && !error && (
        <>
          <div className="dashboard-stats">
            <div className="stat-card"><span className="stat-value">{totalPuzzles}</span><span className="stat-label">Puzzles Solved</span></div>
            <div className="stat-card"><span className="stat-value">{bestTime > 0 ? formatTime(bestTime) : '—'}</span><span className="stat-label">Best Time</span></div>
            <div className="stat-card"><span className="stat-value">{avgStars > 0 ? avgStars.toFixed(1) : '—'}</span><span className="stat-label">Avg Stars</span></div>
            <div className="stat-card"><span className="stat-value">{formatTime(totalTime)}</span><span className="stat-label">Total Time</span></div>
            <div className="stat-card"><span className="stat-value">{threeStarCount}</span><span className="stat-label">3-Star Solves</span></div>
          </div>

          <div className="dashboard-records">
            <h2 className="records-title">Puzzle History</h2>
            {records.length === 0 ? (
              <p className="records-empty">No puzzles solved yet. Complete a puzzle to see your records here!</p>
            ) : (
              <div className="records-list">
                {records.map((record) => (
                  <div className="record-row" key={record.id}>
                    <div className="record-info">
                      <span className="record-name">{record.image_reference || 'Puzzle'}</span>
                      <span className="record-meta">{record.piece_count} pieces · {record.difficulty} · {formatDate(record.completed_at)}</span>
                    </div>
                    <div className="record-stats">
                      <span className="record-stars">{renderStars(record.stars)}</span>
                      <span className="record-time">{formatTime(record.completion_time_sec)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <PendingChallenges onAcceptChallenge={onAcceptChallenge || (() => {})} />

          <FriendsList onViewProfile={onViewProfile} />

          <div className="dashboard-danger">
            <button
              type="button"
              className="delete-account-btn"
              onClick={async () => {
                if (!window.confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
                if (!session?.access_token) return;
                try {
                  await apiFetch('/api/users/me', { method: 'DELETE', token: session.access_token });
                  logout();
                } catch { /* ignore */ }
              }}
            >
              Delete Account
            </button>
          </div>
        </>
      )}
    </div>
  );
}
