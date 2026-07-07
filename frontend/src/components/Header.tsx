import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthModal from './AuthModal';
import './Header.css';

interface HeaderProps {
  onDashboard?: () => void;
  onLoginSuccess?: () => void;
}

export default function Header({ onDashboard, onLoginSuccess }: HeaderProps) {
  const { user, logout, isLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const handleAuthClose = () => {
    setShowAuth(false);
    if (onLoginSuccess) onLoginSuccess();
  };

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
            {isLoading ? null : user ? (
              <div className="header-user">
                <span className="header-username">{user.username}</span>
                {onDashboard && (
                  <button type="button" className="header-dashboard-btn" onClick={onDashboard}>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    Dashboard
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
