import { BinauralPreset } from '../types/features15.ts';

export const BINAURAL_PRESETS: BinauralPreset[] = [
  {
    id: 'alpha-flow',
    name: 'Alpha Flow State',
    baseFreq: 210,
    beatFreq: 10,
    waveType: 'sine',
    description: 'Promotes relaxed alertness, flow state, and creative problem solving.',
    recommendedUse: 'Daily study, reading, writing, and flow state tasks.',
    brainwaveBand: 'Alpha (8-13 Hz)',
  },
  {
    id: 'beta-focus',
    name: 'Beta High Concentration',
    baseFreq: 250,
    beatFreq: 18,
    waveType: 'sine',
    description: 'Enhances executive attention, active analytical thought, and rapid coding.',
    recommendedUse: 'Coding, math problem solving, and complex logic puzzles.',
    brainwaveBand: 'Beta (13-30 Hz)',
  },
  {
    id: 'gamma-cognition',
    name: 'Gamma Peak Cognition',
    baseFreq: 300,
    beatFreq: 40,
    waveType: 'sine',
    description: 'Associated with high-level information processing, memory recall, and binding.',
    recommendedUse: 'Exam prep, rapid recall, and intense 25-minute sprints.',
    brainwaveBand: 'Gamma (30-50 Hz)',
  },
  {
    id: 'theta-creativity',
    name: 'Theta Deep Reflection',
    baseFreq: 160,
    beatFreq: 6,
    waveType: 'sine',
    description: 'Facilitates deep conceptual thinking, intuition, and architectural synthesis.',
    recommendedUse: 'System design, creative thinking, and architectural planning.',
    brainwaveBand: 'Theta (4-8 Hz)',
  },
];

class BinauralBeatsEngine {
  private audioCtx: AudioContext | null = null;
  private oscLeft: OscillatorNode | null = null;
  private oscRight: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private mergerNode: ChannelMergerNode | null = null;
  private isPlaying = false;
  private currentVolume = 0.3; // Default comfortable level
  private activePreset: BinauralPreset = BINAURAL_PRESETS[0];

  public getStatus() {
    return {
      isPlaying: this.isPlaying,
      volume: this.currentVolume,
      preset: this.activePreset,
    };
  }

  private initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  public start(preset: BinauralPreset = this.activePreset, volume = this.currentVolume) {
    this.stop();
    this.initAudio();
    if (!this.audioCtx) return;

    this.activePreset = preset;
    this.currentVolume = Math.max(0, Math.min(1, volume));

    const now = this.audioCtx.currentTime;

    // Create Stereo Channel Merger
    this.mergerNode = this.audioCtx.createChannelMerger(2);

    // Master Gain Node for volume and clickless ramping
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(0.001, now);
    this.gainNode.gain.linearRampToValueAtTime(this.currentVolume * 0.15, now + 0.5); // Attenuate pure sine waves safely

    // Left Channel Oscillator (Carrier)
    this.oscLeft = this.audioCtx.createOscillator();
    this.oscLeft.type = preset.waveType;
    this.oscLeft.frequency.setValueAtTime(preset.baseFreq, now);

    // Right Channel Oscillator (Carrier + Beat Frequency)
    this.oscRight = this.audioCtx.createOscillator();
    this.oscRight.type = preset.waveType;
    this.oscRight.frequency.setValueAtTime(preset.baseFreq + preset.beatFreq, now);

    // Route Left to channel 0, Right to channel 1
    this.oscLeft.connect(this.mergerNode, 0, 0);
    this.oscRight.connect(this.mergerNode, 0, 1);

    // Route Merger -> Gain -> Destination
    this.mergerNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    this.oscLeft.start(now);
    this.oscRight.start(now);
    this.isPlaying = true;
  }

  public setVolume(volume: number) {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.linearRampToValueAtTime(this.currentVolume * 0.15, now + 0.1);
    }
  }

  public stop() {
    if (!this.isPlaying) return;

    if (this.gainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.3);
    }

    setTimeout(() => {
      try {
        this.oscLeft?.stop();
        this.oscRight?.stop();
        this.oscLeft?.disconnect();
        this.oscRight?.disconnect();
        this.mergerNode?.disconnect();
        this.gainNode?.disconnect();
      } catch {
        // cleanup ignore
      }
      this.oscLeft = null;
      this.oscRight = null;
      this.mergerNode = null;
      this.gainNode = null;
      this.isPlaying = false;
    }, 350);
  }
}

export const binauralBeatsEngine = new BinauralBeatsEngine();

