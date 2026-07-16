import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './Leaderboard.css';

interface EloEntry {
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  last_match_at: string | null;
  users: { username: string; avatar_url: string | null } | null;
}

interface UserStats {
  elo: { rating: number; wins: number; losses: number };
  rank: { position: number; percentile: number; totalPlayers: number };
  challenges: { total: number; wins: number; losses: number; ties: number; currentStreak: number; longestStreak: number };
  stats: { totalPuzzles: number; bestTime: number | null };
}

interface LeaderboardProps {
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function Leaderboard({ onBack: _onBack, onViewProfile }: LeaderboardProps) {
  const { user, session } = useAuth();
  const [entries, setEntries] = useState<EloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('global');
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  // Fetch current user's stats for the header
  useEffect(() => {
    if (!user?.id) return;
    apiFetch<UserStats>(`/api/users/${user.id}`)
      .then((data) => setUserStats(data))
      .catch(() => {});
  }, [user?.id]);

  const fetchLeaderboard = async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'friends') {
        if (!session?.access_token) {
          setEntries([]);
          return;
        }
        // Get friends list, include self, then fetch leaderboard filtered by those IDs
        const friendsData = await apiFetch<{
          sent: { addressee: { id: string } | null; status: string }[];
          received: { requester: { id: string } | null; status: string }[];
        }>('/api/friends', { token: session.access_token });

        const friendIds: string[] = [];
        friendsData.sent.filter(f => f.status === 'accepted' && f.addressee).forEach(f => friendIds.push(f.addressee!.id));
        friendsData.received.filter(f => f.status === 'accepted' && f.requester).forEach(f => friendIds.push(f.requester!.id));

        // Include self in friends leaderboard
        if (user?.id) friendIds.push(user.id);

        if (friendIds.length > 0) {
          const data = await apiFetch<EloEntry[]>(`/api/leaderboard?friends=${friendIds.join(',')}`);
          setEntries(data);
        } else {
          setEntries([]);
        }
      } else if (tab === 'weekly') {
        // Weekly: players active in last 7 days, sorted by ELO
        const data = await apiFetch<EloEntry[]>('/api/leaderboard?limit=50');
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        setEntries(data.filter((e) => e.last_match_at && new Date(e.last_match_at).getTime() > weekAgo));
      } else {
        // Global — all players by ELO
        const data = await apiFetch<EloEntry[]>('/api/leaderboard?limit=50');
        setEntries(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(activeTab);
  }, [activeTab]);

  // Find current user's position in the current entries
  const myEntry = user?.id ? entries.find((e) => e.user_id === user.id) : null;
  const myRank = myEntry ? entries.indexOf(myEntry) + 1 : null;

  const top3 = entries.length >= 3 ? entries.slice(0, 3) : [];
  const tableEntries = entries.length >= 3 ? entries.slice(3) : entries;

  // Stats from API
  const myElo = userStats?.elo.rating ?? myEntry?.rating ?? 0;
  const myTier = getTier(myElo);
  const myWins = userStats?.challenges.wins ?? myEntry?.wins ?? 0;
  const myLosses = userStats?.challenges.losses ?? myEntry?.losses ?? 0;
  const myTotal = myWins + myLosses;
  const myWinRate = myTotal > 0 ? Math.round((myWins / myTotal) * 100) : 0;
  const myStreak = userStats?.challenges.currentStreak ?? 0;
  const myRankPos = userStats?.rank.position ?? myRank ?? '—';
  const myPercentile = userStats?.rank.percentile ?? 0;

  if (loading) {
    return (
      <div className="lb-page">
        <div className="lb-loading">
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span>Loading rankings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lb-page">
        <div className="lb-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="lb-page">
      <div className="lb-main">
        {/* Hero */}
        <div className="lb-hero">
          <div className="lb-hero-text">
            <h1 className="lb-hero-title">Leaderboards</h1>
            <p className="lb-hero-subtitle">Compete. Climb. Be the puzzle champion.</p>
          </div>
          <div className="lb-hero-graphic" aria-hidden="true">🏆</div>
        </div>

        {/* Stats row — dynamic data */}
        {user && (
          <div className="lb-stats-row">
            <div className="lb-stat-box">
              <span className="lb-stat-label">YOUR RANK</span>
              <span className="lb-stat-value lb-stat-value--big">#{myRankPos}</span>
              <span className="lb-stat-sub">Top {myPercentile}%</span>
            </div>
            <div className="lb-stat-box">
              <span className="lb-stat-label">YOUR ELO</span>
              <span className="lb-stat-value">{myElo.toLocaleString()}</span>
              <span className="lb-stat-sub" style={{ color: myTier.color }}>{myTier.name}</span>
            </div>
            <div className="lb-stat-box">
              <span className="lb-stat-label">WIN RATE</span>
              <span className="lb-stat-value">{myWinRate}%</span>
              <span className="lb-stat-sub">{myWins} Wins</span>
            </div>
            <div className="lb-stat-box">
              <span className="lb-stat-label">WIN STREAK</span>
              <span className="lb-stat-value">{myStreak}</span>
              <span className="lb-stat-sub">{myStreak >= 5 ? 'Amazing!' : myStreak >= 3 ? 'Great!' : 'Keep going!'}</span>
            </div>
            <div className="lb-stat-box">
              <span className="lb-stat-label">PUZZLES SOLVED</span>
              <span className="lb-stat-value">{userStats?.stats.totalPuzzles ?? 0}</span>
              <span className="lb-stat-sub">{userStats?.stats.bestTime ? `Best: ${formatTime(userStats.stats.bestTime)}` : 'No solves yet'}</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="lb-tabs">
          {['Global', 'Friends', 'Weekly'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`lb-tab${activeTab === tab.toLowerCase() ? ' lb-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.toLowerCase())}
            >
              {tab}
            </button>
          ))}
          <button type="button" className="lb-tab" disabled>
            Live Match Rankings
            <span className="nav-live-badge">LIVE</span>
          </button>
          <button type="button" className="lb-tab" disabled>
            Tournaments
          </button>
        </div>

        {/* Empty state for friends tab */}
        {activeTab === 'friends' && entries.length === 0 && !loading && (
          <div className="lb-empty">
            <p>No friends on the leaderboard yet. Add friends to see them here!</p>
          </div>
        )}

        {/* Empty state for weekly tab */}
        {activeTab === 'weekly' && entries.length === 0 && !loading && (
          <div className="lb-empty">
            <p>No players active this week yet.</p>
          </div>
        )}

        {/* Top 3 Podium */}
        {top3.length >= 3 && (
          <div className="lb-podium-section">
            <h2 className="lb-section-title">
              {activeTab === 'global' ? 'Top Players Worldwide' : activeTab === 'friends' ? 'Top Friends' : 'Top This Week'}
            </h2>
            <div className="lb-podium">
              {/* 2nd place */}
              <div className="lb-podium-card lb-podium-card--2" onClick={() => onViewProfile?.(top3[1].user_id)} style={{ cursor: onViewProfile ? 'pointer' : 'default' }}>
                <div className="lb-podium-rank">2</div>
                <div className="lb-podium-avatar">{top3[1].users?.avatar_url ? <img src={top3[1].users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (top3[1].users?.username?.charAt(0).toUpperCase() || '?')}</div>
                <div className="lb-podium-name">{top3[1].users?.username || 'Unknown'}</div>
                <div className="lb-podium-tier" style={{ color: getTier(top3[1].rating).color }}>{getTier(top3[1].rating).name}</div>
                <div className="lb-podium-elo">{top3[1].rating.toLocaleString()} <small>ELO</small></div>
                <div className="lb-podium-wins">{top3[1].wins}W / {top3[1].losses}L</div>
              </div>
              {/* 1st place */}
              <div className="lb-podium-card lb-podium-card--1" onClick={() => onViewProfile?.(top3[0].user_id)} style={{ cursor: onViewProfile ? 'pointer' : 'default' }}>
                <div className="lb-podium-crown">👑</div>
                <div className="lb-podium-rank">1</div>
                <div className="lb-podium-avatar lb-podium-avatar--gold">{top3[0].users?.avatar_url ? <img src={top3[0].users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (top3[0].users?.username?.charAt(0).toUpperCase() || '?')}</div>
                <div className="lb-podium-name">{top3[0].users?.username || 'Unknown'}</div>
                <div className="lb-podium-tier" style={{ color: getTier(top3[0].rating).color }}>{getTier(top3[0].rating).name}</div>
                <div className="lb-podium-elo">{top3[0].rating.toLocaleString()} <small>ELO</small></div>
                <div className="lb-podium-wins">{top3[0].wins}W / {top3[0].losses}L</div>
              </div>
              {/* 3rd place */}
              <div className="lb-podium-card lb-podium-card--3" onClick={() => onViewProfile?.(top3[2].user_id)} style={{ cursor: onViewProfile ? 'pointer' : 'default' }}>
                <div className="lb-podium-rank">3</div>
                <div className="lb-podium-avatar">{top3[2].users?.avatar_url ? <img src={top3[2].users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (top3[2].users?.username?.charAt(0).toUpperCase() || '?')}</div>
                <div className="lb-podium-name">{top3[2].users?.username || 'Unknown'}</div>
                <div className="lb-podium-tier" style={{ color: getTier(top3[2].rating).color }}>{getTier(top3[2].rating).name}</div>
                <div className="lb-podium-elo">{top3[2].rating.toLocaleString()} <small>ELO</small></div>
                <div className="lb-podium-wins">{top3[2].wins}W / {top3[2].losses}L</div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {tableEntries.length > 0 && (
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PLAYER</th>
                  <th>ELO</th>
                  <th>TIER</th>
                  <th>WINS</th>
                  <th>LOSSES</th>
                  <th>W/L RATIO</th>
                  <th>LAST ACTIVE</th>
                </tr>
              </thead>
              <tbody>
                {tableEntries.map((entry, i) => {
                  const tier = getTier(entry.rating);
                  const rank = entries.length >= 3 ? i + 4 : i + 1;
                  const wlRatio = entry.losses > 0 ? (entry.wins / entry.losses).toFixed(1) : entry.wins > 0 ? '∞' : '—';
                  const isMe = user?.id === entry.user_id;
                  return (
                    <tr key={entry.user_id} className={isMe ? 'lb-row--me' : ''}>
                      <td className="lb-cell-rank">{rank}</td>
                      <td className="lb-cell-player">
                        <div className="lb-player-row">
                          <div className="lb-player-avatar">{entry.users?.avatar_url ? <img src={entry.users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (entry.users?.username?.charAt(0).toUpperCase() || '?')}</div>
                          <div className="lb-player-info">
                            <span
                              className="lb-player-name"
                              onClick={() => onViewProfile?.(entry.user_id)}
                              style={{ cursor: onViewProfile ? 'pointer' : 'default' }}
                            >
                              {entry.users?.username || 'Unknown'}
                              {isMe && <span className="lb-you-badge">YOU</span>}
                            </span>
                            <span className="lb-player-tier" style={{ color: tier.color }}>{tier.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="lb-cell-elo">{entry.rating.toLocaleString()}</td>
                      <td><span className="lb-tier-pill" style={{ color: tier.color, borderColor: tier.color }}>{tier.name}</span></td>
                      <td>{entry.wins}</td>
                      <td>{entry.losses}</td>
                      <td><span className="lb-wl-ratio">{wlRatio}</span></td>
                      <td className="lb-cell-lastactive">{entry.last_match_at ? timeAgo(entry.last_match_at) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No entries at all */}
        {entries.length === 0 && !loading && activeTab === 'global' && (
          <div className="lb-empty">
            <p>No players on the leaderboard yet. Be the first to solve a puzzle!</p>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <aside className="lb-sidebar">
        {/* Your Position card */}
        {user && userStats && (
          <div className="lb-sidebar-card">
            <div className="lb-sidebar-card-header">
              <span className="lb-live-dot" />
              <span className="lb-sidebar-label">YOUR POSITION</span>
            </div>
            <h3 className="lb-sidebar-title">#{userStats.rank.position} of {userStats.rank.totalPlayers}</h3>
            <p className="lb-sidebar-sub">Top {userStats.rank.percentile}% of all players</p>
            <div className="lb-standing">
              <span>ELO: <strong>{userStats.elo.rating.toLocaleString()}</strong></span>
              <div className="lb-progress-bar">
                <div className="lb-progress-fill" style={{ width: `${Math.min(100, (userStats.elo.rating / 2000) * 100)}%` }} />
              </div>
              <span className="lb-progress-label" style={{ color: myTier.color }}>{myTier.name} → {getTier(myElo + 200).name}</span>
            </div>
          </div>
        )}

        {/* Challenge Record */}
        {user && userStats && (
          <div className="lb-sidebar-card">
            <div className="lb-sidebar-card-header">
              <span className="lb-sidebar-label">CHALLENGE RECORD</span>
            </div>
            <div className="lb-sidebar-stats">
              <div className="lb-sidebar-stat">
                <span className="lb-sidebar-stat-num">{userStats.challenges.wins}</span>
                <span className="lb-sidebar-stat-label">Wins</span>
              </div>
              <div className="lb-sidebar-stat">
                <span className="lb-sidebar-stat-num">{userStats.challenges.losses}</span>
                <span className="lb-sidebar-stat-label">Losses</span>
              </div>
              <div className="lb-sidebar-stat">
                <span className="lb-sidebar-stat-num">{userStats.challenges.ties}</span>
                <span className="lb-sidebar-stat-label">Ties</span>
              </div>
            </div>
            <p className="lb-sidebar-sub">
              Current streak: <strong>{userStats.challenges.currentStreak}</strong> · Best: <strong>{userStats.challenges.longestStreak}</strong>
            </p>
          </div>
        )}

        {/* Not logged in */}
        {!user && (
          <div className="lb-sidebar-card">
            <span className="lb-sidebar-label">SIGN IN</span>
            <p className="lb-sidebar-sub">Log in to see your rank, stats, and compete with friends.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
