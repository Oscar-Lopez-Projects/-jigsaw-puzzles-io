/**
 * Sound effects using Web Audio API — no external files needed.
 * Lightweight, instant, and works in all modern browsers.
 */

let audioCtx: AudioContext | null = null;
let muted = localStorage.getItem('jigsaw_muted') === 'true';

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  localStorage.setItem('jigsaw_muted', String(value));
}

/** UI click sound for navigation buttons */
export function playClickSound() {
  if (muted) return;
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  } catch { /* audio not available */ }
}

/** Short "click" when a piece snaps into place */
export function playSnapSound() {
  if (muted) return;
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch { /* audio not available */ }
}

/** Wrong placement buzzer */
export function playWrongSound() {
  if (muted) return;
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio not available */ }
}

/** Celebration fanfare when puzzle is completed */
export function playWinSound() {
  if (muted) return;
  try {
    const ctx = getContext();
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    const startTime = ctx.currentTime;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + i * 0.12);

      gain.gain.setValueAtTime(0, startTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, startTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + i * 0.12 + 0.3);

      osc.start(startTime + i * 0.12);
      osc.stop(startTime + i * 0.12 + 0.3);
    });
  } catch { /* audio not available */ }
}
