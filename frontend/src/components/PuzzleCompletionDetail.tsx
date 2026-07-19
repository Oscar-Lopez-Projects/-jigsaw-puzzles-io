import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import './PuzzleCompletionDetail.css';

export interface CompletionRecord {
  id: string;
  puzzle_id: string | null;
  piece_count: number;
  difficulty: string;
  completion_time_sec: number;
  stars: number;
  image_reference: string | null;
  image_url: string | null;
  completed_at: string;
  _snapshot?: string | null; // in-session canvas capture (data URL), not persisted
}

interface PuzzleCompletionDetailProps {
  record: CompletionRecord;
  onBack: () => void;
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function PuzzleCompletionDetail({ record, onBack }: PuzzleCompletionDetailProps) {
  // Prefer in-session snapshot (exact canvas), fall back to stored image_url
  const [displayUrl, setDisplayUrl] = useState<string | null>(
    record._snapshot || record.image_url || null
  );
  const [puzzleTitle, setPuzzleTitle] = useState<string>(record.image_reference || 'Puzzle');
  const [loading, setLoading]         = useState(!displayUrl && !!record.puzzle_id);
  const [downloading, setDownloading] = useState(false);

  // If no image and it's a community puzzle, fetch the URL
  useEffect(() => {
    if (displayUrl || !record.puzzle_id) return;
    apiFetch<{ image_url: string; title: string }>(`/api/puzzles/${record.puzzle_id}`)
      .then((data) => { setDisplayUrl(data.image_url); setPuzzleTitle(data.title); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [record.puzzle_id, displayUrl]);

  const handleDownload = useCallback(() => {
    if (!displayUrl) return;
    setDownloading(true);
    const link = document.createElement('a');
    link.download = `${puzzleTitle.replace(/[^a-z0-9]/gi, '_')}_completed.png`;
    link.href = displayUrl;
    link.click();
    setDownloading(false);
  }, [displayUrl, puzzleTitle]);

  const stars = record.stars;

  return (
    <div className="pcd-page">
      {/* Header */}
      <div className="pcd-header">
        <button type="button" className="pcd-back-btn" onClick={onBack}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Dashboard
        </button>
        <div className="pcd-title-row">
          <h1 className="pcd-title">{puzzleTitle}</h1>
          <span className="pcd-completed-badge">✓ Completed</span>
        </div>
        <div className="pcd-meta-row">
          <span className="pcd-meta-pill">{record.piece_count} pieces</span>
          <span className="pcd-meta-pill">{record.difficulty}</span>
          <span className="pcd-meta-pill">⏱ {formatTime(record.completion_time_sec)}</span>
          <span className="pcd-meta-pill pcd-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span>
          <span className="pcd-meta-pill pcd-date">{formatDate(record.completed_at)}</span>
          {displayUrl && (
            <button
              type="button"
              className="pcd-download-btn"
              onClick={handleDownload}
              disabled={downloading}
              title="Download completed puzzle as PNG"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          )}
        </div>
      </div>

      {/* Image area */}
      <div className="pcd-canvas-wrap">
        {loading && (
          <div className="pcd-loading">
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <span>Loading…</span>
          </div>
        )}

        {!loading && !displayUrl && (
          <div className="pcd-no-image">
            <span className="pcd-no-image-icon">🖼️</span>
            <p>No image available for this puzzle.</p>
            <p>Complete a puzzle in a session to see and download it here.</p>
          </div>
        )}

        {displayUrl && (
          <img
            src={displayUrl}
            alt={`Completed puzzle: ${puzzleTitle}`}
            className="pcd-canvas"
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
          />
        )}
      </div>
    </div>
  );
}
