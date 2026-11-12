// Web Audio API sound generator for Focus timer and Finance events
// Zero external asset dependencies - works natively offline and in any browser!

let audioCtx: AudioContext | null = null;

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

/**
 * Unlock / resume Web Audio API inside a direct user gesture (e.g., Start/Pause click)
 * so later background timer completion chimes can play reliably without autoplay errors.
 */
export function unlockAudioContext(): void {
  try {
    const ctx = createAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Ignore browser autoplay policy rejection if not triggered by user gesture
      });
    }
  } catch {
    // Ignore AudioContext initialization failures in restricted environments
  }
}

function getAudioContext(): AudioContext | null {
  try {
    const ctx = createAudioContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Ignore autoplay resume rejection when called from background timer callback
      });
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Focus session completed: Warm, triumphant three-tone chime (C5 -> E5 -> G5 -> C6)
 */
export function playFocusCompleteSound(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);

    gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.14);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + idx * 0.14 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + idx * 0.14);
    osc.stop(ctx.currentTime + idx * 0.14 + 0.85);
  });
}

/**
 * Break ended chime: Gentle reminder bell (A4 -> E5)
 */
export function playBreakEndSound(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [440, 659.25];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);

    gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.18);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.18 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.18 + 0.9);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + idx * 0.18);
    osc.stop(ctx.currentTime + idx * 0.18 + 0.95);
  });
}

/**
 * Financial achievement: Satisfying crisp payment confirmation chime
 */
export function playCashSound(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
  osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08); // E6

  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.45);
  osc2.start(ctx.currentTime + 0.08);
  osc2.stop(ctx.currentTime + 0.45);
}

/**
 * Subtle UI click/tap
 */
export function playClickSound(enabled = true) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.04);

  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.04);
}
