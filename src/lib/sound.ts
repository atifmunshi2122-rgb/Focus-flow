// Web Audio API sound generator for Focus timer, Tasks, Habits, Study, and Finance events
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
 * Normalize master volume between 0.0 and 1.0 (input is 0 to 100 percentage)
 */
function getMasterGain(volume?: number): number {
  if (volume === undefined || volume === null) return 0.7;
  return Math.max(0, Math.min(1, volume / 100));
}

/**
 * 1. Button press: very soft, high-frequency subtle acoustic tap
 */
export function playClickSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.035);

    gain.gain.setValueAtTime(0.05 * master, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Unsupported environment
  }
}

export const playButtonClickSound = playClickSound;

/**
 * 2. Task completion: gentle success chime (harmonized ascending pair E5 -> B5)
 */
export function playTaskCompleteSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 659.25, time: 0, dur: 0.35, gain: 0.18 }, // E5
      { freq: 987.77, time: 0.08, dur: 0.45, gain: 0.22 }, // B5
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * 3. Pomodoro start: subtle start tone (gentle ascending fifth C5 -> G5)
 */
export function playTimerStartSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 523.25, time: 0, dur: 0.22, gain: 0.14 }, // C5
      { freq: 783.99, time: 0.09, dur: 0.38, gain: 0.18 }, // G5
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * 4. Pomodoro pause: soft pause tone (calm descending tone G5 -> E5)
 */
export function playTimerPauseSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 783.99, time: 0, dur: 0.18, gain: 0.13 }, // G5
      { freq: 659.25, time: 0.07, dur: 0.28, gain: 0.11 }, // E5
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * 5. Pomodoro completion: pleasant completion sound (warm 4-tone chime C5 -> E5 -> G5 -> C6)
 */
export function playFocusCompleteSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.14);
      gain.gain.linearRampToValueAtTime(0.24 * master, ctx.currentTime + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.14 + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.85);
    });
  } catch {
    // Unsupported environment
  }
}

export const playPomodoroCompleteSound = playFocusCompleteSound;

/**
 * 6. Habit completion: small positive chime (two bright tones F#5 -> A#5)
 */
export function playHabitCompleteSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 739.99, time: 0, dur: 0.22, gain: 0.16 }, // F#5
      { freq: 932.33, time: 0.07, dur: 0.35, gain: 0.20 }, // A#5
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * 7. Study milestone completion: subtle success tone (scholarly triad D5 -> A5 -> D6)
 */
export function playStudyMilestoneSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 587.33, time: 0, dur: 0.25, gain: 0.15 }, // D5
      { freq: 880.00, time: 0.08, dur: 0.35, gain: 0.18 }, // A5
      { freq: 1174.66, time: 0.16, dur: 0.50, gain: 0.22 }, // D6
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * 8. Save success: soft confirmation sound (gentle two-tone ping G5 -> C6)
 */
export function playSaveSuccessSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 783.99, time: 0, dur: 0.16, gain: 0.14 }, // G5
      { freq: 1046.5, time: 0.06, dur: 0.30, gain: 0.16 }, // C6
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * 9. Error feedback: gentle, non-alarming notification tone (mellow warm tones F4 -> Db4)
 */
export function playErrorSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [
      { freq: 349.23, time: 0, dur: 0.16, gain: 0.12 }, // F4
      { freq: 277.18, time: 0.08, dur: 0.28, gain: 0.10 }, // Db4
    ];
    notes.forEach(({ freq, time, dur, gain: baseGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // Warm triangle wave avoids harsh buzzer feel
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.linearRampToValueAtTime(baseGain * master, ctx.currentTime + time + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + dur + 0.02);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * Break ended chime: Gentle reminder bell (A4 -> E5)
 */
export function playBreakEndSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const notes = [440, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.18);
      gain.gain.linearRampToValueAtTime(0.2 * master, ctx.currentTime + idx * 0.18 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.18 + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.18);
      osc.stop(ctx.currentTime + idx * 0.18 + 0.95);
    });
  } catch {
    // Unsupported environment
  }
}

/**
 * Financial achievement: Satisfying crisp payment confirmation chime
 */
export function playCashSound(enabled = true, volume = 70) {
  if (!enabled) return;
  const master = getMasterGain(volume);
  if (master <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08); // E6

    gain.gain.setValueAtTime(0.18 * master, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.45);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // Unsupported environment
  }
}

/**
 * Centralized Sound Manager interface for consistent access across components
 */
export const soundManager = {
  playButtonClick: playClickSound,
  playTaskComplete: playTaskCompleteSound,
  playTimerStart: playTimerStartSound,
  playTimerPause: playTimerPauseSound,
  playTimerComplete: playFocusCompleteSound,
  playHabitComplete: playHabitCompleteSound,
  playStudyMilestone: playStudyMilestoneSound,
  playSaveSuccess: playSaveSuccessSound,
  playError: playErrorSound,
  playCash: playCashSound,
  playBreakEnd: playBreakEndSound,
  unlock: unlockAudioContext,
};
