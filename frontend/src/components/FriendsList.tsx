import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import './FriendsList.css';

interface FriendEntry {
  id: string;
  status: string;
  created_at: string;
  user: { id: string; username: string; avatar_url: string | null };
  direction: 'sent' | 'received';
}

interface SearchResult {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface FriendsListProps {
  onViewProfile: (userId: string) => void;
}

export default function FriendsList({ onViewProfile }: FriendsListProps) {
  const { session } = useAuth();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const fetchFriends = () => {
    if (!session?.access_token) return;
    apiFetch<{
      sent: { id: string; status: string; created_at: string; addressee: { id: string; username: string; avatar_url: string | null } | null }[];
      received: { id: string; status: string; created_at: string; requester: { id: string; username: string; avatar_url: string | null } | null }[];
    }>('/api/friends', { token: session.access_token })
      .then((data) => {
        const combined: FriendEntry[] = [
          ...data.sent.filter((f) => f.addressee).map((f) => ({
            id: f.id, status: f.status, created_at: f.created_at, user: f.addressee!, direction: 'sent' as const,
          })),
          ...data.received.filter((f) => f.requester).map((f) => ({
            id: f.id, status: f.status, created_at: f.created_at, user: f.requester!, direction: 'received' as const,
          })),
        ];
        setFriends(combined);
      })
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchFriends(); }, [session]);

  const handleAccept = async (friendshipId: string) => {
    if (!session?.access_token) return;
    await apiFetch(`/api/friends/${friendshipId}`, {
      method: 'PATCH',
      token: session.access_token,
      body: { status: 'accepted' },
    }).catch(() => {});
    fetchFriends();
  };

  const handleRemove = async (friendshipId: string) => {
    if (!session?.access_token) return;
    await apiFetch(`/api/friends/${friendshipId}`, {
      method: 'DELETE',
      token: session.access_token,
    }).catch(() => {});
    fetchFriends();
  };

  const handleSearch = async () => {
    if (!session?.access_token || searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const results = await apiFetch<SearchResult[]>(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, { token: session.access_token });
      // Filter out users who are already friends or have pending requests
      const friendIds = new Set(friends.map((f) => f.user.id));
      setSearchResults(results.filter((r) => !friendIds.has(r.id)));
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleAddFromSearch = async (userId: string) => {
    if (!session?.access_token) return;
    setAddingId(userId);
    try {
      await apiFetch('/api/friends', { method: 'POST', token: session.access_token, body: { addressee_id: userId } });
      setSearchResults((prev) => prev.filter((r) => r.id !== userId));
      fetchFriends();
    } catch { /* ignore */ }
    finally { setAddingId(null); }
  };

  if (loading) return null;

  return (
    <div className="friends-section">
      <h2 className="friends-title">Friends ({friends.filter((f) => f.status === 'accepted').length})</h2>

      {/* Search to add friends */}
      <div className="friends-search">
        <input
          type="text"
          className="friends-search-input"
          placeholder="Search by username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
        />
        <button type="button" className="friends-search-btn" onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2}>
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="friends-search-results">
          {searchResults.map((u) => (
            <div className="friend-row" key={u.id}>
              <div className="friend-avatar">{u.username.charAt(0).toUpperCase()}</div>
              <div className="friend-info">
                <span className="friend-name" onClick={() => onViewProfile(u.id)}>{u.username}</span>
              </div>
              <button
                type="button"
                className="friend-action-btn friend-action-btn--accept"
                onClick={() => handleAddFromSearch(u.id)}
                disabled={addingId === u.id}
              >
                {addingId === u.id ? '...' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      )}

      {friends.length === 0 ? (
        <p className="friends-empty">No friends yet. Visit player profiles to add friends!</p>
      ) : (
        <div className="friends-list">
          {friends.map((f) => (
            <div className="friend-row" key={f.id}>
              <div className="friend-avatar">
                {f.user.username.charAt(0).toUpperCase()}
              </div>
              <div className="friend-info">
                <span className="friend-name" onClick={() => onViewProfile(f.user.id)}>
                  {f.user.username}
                </span>
                {f.status === 'pending' && (
                  <span className={`friend-status friend-status--pending`}>
                    {f.direction === 'received' ? 'Wants to be your friend' : 'Request sent'}
                  </span>
                )}
                {f.status === 'accepted' && (
                  <span className="friend-status">Friends</span>
                )}
              </div>
              <div className="friend-actions">
                {f.status === 'pending' && f.direction === 'received' && (
                  <button type="button" className="friend-action-btn friend-action-btn--accept" onClick={() => handleAccept(f.id)}>
                    Accept
                  </button>
                )}
                <button type="button" className="friend-action-btn friend-action-btn--remove" onClick={() => handleRemove(f.id)}>
                  {f.status === 'accepted' ? 'Remove' : 'Cancel'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
