import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import UploadPuzzleForm from './UploadPuzzleForm';
import StartPuzzleModal from './StartPuzzleModal';
import SoloPlayModal from './SoloPlayModal';
import { type PieceCount } from './DifficultySelector';
import './CommunityPuzzles.css';

interface Puzzle {
  id: string;
  title: string;
  image_url: string;
  piece_count: number;
  plays: number;
  category: string;
  created_at: string;
  user_id: string;
  users: { username: string } | null;
}

interface CommunityPuzzlesProps {
  onBack: (() => void) | null;
  onPlayPuzzle: (imageUrl: string, title: string, pieceCount: number, puzzleId: string) => void;
  onSoloPlay?: (imageDataUrl: string, fileName: string, pieceCount: PieceCount) => void;
}

const CATEGORIES = [
  { value: 'all', label: 'All', icon: '🧩' },
  { value: 'nature', label: 'Nature', icon: '🌿' },
  { value: 'animals', label: 'Animals', icon: '🐾' },
  { value: 'art', label: 'Art', icon: '🎨' },
  { value: 'cities', label: 'Cities', icon: '🏙️' },
  { value: 'travel', label: 'Travel', icon: '✈️' },
  { value: 'food', label: 'Food', icon: '🍕' },
  { value: 'architecture', label: 'Architecture', icon: '🏛️' },
  { value: 'fantasy', label: 'Fantasy', icon: '✨' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'other', label: 'Other', icon: '🎲' },
];

interface LeaderboardEntry {
  user_id: string;
  completion_time_sec: number;
  stars: number;
  users: { username: string; avatar_url: string | null } | null;
}

function HomePuzzleCard({ puzzle, onPlay }: { puzzle: Puzzle; onPlay: () => void }) {
  const [showScore, setShowScore] = useState(false);
  const [topScore, setTopScore] = useState<LeaderboardEntry | null>(null);
  const [loadingScore, setLoadingScore] = useState(false);
  const [fetched, setFetched] = useState(false);

  const toggleScore = () => {
    if (!fetched) {
      setLoadingScore(true);
      apiFetch<LeaderboardEntry[]>(`/api/leaderboard/puzzle/${puzzle.id}?limit=1`)
        .then((data) => setTopScore(data.length > 0 ? data[0] : null))
        .catch(() => setTopScore(null))
        .finally(() => { setLoadingScore(false); setFetched(true); });
    }
    setShowScore((v) => !v);
  };

  const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <div className="home-puzzle-card">
      <div className="home-puzzle-img-wrap">
        <img src={puzzle.image_url} alt={puzzle.title} className="home-puzzle-img" loading="lazy" />
        <span className="home-puzzle-pieces-badge">⭐ {puzzle.piece_count}</span>
      </div>
      <div className="home-puzzle-body">
        <span className="home-puzzle-title">{puzzle.title}</span>
        <span className="home-puzzle-author">by {puzzle.users?.username || 'Unknown'} · ⭐⭐⭐⭐ 4.7 xoxo</span>
        <div className="home-puzzle-meta">
          <span>🧩 {puzzle.piece_count}</span>
          <span>▶ {puzzle.plays || 0}</span>
          <span>⏱ 00:37 xoxo</span>
        </div>
      </div>
      <div className="home-puzzle-actions">
        <button type="button" className="home-puzzle-play-btn" onClick={onPlay}>Play</button>
        <button type="button" className={`home-puzzle-score-btn${showScore ? ' home-puzzle-score-btn--open' : ''}`} onClick={toggleScore}>
          🏆 {showScore ? '▲' : '▼'}
        </button>
      </div>
      {showScore && (
        <div className="home-puzzle-scoreboard">
          {loadingScore ? (
            <span className="home-score-loading">Loading...</span>
          ) : !topScore ? (
            <span className="home-score-empty">No scores yet — be the first!</span>
          ) : (
            <div className="home-score-entry">
              <span className="home-score-rank">#1</span>
              <span className="home-score-user">{topScore.users?.username || 'Unknown'}</span>
              <span className="home-score-stars">{'★'.repeat(topScore.stars)}{'☆'.repeat(3 - topScore.stars)}</span>
              <span className="home-score-time">{formatTime(topScore.completion_time_sec)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CommunityPuzzles({ onBack, onPlayPuzzle, onSoloPlay }: CommunityPuzzlesProps) {
  const { session, user } = useAuth();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showStartModal, setShowStartModal] = useState(false);
  const [showSoloModal, setShowSoloModal] = useState(false);
  const [soloRecords, setSoloRecords] = useState<{ id: string; image_reference: string | null; piece_count: number; stars: number; completion_time_sec: number; completed_at: string }[]>([]);

  const fetchPuzzles = (category?: string) => {
    setLoading(true);
    const cat = category ?? activeCategory;
    const url = cat && cat !== 'all' ? `/api/puzzles?category=${cat}` : '/api/puzzles';
    apiFetch<Puzzle[]>(url)
      .then((data) => { setPuzzles(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPuzzles(); }, []);

  // Fetch user's solo puzzle records (no puzzle_id = solo)
  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch<{ id: string; image_reference: string | null; piece_count: number; stars: number; completion_time_sec: number; completed_at: string; puzzle_id: string | null }[]>('/api/records', { token: session.access_token })
      .then((data) => setSoloRecords(data.filter((r) => !r.puzzle_id).slice(0, 6)))
      .catch(() => {});
  }, [session]);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    fetchPuzzles(cat);
  };

  const handlePlay = (puzzle: Puzzle) => {
    apiFetch(`/api/puzzles/${puzzle.id}/play`, { method: 'POST' }).catch(() => {});
    onPlayPuzzle(puzzle.image_url, puzzle.title, puzzle.piece_count, puzzle.id);
  };

  const handleUploadSuccess = () => {
    setShowUpload(false);
    fetchPuzzles();
  };

  return (
    <div className="home-page">
      {/* Hero Section */}
      <div className="home-hero">
        <div className="home-hero-left">
          {user && <div className="home-welcome-badge">WELCOME BACK, {user.username.toUpperCase()}! 👋</div>}
          <h1 className="home-hero-title">Race. Solve.<br /><span className="home-hero-accent">Climb</span> the ranks.</h1>
          <p className="home-hero-sub">Solve puzzles, compete in live matches, and become the ultimate puzzle champion.</p>
          <div className="home-hero-btns">
            <button type="button" className="home-hero-btn home-hero-btn--primary" onClick={() => setShowStartModal(true)}>
              🧩 Start a Puzzle
            </button>
            <button type="button" className="home-hero-btn home-hero-btn--secondary" disabled>
              ⚡ Join Live Match <span className="nav-live-badge">LIVE</span>
            </button>
          </div>
        </div>
        <div className="home-hero-right">
          <div className="home-hero-graphic">🏆</div>
          <div className="home-live-card">
            <div className="home-live-dot">● LIVE NOW</div>
            <h4>Speed Puzzle Showdown 🔥 xoxo</h4>
            <p>3 players · 500 pieces · Nature</p>
            <div className="home-live-avatars">👤👤👤 <span>+12</span></div>
            <button type="button" className="home-live-watch" disabled>👁 Watch Live</button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="home-stats-row">
        <div className="home-stat"><span className="home-stat-icon">🥇</span><div><span className="home-stat-label">CURRENT RANK</span><span className="home-stat-val">#1 xoxo</span><span className="home-stat-sub">Top 0.1% ▲</span></div></div>
        <div className="home-stat"><span className="home-stat-icon">⏱️</span><div><span className="home-stat-label">BEST TIME</span><span className="home-stat-val">00:07 xoxo</span><span className="home-stat-sub">View personal best &gt;</span></div></div>
        <div className="home-stat"><span className="home-stat-icon">🧩</span><div><span className="home-stat-label">PUZZLES SOLVED</span><span className="home-stat-val">1,248 xoxo</span><span className="home-stat-sub">This season +24</span></div></div>
        <div className="home-stat"><span className="home-stat-icon">🔥</span><div><span className="home-stat-label">WIN STREAK</span><span className="home-stat-val">12 xoxo</span><span className="home-stat-sub">Amazing!</span></div></div>
        <div className="home-stat"><span className="home-stat-icon">💎</span><div><span className="home-stat-label">ELO RATING</span><span className="home-stat-val">1,265 xoxo</span><span className="home-stat-sub">Diamond II</span></div></div>
        <div className="home-stat"><span className="home-stat-icon">📈</span><div><span className="home-stat-label">WEEKLY PROGRESS</span><span className="home-stat-val">+125 ELO xoxo</span><span className="home-stat-sub"></span></div></div>
      </div>

      {/* Category Filter */}
      <div className="home-filters">
        <div className="home-filter-chips">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={`home-chip${activeCategory === cat.value ? ' home-chip--active' : ''}`}
              onClick={() => handleCategoryChange(cat.value)}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
        <div className="home-filter-right">
          <button type="button" className="home-filter-btn" disabled>📊 Trending ▾ xoxo</button>
          <button type="button" className="home-filter-btn" disabled>⚙ Filters xoxo</button>
        </div>
      </div>

      {/* Live & Upcoming Matches (static) */}
      <div className="home-live-section">
        <div className="home-live-header">● LIVE & UPCOMING xoxo</div>
        <div className="home-live-grid">
          <div className="home-live-tile home-live-tile--live">
            <span className="home-live-badge-sm">LIVE NOW</span>
            <h4>Speed Puzzle Showdown xoxo</h4>
            <p>500 pieces · Nature</p>
            <p>#1 $4.1% · 👤👤👤 +12</p>
            <button type="button" className="home-live-tile-btn" disabled>▶ Watch Live</button>
          </div>
          <div className="home-live-tile">
            <span className="home-live-badge-sm home-live-badge-sm--upcoming">STARTS IN 15:30 xoxo</span>
            <h4>City Lights Challenge</h4>
            <p>750 pieces · Cities</p>
            <p>👤👤 +8</p>
            <button type="button" className="home-live-tile-btn" disabled>Join Queue</button>
          </div>
          <div className="home-live-tile">
            <span className="home-live-badge-sm home-live-badge-sm--upcoming">STARTS IN 2:45:10 xoxo</span>
            <h4>Weekend Tournament 🏆</h4>
            <p>1000 pieces · Mixed</p>
            <p>👤👤👤 +24</p>
            <button type="button" className="home-live-tile-btn" disabled>Details</button>
          </div>
        </div>
        <button type="button" className="home-view-all-link" disabled>View All Live Matches → xoxo</button>
      </div>

      {/* Featured Puzzles */}
      <div className="home-featured">
        <div className="home-featured-header">
          <h2>⭐ Featured Puzzles</h2>
          <button type="button" className="home-view-all-link">View All Puzzles →</button>
        </div>

        {showUpload && (
          <UploadPuzzleForm onClose={() => setShowUpload(false)} onSuccess={handleUploadSuccess} />
        )}

        {loading && (
          <div className="home-loading"><span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /> Loading puzzles...</div>
        )}

        {error && <div className="home-error">{error}</div>}

        {!loading && !error && puzzles.length === 0 && (
          <div className="home-empty">No puzzles yet. Be the first to upload one!</div>
        )}

        {!loading && !error && puzzles.length > 0 && (
          <div className="home-puzzle-grid">
            {puzzles.map((puzzle) => (
              <HomePuzzleCard key={puzzle.id} puzzle={puzzle} onPlay={() => handlePlay(puzzle)} />
            ))}
          </div>
        )}
      </div>

      {/* My Solo Puzzles */}
      {session?.access_token && soloRecords.length > 0 && (
        <div className="home-solo-section">
          <div className="home-featured-header">
            <h2>🎯 My Solo Puzzles</h2>
          </div>
          <div className="home-solo-grid">
            {soloRecords.map((r) => (
              <div className="home-solo-card" key={r.id}>
                <div className="home-solo-info">
                  <span className="home-solo-name">{r.image_reference || 'Solo Puzzle'}</span>
                  <span className="home-solo-meta">{r.piece_count} pieces · {'★'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</span>
                </div>
                <div className="home-solo-time">{String(Math.floor(r.completion_time_sec / 60)).padStart(2, '0')}:{String(r.completion_time_sec % 60).padStart(2, '0')}</div>
                <span className="home-solo-date">{new Date(r.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start Puzzle Choice Modal */}
      {showStartModal && (
        <StartPuzzleModal
          onSoloPlay={() => { setShowStartModal(false); setShowSoloModal(true); }}
          onFeaturedPuzzle={() => { setShowStartModal(false); setShowUpload(true); }}
          onClose={() => setShowStartModal(false)}
        />
      )}

      {/* Solo Play Modal */}
      {showSoloModal && onSoloPlay && (
        <SoloPlayModal
          onStart={(img, name, count) => { setShowSoloModal(false); onSoloPlay(img, name, count); }}
          onClose={() => setShowSoloModal(false)}
        />
      )}

      {onBack && (
        <button type="button" className="community-back" onClick={onBack} style={{ position: 'fixed', top: 70, left: 20, zIndex: 50 }}>
          ← Back
        </button>
      )}
    </div>
  );
}
