import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * Puzzle layout preferences — designed to be extensible.
 * Add new keys here as more layout options are introduced.
 */
export interface PuzzleLayoutPrefs {
  /** Which side the puzzle board sits on. */
  boardPosition: 'left' | 'right';
}

const DEFAULT_PREFS: PuzzleLayoutPrefs = {
  boardPosition: 'left',
};

const STORAGE_KEY = 'jigsaw_layout_prefs';

function loadPrefs(): PuzzleLayoutPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: PuzzleLayoutPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

interface PuzzleLayoutContextValue {
  prefs: PuzzleLayoutPrefs;
  updatePrefs: (updates: Partial<PuzzleLayoutPrefs>) => void;
  toggleBoardPosition: () => void;
}

const PuzzleLayoutContext = createContext<PuzzleLayoutContextValue | null>(null);

export function PuzzleLayoutProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<PuzzleLayoutPrefs>(loadPrefs);

  const updatePrefs = useCallback((updates: Partial<PuzzleLayoutPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updates };
      savePrefs(next);
      return next;
    });
  }, []);

  const toggleBoardPosition = useCallback(() => {
    setPrefs((prev) => {
      const next: PuzzleLayoutPrefs = {
        ...prev,
        boardPosition: prev.boardPosition === 'left' ? 'right' : 'left',
      };
      savePrefs(next);
      return next;
    });
  }, []);

  return (
    <PuzzleLayoutContext.Provider value={{ prefs, updatePrefs, toggleBoardPosition }}>
      {children}
    </PuzzleLayoutContext.Provider>
  );
}

export function usePuzzleLayout() {
  const ctx = useContext(PuzzleLayoutContext);
  if (!ctx) throw new Error('usePuzzleLayout must be used within PuzzleLayoutProvider');
  return ctx;
}
