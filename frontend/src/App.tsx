import { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import ImageUploader from './components/ImageUploader';
import DifficultySelector, { type PieceCount } from './components/DifficultySelector';
import PuzzleBoard from './components/PuzzleBoard';
import PuzzleBoardErrorBoundary from './components/PuzzleBoardErrorBoundary';
import WinOverlay from './components/WinOverlay';
import ChallengeResult from './components/ChallengeResult';
import Dashboard from './components/Dashboard';
import CommunityPuzzles from './components/CommunityPuzzles';
import Leaderboard from './components/Leaderboard';
import UserProfile from './components/UserProfile';
import FriendsList from './components/FriendsList';
import { getGrid, generatePieces, reshufflePieces } from './utils/puzzleUtils';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import { playWinSound, playClickSound } from './lib/sounds';
import type { PuzzlePiece } from './types/puzzle';
import './App.css';

type Phase = 'setup' | 'generating' | 'puzzle';
type View = 'game' | 'dashboard' | 'community' | 'leaderboard' | 'profile' | 'friends';

export default function App() {
  // ── Auth ─────────────────────────────────────────────────────
  const { session } = useAuth();

  // ── View (game vs dashboard vs community) ────────────────────
  const [view, setViewState] = useState<View>('game');
  const [showAuthFromWin, setShowAuthFromWin] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState<View>('game');

  // ── URL hash routing ──────────────────────────────────────────
  const navigate = useCallback((v: View, opts?: { profileId?: string; prev?: View }) => {
    playClickSound();
    setViewState(v);
    if (opts?.profileId) setProfileUserId(opts.profileId);
    if (opts?.prev) setPreviousView(opts.prev);
    const hashMap: Record<View, string> = {
      game: '',
      dashboard: '#/dashboard',
      community: '#/community',
      leaderboard: '#/leaderboard',
      friends: '#/friends',
      profile: opts?.profileId ? `#/profile/${opts.profileId}` : '#/profile',
    };
    window.history.replaceState(null, '', `${window.location.pathname}${hashMap[v]}`);
  }, []);

  // setView wrapper that also updates URL
  const setView = useCallback((v: View) => navigate(v), [navigate]);

  // Restore view from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/dashboard')) navigate('dashboard');
    else if (hash.startsWith('#/community')) navigate('community');
    else if (hash.startsWith('#/leaderboard')) navigate('leaderboard');
    else if (hash.startsWith('#/friends')) navigate('friends');
    else if (hash.startsWith('#/profile/')) {
      const id = hash.replace('#/profile/', '');
      if (id) navigate('profile', { profileId: id });
    }
  }, []); // eslint-disable-line

  // ── Setup state ──────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [pieceCount, setPieceCount] = useState<PieceCount | null>(null);
  const [activePuzzleId, setActivePuzzleId] = useState<string | null>(null);

  // ── Challenge state ────────────────────────────────────────────
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [challengeOpponent, setChallengeOpponent] = useState<{ id: string; username: string } | null>(null);
  const [challengeResult, setChallengeResult] = useState<{
    challengerName: string; opponentName: string;
    challengerTime: number; challengerStars: number;
    opponentTime: number; opponentStars: number;
    winner: 'challenger' | 'opponent' | 'tie';
    isChallenger: boolean;
  } | null>(null);

  // ── Puzzle state ─────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('setup');
  const [pieces, setPieces] = useState<PuzzlePiece[]>([]);
  const [gridCols, setGridCols] = useState(0);
  const [gridRows, setGridRows] = useState(0);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isWon, setIsWon] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hintPieceId, setHintPieceId] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Timer ─────────────────────────────────────────────────────
  const [elapsedSec, setElapsedSec] = useState(0);
  const [finalTime, setFinalTime]   = useState(0);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef  = useRef(0); // mirrors elapsedSec for use in callbacks

  const startTimer = () => {
    elapsedRef.current = 0;
    setElapsedSec(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const pauseTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const resumeTimer = () => {
    if (timerRef.current) return; // already running
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
    }, 1000);
  };

  // Pause timer when tab is hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (phase !== 'puzzle' || isWon) return;
      if (document.hidden) pauseTimer();
      else resumeTimer();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase, isWon]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── Draggable preview panel ───────────────────────────────────
  const [previewPos, setPreviewPos] = useState({ x: 20, y: 80 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handlePreviewPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from the header bar, and ignore the close button
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: previewPos.x,
      origY: previewPos.y,
    };
  }, [previewPos]);

  const handlePreviewPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPreviewPos({
      x: dragState.current.origX + dx,
      y: dragState.current.origY + dy,
    });
  }, []);

  const handlePreviewPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const canStart = selectedImage !== null && pieceCount !== null;
  const snappedCount = pieces.filter((p) => p.snapped).length;

  // ── Handlers ─────────────────────────────────────────────────
  const handleImageSelected = (dataUrl: string, fileName: string) => {
    setSelectedImage(dataUrl);
    setImageFileName(fileName);
  };

  const handleImageCleared = () => {
    setSelectedImage(null);
    setImageFileName(null);
  };

  const handleStartPuzzle = async () => {
    if (!selectedImage || !pieceCount) return;
    setGenerateError(null);
    setPhase('generating');
    setIsWon(false);
    setActivePuzzleId(null); // local image, no community puzzle ID

    try {
      const { cols, rows } = getGrid(pieceCount);
      const generated = await generatePieces(selectedImage, cols, rows);
      setGridCols(cols);
      setGridRows(rows);
      setPieces(generated);
      setPhase('puzzle');
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setGenerateError(`Failed to generate puzzle: ${msg}`);
      setPhase('setup');
    }
  };

  const handlePiecesChange = useCallback((updated: PuzzlePiece[]) => {
    setPieces(updated);
    const allSnapped = updated.length > 0 && updated.every((p) => p.snapped);
    if (allSnapped) {
      stopTimer();
      setFinalTime(elapsedRef.current);
      setIsWon(true);
      playWinSound();
    }
  }, []);

  // Save record after win — runs as effect so it always has fresh state
  const hasWonRef = useRef(false);
  useEffect(() => {
    if (isWon && !hasWonRef.current) {
      hasWonRef.current = true;
      const msg = `isWon=true | session=${!!session?.access_token} | pieceCount=${pieceCount} | time=${elapsedRef.current} | challengeId=${activeChallengeId} | opponent=${challengeOpponent?.username || 'none'}`;

      if (session?.access_token && pieceCount) {
        const difficultyMap: Record<number, string> = { 5: 'beginner', 25: 'beginner', 50: 'easy', 100: 'medium', 150: 'hard' };

        (async () => {
          try {
            // Save puzzle record
            const res = await apiFetch('/api/records', {
              method: 'POST',
              token: session.access_token,
              body: {
                piece_count: pieceCount,
                completion_time_sec: elapsedRef.current,
                difficulty: difficultyMap[pieceCount] || 'easy',
                image_reference: imageFileName || null,
                puzzle_id: activePuzzleId || null,
              },
            });
            console.log('[Record]', msg, res);

            // If playing a challenge (Player B), submit result
            if (activeChallengeId) {
              try {
                const cd = await apiFetch<{ challenger: { username: string }; opponent: { username: string }; challenger_time_sec: number; challenger_stars: number; opponent_time_sec: number; opponent_stars: number; winner: 'challenger' | 'opponent' | 'tie' }>(`/api/challenges/${activeChallengeId}`, {
                  method: 'PATCH',
                  token: session.access_token,
                  body: { opponent_time_sec: elapsedRef.current },
                });
                console.log('[Challenge] Completed:', cd.winner);
                setChallengeResult({
                  challengerName: cd.challenger?.username || 'Challenger',
                  opponentName: cd.opponent?.username || 'You',
                  challengerTime: cd.challenger_time_sec,
                  challengerStars: cd.challenger_stars,
                  opponentTime: cd.opponent_time_sec,
                  opponentStars: cd.opponent_stars,
                  winner: cd.winner,
                  isChallenger: false,
                });
              } catch (err) {
                console.error('[Challenge] Submit error:', err);
              }
            }
            // If initiating a challenge (Player A), upload image + send challenge
            else if (challengeOpponent && selectedImage && pieceCount) {
              const cStars = elapsedRef.current <= pieceCount * 3 ? 3 : elapsedRef.current <= pieceCount * 6 ? 2 : 1;

              // Upload image to get a public URL (data URLs won't work for opponent)
              let imageUrl = selectedImage;
              if (selectedImage.startsWith('data:')) {
                try {
                  const blob = await fetch(selectedImage).then((r) => r.blob());
                  const formData = new FormData();
                  formData.append('image', blob, imageFileName || 'challenge.jpg');
                  formData.append('title', imageFileName || 'Challenge');
                  formData.append('piece_count', String(pieceCount));
                  formData.append('category', 'other');
                  const uploadRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/puzzles/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: formData,
                  });
                  const uploadData = await uploadRes.json();
                  if (uploadRes.ok && uploadData.image_url) {
                    imageUrl = uploadData.image_url;
                  }
                } catch { /* fallback to data URL */ }
              }

              try {
                await apiFetch('/api/challenges', {
                  method: 'POST',
                  token: session.access_token,
                  body: {
                    opponent_id: challengeOpponent.id,
                    image_url: imageUrl,
                    puzzle_title: imageFileName || 'Puzzle',
                    piece_count: pieceCount,
                    difficulty: difficultyMap[pieceCount] || 'easy',
                    challenger_time_sec: elapsedRef.current,
                    challenger_stars: cStars,
                  },
                });
                console.log('[Challenge] Sent to:', challengeOpponent.username);
              } catch (err) {
                console.error('[Challenge] Send error:', err);
              } finally {
                setChallengeOpponent(null);
              }
            }
          } catch (err) {
            console.error('[Record] Error:', err);
          }
        })();
      } else {
        console.log('[Record] Skipped — no session or pieceCount');
      }
    }
    if (!isWon) {
      hasWonRef.current = false;
    }
  }, [isWon, session, pieceCount, imageFileName, activePuzzleId, activeChallengeId, challengeOpponent, selectedImage]);

  const handleReset = useCallback(() => {
    setPieces((prev) => reshufflePieces(prev));
    setIsWon(false);
    startTimer();
  }, []);

  const handleBackToSetup = () => {
    setPhase('setup');
    setPieces([]);
    setGenerateError(null);
    setIsWon(false);
    stopTimer();
    setElapsedSec(0);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHintPieceId(null);
  };

  const handleHint = useCallback(() => {
    const candidates = pieces.filter((p) => !p.snapped);
    if (candidates.length === 0) return;
    // clear any running hint first
    if (hintTimer.current) clearTimeout(hintTimer.current);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setHintPieceId(pick.id);
    hintTimer.current = setTimeout(() => setHintPieceId(null), 2500);
  }, [pieces]);

  const handleCollectAll = useCallback(() => {
    setPieces((prev) =>
      prev.map((p, _, arr) => {
        if (p.snapped || p.zone === 'tray') return p;
        // assign a slotIndex after existing tray pieces
        const trayCount = arr.filter((q) => q.zone === 'tray' && q.id !== p.id).length;
        return { ...p, zone: 'tray' as const, slotIndex: trayCount };
      }).map((p, _, arr) => {
        // re-index tray pieces sequentially so slots don't collide
        if (p.zone !== 'tray' || p.snapped) return p;
        const trayPieces = arr.filter((q) => q.zone === 'tray' && !q.snapped);
        const idx = trayPieces.findIndex((q) => q.id === p.id);
        return { ...p, slotIndex: idx };
      })
    );
  }, []);

  // ── Play a community puzzle ─────────────────────────────────
  const handlePlayCommunityPuzzle = (imageUrl: string, title: string, _pieceCount: number, _puzzleId: string) => {
    setSelectedImage(imageUrl);
    setImageFileName(title);
    setPieceCount(_pieceCount as PieceCount);
    setActivePuzzleId(_puzzleId);
    setView('game');
    // Auto-start the puzzle
    setGenerateError(null);
    setPhase('generating');
    setIsWon(false);
    const { cols, rows } = getGrid(_pieceCount as PieceCount);
    generatePieces(imageUrl, cols, rows)
      .then((generated) => {
        setGridCols(cols);
        setGridRows(rows);
        setPieces(generated);
        setPhase('puzzle');
        startTimer();
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setGenerateError(`Failed to generate puzzle: ${msg}`);
        setPhase('setup');
      });
  };
  return (
    <div className="app-layout">
      <Header
        activeView={view}
        onHome={() => setView('game')}
        onDashboard={() => setView('dashboard')}
        onCommunity={() => setView('community')}
        onLeaderboard={() => setView('leaderboard')}
        onFriends={() => setView('friends')}
        onLoginSuccess={() => setView('dashboard')}
        onAcceptChallenge={(challenge) => {
          setActiveChallengeId(challenge.id);
          setSelectedImage(challenge.image_url);
          setImageFileName(challenge.puzzle_title);
          setPieceCount(challenge.piece_count as PieceCount);
          setView('game');
          setGenerateError(null);
          setPhase('generating');
          setIsWon(false);
          const { cols, rows } = getGrid(challenge.piece_count as PieceCount);
          generatePieces(challenge.image_url, cols, rows)
            .then((generated) => { setGridCols(cols); setGridRows(rows); setPieces(generated); setPhase('puzzle'); startTimer(); })
            .catch((err) => { setGenerateError(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`); setPhase('setup'); });
        }}
      />

      {view === 'dashboard' ? (
        <Dashboard
          onBack={() => setView('game')}
          onViewProfile={(id) => navigate('profile', { profileId: id, prev: 'dashboard' })}
          onAcceptChallenge={(challenge) => {
            setActiveChallengeId(challenge.id);
            setSelectedImage(challenge.image_url);
            setImageFileName(challenge.puzzle_title);
            setPieceCount(challenge.piece_count as PieceCount);
            setView('game');
            setGenerateError(null);
            setPhase('generating');
            setIsWon(false);
            const { cols, rows } = getGrid(challenge.piece_count as PieceCount);
            generatePieces(challenge.image_url, cols, rows)
              .then((generated) => { setGridCols(cols); setGridRows(rows); setPieces(generated); setPhase('puzzle'); startTimer(); })
              .catch((err) => { setGenerateError(`Failed: ${err instanceof Error ? err.message : 'Unknown'}`); setPhase('setup'); });
          }}
        />
      ) : view === 'community' ? (
        <CommunityPuzzles onBack={() => setView('game')} onPlayPuzzle={handlePlayCommunityPuzzle} />
      ) : view === 'leaderboard' ? (
        <Leaderboard onBack={() => setView('game')} onViewProfile={(id) => navigate('profile', { profileId: id, prev: 'leaderboard' })} />
      ) : view === 'friends' ? (
        <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: '32px 24px 80px' }}>
          <button type="button" className="community-back" onClick={() => setView('game')} style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-body)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 16, height: 16 }}><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)', margin: '0 0 20px' }}>Friends</h1>
          <FriendsList onViewProfile={(id) => navigate('profile', { profileId: id, prev: 'friends' })} />
        </div>
      ) : view === 'profile' && profileUserId ? (
        <UserProfile
          userId={profileUserId}
          onBack={() => setView(previousView)}
          onChallenge={(id, username) => {
            setChallengeOpponent({ id, username });
            setView('game');
            handleBackToSetup();
          }}
        />
      ) : (
      <>
      <main className={`main-content${phase === 'puzzle' ? ' main-content--puzzle' : ''}`}>

        {/* ── Setup screen ── */}
        {(phase === 'setup' || phase === 'generating') && (
          <div className="setup-card">
            <div className="setup-card-header">
              <h1 className="setup-title">Create your puzzle</h1>
              <p className="setup-subtitle">
                Pick any image from your device and choose how many pieces you want to solve.
              </p>
            </div>

            <div className="setup-body">
              <ImageUploader
                selectedImage={selectedImage}
                fileName={imageFileName}
                onImageSelected={handleImageSelected}
                onImageCleared={handleImageCleared}
              />
              <DifficultySelector
                selected={pieceCount}
                onSelect={setPieceCount}
              />
            </div>

            {generateError && (
              <div className="generate-error" role="alert">{generateError}</div>
            )}

            <div className="setup-footer">
              <button
                type="button"
                className="start-btn"
                disabled={!canStart || phase === 'generating'}
                onClick={handleStartPuzzle}
                aria-disabled={!canStart || phase === 'generating'}
              >
                {phase === 'generating' ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="start-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 7l5 3-5 3V7Z" fill="currentColor" />
                    </svg>
                    Start Puzzle
                  </>
                )}
              </button>

              {!canStart && phase !== 'generating' && (
                <p className="start-hint" aria-live="polite">
                  {!selectedImage && !pieceCount
                    ? 'Select an image and a piece count to begin'
                    : !selectedImage
                    ? 'Select an image to continue'
                    : 'Choose a piece count to continue'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Puzzle screen ── */}
        {phase === 'puzzle' && pieces.length === 0 && (
          <div style={{ color: '#fff', textAlign: 'center', padding: 48 }}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        )}
        {phase === 'puzzle' && pieces.length > 0 && (
          <div className="puzzle-screen">
            {/* Toolbar */}
            <div className="puzzle-toolbar">
              <button type="button" className="back-btn" onClick={handleBackToSetup}>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                New Puzzle
              </button>

              <div className="puzzle-meta">
                <span className="puzzle-meta-label">{imageFileName ?? 'Puzzle'}</span>
                <span className="puzzle-meta-pill">
                  {gridCols * gridRows} pieces &middot; {gridCols}&times;{gridRows}
                </span>
              </div>

              {/* Live timer */}
              <div className="puzzle-timer" aria-label="Elapsed time" aria-live="off">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 6v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6.5 2h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                {formatTime(elapsedSec)}
              </div>

              {/* Progress */}
              <div className="puzzle-progress">
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(snappedCount / pieces.length) * 100}%` }}
                    aria-valuenow={snappedCount}
                    aria-valuemax={pieces.length}
                    role="progressbar"
                    aria-label="Puzzle progress"
                  />
                </div>
                <span className="progress-label">{Math.round((snappedCount / pieces.length) * 100)}%</span>
              </div>

              {selectedImage && (
                <button
                  type="button"
                  className={`preview-btn${showPreview ? ' preview-btn--active' : ''}`}
                  onClick={() => {
                    if (!showPreview) setPreviewPos({ x: 20, y: 80 });
                    setShowPreview((v) => !v);
                  }}
                  aria-label={showPreview ? 'Hide reference image' : 'Show reference image'}
                  title={showPreview ? 'Hide preview' : 'Preview image'}
                >
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  Preview
                </button>
              )}

              <button
                type="button"
                className={`hint-btn${hintPieceId ? ' hint-btn--active' : ''}`}
                onClick={handleHint}
                disabled={pieces.filter((p) => !p.snapped).length === 0}
                aria-label="Show a hint"
                title="Hint"
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M7.5 8a2.5 2.5 0 0 1 5 0c0 1.2-.8 2-1.5 2.5V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="10" cy="14.5" r="1" fill="currentColor" />
                </svg>
                Hint
              </button>

              <button
                type="button"
                className="collect-btn"
                onClick={handleCollectAll}
                disabled={pieces.filter((p) => !p.snapped && p.zone !== 'tray').length === 0}
                aria-label="Collect all loose pieces into tray"
                title="Collect all pieces into tray"
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M3 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M5 13V7a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 13h16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M8 6V4M12 6V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Collect
              </button>

              <button type="button" className="reset-btn" onClick={handleReset}>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M13.5 8A5.5 5.5 0 1 1 8 2.5M13.5 2.5v3.5H10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Reset
              </button>
            </div>

            {/* Board */}
            <PuzzleBoardErrorBoundary onReset={handleBackToSetup}>
              <PuzzleBoard
                pieces={pieces}
                cols={gridCols}
                rows={gridRows}
                onPiecesChange={handlePiecesChange}
                hintPieceId={hintPieceId}
              />
            </PuzzleBoardErrorBoundary>
          </div>
        )}
      </main>

      {/* Win overlay — hide if challenge result is showing */}
      {isWon && !challengeResult && (
        <WinOverlay
          pieceCount={pieces.length}
          completionTime={finalTime}
          puzzleName={imageFileName || 'Puzzle'}
          formatTime={formatTime}
          isLoggedIn={!!session?.access_token}
          onDashboard={() => { setIsWon(false); setActiveChallengeId(null); setView('dashboard'); }}
          onPlayAgain={() => { setIsWon(false); setActiveChallengeId(null); handleBackToSetup(); }}
          onCreateAccount={() => { setIsWon(false); setShowAuthFromWin(true); }}
        />
      )}

      {/* Challenge result overlay */}
      {challengeResult && (
        <ChallengeResult
          {...challengeResult}
          onClose={() => { setChallengeResult(null); setIsWon(false); setActiveChallengeId(null); setView('dashboard'); }}
        />
      )}
      </>
      )}

      {/* Draggable image preview panel */}
      {showPreview && selectedImage && (
        <div
          className="preview-float"
          style={{ left: previewPos.x, top: previewPos.y }}
          role="dialog"
          aria-label="Reference image preview"
        >
          {/* Drag handle / header */}
          <div
            className="preview-float-header"
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
          >
            <svg className="preview-float-drag-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="5" cy="4" r="1" fill="currentColor" />
              <circle cx="5" cy="8" r="1" fill="currentColor" />
              <circle cx="5" cy="12" r="1" fill="currentColor" />
              <circle cx="11" cy="4" r="1" fill="currentColor" />
              <circle cx="11" cy="8" r="1" fill="currentColor" />
              <circle cx="11" cy="12" r="1" fill="currentColor" />
            </svg>
            <span className="preview-float-title">
              {imageFileName ?? 'Reference Image'}
            </span>
            <button
              type="button"
              className="preview-float-close"
              onClick={() => setShowPreview(false)}
              aria-label="Close preview"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Image */}
          <div className="preview-float-body">
            <img
              src={selectedImage}
              alt={imageFileName ?? 'Reference image'}
              className="preview-float-img"
              draggable={false}
            />
          </div>
        </div>
      )}

      {/* Auth modal triggered from win overlay */}
      {showAuthFromWin && (
        <AuthModal onClose={() => { setShowAuthFromWin(false); setView('dashboard'); }} />
      )}
    </div>
  );
}
