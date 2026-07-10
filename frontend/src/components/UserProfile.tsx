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
  stats: { totalPuzzles: number; avgStars: number; bestTime: number | null; threeStarCount: number; totalTime: number };
  challenges: { total: number; wins: number; losses: number; ties: number };
}

interface PuzzleRecord {
  id: string;
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

export default function UserProfile({ userId, onBack, onChallenge }: UserProfileProps) {
  const { session, user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [records, setRecords] = useState<PuzzleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted' | 'loading'>('loading');
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    apiFetch<UserProfileData>(`/api/users/${userId}`)
      .then((data) => setProfile(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  // Fetch records if viewing own profile
  useEffect(() => {
    if (!session?.access_token || !isOwnProfile) return;
    apiFetch<PuzzleRecord[]>('/api/records', { token: session.access_token })
      .then((data) => setRecords(data.slice(0, 5)))
      .catch(() => {});
  }, [session, isOwnProfile]);

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
              <span className="profile-rank-text">Top 0.6% of players</span>
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
          <span className="profile-stat-val">{Math.min(profile.elo.wins, 12)}</span>
          <span className="profile-stat-sub">Amazing!</span>
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

          {/* Play Style */}
          <div className="profile-card">
            <h3>Play Style</h3>
            <div className="profile-playstyle">
              <div className="profile-playstyle-main">
                <span className="profile-playstyle-pct">{winRate}%</span>
                <span className="profile-playstyle-label">Speed Solver</span>
              </div>
              <div className="profile-playstyle-bars">
                <div className="profile-bar-row"><span>Speed</span><div className="profile-bar"><div className="profile-bar-fill" style={{ width: '78%' }} /></div><span>78%</span></div>
                <div className="profile-bar-row"><span>Accuracy</span><div className="profile-bar"><div className="profile-bar-fill" style={{ width: '64%' }} /></div><span>64%</span></div>
                <div className="profile-bar-row"><span>Consistency</span><div className="profile-bar"><div className="profile-bar-fill" style={{ width: '70%' }} /></div><span>70%</span></div>
                <div className="profile-bar-row"><span>Focus</span><div className="profile-bar"><div className="profile-bar-fill" style={{ width: '82%' }} /></div><span>82%</span></div>
              </div>
            </div>
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
            <table className="profile-history-table">
              <thead>
                <tr><th>PUZZLE</th><th>PIECES</th><th>STARS</th><th>TIME</th><th>DATE</th></tr>
              </thead>
              <tbody>
                {records.length > 0 ? records.map((r) => (
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

          {/* Friends Online - static */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Friends Online (3)</h3>
              <button type="button" className="profile-card-link">View All</button>
            </div>
            <div className="profile-friends-online">
              <div className="profile-friend-online">
                <div className="profile-friend-av">L</div>
                <span className="profile-friend-nm">lofigirl31</span>
                <span className="profile-friend-status">● Online</span>
              </div>
              <div className="profile-friend-online">
                <div className="profile-friend-av">P</div>
                <span className="profile-friend-nm">puzzle_master</span>
                <span className="profile-friend-status profile-friend-status--match">● In Match</span>
              </div>
              <div className="profile-friend-online">
                <div className="profile-friend-av">A</div>
                <span className="profile-friend-nm">artlover</span>
                <span className="profile-friend-status">● Online</span>
              </div>
            </div>
          </div>
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
                <div className="profile-challenge-stat"><span className="profile-dot profile-dot--rematch" /> 1 Rematches <span>8%</span></div>
              </div>
            </div>
            <div className="profile-recent-challenges">
              <span className="profile-recent-label">Recent Challenges</span>
              <div className="profile-recent-row"><span>lofigirl31</span><span className="profile-result-badge profile-result-badge--won">You Won</span><span className="profile-recent-time">2h ago</span></div>
              <div className="profile-recent-row"><span>puzzle_master</span><span className="profile-result-badge profile-result-badge--lost">You Lost</span><span className="profile-recent-time">5h ago</span></div>
              <div className="profile-recent-row"><span>artlover</span><span className="profile-result-badge profile-result-badge--tie">Tie</span><span className="profile-recent-time">1d ago</span></div>
            </div>
            {!isOwnProfile && onChallenge && friendStatus === 'accepted' && (
              <button type="button" className="profile-link-btn" onClick={() => onChallenge(userId, profile.username)}>Challenge a Player →</button>
            )}
          </div>

          {/* Performance Overview - static */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h3>Performance Overview</h3>
              <span className="profile-card-meta">Last 10 Days →</span>
            </div>
            <div className="profile-perf-chart">
              <div className="profile-perf-placeholder">
                <div className="profile-perf-bar" style={{ height: '30%' }} />
                <div className="profile-perf-bar" style={{ height: '45%' }} />
                <div className="profile-perf-bar" style={{ height: '60%' }} />
                <div className="profile-perf-bar" style={{ height: '40%' }} />
                <div className="profile-perf-bar" style={{ height: '75%' }} />
                <div className="profile-perf-bar" style={{ height: '85%' }} />
                <div className="profile-perf-bar" style={{ height: '70%' }} />
              </div>
              <div className="profile-perf-metrics">
                <div className="profile-perf-metric"><span>ELO Change</span><span className="profile-perf-positive">+125</span></div>
                <div className="profile-perf-metric"><span>Best Time Improvement</span><span className="profile-perf-negative">↓ -00:12</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
