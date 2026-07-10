import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import AuthModal from './AuthModal';
import ThemeToggle from './ThemeToggle';
import MuteToggle from './MuteToggle';
import './Header.css';

interface HeaderProps {
  activeView?: string;
  onDashboard?: () => void;
  onLeaderboard?: () => void;
  onFriends?: () => void;
  onHome?: () => void;
  onLoginSuccess?: () => void;
  onAcceptChallenge?: (challenge: { id: string; image_url: string; puzzle_title: string; piece_count: number; difficulty: string; challenger_time_sec: number; challenger_stars: number }) => void;
}

interface Notification {
  id: string;
  type: 'challenge' | 'friend_request' | 'challenge_result';
  title: string;
  subtitle: string;
  data?: unknown;
}

export default function Header({ activeView, onDashboard, onLeaderboard, onFriends, onHome, onLoginSuccess, onAcceptChallenge }: HeaderProps) {
  const { user, session, logout, isLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [userElo, setUserElo] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  useEffect(() => {
    if (!session?.access_token) { setNotifications([]); return; }

    // Fetch user ELO
    if (user?.id) {
      apiFetch<{ elo: { rating: number } }>(`/api/users/${user.id}`)
        .then((data) => setUserElo(data.elo.rating))
        .catch(() => {});
    }

    const fetchNotifs = async () => {
      const notifs: Notification[] = [];
      try {
        const [challengeData, friendData] = await Promise.all([
          apiFetch<{ sent: { id: string; puzzle_title: string; piece_count: number; difficulty: string; image_url: string; challenger_time_sec: number; challenger_stars: number; opponent_time_sec: number | null; opponent_stars: number | null; winner: string | null; status: string; opponent?: { id: string; username: string } }[]; received: { id: string; puzzle_title: string; piece_count: number; difficulty: string; image_url: string; challenger_time_sec: number; challenger_stars: number; status: string; challenger?: { id: string; username: string } }[] }>('/api/challenges', { token: session.access_token }).catch(() => ({ sent: [], received: [] })),
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

        challengeData.sent
          .filter((c) => c.status === 'completed' && c.winner)
          .forEach((c) => {
            const won = c.winner === 'challenger';
            const tied = c.winner === 'tie';
            notifs.push({
              id: `result-${c.id}`,
              type: 'challenge_result',
              title: tied ? `Tie! ${c.puzzle_title}` : won ? `You Won! ${c.puzzle_title}` : `You Lost! ${c.puzzle_title}`,
              subtitle: `vs ${c.opponent?.username || 'opponent'}`,
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

  // Close dropdown on outside click
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
    } else if (notif.type === 'challenge_result' && onDashboard) {
      onDashboard();
      setShowNotifs(false);
    } else if (notif.type === 'friend_request' && onFriends) {
      onFriends();
      setShowNotifs(false);
    }
  };

  const notifCount = notifications.filter((n) => !seenIds.has(n.id)).length;

  const handleBellClick = () => {
    if (!showNotifs) {
      setSeenIds(new Set(notifications.map((n) => n.id)));
    }
    setShowNotifs((v) => !v);
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* Logo */}
          <div className="header-logo" onClick={onHome} style={{ cursor: onHome ? 'pointer' : 'default' }}>
            <svg className="puzzle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 3h4v2a1 1 0 0 0 1 1 1 1 0 0 0 1-1V3h4v4h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h2v4h-4v-2a1 1 0 0 0-1-1 1 1 0 0 0-1 1v2H7v-4h2a1 1 0 0 0 1-1 1 1 0 0 0-1-1H7V3Z" fill="currentColor" />
              <path d="M3 13h4v-2a1 1 0 0 1 1-1 1 1 0 0 1 1 1v2h4v4h-2a1 1 0 0 0-1 1 1 1 0 0 0 1 1h2v3H3v-4h2a1 1 0 0 0 1-1 1 1 0 0 0-1-1H3v-3Z" fill="currentColor" opacity="0.6" />
            </svg>
            <span className="header-title">Jigsaw Puzzles I.O</span>
          </div>

          {/* Nav links */}
          <nav className="header-nav">
            {onHome && (
              <button type="button" className={`header-nav-link${activeView === 'game' ? ' header-nav-link--active' : ''}`} onClick={onHome}>
                <svg viewBox="0 0 16 16" fill="none"><path d="M2 8.5l6-6 6 6M3.5 7.5V14h3.5v-3.5h2V14H12.5V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span>Home</span>
              </button>
            )}
            <button type="button" className="header-nav-link" disabled>
              <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.8"/><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/></svg>
              <span>Live Matches</span>
              <span className="nav-live-badge">LIVE</span>
            </button>
            {onLeaderboard && (
              <button type="button" className={`header-nav-link${activeView === 'leaderboard' ? ' header-nav-link--active' : ''}`} onClick={onLeaderboard}>
                <svg viewBox="0 0 16 16" fill="none"><path d="M2 14h3V8H2v6ZM6.5 14h3V4h-3v10ZM11 14h3V6h-3v8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                <span>Leaderboards</span>
              </button>
            )}
            {onFriends && (
              <button type="button" className={`header-nav-link${activeView === 'friends' ? ' header-nav-link--active' : ''}`} onClick={onFriends}>
                <svg viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="12" cy="5.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/><path d="M14.5 13c0-1.8-1.2-3.2-2.8-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span>Friends</span>
              </button>
            )}
            {onDashboard && (
              <button type="button" className={`header-nav-link${activeView === 'dashboard' ? ' header-nav-link--active' : ''}`} onClick={onDashboard}>
                <svg viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>
                <span>Dashboard</span>
              </button>
            )}
          </nav>

          {/* Search */}
          <div className="header-search">
            <svg className="header-search-icon" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="text" className="header-search-input" placeholder="Search puzzles, players..." disabled />
          </div>

          {/* Right controls */}
          <div className="header-controls">
            <ThemeToggle />
            <MuteToggle />

            {/* Notification bell */}
            {!isLoading && user && (
              <div className="header-notif-wrap" ref={dropdownRef}>
                <button type="button" className="header-notif-btn" onClick={handleBellClick} aria-label={`Notifications (${notifCount})`}>
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
                        <button key={n.id} type="button" className="notif-item" onClick={() => handleNotifClick(n)}>
                          <span className="notif-icon">{n.type === 'challenge' ? '⚔️' : n.type === 'challenge_result' ? '🏆' : '👋'}</span>
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
            )}
          </div>

          {/* User section */}
          {!isLoading && (
            user ? (
              <div className="header-user-section">
                <div className="header-user-avatar">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    user.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="header-user-info">
                  <span className="header-user-name">{user.username}</span>
                  <span className="header-user-elo">⚡ {userElo !== null ? userElo.toLocaleString() : '—'}</span>
                </div>
                <button type="button" className="header-logout-btn" onClick={logout} title="Sign Out">
                  <svg viewBox="0 0 16 16" fill="none"><path d="M6 2H3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H6M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            ) : (
              <button type="button" className="header-login-btn" onClick={() => setShowAuth(true)}>Sign In</button>
            )
          )}
        </div>
      </header>

      {showAuth && <AuthModal onClose={handleAuthClose} />}
    </>
  );
}
