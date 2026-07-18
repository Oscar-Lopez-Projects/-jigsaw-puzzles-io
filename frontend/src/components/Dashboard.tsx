import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import FriendsList from './FriendsList';
import PendingChallenges from './PendingChallenges';
import './Dashboard.css';

interface PuzzleRecord {
  id: string;
  puzzle_id: string | null;
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
  dailyElo?: { date: string; elo: number }[];
  totalEloChange?: number;
}

interface DashboardProps {
  onBack: () => void;
  onViewProfile: (userId: string) => void;
  onStartPuzzle?: () => void;
  onViewChallenge?: (challengeId: string) => void;
  onAcceptChallenge?: (challenge: { id: string; image_url: string; puzzle_title: string; piece_count: number; difficulty: string; challenger_time_sec: number; challenger_stars: number }) => void;
  onResumeSave?: (save: SavedGame) => void;
}

interface SavedGame {
  id: string;
  image_url: string;
  image_filename: string | null;
  piece_count: number;
  grid_cols: number;
  grid_rows: number;
  elapsed_sec: number;
  pieces_state: unknown[];
  puzzle_id: string | null;
  saved_at: string;
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

export default function Dashboard({ onBack, onViewProfile, onStartPuzzle, onViewChallenge, onAcceptChallenge, onResumeSave }: DashboardProps) {
  const { user, session, logout, updateUser } = useAuth();
  const [records, setRecords] = useState<PuzzleRecord[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<'puzzle' | 'pieces' | 'stars' | 'time' | 'date'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 5;

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
      apiFetch<SavedGame[]>('/api/saved-games', { token: session.access_token }),
    ])
      .then(([recs, prof, saves]) => { setRecords(recs); setProfile(prof); setSavedGames(saves); })
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
  }).slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE);

  const totalPages = Math.ceil(records.length / HISTORY_PER_PAGE);

  const sortArrow = (col: typeof sortCol) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="dash-page">
      {/* Header Card */}
      <div className="dash-header-card">
        <div className="dash-header-left">
          <label className="dash-avatar-upload" title="Click to change profile picture">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.username} className="dash-avatar-img" />
            ) : (
              <div className="dash-avatar">{user?.username?.charAt(0).toUpperCase() || '?'}</div>
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !session?.access_token) return;
                const formData = new FormData();
                formData.append('avatar', file);
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/users/me/avatar`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: formData,
                  });
                  const data = await res.json();
                  if (res.ok && data.avatar_url) {
                    updateUser({ avatar_url: data.avatar_url });
                  }
                } catch {}
              }}
            />
            <span className="dash-avatar-overlay">📷</span>
          </label>
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
              const rating = profile?.elo.rating || 0;
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

          {/* Puzzles Completed */}
          <div className="dash-card">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 10px' }}>Puzzles Completed</h3>
            {(() => {
              const total = records.length;
              const solo = records.filter((r) => !r.puzzle_id).length;
              const featured = records.filter((r) => r.puzzle_id).length;
              const threeStars = records.filter((r) => r.stars === 3).length;
              const twoStars = records.filter((r) => r.stars === 2).length;
              const oneStar = records.filter((r) => r.stars === 1).length;
              return (
                <div className="dash-completed-stats">
                  <div className="dash-completed-total"><span className="dash-completed-num">{total}</span><span className="dash-completed-label">Total</span></div>
                  <div className="dash-completed-breakdown">
                    <div className="dash-completed-row"><span className="dash-dot dash-dot--win" /> Featured Puzzles <span>{featured}</span></div>
                    <div className="dash-completed-row"><span className="dash-dot dash-dot--tie" /> Solo Puzzles <span>{solo}</span></div>
                    <div className="dash-completed-row" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}><span style={{ color: '#f59e0b' }}>★★★</span> 3-Star Solves <span>{threeStars}</span></div>
                    <div className="dash-completed-row"><span style={{ color: '#f59e0b' }}>★★☆</span> 2-Star Solves <span>{twoStars}</span></div>
                    <div className="dash-completed-row"><span style={{ color: '#f59e0b' }}>★☆☆</span> 1-Star Solves <span>{oneStar}</span></div>
                  </div>
                </div>
              );
            })()}
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
            {totalPages > 1 && (
              <div className="dash-pagination">
                <button disabled={historyPage === 1} onClick={() => setHistoryPage((p) => p - 1)}>← Prev</button>
                <span className="dash-pagination-info">Page {historyPage} of {totalPages}</span>
                <button disabled={historyPage === totalPages} onClick={() => setHistoryPage((p) => p + 1)}>Next →</button>
              </div>
            )}
          </div>

          {/* Saved Solo Gameplay */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>💾 Saved Solo Gameplay</h3>
              <span className="dash-card-meta">{savedGames.length}/2 slots used</span>
            </div>
            {savedGames.length === 0 ? (
              <div className="dash-saved-empty">
                <span className="dash-saved-empty-icon">🎮</span>
                <p>No saved games yet.</p>
                <p>Press <strong>Save</strong> during a solo puzzle to pick up right where you left off.</p>
              </div>
            ) : (
              <div className="dash-saved-list">
                {savedGames.map((save) => (
                  <div key={save.id} className="dash-saved-item">
                    <img src={save.image_url} alt={save.image_filename || 'Saved puzzle'} className="dash-saved-thumb" />
                    <div className="dash-saved-info">
                      <span className="dash-saved-name">{save.image_filename || 'Puzzle'}</span>
                      <span className="dash-saved-meta">
                        {save.piece_count} pieces &middot; {save.grid_cols}×{save.grid_rows} &middot; {formatTime(save.elapsed_sec)} elapsed
                      </span>
                      <span className="dash-saved-date">Saved {formatDate(save.saved_at)}</span>
                    </div>
                    <div className="dash-saved-actions">
                      <button
                        type="button"
                        className="dash-saved-resume-btn"
                        onClick={() => onResumeSave?.(save)}
                        title="Resume this game"
                      >
                        ▶ Resume
                      </button>
                      <button
                        type="button"
                        className="dash-saved-delete-btn"
                        title="Delete this save"
                        onClick={async () => {
                          if (!session?.access_token) return;
                          if (!window.confirm('Delete this saved game? This cannot be undone.')) return;
                          try {
                            await apiFetch(`/api/saved-games/${save.id}`, { method: 'DELETE', token: session.access_token });
                            setSavedGames((prev) => prev.filter((s) => s.id !== save.id));
                          } catch {}
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Friends */}
          <FriendsList onViewProfile={onViewProfile} />

        {/* Right Column */}
        <div className="dash-col-right">
          {/* Challenges */}
          <PendingChallenges onAcceptChallenge={onAcceptChallenge || (() => {})} onViewChallenge={onViewChallenge} />

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

          {/* Performance Overview */}
          <div className="dash-card">
            <div className="dash-card-header"><h3>Performance Overview</h3><span className="dash-card-meta">Last 7 Days</span></div>
            <div className="dash-perf-chart">
              {(() => {
                const days = profile?.dailyElo || [];
                const maxElo = Math.max(...days.map((d) => Math.abs(d.elo)), 1);
                return (
                  <>
                    <div className="dash-perf-bars">
                      {days.map((d) => {
                        const pct = Math.max(5, (Math.abs(d.elo) / maxElo) * 100);
                        const isNeg = d.elo < 0;
                        const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
                        return (
                          <div key={d.date} className="dash-perf-bar-wrap" title={`${dayLabel}: ${d.elo >= 0 ? '+' : ''}${d.elo} ELO`}>
                            <div
                              className={`dash-perf-bar${isNeg ? ' dash-perf-bar--neg' : ''}`}
                              style={{ height: `${pct}%` }}
                            />
                            <span className="dash-perf-bar-label">{dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="dash-perf-metrics">
                      <div>
                        <span>ELO Change (7d)</span>
                        {(() => {
                          const total = profile?.totalEloChange ?? 0;
                          return total >= 0
                            ? <span className="dash-perf-pos">+{total}</span>
                            : <span className="dash-perf-neg">{total}</span>;
                        })()}
                      </div>
                      <div><span>Best Time Improvement</span><span className="dash-perf-neg">↓ -00:12 xoxo</span></div>
                    </div>
                  </>
                );
              })()}
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
