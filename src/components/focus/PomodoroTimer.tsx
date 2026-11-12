import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, TimerMode } from '../../context/AppContext.tsx';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  ConfirmationBurst,
  ValidationMessage,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';
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
  const [customError, setCustomError] = useState<string | null>(null);
  const [resetSpinCount, setResetSpinCount] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevTimeRef = useRef(timeLeft);
  const prevRunningRef = useRef(isRunning);
  const { isDisabled } = useMotionPreferences();

  useEffect(() => {
    if (prevRunningRef.current && prevTimeRef.current > 0 && timeLeft === 0) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 2400);
      prevTimeRef.current = timeLeft;
      prevRunningRef.current = isRunning;
      return () => clearTimeout(timer);
    }
    prevTimeRef.current = timeLeft;
    prevRunningRef.current = isRunning;
  }, [timeLeft, isRunning]);

  const clampedTimeLeft = Math.max(0, Math.floor(Number.isFinite(timeLeft) ? timeLeft : 0));
  const safeTotalDuration = Math.max(1, Math.floor(Number.isFinite(totalDuration) ? totalDuration : 1500));
  const mins = Math.floor(clampedTimeLeft / 60);
  const secs = clampedTimeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const size = 280;
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = Math.min(1, Math.max(0, (safeTotalDuration - clampedTimeLeft) / safeTotalDuration));
  const strokeDashoffset = circumference - progressRatio * circumference;

  const modeTokenColors: Record<TimerMode, { ring: string; text: string; aura: string }> = {
    work: {
      ring: 'var(--ff-accent)',
      text: 'var(--ff-accent-text)',
      aura: 'var(--ff-accent-soft)',
    },
    short_break: {
      ring: 'var(--ff-success)',
      text: 'var(--ff-success)',
      aura: 'var(--ff-success-soft)',
    },
    long_break: {
      ring: 'var(--ff-info)',
      text: 'var(--ff-info)',
      aura: 'var(--ff-info-soft, var(--ff-accent-soft))',
    },
  };

  const currentModeColors = modeTokenColors[timerMode];

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInputMinutes.trim();
    const parsed = Number(trimmed);
    if (trimmed !== '' && Number.isInteger(parsed) && parsed >= 1 && parsed <= 180) {
      setCustomError(null);
      setCustomDuration(parsed);
      setShowCustomModal(false);
    } else {
      setCustomError('Please enter a whole number between 1 and 180 minutes.');
    }
  };

  const handleReset = () => {
    setResetSpinCount((c) => c + 1);
    resetTimer();
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
    <ThemeCard className="relative overflow-hidden flex flex-col items-center justify-center p-6 sm:p-8">
      {/* Subtle Break vs Focus Ambient Atmosphere Layer */}
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: isRunning ? 0.55 : timerMode === 'work' ? 0.16 : 0.34,
          scale: isRunning && !isDisabled ? [1, 1.06, 1] : 1,
        }}
        transition={
          isRunning && !isDisabled
            ? {
                opacity: { duration: 0.4 },
                scale: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
              }
            : { duration: isDisabled ? 0.01 : 0.45, ease: MOTION_EASING.standard }
        }
        className="absolute inset-x-0 top-12 mx-auto w-72 h-72 rounded-full pointer-events-none blur-3xl"
        style={{ background: currentModeColors.aura }}
      />

      {/* Mode Switcher Segmented Tabs */}
      <div className="relative z-10 mb-8">
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
      <div className="relative z-10 mb-6 min-h-[2rem] flex items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          {activeTask ? (
            <motion.div
              key={`linked-${activeTask.id}`}
              initial={isDisabled ? false : { opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium max-w-sm truncate border"
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
            </motion.div>
          ) : (
            <motion.div
              key="unlinked-session"
              initial={isDisabled ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION_DURATION.dropdown }}
              className="flex items-center gap-2 text-xs text-[var(--ff-text-muted)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Independent Session (No task linked)</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Circular Progress Display */}
      <div className="relative z-10 flex items-center justify-center my-2">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90 transition-[filter] duration-300"
          style={{
            filter: isRunning
              ? `drop-shadow(0 0 14px color-mix(in oklab, ${currentModeColors.ring} 38%, transparent))`
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
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            animate={{
              strokeDashoffset,
              stroke: currentModeColors.ring,
            }}
            transition={{
              strokeDashoffset: { duration: isDisabled ? 0.01 : 0.5, ease: 'linear' },
              stroke: { duration: isDisabled ? 0.01 : 0.35, ease: MOTION_EASING.standard },
            }}
            strokeLinecap="round"
          />
        </svg>

        {/* Center Countdown Display */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <ConfirmationBurst show={showCelebration} label="Session Complete!" />
          <motion.span
            animate={{ scale: isRunning && !isDisabled ? 1.03 : 1 }}
            transition={{ duration: 0.3, ease: MOTION_EASING.standard }}
            className="text-5xl font-extrabold font-mono tabular-nums text-[var(--ff-text-primary)]"
          >
            {timeFormatted}
          </motion.span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={timerMode}
              initial={isDisabled ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: MOTION_DURATION.dropdown * 0.8 }}
              className="text-xs font-semibold uppercase tracking-wider mt-1.5"
              style={{ color: currentModeColors.text }}
            >
              {timerMode === 'work'
                ? 'Deep Focus'
                : timerMode === 'short_break'
                ? 'Short Pause'
                : 'Rest & Recharge'}
            </motion.span>
          </AnimatePresence>
          <span className="text-[11px] text-[var(--ff-text-muted)] mt-1">
            {isRunning ? 'Session in progress' : 'Ready to start'}
          </span>
        </div>
      </div>

      {/* Main Action Controls */}
      <div className="relative z-10 flex items-center gap-4 mt-8">
        <ThemeButton
          variant="secondary"
          size="md"
          onClick={handleReset}
          className="p-3 rounded-full"
          title="Reset timer"
          aria-label="Reset timer"
        >
          <motion.span
            animate={{ rotate: resetSpinCount * -360 }}
            transition={{ duration: isDisabled ? 0.01 : 0.42, ease: MOTION_EASING.decelerate }}
            className="inline-flex"
          >
            <RotateCcw className="w-5 h-5" />
          </motion.span>
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isRunning ? 'pause-btn' : 'play-btn'}
              initial={isDisabled ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: MOTION_DURATION.micro }}
              className="inline-flex items-center gap-2"
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
            </motion.span>
          </AnimatePresence>
        </ThemeButton>

        <ThemeButton
          variant="secondary"
          size="md"
          onClick={() => {
            setCustomError(null);
            setShowCustomModal(true);
          }}
          className="p-3 rounded-full"
          title="Set custom duration"
          aria-label="Custom duration"
        >
          <Sliders className="w-5 h-5" />
        </ThemeButton>
      </div>

      {/* Quick Settings Toggles */}
      <div className="relative z-10 flex items-center gap-6 mt-8 pt-6 border-t border-[var(--ff-border-color)] text-xs text-[var(--ff-text-muted)]">
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
            className="w-4 h-4 transition-colors"
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
        <form onSubmit={handleCustomSubmit} noValidate className="space-y-4">
          <ThemeInput
            type="number"
            min="1"
            max="180"
            step="1"
            required
            autoFocus
            value={customInputMinutes}
            onChange={(e) => {
              setCustomInputMinutes(e.target.value);
              if (customError) setCustomError(null);
            }}
            className="font-mono tabular-nums"
          />
          <ValidationMessage message={customError} tone="error" />
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
