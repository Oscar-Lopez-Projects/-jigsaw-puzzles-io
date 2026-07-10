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

interface ProfileData {
  elo: { rating: number; wins: number; losses: number };
  stats: { totalPuzzles: number; avgStars: number; bestTime: number | null; threeStarCount: number; totalTime: number };
  challenges: { total: number; wins: number; losses: number; ties: number };
}

interface DashboardProps {
  onBack: () => void;
  onViewProfile: (userId: string) => void;
  onAcceptChallenge?: (challenge: { id: string; image_url: string; puzzle_title: string; piece_count: number; difficulty: string; challenger_time_sec: number; challenger_stars: number }) => void;
}

function getTier(rating: number): { name: string; color: string } {
  if (rating >= 2000) return { name: 'Grandmaster', color: '#ff4444' };
  if (rating >= 1800) return { name: 'Master', color: '#a855f7' };
  if (rating >= 1500) return { name: 'Diamond I', color: '#60a5fa' };
  if (rating >= 1300) return { name: 'Platinum III', color: '#34d399' };
  if (rating >= 1200) return { name: 'Platinum II', color: '#6ee7b7' };
  if (rating >= 1100) return { name: 'Gold I', color: '#fbbf24' };
  return { name: 'Silver', color: '#9ca3af' };
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}\n${time}`;
}

export default function Dashboard({ onBack, onViewProfile, onAcceptChallenge }: DashboardProps) {
  const { user, session, logout } = useAuth();
  const [records, setRecords] = useState<PuzzleRecord[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token || !user?.id) return;
    // Reset state when user changes
    setRecords([]);
    setProfile(null);
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<PuzzleRecord[]>('/api/records', { token: session.access_token }),
      apiFetch<ProfileData>(`/api/users/${user.id}`),
    ])
      .then(([recs, prof]) => { setRecords(recs); setProfile(prof); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [session?.access_token, user?.id]);

  if (loading) {
    return <div className="dash-page"><div className="dash-loading"><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /> Loading dashboard...</div></div>;
  }

  if (error) {
    return <div className="dash-page"><div className="dash-error">{error}</div></div>;
  }

  const tier = profile ? getTier(profile.elo.rating) : { name: 'Silver', color: '#9ca3af' };
  const winRate = profile && profile.challenges.total > 0 ? Math.round((profile.challenges.wins / profile.challenges.total) * 100) : 0;

  return (
    <div className="dash-page">
      {/* Header Card */}
      <div className="dash-header-card">
        <div className="dash-header-left">
          <div className="dash-avatar">{user?.username?.charAt(0).toUpperCase() || '?'}</div>
          <div className="dash-header-info">
            <h1 className="dash-name">{user?.username || 'Dashboard'} <span className="dash-verified">✓</span></h1>
            <div className="dash-tier-row">
              <span className="dash-tier-badge" style={{ color: tier.color, borderColor: tier.color }}>{tier.name}</span>
              <span className="dash-rank-text">Top 0.6% of players xoxo</span>
            </div>
            <div className="dash-elo-row">
              <span className="dash-elo-label">ELO RATING</span>
              <span className="dash-elo-value">{profile?.elo.rating.toLocaleString() || '1,200'}</span>
              <span className="dash-status">● Online</span>
            </div>
          </div>
        </div>
        <div className="dash-header-right">
          <button type="button" className="dash-start-btn" onClick={onBack}>🧩 Start a Puzzle</button>
          <button type="button" className="dash-logout-btn" onClick={logout}>Sign Out</button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="dash-stats-row">
        <div className="dash-stat"><span className="dash-stat-icon">🧩</span><div><span className="dash-stat-label">PUZZLES SOLVED</span><span className="dash-stat-val">{profile?.stats.totalPuzzles || 0}</span><span className="dash-stat-sub">This Season ▲{Math.min(records.length, 24)} xoxo</span></div></div>
        <div className="dash-stat"><span className="dash-stat-icon">⏱️</span><div><span className="dash-stat-label">BEST TIME</span><span className="dash-stat-val">{profile?.stats.bestTime ? formatTime(profile.stats.bestTime) : '—'}</span><span className="dash-stat-sub">Personal Best</span></div></div>
        <div className="dash-stat"><span className="dash-stat-icon">⭐</span><div><span className="dash-stat-label">AVG STARS</span><span className="dash-stat-val">{profile?.stats.avgStars || '—'}</span><span className="dash-stat-sub">Per Puzzle</span></div></div>
        <div className="dash-stat"><span className="dash-stat-icon">🕐</span><div><span className="dash-stat-label">TOTAL PLAY TIME</span><span className="dash-stat-val">{profile?.stats.totalTime ? `${Math.floor(profile.stats.totalTime / 3600)}h ${Math.floor((profile.stats.totalTime % 3600) / 60)}m` : '—'}</span><span className="dash-stat-sub">Across All Time</span></div></div>
        <div className="dash-stat"><span className="dash-stat-icon">📊</span><div><span className="dash-stat-label">WIN RATE</span><span className="dash-stat-val">{winRate}%</span><span className="dash-stat-sub">{profile?.challenges.wins || 0} Wins</span></div></div>
        <div className="dash-stat"><span className="dash-stat-icon">🔥</span><div><span className="dash-stat-label">CURRENT STREAK</span><span className="dash-stat-val">{Math.min(profile?.elo.wins || 0, 12)} xoxo</span><span className="dash-stat-sub">Amazing!</span></div></div>
      </div>

      {/* Three Column Layout */}
      <div className="dash-columns">
        {/* Left Column */}
        <div className="dash-col-left">
          {/* Season Progress */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>Season 8 Progress xoxo</h3><span className="dash-card-meta">Ends in 24d 5h</span></div>
            <div className="dash-season-row">
              <span style={{ color: tier.color, fontWeight: 700, fontSize: 13 }}>{tier.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next: {getTier((profile?.elo.rating || 1200) + 200).name}</span>
            </div>
            <div className="dash-progress"><div className="dash-progress-fill" style={{ width: '72%' }} /></div>
            <span className="dash-progress-text">{profile?.elo.rating || 1200} / {Math.ceil((profile?.elo.rating || 1200) / 500) * 500} ELO</span>
            <button type="button" className="dash-link-btn">View Season Rewards → xoxo</button>
          </div>

          {/* Achievements */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>Achievements</h3></div>
            <div className="dash-achievements">
              <span className="dash-ach">🏆</span><span className="dash-ach">⭐</span><span className="dash-ach">🔥</span>
              <span className="dash-ach">💎</span><span className="dash-ach">🎯</span><span className="dash-ach dash-ach--locked">🔒</span>
            </div>
            <span className="dash-ach-count">{profile?.stats.threeStarCount || 0} / 36 Unlocked xoxo</span>
          </div>

          {/* Play Style */}
          <div className="dash-card">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 10px' }}>Play Style xoxo</h3>
            <div className="dash-playstyle">
              <div className="dash-playstyle-main"><span className="dash-playstyle-pct">{winRate}%</span><span className="dash-playstyle-label">Speed Solver</span></div>
              <div className="dash-playstyle-bars">
                <div className="dash-bar-row"><span>Speed</span><div className="dash-bar"><div className="dash-bar-fill" style={{ width: '78%' }} /></div><span>78%</span></div>
                <div className="dash-bar-row"><span>Accuracy</span><div className="dash-bar"><div className="dash-bar-fill" style={{ width: '64%' }} /></div><span>64%</span></div>
                <div className="dash-bar-row"><span>Consistency</span><div className="dash-bar"><div className="dash-bar-fill" style={{ width: '70%' }} /></div><span>70%</span></div>
                <div className="dash-bar-row"><span>Focus</span><div className="dash-bar"><div className="dash-bar-fill" style={{ width: '82%' }} /></div><span>82%</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column */}
        <div className="dash-col-mid">
          {/* Puzzle History */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>Puzzle History</h3></div>
            <table className="dash-history-table">
              <thead><tr><th>PUZZLE</th><th>PIECES</th><th>STARS</th><th>TIME</th><th>DATE</th></tr></thead>
              <tbody>
                {records.length > 0 ? records.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td className="dash-hist-name">{r.image_reference || 'Puzzle'}<br/><span className="dash-hist-by">{r.difficulty}</span></td>
                    <td>{r.piece_count}</td>
                    <td className="dash-hist-stars">{'★'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</td>
                    <td>{formatTime(r.completion_time_sec)}</td>
                    <td className="dash-hist-date" style={{ whiteSpace: 'pre-line' }}>{formatDate(r.completed_at)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="dash-hist-empty">No puzzles solved yet. Start playing!</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Friends */}
          <FriendsList onViewProfile={onViewProfile} />
        </div>

        {/* Right Column */}
        <div className="dash-col-right">
          {/* Challenges */}
          <PendingChallenges onAcceptChallenge={onAcceptChallenge || (() => {})} />

          {/* Challenge Stats */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>Challenge Record</h3></div>
            <div className="dash-challenge-summary">
              <div className="dash-challenge-ring"><span className="dash-challenge-total">{profile?.challenges.total || 0}</span><span className="dash-challenge-total-label">Total</span></div>
              <div className="dash-challenge-breakdown">
                <div className="dash-ch-stat"><span className="dash-dot dash-dot--win" /> {profile?.challenges.wins || 0} Wins <span>{winRate}%</span></div>
                <div className="dash-ch-stat"><span className="dash-dot dash-dot--loss" /> {profile?.challenges.losses || 0} Losses <span>{profile && profile.challenges.total > 0 ? Math.round((profile.challenges.losses / profile.challenges.total) * 100) : 0}%</span></div>
                <div className="dash-ch-stat"><span className="dash-dot dash-dot--tie" /> {profile?.challenges.ties || 0} Ties <span>{profile && profile.challenges.total > 0 ? Math.round((profile.challenges.ties / profile.challenges.total) * 100) : 0}%</span></div>
              </div>
            </div>
          </div>

          {/* Performance (static) */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>Performance Overview xoxo</h3><span className="dash-card-meta">Last 10 Days</span></div>
            <div className="dash-perf-chart">
              <div className="dash-perf-bars">
                <div className="dash-perf-bar" style={{ height: '30%' }} />
                <div className="dash-perf-bar" style={{ height: '45%' }} />
                <div className="dash-perf-bar" style={{ height: '60%' }} />
                <div className="dash-perf-bar" style={{ height: '40%' }} />
                <div className="dash-perf-bar" style={{ height: '75%' }} />
                <div className="dash-perf-bar" style={{ height: '85%' }} />
                <div className="dash-perf-bar" style={{ height: '70%' }} />
              </div>
              <div className="dash-perf-metrics">
                <div><span>ELO Change</span><span className="dash-perf-pos">+125 xoxo</span></div>
                <div><span>Best Time Improvement</span><span className="dash-perf-neg">↓ -00:12 xoxo</span></div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="dash-card dash-danger-zone">
            <button type="button" className="dash-delete-btn" onClick={async () => {
              if (!window.confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
              if (!session?.access_token) return;
              try { await apiFetch('/api/users/me', { method: 'DELETE', token: session.access_token }); logout(); } catch {}
            }}>
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
