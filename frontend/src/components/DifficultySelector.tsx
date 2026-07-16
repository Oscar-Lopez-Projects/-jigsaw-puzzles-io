import './DifficultySelector.css';

export type PieceCount = 10 | 25 | 50 | 100 | 150 | 300;

interface DifficultySelectorProps {
  selected: PieceCount | null;
  onSelect: (count: PieceCount) => void;
}

interface Option {
  count: PieceCount;
  label: string;
  description: string;
}

const OPTIONS: Option[] = [
  {
    count: 10,
    label: '10 Pieces',
    description: 'Beginner',
  },
  {
    count: 25,
    label: '25 Pieces',
    description: 'Easy',
  },
  {
    count: 50,
    label: '50 Pieces',
    description: 'Medium',
  },
  {
    count: 100,
    label: '100 Pieces',
    description: 'Hard',
  },
  {
    count: 150,
    label: '150 Pieces',
    description: 'Expert',
  },
  {
    count: 300,
    label: '300 Pieces',
    description: 'Master',
  },
];

export default function DifficultySelector({ selected, onSelect }: DifficultySelectorProps) {
  return (
    <div className="difficulty-section">
      <h2 className="section-label">2. Choose difficulty</h2>

      <div className="difficulty-grid" role="radiogroup" aria-label="Puzzle piece count">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.count;
          return (
            <button
              key={opt.count}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`difficulty-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(opt.count)}
            >
              <span className="difficulty-count">{opt.count}</span>
              <span className="difficulty-label">{opt.label}</span>
              <span className="difficulty-desc">{opt.description}</span>
              {isSelected && (
                <span className="difficulty-check" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="var(--accent)" />
                    <path
                      d="M5 8l2 2 4-4"
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
