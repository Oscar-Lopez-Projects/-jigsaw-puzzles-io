import { useRef, useState, useCallback } from 'react';
import { validateImageDimensions, getImageDimensions, MIN_LONG_SIDE, MIN_SHORT_SIDE } from '../utils/imageValidation';
import './ImageUploader.css';

interface ImageUploaderProps {
  /** base64 data URL of the currently selected image, or null */
  selectedImage: string | null;
  /** file name of the currently selected image, or null */
  fileName: string | null;
  /** called when a valid image is picked */
  onImageSelected: (dataUrl: string, fileName: string) => void;
  /** called when the selection is cleared */
  onImageCleared: () => void;
}

// File types we accept beyond the generic image/* MIME check
const ACCEPTED_MIME_PREFIXES = ['image/'];

function isImageFile(file: File): boolean {
  return ACCEPTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));
}

export default function ImageUploader({
  selectedImage,
  fileName,
  onImageSelected,
  onImageCleared,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Reset the native input value so picking the same file again fires onChange */
  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = useCallback(
    (file: File) => {
      setError(null);

      if (!isImageFile(file)) {
        setError(
          `"${file.name}" is not a supported image. Please choose a JPG, PNG, WEBP, or GIF file.`
        );
        resetInput();
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;

        // Validate image dimensions
        try {
          const dims = await getImageDimensions(result);
          const validation = validateImageDimensions(dims);
          if (!validation.valid) {
            setError(validation.error!);
            resetInput();
            return;
          }
        } catch {
          setError('Could not read image dimensions. Please try a different file.');
          resetInput();
          return;
        }

        onImageSelected(result, file.name);
      };
      reader.onerror = () => {
        setError('Could not read the file. Please try again.');
      };
      reader.readAsDataURL(file);
      resetInput();
    },
    [onImageSelected]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear drag state when leaving the drop-zone itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't re-open file picker
    setError(null);
    onImageCleared();
    resetInput();
  };

  const dismissError = () => setError(null);

  return (
    <div className="uploader-section">
      <h2 className="section-label">1. Choose an image</h2>

      <div
        className={[
          'drop-zone',
          isDragging ? 'dragging' : '',
          selectedImage ? 'has-image' : '',
          error ? 'has-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={
          selectedImage
            ? 'Image selected. Click to change.'
            : 'Upload an image. Click or drag and drop.'
        }
      >
        {/* Hidden native file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="file-input"
          onChange={handleChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {selectedImage ? (
          /* ── Preview state ── */
          <div className="preview-wrapper">
            <img
              src={selectedImage}
              alt="Selected puzzle image preview"
              className="preview-img"
            />
            <div className="preview-overlay">
              <span className="preview-change-text">Click to change</span>
            </div>
            {/* Clear / remove button */}
            <button
              type="button"
              className="clear-btn"
              onClick={handleClear}
              aria-label="Remove selected image"
              title="Remove image"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="rgba(0,0,0,0.55)" />
                <path
                  d="M5.5 5.5l5 5M10.5 5.5l-5 5"
                  stroke="#fff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : (
          /* ── Empty / prompt state ── */
          <div className="drop-zone-content">
            <svg
              className="upload-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 16V8M12 8L9 11M12 8L15 11"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 20H5a2 2 0 0 1-2-2v-1a5 5 0 0 1 5-5h0M17 20h2a2 2 0 0 0 2-2v-1a5 5 0 0 0-5-5h0"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <p className="drop-primary">Drag &amp; drop an image here</p>
            <p className="drop-secondary">
              or <span className="drop-link">browse your files</span>
            </p>
            <p className="drop-hint">JPG, PNG, WEBP, GIF · Min {MIN_LONG_SIDE}×{MIN_SHORT_SIDE}px</p>
          </div>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="upload-error" role="alert" aria-live="assertive">
          <svg
            className="error-icon"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="7" fill="var(--error)" />
            <path
              d="M8 5v3.5M8 10.5v.5"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="error-text">{error}</span>
          <button
            type="button"
            className="error-dismiss"
            onClick={dismissError}
            aria-label="Dismiss error"
          >
            <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 2l8 8M10 2L2 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* ── Success / file name row ── */}
      {fileName && !error && (
        <p className="file-name" aria-live="polite">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="check-icon"
          >
            <circle cx="8" cy="8" r="7" fill="var(--accent)" />
            <path
              d="M5 8l2 2 4-4"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {fileName}
        </p>
      )}
    </div>
  );
}
