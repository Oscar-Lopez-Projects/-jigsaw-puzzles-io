import './Header.css';

export default function Header() {
  return (
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
      </div>
    </header>
  );
}
