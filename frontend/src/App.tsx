import { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import { type PieceCount } from './components/DifficultySelector';
import PuzzleBoard, { type PuzzleBoardHandle } from './components/PuzzleBoard';
import PuzzleBoardErrorBoundary from './components/PuzzleBoardErrorBoundary';
import WinOverlay from './components/WinOverlay';
import ChallengeResult from './components/ChallengeResult';
import ChallengeDetails from './components/ChallengeDetails';
import PuzzleCompletionDetail from './components/PuzzleCompletionDetail';
import ChallengePicker from './components/ChallengePicker';
import StartPuzzleModal from './components/StartPuzzleModal';
import SoloPlayModal from './components/SoloPlayModal';
import UploadPuzzleForm from './components/UploadPuzzleForm';
import Dashboard from './components/Dashboard';
import CommunityPuzzles from './components/CommunityPuzzles';
import Leaderboard from './components/Leaderboard';
import UserProfile from './components/UserProfile';
import FriendsPage from './components/FriendsPage';
import { getGrid, generatePieces, reshufflePieces } from './utils/puzzleUtils';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './lib/api';
import { startUpload, claimUpload, type UploadTask } from './lib/imageUpload';
import { playWinSound, playClickSound } from './lib/sounds';
import type { PuzzlePiece } from './types/puzzle';
import './App.css';

type Phase = 'setup' | 'generating' | 'puzzle';
type View = 'game' | 'dashboard' | 'community' | 'leaderboard' | 'profile' | 'friends' | 'challenge-details' | 'puzzle-completion';

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
      'challenge-details': `#/challenge/${challengeDetailsId || ''}`,
      'puzzle-completion': `#/completion/${completionRecord?.id || ''}`,
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
  const [showChallengePicker, setShowChallengePicker] = useState(false);
  const [showGlobalStartModal, setShowGlobalStartModal] = useState(false);
  const [showGlobalSoloModal, setShowGlobalSoloModal] = useState(false);
  const [showGlobalUploadModal, setShowGlobalUploadModal] = useState(false);
  const [challengeDetailsId, setChallengeDetailsId] = useState<string | null>(null);
  const [completionRecord, setCompletionRecord] = useState<{
    id: string; puzzle_id: string | null; piece_count: number; difficulty: string;
    completion_time_sec: number; stars: number; image_reference: string | null;
    image_url: string | null; completed_at: string; _snapshot?: string | null;
  } | null>(null);
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
  const [, setGenerateError] = useState<string | null>(null);
  const [isWon, setIsWon] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hintPieceId, setHintPieceId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const puzzleScreenRef = useRef<HTMLDivElement>(null);
  const puzzleBoardRef  = useRef<PuzzleBoardHandle>(null);
  const snapshotRef     = useRef<string | null>(null); // PNG data URL captured at win
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Uploaded image tracking ───────────────────────────────────
  // Single shared UploadTask for the current puzzle session.
  // All consumers (win handler, Save, Back) await the SAME Promise —
  // this prevents duplicate uploads and orphaned files.
  const uploadTask = useRef<UploadTask | null>(null);

  // Cancel any in-flight upload on unmount (e.g. hard navigation)
  useEffect(() => {
    return () => { uploadTask.current?.cancel(); };
  }, []);

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

  const snappedCount = pieces.filter((p) => p.snapped).length;

  // ── Handlers ─────────────────────────────────────────────────

  const handlePiecesChange = useCallback((updated: PuzzlePiece[]) => {
    setPieces(updated);
    const allSnapped = updated.length > 0 && updated.every((p) => p.snapped);
    if (allSnapped) {
      stopTimer();
      setFinalTime(elapsedRef.current);
      // Capture the Konva stage as a PNG — this is the exact image the user sees
      snapshotRef.current = puzzleBoardRef.current?.captureSnapshot() ?? null;
      setIsWon(true);
      playWinSound();
    }
  }, []);

  // Save record after win — runs as effect so it always has fresh state
  const hasWonRef = useRef(false);
  const [debugMsg, setDebugMsg] = useState('');

  /**
   * Shared helper: resolve the in-flight upload and return the stable image URL.
   * Used by both the win handler and handleSaveGame so behaviour is identical.
   * - Awaits the existing UploadTask (never starts a second upload).
   * - If already resolved, returns immediately.
   * - Falls back to the community puzzle URL or null for data URLs.
   */
  const resolveImageUrl = useCallback(async (): Promise<{ imageUrl: string | null; uploadId: string | null }> => {
    // Community puzzle — already a remote URL, nothing to upload
    if (selectedImage && !selectedImage.startsWith('data:')) {
      return { imageUrl: selectedImage, uploadId: null };
    }
    if (!uploadTask.current) return { imageUrl: null, uploadId: null };
    const result = await uploadTask.current.resolve();
    return {
      imageUrl:  result?.image_url  ?? null,
      uploadId:  result?.upload_id  ?? null,
    };
  }, [selectedImage]);
  useEffect(() => {
    if (isWon && !hasWonRef.current) {
      hasWonRef.current = true;
      const msg = `isWon=true | session=${!!session?.access_token} | pieceCount=${pieceCount} | time=${elapsedRef.current} | challengeId=${activeChallengeId} | opponent=${challengeOpponent?.username || 'none'} | image=${selectedImage ? selectedImage.slice(0, 40) : 'null'}`;
      setDebugMsg(msg);

      if (session?.access_token && pieceCount) {
        const difficultyMap: Record<number, string> = { 10: 'beginner', 25: 'beginner', 50: 'easy', 100: 'medium', 150: 'hard', 300: 'hard' };

        (async () => {
          try {
            // Await the in-flight upload before creating the record.
            // resolveImageUrl() always returns the same Promise — never a second upload.
            const { imageUrl: resolvedUrl, uploadId } = await resolveImageUrl();

            // Prefer the snapshot (exact canvas capture) over the uploaded URL.
            // The snapshot is a data URL — too large to store in the DB directly,
            // so we use it only for the completion detail page within this session.
            // For the DB record we store the uploaded remote URL.
            const dbImageUrl = resolvedUrl;
            // Store snapshot in session for the completion detail view
            const sessionSnapshot = snapshotRef.current;

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
                image_url: dbImageUrl,
              },
            });
            // Attach the snapshot to the record for the completion detail page
            if (res && sessionSnapshot) {
              (res as Record<string, unknown>)._snapshot = sessionSnapshot;
            }
            console.log('[Record]', msg, res);
            setDebugMsg((prev) => prev + ' | RECORD SAVED');

            // Claim the upload now that the record is saved.
            // Only claim if record creation succeeded — if it failed we'd have thrown above.
            if (uploadId) {
              claimUpload(uploadId, session.access_token);
              uploadTask.current = null; // no longer needed
            }

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
              console.log('[Challenge] Attempting to send challenge to:', challengeOpponent.username, 'image:', selectedImage?.slice(0, 50));
              setDebugMsg((prev) => prev + ' | SENDING CHALLENGE...');
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
                setDebugMsg((prev) => prev + ' | CHALLENGE SENT!');
              } catch (err) {
                console.error('[Challenge] Send error:', err);
                setDebugMsg((prev) => prev + ' | CHALLENGE ERROR: ' + (err instanceof Error ? err.message : String(err)));
              } finally {
                setChallengeOpponent(null);
              }
            }
          } catch (err) {
            console.error('[Record] Error:', err);
            setDebugMsg((prev) => prev + ' | RECORD ERROR: ' + (err instanceof Error ? err.message : String(err)));
          }
        })();
      } else {
        console.log('[Record] Skipped — no session or pieceCount');
      }
    }
    if (!isWon) {
      hasWonRef.current = false;
      setDebugMsg('');
    }
  }, [isWon, session, pieceCount, imageFileName, activePuzzleId, activeChallengeId, challengeOpponent, selectedImage, resolveImageUrl]);

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
    setActiveSaveId(null);
    // Abandon the upload: wait for it to finish then delete it.
    // abandon() is safe to call even if the upload already resolved or failed.
    uploadTask.current?.abandon();
    uploadTask.current = null;
    snapshotRef.current = null;
  };

  // ── Save Game (solo only) ─────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null); // set when resuming a save

  const isSoloPuzzle = !activeChallengeId && !challengeOpponent;

  const handleSaveGame = useCallback(async () => {
    if (!session?.access_token || !selectedImage || !pieceCount) return;
    setIsSaving(true);
    setSaveError(null);
    pauseTimer();

    try {
      // Await the in-flight upload using the same helper as the win flow.
      // Guaranteed: resolves the existing Promise, never starts a second upload.
      const { imageUrl: resolvedUrl, uploadId } = await resolveImageUrl();

      // Fallback: if upload failed and we have no URL, use a sentinel so
      // the backend still accepts the save (image display will show placeholder).
      const finalImageUrl = resolvedUrl || 'about:blank';

      // Strip imageUrl (base64) from each piece — regenerated on resume.
      // Reduces payload from ~15MB to ~50KB for a 150-piece game.
      const slimPieces = pieces.map(({ imageUrl: _img, ...rest }) => rest);

      const saveBody = {
        image_url: finalImageUrl,
        image_filename: imageFileName || null,
        piece_count: pieceCount,
        grid_cols: gridCols,
        grid_rows: gridRows,
        elapsed_sec: elapsedRef.current,
        pieces_state: slimPieces,
        puzzle_id: activePuzzleId || null,
      };

      // If resuming an existing save, update it (PUT). Otherwise create new (POST).
      if (activeSaveId) {
        await apiFetch(`/api/saved-games/${activeSaveId}`, {
          method: 'PUT',
          token: session.access_token,
          body: saveBody,
        });
      } else {
        await apiFetch('/api/saved-games', {
          method: 'POST',
          token: session.access_token,
          body: saveBody,
        });
      }

      // Save succeeded — claim the upload so cleanup won't delete it.
      // If save had thrown above, we'd skip this and leave it pending (correct).
      if (uploadId) {
        claimUpload(uploadId, session.access_token);
        uploadTask.current = null;
      }

      stopTimer();
      handleBackToSetup();
      setView('dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save game';
      setSaveError(msg);
      resumeTimer();
    } finally {
      setIsSaving(false);
    }
  }, [session, selectedImage, imageFileName, pieceCount, gridCols, gridRows, pieces, activePuzzleId, activeSaveId, resolveImageUrl]);

  const handleHint = useCallback(() => {
    // Prefer loose (free, unconnected) pieces; fall back to any not-yet-placed piece.
    const notPlaced = pieces.filter((p) => !p.snapped);
    if (notPlaced.length === 0) return;
    const free = notPlaced.filter((p) => p.groupId == null);
    const pool = free.length > 0 ? free : notPlaced;
    // clear any running hint first
    if (hintTimer.current) clearTimeout(hintTimer.current);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setHintPieceId(pick.id);
    hintTimer.current = setTimeout(() => setHintPieceId(null), 5000);
  }, [pieces]);

  // ── Fullscreen toggle ─────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!puzzleScreenRef.current) return;
    if (!document.fullscreenElement) {
      puzzleScreenRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
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

  // ── Solo play (local image, no puzzle_id) ─────────────────────
  const handleSoloPlay = (imageDataUrl: string, fileName: string, count: PieceCount) => {
    setSelectedImage(imageDataUrl);
    setImageFileName(fileName);
    setPieceCount(count);
    setActivePuzzleId(null);
    setView('game');
    setPhase('generating');
    setIsWon(false);

    // Reset any previous upload tracking
    uploadTask.current?.abandon();
    uploadTask.current = null;

    // Start the upload immediately in the background while the puzzle generates.
    // We store the UploadTask — all consumers (win, save, back) await the SAME
    // Promise, so no second upload can ever start and no orphan can escape.
    if (session?.access_token) {
      uploadTask.current = startUpload(imageDataUrl, session.access_token, 'solo', fileName);
    }

    const { cols, rows } = getGrid(count);
    generatePieces(imageDataUrl, cols, rows)
      .then((generated) => {
        setGridCols(cols);
        setGridRows(rows);
        setPieces(generated);
        setPhase('puzzle');
        startTimer();
      })
      .catch((err) => {
        const msg2 = err instanceof Error ? err.message : 'Unknown error';
        setGenerateError(`Failed: ${msg2}`);
        setPhase('setup');
      });
  };
  return (
    <div className="app-layout">
      <Header
        activeView={view}
        onHome={() => { setView('game'); setPhase('setup'); setIsWon(false); }}
        onDashboard={() => setView('dashboard')}
        onLeaderboard={() => setView('leaderboard')}
        onFriends={() => setView('friends')}
        onLoginSuccess={() => setView('dashboard')}
        onViewChallengeResult={(id) => { setChallengeDetailsId(id); setPreviousView(view); setView('challenge-details'); }}
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
          onStartPuzzle={() => setShowGlobalStartModal(true)}
          onViewChallenge={(id) => { setChallengeDetailsId(id); setPreviousView('dashboard'); setView('challenge-details'); }}
          onViewRecord={(rec) => { setCompletionRecord(rec); setPreviousView('dashboard'); setView('puzzle-completion'); }}
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
          onResumeSave={(save) => {
            // Regenerate piece images from the saved image URL, then restore positions/state.
            // We stored slim pieces (no imageUrl) so we need to re-slice the image first.
            setSelectedImage(save.image_url);
            setImageFileName(save.image_filename);
            setPieceCount(save.piece_count as PieceCount);
            setActivePuzzleId(save.puzzle_id);
            setActiveChallengeId(null);
            setChallengeOpponent(null);
            setActiveSaveId(save.id); // track so Save overwrites this record instead of creating a new one
            setIsWon(false);
            setView('game');
            setPhase('generating');

            const slimPieces = save.pieces_state as Array<Omit<import('./types/puzzle').PuzzlePiece, 'imageUrl'>>;

            generatePieces(save.image_url, save.grid_cols, save.grid_rows)
              .then((freshPieces) => {
                // Merge fresh imageUrls back into the saved position/state data
                const slimMap = new Map(slimPieces.map((p) => [p.id, p]));
                const restored = freshPieces.map((fp) => {
                  const saved = slimMap.get(fp.id);
                  return saved ? { ...fp, ...saved, imageUrl: fp.imageUrl } : fp;
                });
                setGridCols(save.grid_cols);
                setGridRows(save.grid_rows);
                setPieces(restored);
                setPhase('puzzle');
                // Restore elapsed time then start counting from there (don't use
                // startTimer — it resets to 0. Set refs first, then resumeTimer.)
                elapsedRef.current = save.elapsed_sec;
                setElapsedSec(save.elapsed_sec);
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = setInterval(() => {
                  elapsedRef.current += 1;
                  setElapsedSec(elapsedRef.current);
                }, 1000);
              })
              .catch(() => {
                setGenerateError('Failed to restore saved game.');
                setPhase('setup');
              });
          }}
        />
      ) : view === 'leaderboard' ? (
        <Leaderboard onBack={() => setView('game')} onViewProfile={(id) => navigate('profile', { profileId: id, prev: 'leaderboard' })} />
      ) : view === 'friends' ? (
        <FriendsPage
          onViewProfile={(id) => navigate('profile', { profileId: id, prev: 'friends' })}
          onChallenge={(id, username) => {
            setChallengeOpponent({ id, username });
            setShowChallengePicker(true);
          }}
          onViewChallenge={(id) => { setChallengeDetailsId(id); setPreviousView('friends'); setView('challenge-details'); }}
        />
      ) : view === 'profile' && profileUserId ? (
        <UserProfile
          userId={profileUserId}
          onBack={() => setView(previousView)}
          onChallenge={(id, username) => {
            setChallengeOpponent({ id, username });
            setShowChallengePicker(true);
          }}
        />
      ) : view === 'challenge-details' && challengeDetailsId ? (
        <ChallengeDetails challengeId={challengeDetailsId} onBack={() => setView(previousView)} />
      ) : view === 'puzzle-completion' && completionRecord ? (
        <PuzzleCompletionDetail record={completionRecord} onBack={() => setView(previousView)} />
      ) : (
      <>
      <main className={`main-content${phase === 'puzzle' ? ' main-content--puzzle' : ''}`}>

        {/* ── Home: Community Puzzles (browse + upload) ── */}
        {(phase === 'setup' || phase === 'generating') && (
          <CommunityPuzzles onBack={null} onPlayPuzzle={handlePlayCommunityPuzzle} onSoloPlay={handleSoloPlay} />
        )}

        {/* ── Puzzle screen ── */}
        {phase === 'puzzle' && pieces.length === 0 && (
          <div style={{ color: '#fff', textAlign: 'center', padding: 48 }}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        )}
        {phase === 'puzzle' && pieces.length > 0 && (
          <div className={`puzzle-screen${isFullscreen ? ' puzzle-screen--fullscreen' : ''}`} ref={puzzleScreenRef}>
            {/* Toolbar */}
            <div className="puzzle-toolbar">
              {/* Left section: back + puzzle info */}
              <div className="puzzle-toolbar-left">
                <button type="button" className="back-btn" onClick={handleBackToSetup}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back to Puzzles
                </button>

                <div className="puzzle-meta">
                  <span className="puzzle-meta-label">{imageFileName ?? 'Puzzle'}</span>
                  <span className="puzzle-meta-pill">
                    {gridCols * gridRows} pieces &middot; {gridCols}&times;{gridRows}
                    &middot;
                    <svg className="puzzle-meta-timer-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8 6v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.5 2h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <span className="puzzle-meta-time">{formatTime(elapsedSec)}</span>
                    <span className="puzzle-meta-progress-wrap">
                      <span className="puzzle-meta-progress-track">
                        <span className="puzzle-meta-progress-fill" style={{ width: `${(snappedCount / pieces.length) * 100}%` }} />
                      </span>
                      <span className="puzzle-meta-progress-pct">{Math.round((snappedCount / pieces.length) * 100)}%</span>
                    </span>
                  </span>
                </div>
              </div>

              {/* Right section: action buttons */}
              <div className="puzzle-toolbar-right">
                {selectedImage && (
                  <button
                    type="button"
                    className={`toolbar-action-btn toolbar-action-btn--preview${showPreview ? ' toolbar-action-btn--active' : ''}`}
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
                  className={`toolbar-action-btn toolbar-action-btn--hint${hintPieceId ? ' toolbar-action-btn--active' : ''}`}
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

                <button type="button" className="toolbar-action-btn toolbar-action-btn--reset" onClick={handleReset}>
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

                {/* Save Game — solo play only, requires login */}
                {isSoloPuzzle && session?.access_token && (
                  <button
                    type="button"
                    className={`toolbar-action-btn toolbar-action-btn--save${isSaving ? ' toolbar-action-btn--saving' : ''}`}
                    onClick={handleSaveGame}
                    disabled={isSaving}
                    aria-label="Save game and go to dashboard"
                    title={saveError || 'Save game'}
                  >
                    {isSaving ? (
                      <>
                        <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
                        Saving…
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M2 3a1 1 0 0 1 1-1h8l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M5 2v4h6V2M5 10h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Save
                      </>
                    )}
                  </button>
                )}
                {saveError && <span className="toolbar-save-error" title={saveError} aria-label={saveError}>⚠ {saveError}</span>}

                {/* Fullscreen toggle */}
                <button
                  type="button"
                  className={`toolbar-action-btn toolbar-action-btn--fullscreen${isFullscreen ? ' toolbar-action-btn--active' : ''}`}
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M5 2v3H2M11 2v3h3M5 14v-3H2M11 14v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Board */}
            <PuzzleBoardErrorBoundary onReset={handleBackToSetup}>
              <PuzzleBoard
                ref={puzzleBoardRef}
                pieces={pieces}
                cols={gridCols}
                rows={gridRows}
                onPiecesChange={handlePiecesChange}
                hintPieceId={hintPieceId}
              />
            </PuzzleBoardErrorBoundary>

            {/* Draggable image preview panel — inside puzzle-screen so it shows in fullscreen too */}
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
          debugMsg={debugMsg}
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

      {/* Auth modal triggered from win overlay */}
      {showAuthFromWin && (
        <AuthModal onClose={() => { setShowAuthFromWin(false); setView('dashboard'); }} />
      )}

      {/* Global Start Puzzle Modal (from dashboard) */}
      {showGlobalStartModal && (
        <StartPuzzleModal
          onSoloPlay={() => { setShowGlobalStartModal(false); setShowGlobalSoloModal(true); }}
          onFeaturedPuzzle={() => { setShowGlobalStartModal(false); setShowGlobalUploadModal(true); }}
          onClose={() => setShowGlobalStartModal(false)}
        />
      )}

      {/* Global Solo Play Modal (from dashboard) */}
      {showGlobalSoloModal && (
        <SoloPlayModal
          onStart={(img, name, count) => { setShowGlobalSoloModal(false); handleSoloPlay(img, name, count); }}
          onClose={() => setShowGlobalSoloModal(false)}
        />
      )}

      {/* Global Upload/Featured Puzzle Modal (from dashboard) */}
      {showGlobalUploadModal && (
        <UploadPuzzleForm
          onClose={() => setShowGlobalUploadModal(false)}
          onSuccess={() => { setShowGlobalUploadModal(false); setView('game'); setPhase('setup'); }}
        />
      )}

      {/* Challenge Picker modal */}
      {showChallengePicker && challengeOpponent && (
        <ChallengePicker
          opponent={challengeOpponent}
          onSelectPuzzle={(imageUrl, title, pieceCount, puzzleId) => {
            setShowChallengePicker(false);
            handlePlayCommunityPuzzle(imageUrl, title, pieceCount, puzzleId);
          }}
          onClose={() => { setShowChallengePicker(false); setChallengeOpponent(null); }}
        />
      )}
    </div>
  );
}
