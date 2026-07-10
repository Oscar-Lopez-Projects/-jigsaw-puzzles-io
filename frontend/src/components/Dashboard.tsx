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
  rank: { position: number; percentile: number; totalPlayers: number };
  stats: { totalPuzzles: number; avgStars: number; bestTime: number | null; threeStarCount: number; totalTime: number };
  challenges: { total: number; wins: number; losses: number; ties: number; currentStreak: number; longestStreak: number };
}

interface DashboardProps {
  onBack: () => void;
  onViewProfile: (userId: string) => void;
  onStartPuzzle?: () => void;
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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeOfDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function DateCell({ iso }: { iso: string }) {
  const [showTime, setShowTime] = useState(false);
  return (
    <span className="dash-date-cell" onClick={() => setShowTime((v) => !v)} style={{ cursor: 'pointer' }}>
      {formatDate(iso)}
      {showTime && <span className="dash-date-time">{formatTimeOfDay(iso)}</span>}
      {!showTime && <span className="dash-date-hint">▼</span>}
    </span>
  );
}

export default function Dashboard({ onBack, onViewProfile, onStartPuzzle, onAcceptChallenge }: DashboardProps) {
  const { user, session, logout } = useAuth();
  const [records, setRecords] = useState<PuzzleRecord[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<'puzzle' | 'pieces' | 'stars' | 'time' | 'date'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
  };

  const sortedRecords = [...records].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'puzzle': cmp = (a.image_reference || '').localeCompare(b.image_reference || ''); break;
      case 'pieces': cmp = a.piece_count - b.piece_count; break;
      case 'stars': cmp = a.stars - b.stars; break;
      case 'time': cmp = a.completion_time_sec - b.completion_time_sec; break;
      case 'date': cmp = new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }).slice(0, 8);

  const sortArrow = (col: typeof sortCol) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

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
              <span className="dash-rank-text">Top {profile?.rank.percentile || 0}% of players (#{profile?.rank.position || '?'})</span>
            </div>
            <div className="dash-elo-row">
              <span className="dash-elo-label">ELO RATING</span>
              <span className="dash-elo-value">{profile?.elo.rating.toLocaleString() || '1,200'}</span>
              <span className="dash-status">● Online</span>
            </div>
          </div>
        </div>
        <div className="dash-header-right">
          <button type="button" className="dash-start-btn" onClick={onStartPuzzle || onBack}>🧩 Start a Puzzle</button>
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
        <div className="dash-stat"><span className="dash-stat-icon">🔥</span><div><span className="dash-stat-label">CURRENT STREAK</span><span className="dash-stat-val">{profile?.challenges.currentStreak || 0}</span><span className="dash-stat-sub">Longest: {profile?.challenges.longestStreak || 0}</span></div></div>
      </div>

      {/* Three Column Layout */}
      <div className="dash-columns">
        {/* Left Column */}
        <div className="dash-col-left">
          {/* ELO Progress */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>ELO Progress</h3></div>
            {(() => {
              const rating = profile?.elo.rating || 1200;
              const tiers = [
                { name: 'Silver', color: '#9ca3af', min: 0, max: 1099 },
                { name: 'Gold I', color: '#fbbf24', min: 1100, max: 1199 },
                { name: 'Platinum II', color: '#6ee7b7', min: 1200, max: 1299 },
                { name: 'Platinum III', color: '#34d399', min: 1300, max: 1499 },
                { name: 'Diamond I', color: '#60a5fa', min: 1500, max: 1799 },
                { name: 'Master', color: '#a855f7', min: 1800, max: 1999 },
                { name: 'Grandmaster', color: '#ff4444', min: 2000, max: 9999 },
              ];
              const currentTier = tiers.find((t) => rating >= t.min && rating <= t.max) || tiers[0];
              const currentIdx = tiers.indexOf(currentTier);
              const nextTier = currentIdx < tiers.length - 1 ? tiers[currentIdx + 1] : null;
              const progressInTier = rating - currentTier.min;
              const tierRange = currentTier.max - currentTier.min + 1;
              const pct = Math.min(100, Math.round((progressInTier / tierRange) * 100));

              return (
                <>
                  <div className="dash-season-row">
                    <span style={{ color: currentTier.color, fontWeight: 700, fontSize: 13 }}>{currentTier.name}</span>
                    {nextTier && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next: <span style={{ color: nextTier.color, fontWeight: 600 }}>{nextTier.name}</span></span>}
                  </div>
                  <div className="dash-progress"><div className="dash-progress-fill" style={{ width: `${pct}%`, background: currentTier.color }} /></div>
                  <span className="dash-progress-text">{rating} / {nextTier ? nextTier.min : '∞'} ELO ({pct}%)</span>
                  {nextTier && <span className="dash-progress-text" style={{ marginTop: 4 }}>Need {nextTier.min - rating} more ELO to reach <span style={{ color: nextTier.color, fontWeight: 600 }}>{nextTier.name}</span></span>}
                </>
              );
            })()}
            <button type="button" className="dash-link-btn" onClick={() => {
              const el = document.querySelector('.dash-elo-details');
              if (el) el.classList.toggle('dash-elo-details--open');
            }}>View Progress Details →</button>
            <div className="dash-elo-details">
              <table className="dash-elo-table">
                <thead><tr><th>Tier</th><th>ELO Range</th></tr></thead>
                <tbody>
                  <tr><td><span style={{ color: '#9ca3af' }}>● Silver</span></td><td>0 – 1,099</td></tr>
                  <tr><td><span style={{ color: '#fbbf24' }}>● Gold I</span></td><td>1,100 – 1,199</td></tr>
                  <tr><td><span style={{ color: '#6ee7b7' }}>● Platinum II</span></td><td>1,200 – 1,299</td></tr>
                  <tr><td><span style={{ color: '#34d399' }}>● Platinum III</span></td><td>1,300 – 1,499</td></tr>
                  <tr><td><span style={{ color: '#60a5fa' }}>● Diamond I</span></td><td>1,500 – 1,799</td></tr>
                  <tr><td><span style={{ color: '#a855f7' }}>● Master</span></td><td>1,800 – 1,999</td></tr>
                  <tr><td><span style={{ color: '#ff4444' }}>● Grandmaster</span></td><td>2,000+</td></tr>
                </tbody>
              </table>
            </div>
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
              <thead><tr>
                <th className="dash-th-sort" onClick={() => handleSort('puzzle')}>PUZZLE{sortArrow('puzzle')}</th>
                <th className="dash-th-sort" onClick={() => handleSort('pieces')}>PIECES{sortArrow('pieces')}</th>
                <th className="dash-th-sort" onClick={() => handleSort('stars')}>STARS{sortArrow('stars')}</th>
                <th className="dash-th-sort" onClick={() => handleSort('time')}>TIME{sortArrow('time')}</th>
                <th className="dash-th-sort" onClick={() => handleSort('date')}>DATE{sortArrow('date')}</th>
              </tr></thead>
              <tbody>
                {sortedRecords.length > 0 ? sortedRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="dash-hist-name">{r.image_reference || 'Puzzle'}<br/><span className="dash-hist-by">{r.difficulty}</span></td>
                    <td>{r.piece_count}</td>
                    <td className="dash-hist-stars">{'★'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</td>
                    <td>{formatTime(r.completion_time_sec)}</td>
                    <td className="dash-hist-date" style={{ whiteSpace: 'pre-line' }}>
                      <DateCell iso={r.completed_at} />
                    </td>
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
