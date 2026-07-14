import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './UserProfile.css';

interface UserProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  elo: { rating: number; wins: number; losses: number };
  rank: { position: number; percentile: number; totalPlayers: number };
  stats: { totalPuzzles: number; avgStars: number; bestTime: number | null; threeStarCount: number; totalTime: number };
  challenges: { total: number; wins: number; losses: number; ties: number; currentStreak: number; longestStreak: number };
  dailyElo?: { date: string; elo: number }[];
  totalEloChange?: number;
}

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

interface UserProfileProps {
  userId: string;
  onBack: () => void;
  onChallenge?: (userId: string, username: string) => void;
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function UserProfile({ userId, onBack, onChallenge }: UserProfileProps) {
  const { session, user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [records, setRecords] = useState<PuzzleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted' | 'loading'>('loading');
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [recentChallenges, setRecentChallenges] = useState<{ id: string; opponentName: string; result: 'won' | 'lost' | 'tie'; completedAt: string }[]>([]);

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    apiFetch<UserProfileData>(`/api/users/${userId}`)
      .then((data) => setProfile(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  // Fetch puzzle records for this user's profile
  const [recordsDebug, setRecordsDebug] = useState<string>('Loading records...');
  useEffect(() => {
    let cancelled = false;
    
    const fetchRecords = (attempt: number) => {
      const cacheBust = Date.now();
      apiFetch<PuzzleRecord[]>(`/api/records/public?userId=${userId}&_t=${cacheBust}`)
        .then((data) => {
          if (cancelled) return;
          if (data.length === 0 && attempt < 4) {
            // Render free tier cold start can take up to 30s
            const delay = attempt === 0 ? 3000 : 5000;
            setRecordsDebug(`Server warming up, retrying... (attempt ${attempt + 1}/4)`);
            setTimeout(() => fetchRecords(attempt + 1), delay);
          } else {
            setRecords(data);
            setRecordsDebug(`Fetched ${data.length} records for userId=${userId}`);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (attempt < 4) {
            const delay = attempt === 0 ? 3000 : 5000;
            setRecordsDebug(`Retrying... (attempt ${attempt + 1}/4)`);
            setTimeout(() => fetchRecords(attempt + 1), delay);
          } else {
            setRecordsDebug(`Error: ${err.message} | userId=${userId}`);
          }
        });
    };
    
    fetchRecords(0);
    return () => { cancelled = true; };
  }, [userId, session?.access_token]);

  // Fetch recent challenges for this user
  useEffect(() => {
    apiFetch<{ sent: { id: string; status: string; winner: string | null; completed_at: string; challenger?: { username: string }; opponent?: { username: string } }[]; received: { id: string; status: string; winner: string | null; completed_at: string; challenger?: { username: string }; opponent?: { username: string } }[] }>(`/api/challenges/user/${userId}`)
      .then((data) => {
        const all = [
          ...(data.sent || []).filter(c => c.status === 'completed').map(c => ({
            id: c.id,
            opponentName: c.opponent?.username || 'Unknown',
            result: (c.winner === 'challenger' ? 'won' : c.winner === 'opponent' ? 'lost' : 'tie') as 'won' | 'lost' | 'tie',
            completedAt: c.completed_at,
          })),
          ...(data.received || []).filter(c => c.status === 'completed').map(c => ({
            id: c.id,
            opponentName: c.challenger?.username || 'Unknown',
            result: (c.winner === 'opponent' ? 'won' : c.winner === 'challenger' ? 'lost' : 'tie') as 'won' | 'lost' | 'tie',
            completedAt: c.completed_at,
          })),
        ].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).slice(0, 5);
        setRecentChallenges(all);
      })
      .catch(() => {});
  }, [userId]);

  // Check friendship status
  useEffect(() => {
    if (!session?.access_token || isOwnProfile) { setFriendStatus('none'); return; }
    apiFetch<{ sent: { addressee: { id: string } | null; status: string }[]; received: { requester: { id: string } | null; status: string }[] }>('/api/friends', { token: session.access_token })
      .then((data) => {
        const sentMatch = data.sent.find((f) => (f.addressee as { id: string } | null)?.id === userId);
        const recvMatch = data.received.find((f) => (f.requester as { id: string } | null)?.id === userId);
        if (sentMatch) setFriendStatus(sentMatch.status as 'pending' | 'accepted');
        else if (recvMatch) setFriendStatus(recvMatch.status as 'pending' | 'accepted');
        else setFriendStatus('none');
      })
      .catch(() => setFriendStatus('none'));
  }, [session, userId, isOwnProfile]);

  const handleAddFriend = async () => {
    if (!session?.access_token) return;
    setFriendActionLoading(true);
    try {
      await apiFetch('/api/friends', { method: 'POST', token: session.access_token, body: { addressee_id: userId } });
      setFriendStatus('pending');
    } catch { /* ignore */ }
    finally { setFriendActionLoading(false); }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading"><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /> Loading profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-page">
        <button type="button" className="profile-back-btn" onClick={onBack}>← Back</button>
        <div className="profile-error">{error || 'User not found'}</div>
      </div>
    );
  }

  const tier = getTier(profile.elo.rating);
  const winRate = profile.challenges.total > 0 ? Math.round((profile.challenges.wins / profile.challenges.total) * 100) : 0;

  return (
    <div className="profile-page">
      {/* Profile Header */}
      <div className="profile-header-card">
        <div className="profile-header-left">
          <div className="profile-avatar-lg">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              profile.username.charAt(0).toUpperCase()
            )}
          </div>
          <div className="profile-header-info">
            <h1 className="profile-name-lg">{profile.username} <span className="profile-verified">✓</span></h1>
            <div className="profile-tier-row">
              <span className="profile-tier-badge" style={{ color: tier.color, borderColor: tier.color }}>{tier.name}</span>
              <span className="profile-rank-text">Top {profile.rank?.percentile || 0}% of players (#{profile.rank?.position || '?'})</span>
            </div>
            <div className="profile-elo-row">
              <span className="profile-elo-label">ELO RATING</span>
              <span className="profile-elo-value">{profile.elo.rating.toLocaleString()}</span>
              <span className="profile-status">● Online</span>
            </div>
            <p className="profile-bio">Piecing together victories, one puzzle at a time.</p>
          </div>
        </div>
        <div className="profile-header-right">
          <button type="button" className="profile-start-btn" onClick={onBack}>Start Puzzle</button>
          <button type="button" className="profile-live-btn" disabled>⚡ Join Live Match <span className="nav-live-badge">LIVE</span></button>
          {!isOwnProfile && session?.access_token && (
            <div className="profile-friend-actions">
              {friendStatus === 'none' && (
                <button type="button" className="profile-action-btn" onClick={handleAddFriend} disabled={friendActionLoading}>
                  {friendActionLoading ? '...' : '+ Add Friend'}
                </button>
              )}
              {friendStatus === 'pending' && <span className="profile-status-badge profile-status-badge--pending">Request Pending</span>}
              {friendStatus === 'accepted' && onChallenge && (
                <button type="button" className="profile-action-btn profile-action-btn--challenge" onClick={() => onChallenge(userId, profile.username)}>
                  ⚔️ Challenge
                </button>
              )}
              {friendStatus === 'accepted' && <span className="profile-status-badge profile-status-badge--friends">✓ Friends</span>}
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="profile-stats-row">
        <div className="profile-stat-card">
          <span className="profile-stat-icon">🧩</span>
          <span className="profile-stat-label">PUZZLES SOLVED</span>
          <span className="profile-stat-val">{profile.stats.totalPuzzles.toLocaleString()}</span>
          <span className="profile-stat-sub">This Season: ▲24</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-icon">⏱️</span>
          <span className="profile-stat-label">BEST TIME</span>
          <span className="profile-stat-val">{profile.stats.bestTime ? formatTime(profile.stats.bestTime) : '—'}</span>
          <span className="profile-stat-sub">Personal Best</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-icon">⭐</span>
          <span className="profile-stat-label">AVG STARS</span>
          <span className="profile-stat-val">{profile.stats.avgStars || '—'}</span>
          <span className="profile-stat-sub">Per Puzzle</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-icon">🕐</span>
          <span className="profile-stat-label">TOTAL PLAY TIME</span>
          <span className="profile-stat-val">{profile.stats.totalTime > 0 ? `${Math.floor(profile.stats.totalTime / 3600)}h ${Math.floor((profile.stats.totalTime % 3600) / 60)}m` : '—'}</span>
          <span className="profile-stat-sub">Across All Time</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-icon">📊</span>
          <span className="profile-stat-label">WIN RATE</span>
          <span className="profile-stat-val">{winRate}%</span>
          <span className="profile-stat-sub">{profile.challenges.wins} Wins</span>
        </div>
        <div className="profile-stat-card">
          <span className="profile-stat-icon">🔥</span>
          <span className="profile-stat-label">CURRENT STREAK</span>
          <span className="profile-stat-val">{profile.challenges.currentStreak || 0}</span>
          <span className="profile-stat-sub">Longest: {profile.challenges.longestStreak || 0}</span>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="profile-columns">
        {/* Left Column */}
        <div className="profile-col-left">
          {/* Season Progress */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Season 8 Progress</h3>
              <span className="profile-card-meta">Ends in 24d 5h</span>
            </div>
            <div className="profile-season-row">
              <span className="profile-season-tier" style={{ color: tier.color }}>{tier.name}</span>
              <span className="profile-season-next">Next: {getTier(profile.elo.rating + 200).name}</span>
            </div>
            <div className="profile-progress"><div className="profile-progress-fill" style={{ width: '72%' }} /></div>
            <span className="profile-progress-text">{profile.elo.rating} / {Math.ceil(profile.elo.rating / 500) * 500} ELO</span>
            <button type="button" className="profile-link-btn">View Season Rewards →</button>
          </div>

          {/* Achievements */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Achievements</h3>
              <button type="button" className="profile-card-link">View All</button>
            </div>
            <div className="profile-achievements">
              <div className="profile-achievement">🏆</div>
              <div className="profile-achievement">⭐</div>
              <div className="profile-achievement">🔥</div>
              <div className="profile-achievement">💎</div>
              <div className="profile-achievement">🎯</div>
              <div className="profile-achievement profile-achievement--locked">🔒</div>
            </div>
            <span className="profile-achievement-count">{profile.stats.threeStarCount} / 36 Unlocked</span>
          </div>

          {/* Puzzles Completed */}
          <div className="profile-card">
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
        </div>

        {/* Middle Column */}
        <div className="profile-col-mid">
          {/* Puzzle History */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Puzzle History</h3>
              <button type="button" className="profile-card-link">View All</button>
            </div>
            <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', color: '#aaa', marginBottom: 8 }}>
              {recordsDebug}
            </div>
            <table className="profile-history-table">
              <thead>
                <tr><th>PUZZLE</th><th>PIECES</th><th>STARS</th><th>TIME</th><th>DATE</th></tr>
              </thead>
              <tbody>
                {records.length > 0 ? records.slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td className="profile-history-name">{r.image_reference || 'Puzzle'}<br/><span className="profile-history-by">by {profile.username}</span></td>
                    <td>{r.piece_count}</td>
                    <td className="profile-history-stars">{'★'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</td>
                    <td>{formatTime(r.completion_time_sec)}</td>
                    <td className="profile-history-date">{formatDate(r.completed_at)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="profile-history-empty">No puzzle history yet</td></tr>
                )}
              </tbody>
            </table>
            <button type="button" className="profile-link-btn">View Full Puzzle History →</button>
          </div>

          {/* Friends Online - removed */}
        </div>

        {/* Right Column */}
        <div className="profile-col-right">
          {/* Challenges & Results */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Challenges & Results</h3>
              <button type="button" className="profile-card-link">View All</button>
            </div>
            <div className="profile-challenges-summary">
              <div className="profile-challenge-ring">
                <span className="profile-challenge-total">{profile.challenges.total}</span>
                <span className="profile-challenge-total-label">Total</span>
              </div>
              <div className="profile-challenge-breakdown">
                <div className="profile-challenge-stat"><span className="profile-dot profile-dot--win" /> {profile.challenges.wins} Wins <span>{profile.challenges.total > 0 ? Math.round((profile.challenges.wins / profile.challenges.total) * 100) : 0}%</span></div>
                <div className="profile-challenge-stat"><span className="profile-dot profile-dot--loss" /> {profile.challenges.losses} Losses <span>{profile.challenges.total > 0 ? Math.round((profile.challenges.losses / profile.challenges.total) * 100) : 0}%</span></div>
                <div className="profile-challenge-stat"><span className="profile-dot profile-dot--tie" /> {profile.challenges.ties} Ties <span>{profile.challenges.total > 0 ? Math.round((profile.challenges.ties / profile.challenges.total) * 100) : 0}%</span></div>
              </div>
            </div>
            <div className="profile-recent-challenges">
              <span className="profile-recent-label">Recent Challenges</span>
              {recentChallenges.length > 0 ? recentChallenges.map((c) => (
                <div className="profile-recent-row" key={c.id}>
                  <span>{c.opponentName}</span>
                  <span className={`profile-result-badge profile-result-badge--${c.result}`}>
                    {c.result === 'won' ? 'Won' : c.result === 'lost' ? 'Lost' : 'Tie'}
                  </span>
                  <span className="profile-recent-time">{timeAgo(c.completedAt)}</span>
                </div>
              )) : (
                <div className="profile-recent-row"><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No completed challenges yet</span></div>
              )}
            </div>
            {!isOwnProfile && onChallenge && friendStatus === 'accepted' && (
              <button type="button" className="profile-link-btn" onClick={() => onChallenge(userId, profile.username)}>Challenge a Player →</button>
            )}
          </div>

          {/* Performance Overview - dynamic */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Performance Overview</h3>
              <span className="profile-card-meta">Last 7 Days</span>
            </div>
            <div className="profile-perf-chart">
              {(() => {
                const days = profile.dailyElo || [];
                const maxElo = Math.max(...days.map((d) => Math.abs(d.elo)), 1);
                return (
                  <>
                    <div className="profile-perf-placeholder">
                      {days.map((d) => {
                        const pct = Math.max(5, (Math.abs(d.elo) / maxElo) * 100);
                        const isNeg = d.elo < 0;
                        const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
                        return (
                          <div key={d.date} className="profile-perf-bar-wrap" title={`${dayLabel}: ${d.elo >= 0 ? '+' : ''}${d.elo} ELO`}>
                            <div
                              className={`profile-perf-bar${isNeg ? ' profile-perf-bar--neg' : ''}`}
                              style={{ height: `${pct}%` }}
                            />
                            <span className="profile-perf-bar-label">{dayLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="profile-perf-metrics">
                      <div className="profile-perf-metric">
                        <span>ELO Change (7d)</span>
                        {(() => {
                          const total = profile.totalEloChange ?? 0;
                          return total >= 0
                            ? <span className="profile-perf-positive">+{total}</span>
                            : <span className="profile-perf-negative">{total}</span>;
                        })()}
                      </div>
                      <div className="profile-perf-metric"><span>Best Time Improvement</span><span className="profile-perf-negative">↓ -00:12 xoxo</span></div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
