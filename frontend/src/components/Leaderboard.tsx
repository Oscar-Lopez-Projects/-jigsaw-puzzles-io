import { useEffect, useState } from 'react';
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

export default function Leaderboard({ onBack: _onBack, onViewProfile }: LeaderboardProps) {
  const [entries, setEntries] = useState<EloEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('global');

  const fetchLeaderboard = async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'friends') {
        // Get friends first, then filter leaderboard
        const token = localStorage.getItem('jigsaw_session');
        const session = token ? JSON.parse(token) : null;
        if (session?.access_token) {
          const friendsData = await apiFetch<{ sent: { addressee: { id: string } | null; status: string }[]; received: { requester: { id: string } | null; status: string }[] }>('/api/friends', { token: session.access_token });
          const friendIds: string[] = [];
          friendsData.sent.filter(f => f.status === 'accepted' && f.addressee).forEach(f => friendIds.push(f.addressee!.id));
          friendsData.received.filter(f => f.status === 'accepted' && f.requester).forEach(f => friendIds.push(f.requester!.id));
          if (friendIds.length > 0) {
            const data = await apiFetch<EloEntry[]>(`/api/leaderboard?friends=${friendIds.join(',')}`);
            setEntries(data);
          } else {
            setEntries([]);
          }
        } else {
          setEntries([]);
        }
      } else if (tab === 'weekly') {
        // Weekly: show global but only players active in last 7 days
        const data = await apiFetch<EloEntry[]>('/api/leaderboard?limit=50');
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        setEntries(data.filter((e: EloEntry) => e.last_match_at && new Date(e.last_match_at).getTime() > weekAgo));
      } else {
        // Global
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

  const top3 = entries.length >= 3 ? entries.slice(0, 3) : [];
  const tableEntries = entries.length >= 3 ? entries.slice(3) : entries;

  // Debug display
  const debugInfo = `Tab: ${activeTab} | Entries: ${entries.length} | Loading: ${loading} | Error: ${error || 'none'}`;

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

        {/* Stats row */}
        <div className="lb-stats-row">
          <div className="lb-stat-box">
            <span className="lb-stat-label">YOUR CURRENT RANK</span>
            <span className="lb-stat-value lb-stat-value--big">#1</span>
            <span className="lb-stat-sub">Top 0.1%</span>
          </div>
          <div className="lb-stat-box">
            <span className="lb-stat-label">YOUR ELO</span>
            <span className="lb-stat-value">1,265</span>
            <span className="lb-stat-sub" style={{ color: '#60a5fa' }}>Diamond I</span>
          </div>
          <div className="lb-stat-box">
            <span className="lb-stat-label">WIN RATE</span>
            <span className="lb-stat-value">72%</span>
            <span className="lb-stat-sub">125 Wins</span>
          </div>
          <div className="lb-stat-box">
            <span className="lb-stat-label">WIN STREAK</span>
            <span className="lb-stat-value">12</span>
            <span className="lb-stat-sub">Amazing!</span>
          </div>
          <div className="lb-stat-box">
            <span className="lb-stat-label">SEASON STANDING</span>
            <span className="lb-stat-value">#2</span>
            <span className="lb-stat-sub">Ends in 12d 4h</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="lb-tabs">
          {['Global', 'Friends', 'Weekly', 'Live Match Rankings', 'Tournaments'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`lb-tab${activeTab === tab.toLowerCase() ? ' lb-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.toLowerCase())}
            >
              {tab}
              {tab === 'Live Match Rankings' && <span className="nav-live-badge">LIVE</span>}
            </button>
          ))}
        </div>

        {/* Debug */}
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', color: '#aaa', marginBottom: 16 }}>
          {debugInfo}
          {entries.length > 0 && <span> | First: {JSON.stringify(entries[0]).slice(0, 100)}...</span>}
        </div>

        {/* Top 3 Podium */}
        {top3.length >= 3 && (
          <div className="lb-podium-section">
            <h2 className="lb-section-title">Top Players Worldwide</h2>
            <div className="lb-podium">
              {/* 2nd place */}
              <div className="lb-podium-card lb-podium-card--2">
                <div className="lb-podium-rank">2</div>
                <div className="lb-podium-avatar">{top3[1].users?.avatar_url ? <img src={top3[1].users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (top3[1].users?.username?.charAt(0).toUpperCase() || '?')}</div>
                <div className="lb-podium-name">{top3[1].users?.username || 'Unknown'}</div>
                <div className="lb-podium-tier" style={{ color: getTier(top3[1].rating).color }}>{getTier(top3[1].rating).name}</div>
                <div className="lb-podium-elo">{top3[1].rating.toLocaleString()} <small>ELO</small></div>
              </div>
              {/* 1st place */}
              <div className="lb-podium-card lb-podium-card--1">
                <div className="lb-podium-crown">👑</div>
                <div className="lb-podium-rank">1</div>
                <div className="lb-podium-avatar lb-podium-avatar--gold">{top3[0].users?.avatar_url ? <img src={top3[0].users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (top3[0].users?.username?.charAt(0).toUpperCase() || '?')}</div>
                <div className="lb-podium-name">{top3[0].users?.username || 'Unknown'}</div>
                <div className="lb-podium-tier" style={{ color: getTier(top3[0].rating).color }}>{getTier(top3[0].rating).name}</div>
                <div className="lb-podium-elo">{top3[0].rating.toLocaleString()} <small>ELO</small></div>
              </div>
              {/* 3rd place */}
              <div className="lb-podium-card lb-podium-card--3">
                <div className="lb-podium-rank">3</div>
                <div className="lb-podium-avatar">{top3[2].users?.avatar_url ? <img src={top3[2].users.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (top3[2].users?.username?.charAt(0).toUpperCase() || '?')}</div>
                <div className="lb-podium-name">{top3[2].users?.username || 'Unknown'}</div>
                <div className="lb-podium-tier" style={{ color: getTier(top3[2].rating).color }}>{getTier(top3[2].rating).name}</div>
                <div className="lb-podium-elo">{top3[2].rating.toLocaleString()} <small>ELO</small></div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="lb-table-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>PLAYER</th>
                <th>ELO</th>
                <th>WINS</th>
                <th>WIN STREAK</th>
                <th>FASTEST SOLVE</th>
                <th>FAVORITE CATEGORY</th>
              </tr>
            </thead>
            <tbody>
              {tableEntries.map((entry, i) => {
                const tier = getTier(entry.rating);
                const rank = entries.length >= 3 ? i + 4 : i + 1;
                return (
                  <tr key={entry.user_id}>
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
                          </span>
                          <span className="lb-player-tier" style={{ color: tier.color }}>{tier.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="lb-cell-elo">{entry.rating.toLocaleString()}</td>
                    <td>{entry.wins}</td>
                    <td><span className="lb-streak">🔥 {Math.min(entry.wins, 8)}</span></td>
                    <td>{`0${Math.floor(Math.random() * 5) + 2}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`}</td>
                    <td><span className="lb-category">{['🌿 Nature', '🐾 Animals', '🎨 Art', '🏙️ Cities', '✨ Fantasy', '✈️ Travel'][i % 6]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Sidebar */}
      <aside className="lb-sidebar">
        {/* Season card */}
        <div className="lb-sidebar-card">
          <div className="lb-sidebar-card-header">
            <span className="lb-live-dot" />
            <span className="lb-sidebar-label">MATCH SEASON</span>
          </div>
          <h3 className="lb-sidebar-title">Season 12</h3>
          <p className="lb-sidebar-sub">Puzzle Champions League</p>
          <p className="lb-sidebar-sub">Ends in</p>
          <div className="lb-countdown">
            <div className="lb-countdown-item"><span className="lb-countdown-num">12</span><span className="lb-countdown-label">DAYS</span></div>
            <div className="lb-countdown-item"><span className="lb-countdown-num">04</span><span className="lb-countdown-label">HRS</span></div>
            <div className="lb-countdown-item"><span className="lb-countdown-num">18</span><span className="lb-countdown-label">MIN</span></div>
            <div className="lb-countdown-item"><span className="lb-countdown-num">33</span><span className="lb-countdown-label">SEC</span></div>
          </div>
          <div className="lb-standing">
            <span>Your Standing: <strong>#2</strong> ▲1</span>
            <div className="lb-progress-bar"><div className="lb-progress-fill" style={{ width: '84%' }} /></div>
            <span className="lb-progress-label">1,265 / 1,500 ELO</span>
          </div>
          <button type="button" className="lb-sidebar-btn">View Season Rewards</button>
        </div>

        {/* Upcoming Tournament */}
        <div className="lb-sidebar-card">
          <div className="lb-sidebar-card-header">
            <span className="lb-sidebar-label">UPCOMING TOURNAMENT</span>
          </div>
          <h3 className="lb-sidebar-title">Speed Puzzle Showdown 🔥</h3>
          <p className="lb-sidebar-sub">3 Players · 50 Pieces · Nature</p>
          <p className="lb-sidebar-sub">⏱ Starts in 1h 45m &nbsp; 💰 1,500</p>
          <button type="button" className="lb-sidebar-btn lb-sidebar-btn--accent">Join Tournament</button>
        </div>

        {/* Rewards */}
        <div className="lb-sidebar-card lb-sidebar-card--rewards">
          <span className="lb-sidebar-label">LEADERBOARD REWARDS</span>
          <p className="lb-sidebar-sub">Climb the ranks and earn exclusive rewards!</p>
          <button type="button" className="lb-sidebar-btn">View All Rewards</button>
        </div>
      </aside>
    </div>
  );
}
