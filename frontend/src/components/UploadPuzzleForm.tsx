import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './UploadPuzzleForm.css';

interface UploadPuzzleFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function UploadPuzzleForm({ onClose, onSuccess }: UploadPuzzleFormProps) {
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [pieceCount, setPieceCount] = useState('25');
  const [category, setCategory] = useState('other');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim() || !session?.access_token) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('title', title.trim());
    formData.append('piece_count', pieceCount);
    formData.append('category', category);

    try {
      const res = await fetch(`${API_URL}/api/puzzles/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-backdrop" onClick={onClose}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
        <button className="upload-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>

        <h2 className="upload-title">Upload a Puzzle</h2>
        <p className="upload-subtitle">Share an image for others to solve as a jigsaw puzzle.</p>

        <form className="upload-form" onSubmit={handleSubmit}>
          <div className="upload-field">
            <label htmlFor="upload-title">Title</label>
            <input
              id="upload-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your puzzle a name"
              required
            />
          </div>

          <div className="upload-field">
            <label htmlFor="upload-pieces">Piece Count</label>
            <select id="upload-pieces" value={pieceCount} onChange={(e) => setPieceCount(e.target.value)}>
              <option value="25">25 Pieces (Beginner)</option>
              <option value="50">50 Pieces (Easy)</option>
              <option value="100">100 Pieces (Medium)</option>
              <option value="150">150 Pieces (Hard)</option>
            </select>
          </div>

          <div className="upload-field">
            <label htmlFor="upload-category">Category</label>
            <select id="upload-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="nature">Nature</option>
              <option value="animals">Animals</option>
              <option value="art">Art</option>
              <option value="memes">Memes</option>
              <option value="food">Food</option>
              <option value="travel">Travel</option>
              <option value="architecture">Architecture</option>
              <option value="sports">Sports</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="upload-field">
            <label htmlFor="upload-file">Image</label>
            <input
              id="upload-file"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              required
            />
          </div>

          {preview && (
            <div className="upload-preview">
              <img src={preview} alt="Preview" />
            </div>
          )}

          {error && <div className="upload-error" role="alert">{error}</div>}

          <button type="submit" className="upload-submit" disabled={loading || !file || !title.trim()}>
            {loading ? 'Uploading...' : 'Upload Puzzle'}
          </button>
        </form>
      </div>
    </div>
  );
}
