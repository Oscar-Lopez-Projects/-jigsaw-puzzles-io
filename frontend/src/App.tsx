import { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import ImageUploader from './components/ImageUploader';
import DifficultySelector, { type PieceCount } from './components/DifficultySelector';
import PuzzleBoard from './components/PuzzleBoard';
import PuzzleBoardErrorBoundary from './components/PuzzleBoardErrorBoundary';
import WinOverlay from './components/WinOverlay';
import Dashboard from './components/Dashboard';
import CommunityPuzzles from './components/CommunityPuzzles';
import Leaderboard from './components/Leaderboard';
import { getGrid, generatePieces, reshufflePieces } from './utils/puzzleUtils';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import type { PuzzlePiece } from './types/puzzle';
import './App.css';

type Phase = 'setup' | 'generating' | 'puzzle';
type View = 'game' | 'dashboard' | 'community' | 'leaderboard';

export default function App() {
  // ── Auth ─────────────────────────────────────────────────────
  const { session } = useAuth();

  // ── View (game vs dashboard vs community) ────────────────────
  const [view, setView] = useState<View>('game');
  const [showAuthFromWin, setShowAuthFromWin] = useState(false);

  // ── Setup state ──────────────────────────────────────────────
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [pieceCount, setPieceCount] = useState<PieceCount | null>(null);
  const [activePuzzleId, setActivePuzzleId] = useState<string | null>(null);

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
    }
  }, []);

  // Save record after win — runs as effect so it always has fresh state
  const hasWonRef = useRef(false);
  const [debugMsg, setDebugMsg] = useState<string>('');
  useEffect(() => {
    if (isWon && !hasWonRef.current) {
      hasWonRef.current = true;
      let msg = `isWon=true | session=${!!session?.access_token} | pieceCount=${pieceCount} | time=${elapsedRef.current}`;
      if (session?.access_token && pieceCount) {
        const difficultyMap: Record<number, string> = { 5: 'beginner', 25: 'beginner', 50: 'easy', 100: 'medium', 150: 'hard' };
        apiFetch('/api/records', {
          method: 'POST',
          token: session.access_token,
          body: {
            piece_count: pieceCount,
            completion_time_sec: elapsedRef.current,
            difficulty: difficultyMap[pieceCount] || 'easy',
            image_reference: imageFileName || null,
            puzzle_id: activePuzzleId || null,
          },
        })
          .then((res) => setDebugMsg(msg + ' | SAVED: ' + JSON.stringify(res)))
          .catch((err) => setDebugMsg(msg + ' | ERROR: ' + (err instanceof Error ? err.message : String(err))));
      } else {
        msg += ' | SKIPPED (no session or pieceCount)';
        setDebugMsg(msg);
      }
    }
    if (!isWon) {
      hasWonRef.current = false;
      setDebugMsg('');
    }
  }, [isWon, session, pieceCount, imageFileName, activePuzzleId]);

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
        onDashboard={() => setView('dashboard')}
        onCommunity={() => setView('community')}
        onLeaderboard={() => setView('leaderboard')}
        onLoginSuccess={() => setView('dashboard')}
      />

      {view === 'dashboard' ? (
        <Dashboard onBack={() => setView('game')} />
      ) : view === 'community' ? (
        <CommunityPuzzles onBack={() => setView('game')} onPlayPuzzle={handlePlayCommunityPuzzle} />
      ) : view === 'leaderboard' ? (
        <Leaderboard onBack={() => setView('game')} />
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

      {/* Win overlay */}
      {isWon && (
        <WinOverlay
          pieceCount={pieces.length}
          completionTime={finalTime}
          formatTime={formatTime}
          isLoggedIn={!!session?.access_token}
          onDashboard={() => { setIsWon(false); setView('dashboard'); }}
          onPlayAgain={() => { setIsWon(false); handleBackToSetup(); }}
          onCreateAccount={() => { setIsWon(false); setShowAuthFromWin(true); }}
          debugMsg={debugMsg}
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
