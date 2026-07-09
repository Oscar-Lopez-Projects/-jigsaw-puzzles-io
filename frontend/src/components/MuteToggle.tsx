import { useState } from 'react';
import { isMuted, setMuted } from '../lib/sounds';

export default function MuteToggle() {
  const [muted, setMutedState] = useState(isMuted());

  const toggle = () => {
    const newVal = !muted;
    setMuted(newVal);
    setMutedState(newVal);
  };

  return (
    <button
      type="button"
      className="mute-toggle"
      onClick={toggle}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2L4 5.5H1.5v5H4L8 14V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M11 5.5l4 5M15 5.5l-4 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2L4 5.5H1.5v5H4L8 14V2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M11 4.5a4.5 4.5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M12.5 2.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
