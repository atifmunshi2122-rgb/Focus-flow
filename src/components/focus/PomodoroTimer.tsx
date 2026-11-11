import React, { useState } from 'react';
import { useApp, TimerMode } from '../../context/AppContext.tsx';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Sparkles,
  Volume2,
  VolumeX,
  Target,
} from 'lucide-react';

export const PomodoroTimer: React.FC = () => {
  const {
    timerMode,
    timeLeft,
    totalDuration,
    isRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    switchTimerMode,
    activeTask,
    setActiveTaskId,
    setCustomDuration,
    settings,
    updateSettings,
  } = useApp();

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customInputMinutes, setCustomInputMinutes] = useState('25');

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const size = 280;
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = totalDuration > 0 ? (totalDuration - timeLeft) / totalDuration : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  const modeTokenColors: Record<TimerMode, { ring: string; text: string }> = {
    work: {
      ring: 'var(--ff-accent)',
      text: 'var(--ff-accent-text)',
    },
    short_break: {
      ring: 'var(--ff-success)',
      text: 'var(--ff-success)',
    },
    long_break: {
      ring: 'var(--ff-info)',
      text: 'var(--ff-info)',
    },
  };

  const currentModeColors = modeTokenColors[timerMode];

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customInputMinutes, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 180) {
      setCustomDuration(parsed);
      setShowCustomModal(false);
    }
  };

  const toggleSound = () => {
    if (settings) {
      void updateSettings({ soundEnabled: !settings.soundEnabled });
    }
  };

  const toggleAutoSwitch = () => {
    if (settings) {
      void updateSettings({ autoSwitchSessions: !settings.autoSwitchSessions });
    }
  };

  return (
    <ThemeCard className="flex flex-col items-center justify-center p-6 sm:p-8">
      {/* Mode Switcher Segmented Tabs */}
      <div className="mb-8">
        <ThemeSegmentedControl<TimerMode>
          ariaLabel="Pomodoro timer mode"
          value={timerMode}
          onChange={(mode) => switchTimerMode(mode)}
          options={[
            { id: 'work', label: `Focus (${settings?.pomodoroWorkDuration || 25}m)` },
            { id: 'short_break', label: `Short Break (${settings?.shortBreakDuration || 5}m)` },
            { id: 'long_break', label: `Long Break (${settings?.longBreakDuration || 15}m)` },
          ]}
        />
      </div>

      {/* Linked Task Indicator */}
      {activeTask ? (
        <div
          className="mb-6 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium max-w-sm truncate border"
          style={{
            background: 'var(--ff-surface-muted)',
            borderColor: 'var(--ff-border-color)',
            color: 'var(--ff-text-primary)',
          }}
        >
          <Target className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
          <span className="truncate">
            Focusing on: <strong>{activeTask.title}</strong>
          </span>
          <button
            type="button"
            onClick={() => setActiveTaskId(null)}
            className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] ml-1 text-xs"
            title="Unlink task"
            aria-label="Unlink task"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-2 text-xs text-[var(--ff-text-muted)]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Independent Session (No task linked)</span>
        </div>
      )}

      {/* Circular Progress Display */}
      <div className="relative flex items-center justify-center my-2">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          style={{
            filter: isRunning
              ? 'drop-shadow(0 0 14px color-mix(in oklab, var(--ff-accent) 35%, transparent))'
              : undefined,
          }}
          aria-hidden="true"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke="var(--ff-surface-muted)"
            fill="transparent"
          />

          {/* Active Animated Progress Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={currentModeColors.ring}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-linear"
          />
        </svg>

        {/* Center Countdown Display */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-5xl font-extrabold font-mono tabular-nums text-[var(--ff-text-primary)]">
            {timeFormatted}
          </span>
          <span
            className="text-xs font-semibold uppercase tracking-wider mt-1.5"
            style={{ color: currentModeColors.text }}
          >
            {timerMode === 'work'
              ? 'Deep Focus'
              : timerMode === 'short_break'
              ? 'Short Pause'
              : 'Rest & Recharge'}
          </span>
          <span className="text-[11px] text-[var(--ff-text-muted)] mt-1">
            {isRunning ? 'Session in progress' : 'Ready to start'}
          </span>
        </div>
      </div>

      {/* Main Action Controls */}
      <div className="flex items-center gap-4 mt-8">
        <ThemeButton
          variant="secondary"
          size="md"
          onClick={resetTimer}
          className="p-3 rounded-full"
          title="Reset timer"
          aria-label="Reset timer"
        >
          <RotateCcw className="w-5 h-5" />
        </ThemeButton>

        <ThemeButton
          variant={isRunning ? 'secondary' : 'primary'}
          size="lg"
          onClick={isRunning ? pauseTimer : startTimer}
          className="px-8 py-3.5 font-bold"
          style={
            isRunning
              ? {
                  background: 'var(--ff-warning)',
                  color: '#09090b',
                  borderColor: 'transparent',
                }
              : undefined
          }
        >
          {isRunning ? (
            <>
              <Pause className="w-5 h-5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current ml-0.5" />
              <span>{timeLeft < totalDuration ? 'Resume' : 'Start Focus'}</span>
            </>
          )}
        </ThemeButton>

        <ThemeButton
          variant="secondary"
          size="md"
          onClick={() => setShowCustomModal(true)}
          className="p-3 rounded-full"
          title="Set custom duration"
          aria-label="Custom duration"
        >
          <Sliders className="w-5 h-5" />
        </ThemeButton>
      </div>

      {/* Quick Settings Toggles */}
      <div className="flex items-center gap-6 mt-8 pt-6 border-t border-[var(--ff-border-color)] text-xs text-[var(--ff-text-muted)]">
        <button
          type="button"
          onClick={toggleSound}
          className="flex items-center gap-1.5 hover:text-[var(--ff-text-primary)] transition-colors"
        >
          {settings?.soundEnabled ? (
            <Volume2 className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
          <span>Sound {settings?.soundEnabled ? 'Enabled' : 'Muted'}</span>
        </button>

        <button
          type="button"
          onClick={toggleAutoSwitch}
          className="flex items-center gap-1.5 hover:text-[var(--ff-text-primary)] transition-colors"
        >
          <CheckCircle2
            className="w-4 h-4"
            style={{
              color: settings?.autoSwitchSessions
                ? 'var(--ff-accent-text)'
                : 'var(--ff-text-muted)',
            }}
          />
          <span>Auto-Switch {settings?.autoSwitchSessions ? 'On' : 'Off'}</span>
        </button>
      </div>

      {/* Custom Duration Modal */}
      <ThemeModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        title="Custom Duration"
        subtitle="Enter target duration in minutes (1 - 180 min)"
        maxWidthClass="max-w-xs"
      >
        <form onSubmit={handleCustomSubmit} className="space-y-4">
          <ThemeInput
            type="number"
            min="1"
            max="180"
            autoFocus
            value={customInputMinutes}
            onChange={(e) => setCustomInputMinutes(e.target.value)}
            className="font-mono tabular-nums"
          />
          <div className="flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setShowCustomModal(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm">
              Set Duration
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </ThemeCard>
  );
};
