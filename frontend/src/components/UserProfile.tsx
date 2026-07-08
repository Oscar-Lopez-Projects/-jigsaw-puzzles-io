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

interface UserProfileProps {
  userId: string;
  onBack: () => void;
  onChallenge?: (userId: string, username: string) => void;
}

export default function UserProfile({ userId, onBack, onChallenge }: UserProfileProps) {
  const { session, user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
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

  // Check friendship status
  useEffect(() => {
    if (!session?.access_token || isOwnProfile) {
      setFriendStatus('none');
      return;
    }
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
      await apiFetch('/api/friends', {
        method: 'POST',
        token: session.access_token,
        body: { addressee_id: userId },
      });
      setFriendStatus('pending');
    } catch { /* ignore */ }
    finally { setFriendActionLoading(false); }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="user-profile">
        <div className="profile-loading">
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="user-profile">
        <div className="user-profile-header">
          <button type="button" className="user-profile-back" onClick={onBack}>
            <svg viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back
          </button>
        </div>
        <div className="profile-error">{error || 'User not found'}</div>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <div className="user-profile-header">
        <button type="button" className="user-profile-back" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back
        </button>
      </div>

      <div className="profile-card">
        <div className="profile-avatar">
          {profile.username.charAt(0).toUpperCase()}
        </div>
        <h2 className="profile-username">{profile.username}</h2>
        <p className="profile-joined">Joined {formatDate(profile.created_at)}</p>

        <div className="profile-elo">ELO {profile.elo.rating}</div>

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.stats.totalPuzzles}</span>
            <span className="profile-stat-label">Puzzles Solved</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.stats.avgStars || '—'}</span>
            <span className="profile-stat-label">Avg Stars</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.stats.bestTime ? formatTime(profile.stats.bestTime) : '—'}</span>
            <span className="profile-stat-label">Best Time</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.stats.threeStarCount}</span>
            <span className="profile-stat-label">3-Star Solves</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.stats.totalTime ? formatTime(profile.stats.totalTime) : '—'}</span>
            <span className="profile-stat-label">Total Time</span>
          </div>
        </div>

        <div className="profile-section-label">Challenge Record</div>
        <div className="profile-stats">
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.challenges.total}</span>
            <span className="profile-stat-label">Challenges</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--win">{profile.challenges.wins}</span>
            <span className="profile-stat-label">Wins</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--loss">{profile.challenges.losses}</span>
            <span className="profile-stat-label">Losses</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--tie">{profile.challenges.ties}</span>
            <span className="profile-stat-label">Ties</span>
          </div>
        </div>

        <div className="profile-section-label">ELO Rating</div>
        <div className="profile-stats">
          <div className="profile-stat">
            <span className="profile-stat-value">{profile.elo.rating}</span>
            <span className="profile-stat-label">Rating</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--win">{profile.elo.wins}</span>
            <span className="profile-stat-label">Total Wins</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--loss">{profile.elo.losses}</span>
            <span className="profile-stat-label">Total Losses</span>
          </div>
        </div>

        {/* Friend action — only show if logged in and not own profile */}
        {session?.access_token && !isOwnProfile && (
          <>
            {friendStatus === 'none' && (
              <button type="button" className="profile-friend-btn" onClick={handleAddFriend} disabled={friendActionLoading}>
                {friendActionLoading ? 'Sending...' : '+ Add Friend'}
              </button>
            )}
            {friendStatus === 'pending' && (
              <button type="button" className="profile-friend-btn profile-friend-btn--pending" disabled>
                Request Pending
              </button>
            )}
            {friendStatus === 'accepted' && (
              <button type="button" className="profile-friend-btn profile-friend-btn--friends" disabled>
                Friends
              </button>
            )}
            {friendStatus === 'accepted' && onChallenge && profile && (
              <button
                type="button"
                className="profile-challenge-btn"
                onClick={() => onChallenge(userId, profile.username)}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1v4M5.5 3l1.5 2M10.5 3L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M3 7h10v2a5 5 0 01-10 0V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M6 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Challenge
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
