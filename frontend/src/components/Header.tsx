import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import AuthModal from './AuthModal';
import './Header.css';

interface HeaderProps {
  onDashboard?: () => void;
  onCommunity?: () => void;
  onLeaderboard?: () => void;
  onFriends?: () => void;
  onLoginSuccess?: () => void;
  onAcceptChallenge?: (challenge: { id: string; image_url: string; puzzle_title: string; piece_count: number; difficulty: string; challenger_time_sec: number; challenger_stars: number }) => void;
}

interface Notification {
  id: string;
  type: 'challenge' | 'friend_request';
  title: string;
  subtitle: string;
  data?: unknown;
}

export default function Header({ onDashboard, onCommunity, onLeaderboard, onFriends, onLoginSuccess, onAcceptChallenge }: HeaderProps) {
  const { user, session, logout, isLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications (pending challenges + pending friend requests)
  useEffect(() => {
    if (!session?.access_token) { setNotifications([]); return; }

    const fetchNotifs = async () => {
      const notifs: Notification[] = [];

      try {
        const [challengeData, friendData] = await Promise.all([
          apiFetch<{ received: { id: string; puzzle_title: string; piece_count: number; difficulty: string; image_url: string; challenger_time_sec: number; challenger_stars: number; status: string; challenger?: { id: string; username: string } }[] }>('/api/challenges', { token: session.access_token }).catch(() => ({ received: [] })),
          apiFetch<{ received: { id: string; status: string; requester: { id: string; username: string } | null }[] }>('/api/friends', { token: session.access_token }).catch(() => ({ received: [] })),
        ]);

        challengeData.received
          .filter((c) => c.status === 'pending')
          .forEach((c) => {
            notifs.push({
              id: `challenge-${c.id}`,
              type: 'challenge',
              title: `Challenge: ${c.puzzle_title}`,
              subtitle: `from ${c.challenger?.username || 'someone'} · Beat ${Math.floor(c.challenger_time_sec / 60)}:${String(c.challenger_time_sec % 60).padStart(2, '0')}`,
              data: c,
            });
          });

        friendData.received
          .filter((f) => f.status === 'pending')
          .forEach((f) => {
            notifs.push({
              id: `friend-${f.id}`,
              type: 'friend_request',
              title: 'Friend Request',
              subtitle: `from ${f.requester?.username || 'someone'}`,
              data: f,
            });
          });
      } catch { /* ignore */ }

      setNotifications(notifs);
    };

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [session]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleAuthClose = () => {
    setShowAuth(false);
    if (onLoginSuccess) onLoginSuccess();
  };

  const handleNotifClick = (notif: Notification) => {
    if (notif.type === 'challenge' && onAcceptChallenge) {
      const c = notif.data as { id: string; image_url: string; puzzle_title: string; piece_count: number; difficulty: string; challenger_time_sec: number; challenger_stars: number };
      onAcceptChallenge(c);
      setShowNotifs(false);
    } else if (notif.type === 'friend_request' && onDashboard) {
      onDashboard();
      setShowNotifs(false);
    }
  };

  const notifCount = notifications.length;

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="header-logo">
            <svg className="puzzle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 3h4v2a1 1 0 0 0 1 1 1 1 0 0 0 1-1V3h4v4h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h2v4h-4v-2a1 1 0 0 0-1-1 1 1 0 0 0-1 1v2H7v-4h2a1 1 0 0 0 1-1 1 1 0 0 0-1-1H7V3Z"
                fill="currentColor"
              />
              <path
                d="M3 13h4v-2a1 1 0 0 1 1-1 1 1 0 0 1 1 1v2h4v4h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h2v3H3v-4h2a1 1 0 0 0 1-1 1 1 0 0 0-1-1H3v-3Z"
                fill="currentColor"
                opacity="0.6"
              />
            </svg>
            <span className="header-title">Jigsaw Puzzles I.O</span>
          </div>

          <div className="header-auth">
            {onCommunity && (
              <button type="button" className="header-community-btn" onClick={onCommunity}>
                Community
              </button>
            )}

            {onLeaderboard && (
              <button type="button" className="header-community-btn" onClick={onLeaderboard}>
                Leaderboard
              </button>
            )}

            {isLoading ? null : user ? (
              <div className="header-user">
                {/* Notification bell */}
                <div className="header-notif-wrap" ref={dropdownRef}>
                  <button
                    type="button"
                    className="header-notif-btn"
                    onClick={() => setShowNotifs((v) => !v)}
                    aria-label={`Notifications (${notifCount})`}
                  >
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 1.5a4 4 0 0 0-4 4v3l-1 2h10l-1-2v-3a4 4 0 0 0-4-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    {notifCount > 0 && <span className="header-notif-badge">{notifCount}</span>}
                  </button>

                  {showNotifs && (
                    <div className="header-notif-dropdown">
                      {notifications.length === 0 ? (
                        <div className="notif-empty">No new notifications</div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className="notif-item"
                            onClick={() => handleNotifClick(n)}
                          >
                            <span className={`notif-icon notif-icon--${n.type}`}>
                              {n.type === 'challenge' ? '⚔️' : '👋'}
                            </span>
                            <div className="notif-text">
                              <span className="notif-title">{n.title}</span>
                              <span className="notif-subtitle">{n.subtitle}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <span className="header-username">{user.username}</span>
                {onDashboard && (
                  <button type="button" className="header-dashboard-btn" onClick={onDashboard}>
                    Dashboard
                  </button>
                )}
                {onFriends && (
                  <button type="button" className="header-community-btn" onClick={onFriends}>
                    Friends
                  </button>
                )}
                <button type="button" className="header-logout-btn" onClick={logout}>
                  Sign Out
                </button>
              </div>
            ) : (
              <button type="button" className="header-login-btn" onClick={() => setShowAuth(true)}>
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {showAuth && <AuthModal onClose={handleAuthClose} />}
    </>
  );
}
