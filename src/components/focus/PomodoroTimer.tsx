import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TimerEngineMode, TimerMode, useApp } from '../../context/AppContext.tsx';
import { AmbientPreset } from '../../lib/ambientAudio.ts';
import { api } from '../../lib/api.ts';
import { saveTimerState } from '../../lib/timerEngine.ts';
import { StudySubject, StudyTopic } from '../../types/study.ts';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  ConfirmationBurst,
  InteractiveSurface3D,
  RollingTimerDigits,
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
  Maximize2,
  Minimize2,
  Music,
  Save,
  X,
  BookOpen,
  GraduationCap,
} from 'lucide-react';

const AMBIENT_OPTIONS: Array<{ id: AmbientPreset; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'drone', label: 'Warm Drone' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'cafe', label: 'Soft Cafe' },
];

export const PomodoroTimer: React.FC = () => {
  const {
    timerEngine,
    setTimerEngine,
    timerMode,
    timeLeft,
    totalDuration,
    stopwatchElapsed,
    isRunning,
    completedCycleCount,
    startTimer,
    pauseTimer,
    resetTimer,
    saveStopwatchSession,
    switchTimerMode,
    activeTask,
    setActiveTaskId,
    setCustomDuration,
    settings,
    updateSettings,
    fullScreenFocus,
    setFullScreenFocus,
    ambientPreset,
    ambientVolume,
    setAmbientSound,
    activeStudySubjectCode,
    setActiveStudySubjectCode,
    activeStudyTopicId,
    setActiveStudyTopicId,
    activeStudyActivityType,
    setActiveStudyActivityType,
  } = useApp();

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customInputMinutes, setCustomInputMinutes] = useState('25');
  const [customError, setCustomError] = useState<string | null>(null);
  const [resetSpinCount, setResetSpinCount] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevCycleCountRef = useRef(completedCycleCount);
  const { isDisabled, profile } = useMotionPreferences();

  // Study Topic Linkage Modal State
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [studySubjects, setStudySubjects] = useState<StudySubject[]>([]);
  const [studyTopics, setStudyTopics] = useState<StudyTopic[]>([]);
  const [modalSubjectCode, setModalSubjectCode] = useState<string>('');
  const [modalTopicId, setModalTopicId] = useState<string>('');
  const [modalActivityType, setModalActivityType] = useState<'study' | 'practice' | 'theory' | 'revision'>('study');
  const [loadingStudyData, setLoadingStudyData] = useState(false);

  useEffect(() => {
    if (!showStudyModal) return;
    let cancelled = false;
    setLoadingStudyData(true);
    api
      .getStudySubjects()
      .then((subs) => {
        if (cancelled) return [];
        setStudySubjects(subs);
        const initialCode = activeStudySubjectCode || subs[0]?.code || '';
        setModalSubjectCode(initialCode);
        return api.getStudyTopics(initialCode ? initialCode : undefined);
      })
      .then((tops) => {
        if (cancelled) return;
        setStudyTopics(tops);
        if (activeStudyTopicId && tops.some((t) => t.id === activeStudyTopicId)) {
          setModalTopicId(activeStudyTopicId);
        } else {
          setModalTopicId(tops[0]?.id || '');
        }
        setModalActivityType(activeStudyActivityType || 'study');
      })
      .catch((err) => {
        console.warn('Failed to load study entities for timer modal:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingStudyData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showStudyModal]);

  const handleSubjectChange = async (newCode: string) => {
    setModalSubjectCode(newCode);
    try {
      const tops = await api.getStudyTopics(newCode || undefined);
      setStudyTopics(tops);
      setModalTopicId(tops[0]?.id || '');
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyStudyLink = () => {
    const matchedTopic = studyTopics.find((t) => t.id === modalTopicId);
    const resolvedSubjectCode = modalSubjectCode || matchedTopic?.subjectCode || null;
    const resolvedTopicId = modalTopicId || null;
    setActiveStudySubjectCode(resolvedSubjectCode);
    setActiveStudyTopicId(resolvedTopicId);
    setActiveStudyActivityType(modalActivityType);
    saveTimerState({
      activeStudySubjectCode: resolvedSubjectCode,
      activeStudyTopicId: resolvedTopicId,
      activeStudyActivityType: modalActivityType,
    });
    setShowStudyModal(false);
  };

  const handleClearStudyLink = () => {
    setActiveStudySubjectCode(null);
    setActiveStudyTopicId(null);
    setActiveStudyActivityType(null);
    saveTimerState({
      activeStudySubjectCode: null,
      activeStudyTopicId: null,
      activeStudyActivityType: null,
    });
    setShowStudyModal(false);
  };

  useEffect(() => {
    if (completedCycleCount > prevCycleCountRef.current) {
      prevCycleCountRef.current = completedCycleCount;
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [completedCycleCount]);

  useEffect(() => {
    if (!fullScreenFocus) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreenFocus(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [fullScreenFocus, setFullScreenFocus]);

  const handleModeSwitch = (mode: TimerMode) => {
    setShowCelebration(false);
    switchTimerMode(mode);
  };

  const displaySeconds =
    timerEngine === 'stopwatch'
      ? Math.max(0, Math.floor(Number.isFinite(stopwatchElapsed) ? stopwatchElapsed : 0))
      : Math.max(0, Math.floor(Number.isFinite(timeLeft) ? timeLeft : 0));

  const safeTotalDuration = Math.max(
    1,
    Math.floor(Number.isFinite(totalDuration) ? totalDuration : 1500)
  );
  const mins = Math.floor(displaySeconds / 60);
  const secs = displaySeconds % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const baseSize = 280;
  const strokeWidth = 10;
  const radius = (baseSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressRatio =
    timerEngine === 'stopwatch'
      ? (displaySeconds % 60) / 60
      : Math.min(1, Math.max(0, (safeTotalDuration - displaySeconds) / safeTotalDuration));
  const strokeDashoffset = circumference - progressRatio * circumference;
  const tipAngle = progressRatio * 2 * Math.PI;
  const tipX = baseSize / 2 + radius * Math.cos(tipAngle);
  const tipY = baseSize / 2 + radius * Math.sin(tipAngle);

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

  const timerBody = (
    <>
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
        className="absolute inset-x-0 top-12 mx-auto w-56 h-56 sm:w-72 sm:h-72 max-w-[70vw] max-h-[70vw] rounded-full pointer-events-none blur-3xl"
        style={{ background: currentModeColors.aura }}
      />

      {/* Header Row: Engine Switcher & Fullscreen Toggle */}
      <div className="relative z-10 w-full flex flex-wrap items-center justify-between gap-2 mb-5">
        <ThemeSegmentedControl<TimerEngineMode>
          ariaLabel="Focus timer engine"
          value={timerEngine}
          onChange={setTimerEngine}
          options={[
            { id: 'pomodoro', label: 'Pomodoro' },
            { id: 'stopwatch', label: 'Stopwatch' },
            { id: 'countdown', label: 'Countdown' },
          ]}
        />

        <button
          type="button"
          onClick={() => setFullScreenFocus(!fullScreenFocus)}
          className="p-2 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
          title={fullScreenFocus ? 'Exit full-screen focus (Esc)' : 'Enter full-screen focus mode'}
          aria-label={fullScreenFocus ? 'Exit full-screen focus' : 'Enter full-screen focus'}
        >
          {fullScreenFocus ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Sub-Mode / Quick Duration Pills */}
      {timerEngine === 'pomodoro' && (
        <div className="relative z-10 mb-5">
          <ThemeSegmentedControl<TimerMode>
            ariaLabel="Pomodoro timer mode"
            value={timerMode}
            onChange={handleModeSwitch}
            options={[
              { id: 'work', label: `Focus (${settings?.pomodoroWorkDuration || 25}m)` },
              { id: 'short_break', label: `Short (${settings?.shortBreakDuration || 5}m)` },
              { id: 'long_break', label: `Long (${settings?.longBreakDuration || 15}m)` },
            ]}
          />
        </div>
      )}

      {timerEngine === 'countdown' && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-1.5 mb-5">
          {[10, 15, 30, 45, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setCustomDuration(m)}
              className="px-2.5 py-1 text-xs font-mono font-semibold border transition-colors"
              style={{
                borderRadius: 'var(--ff-radius-button)',
                borderColor:
                  Math.round(totalDuration / 60) === m
                    ? 'var(--ff-accent-border)'
                    : 'var(--ff-border-color)',
                background:
                  Math.round(totalDuration / 60) === m
                    ? 'var(--ff-accent-soft)'
                    : 'var(--ff-surface-subtle)',
                color:
                  Math.round(totalDuration / 60) === m
                    ? 'var(--ff-accent-text)'
                    : 'var(--ff-text-secondary)',
              }}
            >
              {m}m
            </button>
          ))}
        </div>
      )}

      {/* Linked Task & Study Indicators */}
      <div className="relative z-10 mb-5 min-h-[2rem] flex flex-wrap items-center justify-center gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {activeTask && (
            <motion.div
              key={`linked-${activeTask.id}`}
              layout
              initial={isDisabled ? false : { opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
              transition={profile.spring}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium max-w-xs truncate border"
              style={{
                background: 'var(--ff-surface-muted)',
                borderColor: 'var(--ff-border-color)',
                color: 'var(--ff-text-primary)',
              }}
            >
              <Target className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
              <span className="truncate">
                Focus: <strong>{activeTask.title}</strong>
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
          )}

          {activeStudySubjectCode || activeStudyTopicId ? (
            <motion.div
              key={`linked-study-${activeStudySubjectCode}-${activeStudyTopicId}`}
              layout
              initial={isDisabled ? false : { opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
              transition={profile.spring}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium max-w-xs border"
              style={{
                background: 'var(--ff-surface-muted)',
                borderColor: 'var(--ff-accent-border, var(--ff-border-color))',
                color: 'var(--ff-accent-text, var(--ff-text-primary))',
              }}
            >
              <button
                type="button"
                onClick={() => setShowStudyModal(true)}
                className="flex items-center gap-1.5 min-w-0 truncate hover:underline text-left"
                title="Change linked study subject or topic"
              >
                <GraduationCap className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                <span className="truncate">
                  Study: <strong>{activeStudySubjectCode || 'Topic'}</strong>
                  {activeStudyActivityType ? ` (${activeStudyActivityType})` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={handleClearStudyLink}
                className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] ml-1 text-xs shrink-0"
                title="Unlink study topic"
                aria-label="Unlink study topic"
              >
                ×
              </button>
            </motion.div>
          ) : (
            <button
              type="button"
              onClick={() => setShowStudyModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] rounded-full border border-dashed border-[var(--ff-border-color)] hover:border-[var(--ff-accent)] transition-colors min-h-[32px]"
              title="Link a Study Subject & Topic"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>+ Link Study</span>
            </button>
          )}

          {!activeTask && !(activeStudySubjectCode || activeStudyTopicId) && (
            <motion.div
              key="unlinked-session"
              initial={isDisabled ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION_DURATION.dropdown }}
              className="flex items-center gap-2 text-xs text-[var(--ff-text-muted)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Independent Session</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Circular Progress Display */}
      <div className="relative z-10 flex items-center justify-center my-2 w-full max-w-[280px] sm:max-w-[320px] aspect-square mx-auto">
        {/* Breathing ambient glow behind progress ring */}
        <motion.div
          aria-hidden="true"
          animate={
            isRunning && !isDisabled
              ? {
                  scale: [0.94, 1.05, 0.94],
                  opacity: [0.26, 0.52, 0.26],
                }
              : { scale: 1, opacity: 0.12 }
          }
          transition={
            isRunning && !isDisabled
              ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
          }
          className="absolute inset-0 rounded-full pointer-events-none blur-2xl"
          style={{
            background: currentModeColors.aura,
          }}
        />

        {/* Celebratory Concentric Radial Ripples */}
        <AnimatePresence>
          {showCelebration && !isDisabled && (
            <>
              <motion.div
                key="celebration-ripple-1"
                aria-hidden="true"
                initial={{ scale: 0.75, opacity: 0.85 }}
                animate={{ scale: 1.45, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded-full border-2 pointer-events-none"
                style={{
                  borderColor: 'var(--ff-success)',
                  boxShadow: '0 0 24px var(--ff-success)',
                }}
              />
              <motion.div
                key="celebration-ripple-2"
                aria-hidden="true"
                initial={{ scale: 0.72, opacity: 0.6 }}
                animate={{ scale: 1.65, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded-full border pointer-events-none"
                style={{
                  borderColor: 'var(--ff-accent)',
                }}
              />
            </>
          )}
        </AnimatePresence>

        <svg
          viewBox={`0 0 ${baseSize} ${baseSize}`}
          className="w-56 h-56 xs:w-64 xs:h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 max-w-[75vw] max-h-[75vw] transform -rotate-90 transition-[filter] duration-300 relative z-10"
          style={{
            filter: isRunning
              ? `drop-shadow(0 0 14px color-mix(in oklab, ${currentModeColors.ring} 38%, transparent))`
              : undefined,
          }}
          aria-hidden="true"
        >
          <circle
            cx={baseSize / 2}
            cy={baseSize / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke="var(--ff-surface-muted)"
            fill="transparent"
          />

          <motion.circle
            cx={baseSize / 2}
            cy={baseSize / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            animate={{
              strokeDashoffset,
              stroke: currentModeColors.ring,
            }}
            transition={{
              strokeDashoffset: { duration: isDisabled ? 0.01 : 0.45, ease: 'linear' },
              stroke: { duration: isDisabled ? 0.01 : 0.35, ease: MOTION_EASING.standard },
            }}
            strokeLinecap="round"
          />

          {progressRatio > 0.01 && (
            <motion.circle
              r={strokeWidth * 0.62}
              fill="var(--ff-bg-canvas)"
              stroke={currentModeColors.ring}
              strokeWidth={3}
              animate={{
                cx: tipX,
                cy: tipY,
                opacity: isRunning ? 1 : 0.8,
                scale: isRunning && !isDisabled ? [1, 1.16, 1] : 1,
              }}
              transition={{
                cx: { duration: isDisabled ? 0.01 : 0.45, ease: 'linear' },
                cy: { duration: isDisabled ? 0.01 : 0.45, ease: 'linear' },
                scale:
                  isRunning && !isDisabled
                    ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.2 },
              }}
              style={{
                filter: `drop-shadow(0 0 6px ${currentModeColors.ring})`,
              }}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-20">
          <ConfirmationBurst show={showCelebration} label="Session Complete!" />

          <motion.div
            animate={{ scale: isRunning && !isDisabled ? 1.02 : 1 }}
            transition={profile.spring}
            className="relative flex items-center justify-center min-h-[3.25rem] sm:min-h-[3.75rem]"
          >
            <RollingTimerDigits
              value={timeFormatted}
              className="text-4xl sm:text-5xl font-extrabold font-mono text-[var(--ff-text-primary)] tracking-tight"
            />
          </motion.div>

          <div className="relative overflow-hidden min-h-[1.25rem] flex items-center justify-center mt-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${timerEngine}-${timerMode}`}
                initial={isDisabled ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? undefined : { opacity: 0, y: -4 }}
                transition={{
                  duration: isDisabled ? 0.01 : MOTION_DURATION.micro,
                  ease: MOTION_EASING.decelerate,
                }}
                className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider block"
                style={{ color: currentModeColors.text }}
              >
                {timerEngine === 'stopwatch'
                  ? 'Open Stopwatch'
                  : timerEngine === 'countdown'
                    ? 'Custom Countdown'
                    : timerMode === 'work'
                      ? 'Deep Focus'
                      : timerMode === 'short_break'
                        ? 'Short Pause'
                        : 'Rest & Recharge'}
              </motion.span>
            </AnimatePresence>
          </div>

          <span className="text-[10px] sm:text-[11px] text-[var(--ff-text-muted)] mt-1">
            {isRunning ? 'Session in progress' : 'Ready to start'}
          </span>
        </div>
      </div>

      {/* Main Action Controls */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 mt-6">
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
          className="px-7 py-3.5 font-bold"
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
              <span>
                {timerEngine === 'stopwatch'
                  ? stopwatchElapsed > 0
                    ? 'Resume'
                    : 'Start Stopwatch'
                  : timeLeft < totalDuration
                    ? 'Resume'
                    : 'Start Focus'}
              </span>
            </>
          )}
        </ThemeButton>

        {timerEngine === 'stopwatch' ? (
          <ThemeButton
            variant="success"
            size="md"
            onClick={() => void saveStopwatchSession()}
            disabled={stopwatchElapsed < 30}
            title="Save elapsed time as a verified focus session (min 30s)"
          >
            <Save className="w-4 h-4" />
            <span>Log</span>
          </ThemeButton>
        ) : (
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
        )}
      </div>

      {/* Deterministic Ambient Soundscape Selector */}
      <div className="relative z-10 w-full mt-6 pt-5 border-t border-[var(--ff-border-color)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-[var(--ff-text-secondary)]">
            <Music className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" /> Ambient Soundscape
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.05"
              max="0.9"
              step="0.05"
              value={ambientVolume}
              onChange={(e) => void setAmbientSound(ambientPreset, Number(e.target.value))}
              className="w-20 accent-[var(--ff-accent)]"
              aria-label="Ambient soundscape volume"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {AMBIENT_OPTIONS.map((opt) => {
            const active = ambientPreset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => void setAmbientSound(opt.id)}
                className="px-2.5 py-1 text-[11px] font-semibold border transition-colors"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  borderColor: active ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
                  background: active ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                  color: active ? 'var(--ff-accent-text)' : 'var(--ff-text-muted)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Settings Toggles */}
      <div className="relative z-10 flex items-center gap-6 mt-4 pt-4 border-t border-[var(--ff-border-color)] text-xs text-[var(--ff-text-muted)]">
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
          <span>Chime {settings?.soundEnabled ? 'Enabled' : 'Muted'}</span>
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
    </>
  );

  return (
    <>
      <InteractiveSurface3D maxTilt={3}>
        <ThemeCard className="relative overflow-hidden flex flex-col items-center justify-center p-6 sm:p-7">
          {timerBody}
        </ThemeCard>
      </InteractiveSurface3D>

      {/* Distraction-Free Full-Screen Focus Overlay */}
      <AnimatePresence>
        {fullScreenFocus && (
          <motion.div
            initial={isDisabled ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 bg-[var(--ff-bg-canvas)]/95 backdrop-blur-xl overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="Full-Screen Deep Focus Mode"
          >
            <div className="relative w-full max-w-xl my-auto flex flex-col items-center justify-center p-6 sm:p-8 ff-card-elevated">
              <button
                type="button"
                onClick={() => setFullScreenFocus(false)}
                className="absolute top-4 right-4 p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
                title="Exit full-screen focus (Esc)"
                aria-label="Exit full-screen focus"
              >
                <X className="w-5 h-5" />
              </button>
              {activeTask && (
                <div className="mb-4 px-3.5 py-1.5 rounded-full bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-xs text-center max-w-sm flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                  <span className="text-[var(--ff-text-muted)]">Objective:</span>
                  <span className="font-semibold text-[var(--ff-text-primary)] truncate">{activeTask.title}</span>
                </div>
              )}
              {timerBody}
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-5">
                Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--ff-border-color)]">ESC</kbd> or click ✕ to exit full-screen focus mode
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Link Study Topic Modal */}
      <ThemeModal
        isOpen={showStudyModal}
        onClose={() => setShowStudyModal(false)}
        title="Link Study Topic to Focus"
        subtitle="Pomodoro focus time will automatically count toward your study analytics"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          {loadingStudyData ? (
            <div className="py-6 text-center text-xs text-[var(--ff-text-muted)]">
              Loading study topics...
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
                  Study Subject
                </label>
                <select
                  value={modalSubjectCode}
                  onChange={(e) => void handleSubjectChange(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                >
                  <option value="">-- None / Select Subject --</option>
                  {studySubjects.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
                  Topic from Syllabus (Optional)
                </label>
                <select
                  value={modalTopicId}
                  onChange={(e) => setModalTopicId(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                >
                  <option value="">-- General Subject Study --</option>
                  {studyTopics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.unit ? `[${t.unit}] ` : ''}{t.subtopic || t.topic}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
                  Activity Classification
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'study', label: 'Study' },
                      { id: 'practice', label: 'Practice' },
                      { id: 'theory', label: 'Theory' },
                      { id: 'revision', label: 'Revision' },
                    ] as const
                  ).map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setModalActivityType(type.id)}
                      className={`min-h-[44px] py-2 px-2 text-xs rounded-xl font-medium border text-center flex items-center justify-center transition-all ${
                        modalActivityType === type.id
                          ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-xs'
                          : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--ff-text-muted)] mt-1.5">
                  Selecting <strong>Practice</strong> will mark topic practice complete when session finishes. Standard study logs actual hours.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--ff-border-color)]">
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={handleClearStudyLink}
                  className="text-rose-400 hover:bg-rose-500/10 min-h-[44px]"
                >
                  Clear Link
                </ThemeButton>
                <div className="flex items-center gap-2">
                  <ThemeButton variant="ghost" size="sm" onClick={() => setShowStudyModal(false)} className="min-h-[44px]">
                    Cancel
                  </ThemeButton>
                  <ThemeButton
                    variant="primary"
                    size="sm"
                    onClick={handleApplyStudyLink}
                    disabled={!modalSubjectCode && !modalTopicId}
                    className="min-h-[44px]"
                  >
                    Apply Link
                  </ThemeButton>
                </div>
              </div>
            </>
          )}
        </div>
      </ThemeModal>
    </>
  );
};
