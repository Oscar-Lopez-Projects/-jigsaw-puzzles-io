import { useState } from 'react';
import ImageUploader from './ImageUploader';
import DifficultySelector, { type PieceCount } from './DifficultySelector';
import './SoloPlayModal.css';

interface SoloPlayModalProps {
  onStart: (imageDataUrl: string, fileName: string, pieceCount: PieceCount) => void;
  onClose: () => void;
}

export default function SoloPlayModal({ onStart, onClose }: SoloPlayModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pieceCount, setPieceCount] = useState<PieceCount | null>(null);

  const canStart = selectedImage !== null && pieceCount !== null;

  return (
    <div className="solo-backdrop" onClick={onClose}>
      <div className="solo-modal" onClick={(e) => e.stopPropagation()}>
        <button className="solo-close" onClick={onClose}>✕</button>

        <h2 className="solo-title">🎯 Solo Play</h2>
        <p className="solo-subtitle">Pick any image from your device and choose how many pieces you want to solve.</p>

        <div className="solo-body">
          <ImageUploader
            selectedImage={selectedImage}
            fileName={fileName}
            onImageSelected={(dataUrl, name) => { setSelectedImage(dataUrl); setFileName(name); }}
            onImageCleared={() => { setSelectedImage(null); setFileName(null); }}
          />
          <DifficultySelector selected={pieceCount} onSelect={setPieceCount} />
        </div>

        <button
          type="button"
          className="solo-start-btn"
          disabled={!canStart}
          onClick={() => { if (selectedImage && pieceCount) onStart(selectedImage, fileName || 'Puzzle', pieceCount); }}
        >
          {canStart ? '🧩 Start Puzzle' : 'Select an image and difficulty'}
        </button>
      </div>
    </div>
  );
}
