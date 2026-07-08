import { useState, useEffect } from 'react';
import './ThemeToggle.css';

type Theme = 'light' | 'medium' | 'dark';

const STORAGE_KEY = 'jigsaw_theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="theme-toggle" aria-label="Theme selector">
      <button
        type="button"
        className={`theme-toggle-btn${theme === 'light' ? ' theme-toggle-btn--active' : ''}`}
        onClick={() => setTheme('light')}
        title="Light"
        aria-label="Light theme"
      >
        <svg viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`theme-toggle-btn${theme === 'medium' ? ' theme-toggle-btn--active' : ''}`}
        onClick={() => setTheme('medium')}
        title="Medium"
        aria-label="Medium theme"
      >
        <svg viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 3a5 5 0 0 0 0 10" fill="currentColor" opacity="0.4" />
        </svg>
      </button>
      <button
        type="button"
        className={`theme-toggle-btn${theme === 'dark' ? ' theme-toggle-btn--active' : ''}`}
        onClick={() => setTheme('dark')}
        title="Dark"
        aria-label="Dark theme"
      >
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7A5.5 5.5 0 1 0 13.5 9.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
