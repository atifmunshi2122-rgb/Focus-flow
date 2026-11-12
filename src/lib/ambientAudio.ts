export type AmbientPreset = 'off' | 'rain' | 'drone' | 'ocean' | 'cafe';

interface ActiveNodes {
  masterGain: GainNode;
  cleanup: () => void;
}

let sharedCtx: AudioContext | null = null;
let currentNodes: ActiveNodes | null = null;
let currentPreset: AmbientPreset = 'off';
let currentVolume = 0.35;

function getOrCreateContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

function createNoiseBuffer(ctx: AudioContext, durationSeconds = 4): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const frameCount = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < frameCount; i++) {
    const white = Math.random() * 2 - 1;
    // Brown-ish deterministic smoothing
    lastOut = (lastOut + 0.03 * white) / 1.03;
    data[i] = Math.max(-1, Math.min(1, lastOut * 3.2));
  }
  return buffer;
}

export function stopSoundscape(): void {
  if (currentNodes) {
    try {
      currentNodes.cleanup();
    } catch {
      // Ignore already disconnected Web Audio nodes
    }
    currentNodes = null;
  }
  currentPreset = 'off';
}

export function setSoundscapeVolume(volume: number): void {
  currentVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.35));
  if (currentNodes && sharedCtx) {
    currentNodes.masterGain.gain.setTargetAtTime(currentVolume, sharedCtx.currentTime, 0.08);
  }
}

export function getActiveSoundscape(): { preset: AmbientPreset; volume: number } {
  return { preset: currentPreset, volume: currentVolume };
}

export async function startSoundscape(
  preset: AmbientPreset,
  volume = currentVolume
): Promise<AmbientPreset> {
  if (preset === 'off') {
    stopSoundscape();
    return 'off';
  }

  const ctx = getOrCreateContext();
  if (!ctx) return 'off';

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return 'off';
    }
  }

  stopSoundscape();
  currentVolume = Math.max(0, Math.min(1, volume));
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  masterGain.gain.exponentialRampToValueAtTime(Math.max(0.01, currentVolume), ctx.currentTime + 0.45);
  masterGain.connect(ctx.destination);

  const stoppers: Array<() => void> = [];

  if (preset === 'rain' || preset === 'ocean' || preset === 'cafe') {
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, 5);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = preset === 'rain' ? 'lowpass' : preset === 'cafe' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(
      preset === 'rain' ? 780 : preset === 'cafe' ? 520 : 380,
      ctx.currentTime
    );
    filter.Q.setValueAtTime(preset === 'cafe' ? 0.65 : 0.9, ctx.currentTime);

    if (preset === 'ocean') {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.11, ctx.currentTime);
      lfoGain.gain.setValueAtTime(240, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      stoppers.push(() => {
        lfo.stop();
        lfo.disconnect();
      });
    }

    source.connect(filter);
    filter.connect(masterGain);
    source.start();
    stoppers.push(() => {
      source.stop();
      source.disconnect();
    });
  } else if (preset === 'drone') {
    const freqs = [110, 164.81, 220];
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.18, ctx.currentTime);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, ctx.currentTime);
    oscGain.connect(filter);
    filter.connect(masterGain);

    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.connect(oscGain);
      osc.start();
      stoppers.push(() => {
        osc.stop();
        osc.disconnect();
      });
    }
  }

  currentNodes = {
    masterGain,
    cleanup: () => {
      stoppers.forEach((fn) => fn());
      masterGain.disconnect();
    },
  };
  currentPreset = preset;
  return preset;
}
