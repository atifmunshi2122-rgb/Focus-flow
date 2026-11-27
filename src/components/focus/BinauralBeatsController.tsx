import React, { useState, useEffect } from 'react';
import { binauralBeatsEngine, BINAURAL_PRESETS } from '../../lib/binauralBeats.ts';
import { BinauralPreset } from '../../types/features15.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Headphones,
  Play,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  Info,
} from 'lucide-react';

export const BinauralBeatsController: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState<boolean>(() => binauralBeatsEngine.getStatus().isPlaying);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    () => binauralBeatsEngine.getStatus().preset?.id || BINAURAL_PRESETS[0].id
  );
  const [volume, setVolume] = useState<number>(0.3);
  const [showHeadphoneTip, setShowHeadphoneTip] = useState(false);

  const activePreset = BINAURAL_PRESETS.find((p) => p.id === selectedPresetId) || BINAURAL_PRESETS[0];

  // Keep playing in background across tabs & stay synced if toggled from My Home Vinyl
  useEffect(() => {
    const syncStatus = () => {
      const st = binauralBeatsEngine.getStatus();
      setIsPlaying((prev) => (prev === st.isPlaying ? prev : st.isPlaying));
      const activeId = st.preset?.id;
      if (activeId) {
        setSelectedPresetId((prev) => (prev === activeId ? prev : activeId));
      }
    };
    syncStatus();
    const id = window.setInterval(syncStatus, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleTogglePlay = () => {
    if (isPlaying) {
      binauralBeatsEngine.stop();
      setIsPlaying(false);
    } else {
      binauralBeatsEngine.start(activePreset, volume);
      setIsPlaying(true);
      setShowHeadphoneTip(true);
      setTimeout(() => setShowHeadphoneTip(false), 5000);
    }
  };

  const handleSelectPreset = (preset: BinauralPreset) => {
    setSelectedPresetId(preset.id);
    if (isPlaying) {
      binauralBeatsEngine.start(preset, volume);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    binauralBeatsEngine.setVolume(newVol);
  };

  return (
    <div className="p-4 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-3 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`p-2 rounded-xl transition-colors ${
              isPlaying
                ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
            }`}
          >
            <Headphones className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-bold text-[var(--ff-text-primary)] whitespace-nowrap">Web Audio Binaural Beats</h4>
              <ThemeBadge tone="accent" className="shrink-0">Native Stereo</ThemeBadge>
            </div>
            <p className="text-[11px] text-[var(--ff-text-muted)]">
              Pure dual-oscillator frequency difference. Wear stereo headphones for brainwave entrainment.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Volume Slider */}
          <div className="flex items-center gap-1.5 bg-[var(--ff-surface-muted)] px-2.5 py-1 rounded-xl border border-[var(--ff-border)]">
            {volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
            )}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 accent-[var(--ff-accent)] h-1 cursor-pointer"
            />
          </div>

          <ThemeButton
            variant={isPlaying ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleTogglePlay}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 mr-1 text-rose-300" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Play Beats
              </>
            )}
          </ThemeButton>
        </div>
      </div>

      {/* Preset Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {BINAURAL_PRESETS.map((p) => {
          const isSelected = p.id === selectedPresetId;
          return (
            <button
              key={p.id}
              onClick={() => handleSelectPreset(p)}
              className={`px-2.5 py-1 text-xs rounded-xl border transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[var(--ff-accent)]/15 border-[var(--ff-accent)] text-[var(--ff-text-primary)] font-bold'
                  : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              <span>{p.name}</span>
              <span className="text-[10px] opacity-70 font-mono">({p.beatFreq}Hz)</span>
            </button>
          );
        })}
      </div>

      {/* Active Preset Frequency Breakdown */}
      <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center justify-between pt-1 border-t border-[var(--ff-border)]">
        <span>
          Left Carrier: <strong className="text-[var(--ff-text-primary)]">{activePreset.baseFreq} Hz</strong> • Right:{' '}
          <strong className="text-[var(--ff-text-primary)]">{activePreset.baseFreq + activePreset.beatFreq} Hz</strong> (Δ{' '}
          {activePreset.beatFreq} Hz {activePreset.brainwaveBand})
        </span>
        <span className="hidden sm:inline italic">{activePreset.recommendedUse}</span>
      </div>

      {showHeadphoneTip && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>Stereo headphones required: Each ear receives a distinct frequency to stimulate neural synchrony.</span>
        </div>
      )}
    </div>
  );
};

