import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './FriendsPage.css';

interface FriendEntry {
  id: string;
  status: string;
  user: { id: string; username: string; avatar_url: string | null };
  direction: 'sent' | 'received';
}

function Avatar({ user, size = 32 }: { user: { username: string; avatar_url: string | null }; size?: number }) {
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.username} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return <div className="fp-req-avatar" style={{ width: size, height: size }}>{user.username.charAt(0).toUpperCase()}</div>;
}

interface SearchResult {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface FriendsPageProps {
  onViewProfile: (userId: string) => void;
  onChallenge?: (userId: string, username: string) => void;
  onViewChallenge?: (challengeId: string) => void;
}

// ── Recent Friend Activity ──────────────────────────────────────
interface ActivityItem {
  id: string;
  username: string;
  type: 'puzzle' | 'challenge';
  description: string;
  time: string;
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

function RecentFriendActivity({ friends, onViewChallenge }: { friends: FriendEntry[]; onViewChallenge?: (challengeId: string) => void }) {
  const { session } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token || friends.length === 0) { setLoading(false); return; }

    apiFetch<ActivityItem[]>('/api/friends/activity', { token: session.access_token })
      .then((data) => setActivities(data))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, [session, friends.length]);

  return (
    <div className="fp-card">
      <div className="fp-card-header"><h3>Recent Activity</h3></div>
      {loading ? (
        <p className="fp-empty-sm">Loading...</p>
      ) : activities.length === 0 ? (
        <p className="fp-empty-sm">No recent activity from friends</p>
      ) : (
        activities.slice(0, 8).map((a) => {
          const isChallenge = a.type === 'challenge';
          // The id format is ch-${c.id}-${friendId} where both are UUIDs (5 dash-segments each)
          const rawId = isChallenge && a.id.startsWith('ch-') ? a.id.slice(3) : '';
          const parts = rawId.split('-');
          // UUID is 5 segments (8-4-4-4-12), friendId is also UUID (5 segments). Take first 5 for challenge ID
          const cId = parts.slice(0, 5).join('-');

          return (
            <div
              className={`fp-activity-item${isChallenge ? ' fp-activity-item--clickable' : ''}`}
              key={a.id}
              onClick={() => { if (isChallenge && onViewChallenge && cId) onViewChallenge(cId); }}
              style={isChallenge ? { cursor: 'pointer' } : undefined}
            >
              <span className="fp-activity-text">
                <strong>{a.username}</strong> {a.description}
              </span>
              <span className="fp-activity-time">{timeAgo(a.time)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function FriendsPage({ onViewProfile, onChallenge, onViewChallenge }: FriendsPageProps) {
  const { session, user } = useAuth();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [challengeStats, setChallengeStats] = useState<{ wins: number; total: number } | null>(null);

  const fetchFriends = () => {
    if (!session?.access_token) return;
    apiFetch<{
      sent: { id: string; status: string; created_at: string; addressee: { id: string; username: string; avatar_url: string | null } | null }[];
      received: { id: string; status: string; created_at: string; requester: { id: string; username: string; avatar_url: string | null } | null }[];
    }>('/api/friends', { token: session.access_token })
      .then((data) => {
        const combined: FriendEntry[] = [
          ...data.sent.filter((f) => f.addressee).map((f) => ({ id: f.id, status: f.status, user: f.addressee!, direction: 'sent' as const })),
          ...data.received.filter((f) => f.requester).map((f) => ({ id: f.id, status: f.status, user: f.requester!, direction: 'received' as const })),
        ];
        setFriends(combined);
      })
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchFriends(); }, [session]);

  // Fetch user challenge stats
  useEffect(() => {
    if (!session?.access_token || !user?.id) return;
    apiFetch<{ challenges: { wins: number; total: number } }>(`/api/users/${user.id}`)
      .then((data) => setChallengeStats({ wins: data.challenges.wins, total: data.challenges.total }))
      .catch(() => {});
  }, [session, user?.id]);

  const handleSearch = async () => {
    if (!session?.access_token || searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const results = await apiFetch<SearchResult[]>(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, { token: session.access_token });
      const friendIds = new Set(friends.map((f) => f.user.id));
      setSearchResults(results.filter((r) => !friendIds.has(r.id)));
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleAdd = async (userId: string) => {
    if (!session?.access_token) return;
    setAddingId(userId);
    try {
      await apiFetch('/api/friends', { method: 'POST', token: session.access_token, body: { addressee_id: userId } });
      setSearchResults((prev) => prev.filter((r) => r.id !== userId));
      fetchFriends();
    } catch {}
    finally { setAddingId(null); }
  };

  const handleAccept = async (friendshipId: string) => {
    if (!session?.access_token) return;
    await apiFetch(`/api/friends/${friendshipId}`, { method: 'PATCH', token: session.access_token, body: { status: 'accepted' } }).catch(() => {});
    fetchFriends();
  };

  const handleRemove = async (friendshipId: string) => {
    if (!session?.access_token) return;
    await apiFetch(`/api/friends/${friendshipId}`, { method: 'DELETE', token: session.access_token }).catch(() => {});
    fetchFriends();
  };

  const incomingRequests = friends.filter((f) => f.status === 'pending' && f.direction === 'received');
  const sentInvites = friends.filter((f) => f.status === 'pending' && f.direction === 'sent');
  const acceptedFriends = friends.filter((f) => f.status === 'accepted');

  return (
    <div className="friends-page">
      {/* Hero */}
      <div className="fp-hero">
        <div className="fp-hero-left">
          {user && <div className="fp-welcome">WELCOME BACK, {user.username.toUpperCase()}! 👋</div>}
          <h1 className="fp-title">Friends <span className="fp-title-accent">&</span> Challenges</h1>
          <p className="fp-sub">Connect, challenge, and compete in real-time puzzle races!</p>
          <div className="fp-hero-btns">
            <button type="button" className="fp-btn fp-btn--primary" disabled>🏆 Start 1v1 Match xoxo</button>
            <button type="button" className="fp-btn fp-btn--secondary" onClick={() => document.querySelector<HTMLInputElement>('.fp-search-input')?.focus()}>✨ Join a Friend</button>
          </div>
        </div>
        <div className="fp-hero-right">
          <div className="fp-hero-graphic">🏆</div>
          <div className="fp-stats-mini">
            <span className="fp-stats-label">YOUR STATS</span>
            <div className="fp-stats-grid">
              <div><span className="fp-stats-num">{acceptedFriends.length}</span><span className="fp-stats-lbl">Friends</span></div>
              <div><span className="fp-stats-num">{challengeStats?.wins ?? 0}</span><span className="fp-stats-lbl">Challenges Won</span></div>
              <div><span className="fp-stats-num">{challengeStats && challengeStats.total > 0 ? Math.round((challengeStats.wins / challengeStats.total) * 100) : 0}%</span><span className="fp-stats-lbl">Win Rate</span></div>
              <div><span className="fp-stats-num">{challengeStats?.total ?? 0}</span><span className="fp-stats-lbl">Puzzle Races</span></div>
            </div>
            <button type="button" className="fp-view-challenges" disabled>View Challenges xoxo</button>
          </div>
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="fp-columns">
        {/* Left Column */}
        <div className="fp-col-left">
          {/* Incoming Requests */}
          <div className="fp-card">
            <div className="fp-card-header"><h3>👤 Incoming Requests {incomingRequests.length > 0 && <span className="fp-badge">{incomingRequests.length}</span>}</h3></div>
            {incomingRequests.length === 0 ? (
              <p className="fp-empty-sm">No pending requests</p>
            ) : (
              incomingRequests.map((f) => (
                <div className="fp-request-row" key={f.id}>
                  <Avatar user={f.user} />
                  <div className="fp-req-info">
                    <span className="fp-req-name" onClick={() => onViewProfile(f.user.id)}>{f.user.username}</span>
                  </div>
                  <button className="fp-req-accept" onClick={() => handleAccept(f.id)}>✓</button>
                  <button className="fp-req-decline" onClick={() => handleRemove(f.id)}>✕</button>
                </div>
              ))
            )}
          </div>

          {/* Sent Invites */}
          <div className="fp-card">
            <div className="fp-card-header"><h3>Sent Invites {sentInvites.length > 0 && <span className="fp-badge fp-badge--yellow">{sentInvites.length}</span>}</h3></div>
            {sentInvites.length === 0 ? (
              <p className="fp-empty-sm">No pending invites</p>
            ) : (
              sentInvites.map((f) => (
                <div className="fp-request-row" key={f.id}>
                  <Avatar user={f.user} />
                  <span className="fp-req-name" onClick={() => onViewProfile(f.user.id)}>{f.user.username}</span>
                  <button className="fp-req-cancel" onClick={() => handleRemove(f.id)}>Cancel</button>
                </div>
              ))
            )}
          </div>

          {/* Suggested Players (static) */}
          <div className="fp-card">
            <div className="fp-card-header"><h3>Suggested Players xoxo</h3></div>
            <div className="fp-request-row"><div className="fp-req-avatar">J</div><span className="fp-req-name">jigsaw_master xoxo</span><button className="fp-suggest-add" disabled>Add</button></div>
            <div className="fp-request-row"><div className="fp-req-avatar">N</div><span className="fp-req-name">nightowl_puzzler xoxo</span><button className="fp-suggest-add" disabled>Add</button></div>
            <div className="fp-request-row"><div className="fp-req-avatar">P</div><span className="fp-req-name">puzzle_wizard xoxo</span><button className="fp-suggest-add" disabled>Add</button></div>
            <button type="button" className="fp-link-btn" disabled>View More Suggestions → xoxo</button>
          </div>
        </div>

        {/* Middle Column */}
        <div className="fp-col-mid">
          {/* Search */}
          <div className="fp-search-row">
            <input
              className="fp-search-input"
              type="text"
              placeholder="Search friends by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
            <button type="button" className="fp-search-btn" onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2}>
              {searching ? '...' : '🔍'}
            </button>
            <button type="button" className="fp-invite-btn" disabled>Invite Friends xoxo</button>
            <button type="button" className="fp-filter-btn" disabled>📋 All</button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="fp-search-results">
              {searchResults.map((u) => (
                <div className="fp-request-row" key={u.id}>
                  <div className="fp-req-avatar">{u.username.charAt(0).toUpperCase()}</div>
                  <span className="fp-req-name" onClick={() => onViewProfile(u.id)}>{u.username}</span>
                  <button className="fp-suggest-add" onClick={() => handleAdd(u.id)} disabled={addingId === u.id}>
                    {addingId === u.id ? '...' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Friends Table */}
          <div className="fp-friends-table-wrap">
            <div className="fp-table-header">All Friends ({acceptedFriends.length})</div>
            <table className="fp-friends-table">
              <thead>
                <tr><th></th><th>NAME</th><th>STATUS</th><th>RANK</th><th>LAST SEEN</th><th></th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="fp-table-empty">Loading...</td></tr>
                ) : acceptedFriends.length === 0 ? (
                  <tr><td colSpan={6} className="fp-table-empty">No friends yet. Search and add some!</td></tr>
                ) : (
                  acceptedFriends.map((f) => (
                    <tr key={f.id}>
                      <td><Avatar user={f.user} /></td>
                      <td><span className="fp-table-name" onClick={() => onViewProfile(f.user.id)}>{f.user.username}</span></td>
                      <td><span className="fp-status-dot fp-status-dot--online" /> Online xoxo</td>
                      <td><span className="fp-table-rank">Diamond I xoxo</span><br/><span className="fp-table-elo">⚡ 1,180 xoxo</span></td>
                      <td className="fp-table-seen">Online xoxo</td>
                      <td>
                        <div className="fp-table-actions">
                          {onChallenge && (
                            <button className="fp-challenge-btn" onClick={() => onChallenge(f.user.id, f.user.username)}>Challenge</button>
                          )}
                          <button className="fp-unfriend-btn" onClick={() => { if (window.confirm(`Are you sure you want to unfriend ${f.user.username}?`)) handleRemove(f.id); }}>Unfriend</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <button type="button" className="fp-link-btn">View All Friends →</button>
          </div>
        </div>

        {/* Right Column */}
        <div className="fp-col-right">
          {/* Recent Activity (dynamic — friends' puzzle completions & challenges) */}
          <RecentFriendActivity friends={acceptedFriends} onViewChallenge={onViewChallenge} />

          {/* Active Challenges (static) */}
          <div className="fp-card">
            <div className="fp-card-header"><h3>Active Challenges <span className="fp-badge">2</span> xoxo</h3><button className="fp-card-link" disabled>View All →</button></div>
            <div className="fp-active-challenge">
              <div className="fp-ac-status">Waiting for Opponent xoxo</div>
              <div className="fp-ac-row">
                <div className="fp-ac-player"><div className="fp-req-avatar">L</div><span>lofigirl31<br/>⚡ 1,265 xoxo</span></div>
                <div className="fp-ac-info"><strong>1v1 Challenge</strong><br/>Ocean Waves Sunset<br/>700 pieces · Medium</div>
                <div className="fp-ac-player fp-ac-player--waiting">?<br/>Searching... xoxo</div>
              </div>
              <button className="fp-ac-cancel" disabled>Cancel xoxo</button>
            </div>
            <div className="fp-active-challenge fp-active-challenge--live">
              <div className="fp-ac-status fp-ac-status--live">Live Match xoxo</div>
              <div className="fp-ac-row">
                <div className="fp-ac-player"><div className="fp-req-avatar">T</div><span>tjavier53<br/>⚡ 1,265 xoxo</span></div>
                <div className="fp-ac-info"><strong>vs puzzle_queen</strong><br/>City Lights Challenge<br/>750 pieces · Hard</div>
                <div className="fp-ac-player"><div className="fp-req-avatar">P</div><span>puzzle_queen<br/>⚡ 1,180 xoxo</span></div>
              </div>
              <button className="fp-ac-watch" disabled>View Match Room xoxo</button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA Banner */}
      <div className="fp-bottom-banner">
        <div className="fp-banner-text">
          <h3>Ready to race?</h3>
          <p>Challenge a friend to a live puzzle race and see who finishes first!</p>
        </div>
        <button type="button" className="fp-btn fp-btn--primary" disabled>🏆 Start 1v1 Match xoxo</button>
      </div>
    </div>
  );
}
