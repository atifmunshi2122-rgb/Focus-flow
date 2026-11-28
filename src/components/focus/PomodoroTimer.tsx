import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TimerEngineMode, TimerMode, useApp } from '../../context/AppContext.tsx';
import { AmbientPreset } from '../../lib/ambientAudio.ts';
import { api } from '../../lib/api.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import { saveTimerState } from '../../lib/timerEngine.ts';
import { playAlertTone } from '../../lib/sound.ts';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '../../lib/desktopNotifications.ts';
import {
  computeFocusStreaks,
  computeSubjectFocusBreakdown,
  computePomodoroGoalProgress,
} from '../../lib/pomodoroAnalytics.ts';
import {
  syncUserLeaderboardStats,
} from '../../lib/leaderboardService.ts';
import { calculateFocusSessionXP } from '../../features/gamification/xp-calculator.ts';
import type { FocusSession } from '../../types/index.ts';
import type {
  PomodoroAlertTone,
  PomodoroGoal,
  PomodoroGoalType,
  PomodoroGoalMetric,
  PomodoroPreset,
  PomodoroInterruption,
} from '../../types/pomodoro.ts';
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
  RollingTimerDigits,
  SubtleConfetti,
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
  GraduationCap,
  SkipForward,
  Settings,
  Flame,
  Trophy,
  BarChart2,
  AlertCircle,
  Plus,
  Trash2,
  Bookmark,
  History,
  Check,
  Code2,
} from 'lucide-react';
import { BinauralBeatsController } from './BinauralBeatsController.tsx';
import { CodeTypingWarmupModal } from './CodeTypingWarmupModal.tsx';

const AMBIENT_OPTIONS: Array<{ id: AmbientPreset; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'drone', label: 'Warm Drone' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'cafe', label: 'Soft Cafe' },
];

const ALERT_TONES: Array<{ id: PomodoroAlertTone; label: string }> = [
  { id: 'chime', label: 'Ascending Chime (Harmonic)' },
  { id: 'bell', label: 'Temple Bell (Resonant)' },
  { id: 'digital', label: 'Digital Pulse (Crisp)' },
  { id: 'bowl', label: 'Singing Bowl (432Hz Calm)' },
  { id: 'gentle', label: 'Kalimba Triad (Soft)' },
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
    skipInterval,
    saveStopwatchSession,
    switchTimerMode,
    activeTask,
    setActiveTaskId,
    setCustomDuration,
    settings,
    updateSettings,
    pomodoroSettings,
    updatePomodoroSettings,
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
    activePresetId,
    applyPomodoroPreset,
    activeSessionId,
    firebaseUser,
    refreshKey,
    triggerRefresh,
    showToast,
    confirmAction,
  } = useApp();

  const userTimezone = settings?.timezone || DEFAULT_TIMEZONE;

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showInterruptionsModal, setShowInterruptionsModal] = useState(false);
  const [showManualLogModal, setShowManualLogModal] = useState(false);
  const [manualHours, setManualHours] = useState('1');
  const [manualMinutes, setManualMinutes] = useState('0');
  const [manualDate, setManualDate] = useState(() => getTodayDateString(userTimezone));
  const [manualSubjectCode, setManualSubjectCode] = useState('');
  const [manualTopicId, setManualTopicId] = useState('');
  const [manualActivityType, setManualActivityType] = useState<'study' | 'practice' | 'theory' | 'revision'>('study');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [customInputMinutes, setCustomInputMinutes] = useState('25');
  const [customError, setCustomError] = useState<string | null>(null);
  const [resetSpinCount, setResetSpinCount] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isTypingWarmupOpen, setIsTypingWarmupOpen] = useState(false);
  const prevCycleCountRef = useRef(completedCycleCount);
  const { isDisabled, profile } = useMotionPreferences();

  const isPaused =
    !isRunning &&
    (timerEngine === 'stopwatch'
      ? stopwatchElapsed > 0
      : timeLeft < totalDuration && timeLeft > 0);

  // Sessions, goals, presets, and interruptions cache
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [goals, setGoals] = useState<PomodoroGoal[]>([]);
  const [presets, setPresets] = useState<PomodoroPreset[]>([]);
  const [sessionInterruptions, setSessionInterruptions] = useState<PomodoroInterruption[]>([]);

  // Preset Form State
  const [presetName, setPresetName] = useState('');
  const [presetWork, setPresetWork] = useState(25);
  const [presetShort, setPresetShort] = useState(5);
  const [presetLong, setPresetLong] = useState(15);
  const [presetInterval, setPresetInterval] = useState(4);
  const [presetSaving, setPresetSaving] = useState(false);

  // Goal Form State
  const [goalTitle, setGoalTitle] = useState('');
  const [goalType, setGoalType] = useState<PomodoroGoalType>('daily');
  const [goalMetric, setGoalMetric] = useState<PomodoroGoalMetric>('focus_minutes');
  const [goalTarget, setGoalTarget] = useState(120);
  const [goalSaving, setGoalSaving] = useState(false);

  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission | 'unsupported'>(
    () => getNotificationPermission()
  );

  // Study Topic Linkage Modal State
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [studySubjects, setStudySubjects] = useState<StudySubject[]>([]);
  const [studyTopics, setStudyTopics] = useState<StudyTopic[]>([]);
  const [modalSubjectCode, setModalSubjectCode] = useState<string>('');
  const [modalTopicId, setModalTopicId] = useState<string>('');
  const [modalActivityType, setModalActivityType] = useState<
    'study' | 'practice' | 'theory' | 'revision'
  >('study');
  const [loadingStudyData, setLoadingStudyData] = useState(false);

  // Preferences form local state
  const [prefFocus, setPrefFocus] = useState(pomodoroSettings?.focusDuration || 25);
  const [prefShortBreak, setPrefShortBreak] = useState(pomodoroSettings?.shortBreakDuration || 5);
  const [prefLongBreak, setPrefLongBreak] = useState(pomodoroSettings?.longBreakDuration || 15);
  const [prefInterval, setPrefInterval] = useState(pomodoroSettings?.longBreakInterval || 4);
  const [prefAutoBreak, setPrefAutoBreak] = useState(pomodoroSettings?.autoStartBreaks || false);
  const [prefAutoFocus, setPrefAutoFocus] = useState(pomodoroSettings?.autoStartFocus || false);
  const [prefTone, setPrefTone] = useState<PomodoroAlertTone>(pomodoroSettings?.alertTone || 'chime');
  const [prefVolume, setPrefVolume] = useState(pomodoroSettings?.soundVolume ?? 70);
  const [prefNotifications, setPrefNotifications] = useState(
    pomodoroSettings?.desktopNotifications || false
  );

  // Sync preferences modal state when opened
  useEffect(() => {
    if (showPreferencesModal && pomodoroSettings) {
      setPrefFocus(pomodoroSettings.focusDuration || 25);
      setPrefShortBreak(pomodoroSettings.shortBreakDuration || 5);
      setPrefLongBreak(pomodoroSettings.longBreakDuration || 15);
      setPrefInterval(pomodoroSettings.longBreakInterval || 4);
      setPrefAutoBreak(pomodoroSettings.autoStartBreaks || false);
      setPrefAutoFocus(pomodoroSettings.autoStartFocus || false);
      setPrefTone(pomodoroSettings.alertTone || 'chime');
      setPrefVolume(pomodoroSettings.soundVolume ?? 70);
      setPrefNotifications(pomodoroSettings.desktopNotifications || false);
      setNotificationPerm(getNotificationPermission());
    }
  }, [showPreferencesModal, pomodoroSettings]);

  // Load authoritative focus sessions, goals, and presets
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getFocusSessions().catch(() => [] as FocusSession[]),
      api.getPomodoroGoals().catch(() => [] as PomodoroGoal[]),
      api.getPomodoroPresets().catch(() => [] as PomodoroPreset[]),
    ])
      .then(([sessList, goalList, presetList]) => {
        if (cancelled) return;
        setSessions(sessList);
        setGoals(goalList);
        setPresets(presetList);
      })
      .catch(console.warn);

    return () => {
      cancelled = true;
    };
  }, [refreshKey, completedCycleCount]);

  // Load interruptions for active session if any
  useEffect(() => {
    if (!activeSessionId) {
      setSessionInterruptions([]);
      return;
    }
    let cancelled = false;
    api
      .listInterruptions(activeSessionId)
      .then((ints) => {
        if (!cancelled) setSessionInterruptions(ints);
      })
      .catch(console.warn);
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, isRunning]);

  const handleCreatePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    setPresetSaving(true);
    try {
      const created = await api.savePomodoroPreset({
        name: presetName.trim(),
        workDuration: presetWork,
        shortBreakDuration: presetShort,
        longBreakDuration: presetLong,
        longBreakInterval: presetInterval,
        autoStartBreaks: pomodoroSettings?.autoStartBreaks ?? false,
        autoStartFocus: pomodoroSettings?.autoStartFocus ?? false,
        soundEnabled: settings?.soundEnabled ?? true,
        soundVolume: pomodoroSettings?.soundVolume ?? 70,
        isDefault: false,
        isSystemPreset: false,
      });
      setPresets((prev) => [...prev.filter((p) => p.id !== created.id), created]);
      setPresetName('');
      setShowPresetModal(false);
      showToast(`Created preset: ${created.name}`, 'success');
      applyPomodoroPreset(created);
    } catch {
      showToast('Failed to create preset', 'error');
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      await api.deletePomodoroPreset(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      showToast('Preset removed', 'info');
    } catch {
      showToast('Failed to delete preset', 'error');
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    setGoalSaving(true);
    try {
      const created = await api.savePomodoroGoal({
        title: goalTitle.trim(),
        goalType,
        metricType: goalMetric,
        targetValue: goalTarget,
        currentValue: 0,
        status: 'active',
        startDate: getTodayDateString(settings?.timezone || 'Asia/Kolkata'),
        endDate: null,
        subjectId: null,
        subjectCode: activeStudySubjectCode || null,
        topicId: activeStudyTopicId || null,
      });
      setGoals((prev) => [...prev.filter((g) => g.id !== created.id), created]);
      setGoalTitle('');
      setShowGoalModal(false);
      showToast(`Goal created: ${created.title}`, 'success');
    } catch {
      showToast('Failed to create goal', 'error');
    } finally {
      setGoalSaving(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await api.deletePomodoroGoal(goalId);
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
      showToast('Goal removed', 'info');
    } catch {
      showToast('Failed to remove goal', 'error');
    }
  };

  // Streak summary and goal progress calculations
  const streakSummary = useMemo(
    () => computeFocusStreaks(sessions, undefined, userTimezone),
    [sessions, userTimezone]
  );
  const subjectBreakdown = useMemo(
    () => computeSubjectFocusBreakdown(sessions, studySubjects),
    [sessions, studySubjects]
  );
  const activeGoal = useMemo(
    () => goals.find((g) => g.isActive ?? (g.status ? g.status === 'active' : true)) || null,
    [goals]
  );
  const goalProgress = useMemo(
    () => (activeGoal ? computePomodoroGoalProgress(sessions, activeGoal, new Date(), userTimezone) : null),
    [sessions, activeGoal, userTimezone]
  );

  // Load study subjects for linking modal
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
  }, [showStudyModal, activeStudySubjectCode, activeStudyTopicId, activeStudyActivityType]);

  // Load Study OS subjects when Manual Time Log modal opens
  useEffect(() => {
    if (!showManualLogModal) return;
    setManualError(null);
    setManualSubjectCode(activeStudySubjectCode || '');
    setManualTopicId(activeStudyTopicId || '');
    setManualActivityType(activeStudyActivityType || 'study');
    if (studySubjects.length > 0) return;
    let cancelled = false;
    api
      .getStudySubjects()
      .then((subs) => {
        if (!cancelled) setStudySubjects(subs);
      })
      .catch(console.warn);
    return () => {
      cancelled = true;
    };
  }, [showManualLogModal, activeStudySubjectCode, activeStudyTopicId, activeStudyActivityType, studySubjects.length]);

  const handleManualSubjectChange = async (newCode: string) => {
    setManualSubjectCode(newCode);
    if (!newCode) {
      setManualTopicId('');
      return;
    }
    try {
      const tops = await api.getStudyTopics(newCode);
      setStudyTopics(tops);
      setManualTopicId(tops[0]?.id || '');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(manualHours) || 0;
    const m = Number(manualMinutes) || 0;
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) {
      setManualError('Please enter valid non-negative hours and minutes.');
      return;
    }
    const totalMinutes = Math.round(h * 60 + m);
    if (totalMinutes < 1 || totalMinutes > 1440) {
      setManualError('Total duration must be between 1 minute and 24 hours (1440 minutes).');
      return;
    }

    setManualSaving(true);
    setManualError(null);
    try {
      const todayStr = getTodayDateString(userTimezone);
      const chosenDate = manualDate || todayStr;
      const endMs =
        chosenDate === todayStr
          ? Date.now()
          : new Date(`${chosenDate}T18:00:00`).getTime() || Date.now();
      const startMs = endMs - totalMinutes * 60 * 1000;
      const startedAt = new Date(startMs).toISOString();
      const endedAt = new Date(endMs).toISOString();

      const created = await api.createFocusSession({
        mode: 'work',
        durationMinutes: totalMinutes,
        durationSeconds: totalMinutes * 60,
        actualDurationSeconds: totalMinutes * 60,
        completed: true,
        status: 'completed',
        endReason: 'completed',
        interrupted: false,
        pauseCount: 0,
        totalPauseSeconds: 0,
        startedAt,
        endedAt,
        taskId: activeTask?.id || undefined,
        subjectCode: manualSubjectCode || undefined,
        topicId: manualTopicId || undefined,
        activityType: manualSubjectCode || manualTopicId ? manualActivityType : undefined,
      });

      if (manualTopicId && manualActivityType === 'practice') {
        api.saveStudyTopic({ id: manualTopicId, practice: true }).catch(console.warn);
      } else if (manualTopicId && manualActivityType === 'theory') {
        api.saveStudyTopic({ id: manualTopicId, theory: true }).catch(console.warn);
      }

      setSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      if (firebaseUser?.uid) {
        void api
          .getFocusSessions()
          .then((allSessions) =>
            syncUserLeaderboardStats({
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || undefined,
              dailyGoalMinutes: settings?.dailyFocusGoalMinutes || 120,
              sessions: Array.isArray(allSessions) ? allSessions : [created],
              timezone: userTimezone,
              onlyIfExists: true,
            })
          )
          .catch(() => {});
      }
      triggerRefresh();
      setShowManualLogModal(false);

      const hrsPart = Math.floor(totalMinutes / 60);
      const minsPart = totalMinutes % 60;
      const label =
        hrsPart > 0 && minsPart > 0
          ? `${hrsPart}h ${minsPart}m`
          : hrsPart > 0
          ? `${hrsPart}h`
          : `${minsPart}m`;
      showToast(`Logged ${label} of study / focus time!`, 'success');
      if (totalMinutes >= 5 && created?.id) {
        void api
          .awardXP({
            eventId: `focus_${created.id}`,
            source: 'focus_session',
            sourceId: created.id,
          })
          .then((xpRes) => {
            if (xpRes?.awarded && xpRes.xpAdded > 0) {
              showToast(
                xpRes.leveledUp
                  ? `+${xpRes.xpAdded} XP · Level Up to Lv.${xpRes.newLevel}! 🎉`
                  : `+${xpRes.xpAdded} XP earned!`,
                'success'
              );
            }
          });
      }
    } catch (err: any) {
      setManualError(err?.message || 'Failed to log study time. Please try again.');
    } finally {
      setManualSaving(false);
    }
  };

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
    saveTimerState(
      {
        activeStudySubjectCode: resolvedSubjectCode,
        activeStudyTopicId: resolvedTopicId,
        activeStudyActivityType: modalActivityType,
      },
      typeof window !== 'undefined' ? window.localStorage : null,
      firebaseUser?.uid
    );
    setShowStudyModal(false);
  };

  const handleClearStudyLink = () => {
    setActiveStudySubjectCode(null);
    setActiveStudyTopicId(null);
    setActiveStudyActivityType(null);
    saveTimerState(
      {
        activeStudySubjectCode: null,
        activeStudyTopicId: null,
        activeStudyActivityType: null,
      },
      typeof window !== 'undefined' ? window.localStorage : null,
      firebaseUser?.uid
    );
    setShowStudyModal(false);
  };

  const hasActiveSession =
    isRunning ||
    (timerEngine === 'stopwatch'
      ? stopwatchElapsed > 0
      : timeLeft < totalDuration && timeLeft > 0);

  const handleReset = async () => {
    if (hasActiveSession) {
      const confirmed = await confirmAction({
        title: 'Reset Active Session?',
        message: 'Your current timer session is still in progress. Resetting will discard this session progress.',
        confirmLabel: 'Reset Timer',
        cancelLabel: 'Keep Focusing',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setResetSpinCount((c) => c + 1);
    resetTimer();
  };

  const handleSkipInterval = async () => {
    if (hasActiveSession) {
      const confirmed = await confirmAction({
        title: 'Skip Current Interval?',
        message: 'Your current session is still active. Skipping now will end this interval early.',
        confirmLabel: 'Skip Interval',
        cancelLabel: 'Continue',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    skipInterval();
  };

  const handleEngineSwitch = async (nextEngine: TimerEngineMode) => {
    if (nextEngine === timerEngine) return;
    if (hasActiveSession) {
      const confirmed = await confirmAction({
        title: 'Switch Timer Engine?',
        message: 'Your current session is still active. Switching timer modes will cancel your current progress.',
        confirmLabel: 'Switch Mode',
        cancelLabel: 'Keep Focusing',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setTimerEngine(nextEngine);
  };

  const handleApplyPresetSafe = async (preset: PomodoroPreset): Promise<boolean> => {
    if (hasActiveSession) {
      const confirmed = await confirmAction({
        title: 'Apply Timer Preset?',
        message: `Applying '${preset.name}' will reset your currently active session.`,
        confirmLabel: 'Apply Preset',
        cancelLabel: 'Keep Focusing',
        tone: 'danger',
      });
      if (!confirmed) return false;
    }
    applyPomodoroPreset(preset);
    return true;
  };

  const toggleSound = () => {
    if (settings) {
      void updateSettings({ soundEnabled: !settings.soundEnabled });
    }
  };

  useEffect(() => {
    if (completedCycleCount > prevCycleCountRef.current) {
      prevCycleCountRef.current = completedCycleCount;
      setShowCelebration(true);
      if (firebaseUser?.uid) {
        api
          .getFocusSessions()
          .then((freshSessions) =>
            syncUserLeaderboardStats({
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || undefined,
              dailyGoalMinutes: settings?.dailyFocusGoalMinutes || 120,
              sessions: freshSessions,
              timezone: userTimezone,
              onlyIfExists: true,
            })
          )
          .catch((err) => console.warn('[PomodoroTimer] Leaderboard sync warning:', err));
      }
      const timer = setTimeout(() => setShowCelebration(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [completedCycleCount, firebaseUser?.uid, firebaseUser?.displayName, settings?.dailyFocusGoalMinutes, userTimezone]);

  // Fullscreen keyboard escape & general shortcut handler
  useEffect(() => {
    const anyModalOpen =
      showCustomModal ||
      showPreferencesModal ||
      showStatsModal ||
      showPresetModal ||
      showGoalModal ||
      showInterruptionsModal ||
      showStudyModal ||
      showManualLogModal ||
      isTypingWarmupOpen;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullScreenFocus && !anyModalOpen) {
        setFullScreenFocus(false);
        return;
      }

      if (anyModalOpen || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Ignore shortcuts if input, textarea, select, button, or link is focused
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.isContentEditable ||
          Boolean(target.closest('button, a, summary, input, textarea, select, [role="button"]')))
      ) {
        return;
      }

      if (e.code === 'Space' || e.key === ' ' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (isRunning) pauseTimer();
        else startTimer();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void handleSkipInterval();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void handleReset();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (settings) {
          void updateSettings({ soundEnabled: !settings.soundEnabled });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    fullScreenFocus,
    setFullScreenFocus,
    hasActiveSession,
    isRunning,
    pauseTimer,
    startTimer,
    handleSkipInterval,
    handleReset,
    settings,
    updateSettings,
    showCustomModal,
    showPreferencesModal,
    showStatsModal,
    showPresetModal,
    showGoalModal,
    showInterruptionsModal,
    showStudyModal,
    showManualLogModal,
    isTypingWarmupOpen,
  ]);

  const handleModeSwitch = async (mode: TimerMode) => {
    if (mode === timerMode) return;
    if (hasActiveSession) {
      const targetLabel =
        mode === 'work' ? 'Focus' : mode === 'short_break' ? 'Short Break' : 'Long Break';
      const confirmed = await confirmAction({
        title: `Switch to ${targetLabel}?`,
        message: 'A Pomodoro session is currently running or paused mid-way. Switching now will cancel your active session.',
        confirmLabel: `Switch to ${targetLabel}`,
        cancelLabel: 'Keep Focusing',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
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

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInputMinutes.trim();
    const parsed = Number(trimmed);
    if (trimmed !== '' && Number.isInteger(parsed) && parsed >= 1 && parsed <= 180) {
      if (hasActiveSession) {
        const confirmed = await confirmAction({
          title: 'Apply Custom Duration?',
          message: 'A Pomodoro session is currently running or paused mid-way. Applying a new duration will reset your active session.',
          confirmLabel: 'Apply Duration',
          cancelLabel: 'Keep Focusing',
          tone: 'danger',
        });
        if (!confirmed) return;
      }
      setCustomError(null);
      setCustomDuration(parsed);
      setShowCustomModal(false);
    } else {
      setCustomError('Please enter a whole number between 1 and 180 minutes.');
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFocus = Math.max(1, Math.min(180, Math.round(Number(prefFocus) || 25)));
    const cleanShort = Math.max(1, Math.min(60, Math.round(Number(prefShortBreak) || 5)));
    const cleanLong = Math.max(1, Math.min(90, Math.round(Number(prefLongBreak) || 15)));
    const cleanInterval = Math.max(1, Math.min(12, Math.round(Number(prefInterval) || 4)));

    await updatePomodoroSettings({
      focusDuration: cleanFocus,
      shortBreakDuration: cleanShort,
      longBreakDuration: cleanLong,
      longBreakInterval: cleanInterval,
      autoStartBreaks: prefAutoBreak,
      autoStartFocus: prefAutoFocus,
      alertTone: prefTone,
      soundVolume: Math.max(0, Math.min(100, Math.round(Number(prefVolume) || 70))),
      desktopNotifications: prefNotifications,
    });

    if (settings) {
      void updateSettings({
        pomodoroWorkDuration: cleanFocus,
        shortBreakDuration: cleanShort,
        longBreakDuration: cleanLong,
        autoSwitchSessions: prefAutoBreak || prefAutoFocus,
      });
    }

    setShowPreferencesModal(false);
  };

  const handleRequestNotificationPerm = async () => {
    const granted = await requestNotificationPermission();
    setNotificationPerm(getNotificationPermission());
    if (granted) {
      setPrefNotifications(true);
      showToast('Desktop notifications enabled!', 'success');
    } else {
      setPrefNotifications(false);
      showToast('Notifications permission was not granted.', 'info');
    }
  };

  const toggleAutoSwitch = () => {
    const nextVal = !pomodoroSettings?.autoStartBreaks;
    void updatePomodoroSettings({ autoStartBreaks: nextVal, autoStartFocus: nextVal });
    if (settings) {
      void updateSettings({ autoSwitchSessions: nextVal });
    }
  };

  // Long break interval calculation
  const longInterval = pomodoroSettings?.longBreakInterval || 4;
  const currentCycleInBlock = (completedCycleCount % longInterval) + 1;

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

      {/* Header Row: Engine Switcher, Streak Badge & Tool Controls */}
      <div className="relative z-10 w-full flex flex-wrap items-center justify-between gap-2 mb-4">
        <ThemeSegmentedControl<TimerEngineMode>
          ariaLabel="Focus timer engine"
          value={timerEngine}
          onChange={(next) => void handleEngineSwitch(next)}
          options={[
            { id: 'pomodoro', label: 'Pomodoro' },
            { id: 'stopwatch', label: 'Stopwatch' },
            { id: 'countdown', label: 'Countdown' },
          ]}
        />

        <div className="flex items-center gap-1.5">
          {/* Daily Streak & Analytics Badge */}
          <button
            type="button"
            onClick={() => setShowStatsModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] hover:bg-[var(--ff-surface-hover)] text-xs font-semibold text-[var(--ff-text-secondary)] transition-colors min-h-[38px]"
            title="Focus streak, personal records & subject reports"
            aria-label="View focus analytics"
          >
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
            <span>{streakSummary.currentStreakDays}d Streak</span>
          </button>

          {/* Pomodoro Settings Button */}
          <button
            type="button"
            onClick={() => setShowPreferencesModal(true)}
            className="p-2 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"
            title="Configure Pomodoro Durations, Cycles & Sounds"
            aria-label="Timer settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => setFullScreenFocus(!fullScreenFocus)}
            className="p-2 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"
            title={fullScreenFocus ? 'Exit full-screen focus (Esc)' : 'Enter full-screen focus mode'}
            aria-label={fullScreenFocus ? 'Exit full-screen focus' : 'Enter full-screen focus'}
          >
            {fullScreenFocus ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sub-Mode & Cycle Indicator */}
      {timerEngine === 'pomodoro' && (
        <div className="relative z-10 w-full mb-4 space-y-2">
          <ThemeSegmentedControl<TimerMode>
            ariaLabel="Pomodoro timer mode"
            value={timerMode}
            onChange={(mode) => void handleModeSwitch(mode)}
            options={[
              {
                id: 'work',
                label: `Focus (${pomodoroSettings?.focusDuration || settings?.pomodoroWorkDuration || 25}m)`,
              },
              {
                id: 'short_break',
                label: `Short (${pomodoroSettings?.shortBreakDuration || settings?.shortBreakDuration || 5}m)`,
              },
              {
                id: 'long_break',
                label: `Long (${pomodoroSettings?.longBreakDuration || settings?.longBreakDuration || 15}m)`,
              },
            ]}
          />

          {/* Cycle dots indicator */}
          <div className="flex items-center justify-between px-2 text-[11px] text-[var(--ff-text-muted)]">
            <span className="font-medium">
              Cycle: Pomodoro {currentCycleInBlock} of {longInterval}
            </span>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: longInterval }).map((_, idx) => {
                const filled = idx < currentCycleInBlock;
                return (
                  <span
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all ${
                      filled
                        ? 'bg-[var(--ff-accent)] scale-110 shadow-xs'
                        : 'bg-[var(--ff-border-color)] opacity-60'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Preset Selector Strip */}
      {timerEngine === 'pomodoro' && (
        <div className="relative z-10 w-full mb-3 flex flex-wrap items-center justify-between gap-1.5 px-1">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[85%] no-scrollbar">
            {presets.slice(0, 6).map((p) => {
              const isSelected = activePresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleApplyPresetSafe(p)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all whitespace-nowrap min-h-[32px] flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-xs'
                      : 'bg-[var(--ff-surface-subtle)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]'
                  }`}
                  title={`${p.name}: ${p.workDuration}m work / ${p.shortBreakDuration}m short break`}
                >
                  <Bookmark className="w-3 h-3" />
                  <span>{p.name}</span>
                  <span className="opacity-75 font-mono text-[10px]">
                    {p.workDuration}/{p.shortBreakDuration}m
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowPresetModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] border border-dashed border-[var(--ff-border-color)] transition-colors min-h-[32px] shrink-0"
            title="Manage Presets"
          >
            <Plus className="w-3 h-3" />
            <span>Presets</span>
          </button>
        </div>
      )}

      {/* Active Interruption History Alert */}
      {activeSessionId && sessionInterruptions.length > 0 && (
        <button
          type="button"
          onClick={() => setShowInterruptionsModal(true)}
          className="relative z-10 mb-2.5 flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 hover:bg-amber-500/25 transition-all"
          title="Click to view interruption events"
        >
          <History className="w-3.5 h-3.5" />
          <span>{sessionInterruptions.length} Pause{sessionInterruptions.length > 1 ? 's' : ''} in Session</span>
        </button>
      )}

      {/* Linked Task & Study Entities Banner */}
      <div className="relative z-10 w-full flex flex-wrap items-center justify-center gap-2 mb-2 min-h-[32px]">
        <AnimatePresence mode="popLayout">
          {activeTask && (
            <motion.div
              key={activeTask.id}
              initial={isDisabled ? false : { opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
              transition={profile.spring}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium max-w-xs border"
              style={{
                background: 'var(--ff-surface-subtle)',
                borderColor: 'var(--ff-border-color)',
                color: 'var(--ff-text-primary)',
              }}
            >
              <Target className="w-3.5 h-3.5 text-[var(--ff-accent-text)] shrink-0" />
              <span className="truncate">{activeTask.title}</span>
              <button
                type="button"
                onClick={() => setActiveTaskId(null)}
                className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] ml-1 text-xs shrink-0"
                title="Unlink task from timer"
                aria-label="Unlink task"
              >
                ×
              </button>
            </motion.div>
          )}

          {activeStudySubjectCode || activeStudyTopicId ? (
            <motion.div
              key="linked-study-topic"
              initial={isDisabled ? false : { opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.96 }}
              transition={profile.spring}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium max-w-xs border"
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
              <span>Independent Focus Session</span>
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
                  opacity: [0.28, 0.52, 0.28],
                }
              : isPaused && !isDisabled
              ? {
                  scale: [0.96, 1.03, 0.96],
                  opacity: [0.22, 0.45, 0.22],
                }
              : { scale: 1, opacity: 0.12 }
          }
          transition={
            isRunning && !isDisabled
              ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
              : isPaused && !isDisabled
              ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
          }
          className="absolute inset-0 rounded-full pointer-events-none blur-2xl"
          style={{ background: isPaused ? 'rgba(245, 158, 11, 0.35)' : currentModeColors.aura }}
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
                initial={{ scale: 0.6, opacity: 0.65 }}
                animate={{ scale: 1.65, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded-full border pointer-events-none"
                style={{
                  borderColor: 'var(--ff-accent)',
                  boxShadow: '0 0 32px var(--ff-accent)',
                }}
              />
            </>
          )}
        </AnimatePresence>

        <svg
          className="w-full h-full transform -rotate-90 origin-center drop-shadow-sm"
          viewBox={`0 0 ${baseSize} ${baseSize}`}
        >
          {/* Subtle Dial Depth Ring */}
          <circle
            cx={baseSize / 2}
            cy={baseSize / 2}
            r={radius - strokeWidth * 0.8}
            fill="none"
            stroke="var(--ff-border-color)"
            strokeWidth={1}
            strokeDasharray="2 6"
            className="opacity-25"
          />

          {/* Background Track */}
          <circle
            cx={baseSize / 2}
            cy={baseSize / 2}
            r={radius}
            fill="none"
            stroke="var(--ff-border-color)"
            strokeWidth={strokeWidth}
            className="opacity-30"
          />

          {/* 12 Watchmaker 5-min Dial Accent Ticks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const isQuarter = i % 3 === 0;
            const innerR = radius - strokeWidth * (isQuarter ? 0.65 : 0.45);
            const outerR = radius - strokeWidth * 0.2;
            const x1 = baseSize / 2 + Math.cos(angle) * innerR;
            const y1 = baseSize / 2 + Math.sin(angle) * innerR;
            const x2 = baseSize / 2 + Math.cos(angle) * outerR;
            const y2 = baseSize / 2 + Math.sin(angle) * outerR;
            return (
              <line
                key={`tick-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isQuarter ? 'var(--ff-text-secondary)' : 'var(--ff-border-strong)'}
                strokeWidth={isQuarter ? 2 : 1}
                strokeLinecap="round"
                className="opacity-45"
              />
            );
          })}

          {/* Animated Elapsed Progress Arc */}
          <motion.circle
            cx={baseSize / 2}
            cy={baseSize / 2}
            r={radius}
            fill="none"
            stroke={isPaused ? '#f59e0b' : currentModeColors.ring}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            animate={{
              strokeDashoffset,
              opacity: progressRatio > 0 ? 1 : 0,
            }}
            transition={{
              duration: isDisabled ? 0.01 : 0.45,
              ease: 'linear',
            }}
            strokeLinecap={progressRatio > 0 ? 'round' : 'butt'}
            style={{
              filter: isPaused
                ? 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.4))'
                : `drop-shadow(0 0 6px ${currentModeColors.aura})`,
            }}
          />

          {/* Synchronized Tip Indicator Dot (Locked to Arc Perimeter) */}
          {progressRatio > 0 && (
            <g transform={`rotate(${progressRatio * 360} ${baseSize / 2} ${baseSize / 2})`}>
              <motion.circle
                cx={baseSize / 2 + radius}
                cy={baseSize / 2}
                fill="var(--ff-bg-canvas)"
                stroke={isPaused ? '#f59e0b' : currentModeColors.ring}
                strokeWidth={2.5}
                animate={{
                  r: isRunning && !isDisabled
                    ? [strokeWidth * 0.52, strokeWidth * 0.65, strokeWidth * 0.52]
                    : strokeWidth * 0.55,
                  opacity: isRunning ? 1 : isPaused ? 0.95 : 0.85,
                }}
                transition={{
                  r: isRunning && !isDisabled
                    ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.2 },
                }}
                style={{
                  filter: isPaused
                    ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.8))'
                    : `drop-shadow(0 0 8px ${currentModeColors.ring})`,
                }}
              />
            </g>
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-20 pointer-events-none">
          <SubtleConfetti show={showCelebration} />
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

          <span className="text-[10px] sm:text-[11px] text-[var(--ff-text-muted)] mt-1 font-medium">
            {isRunning
              ? 'Session in progress'
              : isPaused
              ? 'Session paused'
              : 'Ready to start'}
          </span>

          {/* Projected Focus Session XP Reward Pill */}
          {(timerEngine !== 'pomodoro' || timerMode === 'work') && (() => {
            const isStopwatch = timerEngine === 'stopwatch';
            const targetMins = isStopwatch
              ? Math.floor(displaySeconds / 60)
              : Math.max(1, Math.round(safeTotalDuration / 60));
            const rewardXP = calculateFocusSessionXP(targetMins);
            return (
              <span
                className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border"
                style={{
                  background: 'rgba(245, 158, 11, 0.14)',
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                  color: '#fbbf24',
                }}
              >
                {isStopwatch
                  ? rewardXP > 0
                    ? `⚡ +${rewardXP} XP earned (${targetMins}m)`
                    : '⚡ 5m+ for XP (0.8 XP/m)'
                  : rewardXP > 0
                  ? `⚡ ${targetMins}m → +${rewardXP} XP`
                  : '⚡ Min 5m for XP'}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Goal Progress Bar if active goal exists */}
      {goalProgress && (
        <div className="relative z-10 w-full max-w-xs mx-auto my-2 px-2 py-1.5 rounded-lg bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between gap-2 text-[11px] mb-1 font-medium">
            <span className="text-[var(--ff-text-secondary)] truncate">
              🎯 {goalProgress.title}
            </span>
            <span className="text-[var(--ff-text-primary)] shrink-0 font-mono">
              {goalProgress.currentValue}/{goalProgress.targetValue}
              {goalProgress.metricType === 'session_count' ? ' sess' : 'm'} ({goalProgress.progressPct}%)
            </span>
          </div>
          <div className="w-full bg-[var(--ff-border-color)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[var(--ff-accent)] h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, goalProgress.progressPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Action Controls with Accessible Touch Targets (>= 44x44px) */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 mt-4">
        {/* Reset Button */}
        <ThemeButton
          variant="secondary"
          size="md"
          onClick={() => void handleReset()}
          className="p-3 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Reset timer (R)"
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

        {/* Start / Pause Button */}
        <ThemeButton
          variant={isRunning ? 'secondary' : 'primary'}
          size="lg"
          onClick={isRunning ? pauseTimer : startTimer}
          className="px-7 py-3.5 font-bold min-h-[44px]"
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
                  : timerEngine === 'pomodoro' && timerMode === 'short_break'
                  ? 'Start Short Break'
                  : timerEngine === 'pomodoro' && timerMode === 'long_break'
                  ? 'Start Long Break'
                  : 'Start Focus'}
              </span>
            </>
          )}
        </ThemeButton>

        {/* Skip Interval Button */}
        <ThemeButton
          variant="secondary"
          size="md"
          onClick={() => void handleSkipInterval()}
          className="p-3 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Skip interval (S)"
          aria-label="Skip interval"
        >
          <SkipForward className="w-5 h-5" />
        </ThemeButton>

        {/* Custom / Log Button */}
        {timerEngine === 'stopwatch' ? (
          <ThemeButton
            variant="success"
            size="md"
            onClick={() => void saveStopwatchSession()}
            disabled={stopwatchElapsed < 30}
            className="min-h-[44px]"
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
            className="p-3 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Set custom duration"
            aria-label="Custom duration"
          >
            <Sliders className="w-5 h-5" />
          </ThemeButton>
        )}
      </div>

      {/* Paused Interruption Notice */}
      {!isRunning && timeLeft < totalDuration && timeLeft > 0 && timerEngine !== 'stopwatch' && (
        <div className="relative z-10 mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Timer paused. Interruption duration is being tracked automatically.</span>
        </div>
      )}

      {/* Ambient Soundscape Controls */}
      <div className="relative z-10 w-full mt-5 pt-4 border-t border-[var(--ff-border-color)] space-y-2">
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
                className="px-2.5 py-1 text-[11px] font-semibold border transition-colors min-h-[36px]"
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

      {/* Web Audio Binaural Beats Controller */}
      <div className="relative z-10 w-full mt-3">
        <BinauralBeatsController />
      </div>

      {/* Quick Settings Toggles & Keyboard Shortcuts Bar */}
      <div className="relative z-10 w-full flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-[var(--ff-border-color)] text-xs text-[var(--ff-text-muted)]">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setShowManualLogModal(true)}
            className="flex items-center gap-1.5 hover:text-[var(--ff-text-primary)] transition-colors min-h-[36px] font-semibold text-emerald-500"
            title="Manually log additional study or focus hours/minutes"
          >
            <Plus className="w-4 h-4" />
            <span>Log Time</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTypingWarmupOpen(true)}
            className="flex items-center gap-1.5 hover:text-[var(--ff-text-primary)] transition-colors min-h-[36px] font-semibold text-sky-400"
          >
            <Code2 className="w-4 h-4" />
            <span>60s Typing Warmup</span>
          </button>

          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 hover:text-[var(--ff-text-primary)] transition-colors min-h-[36px]"
          >
            {settings?.soundEnabled ? (
              <Volume2 className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
            <span>Chime {settings?.soundEnabled ? 'On' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={toggleAutoSwitch}
            className="flex items-center gap-1.5 hover:text-[var(--ff-text-primary)] transition-colors min-h-[36px]"
          >
            <CheckCircle2
              className="w-4 h-4 transition-colors"
              style={{
                color: pomodoroSettings?.autoStartBreaks
                  ? 'var(--ff-accent-text)'
                  : 'var(--ff-text-muted)',
              }}
            />
            <span>Auto-Break {pomodoroSettings?.autoStartBreaks ? 'On' : 'Off'}</span>
          </button>
        </div>

        {/* Keyboard shortcut tips */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-[var(--ff-text-muted)] font-mono">
          <span>
            <kbd className="px-1 py-0.5 rounded border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)]">
              Space
            </kbd>{' '}
            Toggle
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)]">
              S
            </kbd>{' '}
            Skip
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)]">
              R
            </kbd>{' '}
            Reset
          </span>
        </div>
      </div>
    </>
  );

  return (
    <>
      <ThemeCard
        variant="elevated"
        tilt={false}
        className={`relative overflow-hidden flex flex-col items-center justify-center p-6 sm:p-7 ${
          isRunning ? 'ff-pulse-running' : isPaused ? 'ff-pulse-paused' : ''
        }`}
      >
        {timerBody}
      </ThemeCard>

      {/* Multiple Pomodoro Goals Grid */}
      <ThemeCard className="w-full mt-4 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" /> Focus Goals ({goals.length})
          </h4>
          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => setShowGoalModal(true)}
            className="text-xs py-1 px-2.5 min-h-[32px] flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New Goal
          </ThemeButton>
        </div>
        {goals.length === 0 ? (
          <p className="text-xs text-[var(--ff-text-muted)]">
            No focus goals configured yet. Create a daily, weekly, or monthly goal to track your deep work consistency.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {goals.map((g) => {
              const prog = computePomodoroGoalProgress(sessions, g, new Date(), userTimezone);
              return (
                <div
                  key={g.id}
                  className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between text-xs font-medium mb-1.5 gap-2">
                    <span className="font-semibold text-[var(--ff-text-primary)] truncate">{g.title}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteGoal(g.id)}
                      className="text-[var(--ff-text-muted)] hover:text-rose-400 p-0.5 rounded transition-colors"
                      title="Remove goal"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-baseline justify-between font-mono text-[11px] text-[var(--ff-text-secondary)] mb-1">
                    <span>
                      {prog.currentValue} / {prog.targetValue} {g.metricType === 'session_count' ? 'sessions' : 'mins'}
                    </span>
                    <span className={`font-semibold ${prog.isMet ? 'text-emerald-500' : 'text-[var(--ff-text-muted)]'}`}>
                      {prog.progressPct}%
                    </span>
                  </div>
                  <div className="w-full bg-[var(--ff-border-color)] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${prog.isMet ? 'bg-emerald-500' : 'bg-[var(--ff-accent)]'}`}
                      style={{ width: `${prog.progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[var(--ff-text-muted)] mt-1.5">
                    <span className="capitalize">{g.goalType} Goal</span>
                    {g.subjectCode && <span>• {g.subjectCode}</span>}
                    {prog.isMet && <span className="text-emerald-500 font-bold">✓ Met</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ThemeCard>

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
                className="absolute top-4 right-4 p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Exit full-screen focus (Esc)"
                aria-label="Exit full-screen focus"
              >
                <X className="w-5 h-5" />
              </button>
              {activeTask && (
                <div className="mb-4 px-3.5 py-1.5 rounded-full bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-xs text-center max-w-sm flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                  <span className="text-[var(--ff-text-muted)]">Objective:</span>
                  <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                    {activeTask.title}
                  </span>
                </div>
              )}
              {timerBody}
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-5">
                Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--ff-border-color)]">ESC</kbd> or click ✕ to exit full-screen mode
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pomodoro Preferences Modal */}
      <ThemeModal
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        title="Pomodoro Preferences"
        subtitle="Customize interval durations, auto-start, sounds, and alerts"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSavePreferences} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Focus (min)
              </label>
              <ThemeInput
                type="number"
                min="1"
                max="180"
                value={prefFocus}
                onChange={(e) => setPrefFocus(Number(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Short Break (min)
              </label>
              <ThemeInput
                type="number"
                min="1"
                max="60"
                value={prefShortBreak}
                onChange={(e) => setPrefShortBreak(Number(e.target.value))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Long Break (min)
              </label>
              <ThemeInput
                type="number"
                min="1"
                max="90"
                value={prefLongBreak}
                onChange={(e) => setPrefLongBreak(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Long Break Interval (cycles)
              </label>
              <ThemeInput
                type="number"
                min="1"
                max="12"
                value={prefInterval}
                onChange={(e) => setPrefInterval(Number(e.target.value))}
                required
              />
              <span className="text-[10px] text-[var(--ff-text-muted)]">
                Default: 4 focus sessions before long break
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Alert Sound Chime
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={prefTone}
                  onChange={(e) => setPrefTone(e.target.value as PomodoroAlertTone)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                >
                  {ALERT_TONES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => playAlertTone(prefTone, true, prefVolume)}
                  className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] hover:bg-[var(--ff-surface-hover)] shrink-0 min-h-[40px]"
                  title="Test tone audio"
                >
                  ▶ Test
                </button>
              </div>
            </div>
          </div>

          {/* Volume slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
              <span>Sound Volume</span>
              <span>{prefVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={prefVolume}
              onChange={(e) => setPrefVolume(Number(e.target.value))}
              className="w-full accent-[var(--ff-accent)]"
            />
          </div>

          {/* Automation toggles */}
          <div className="space-y-2 pt-2 border-t border-[var(--ff-border-color)]">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefAutoBreak}
                onChange={(e) => setPrefAutoBreak(e.target.checked)}
                className="w-4 h-4 accent-[var(--ff-accent)] rounded"
              />
              <span className="text-[var(--ff-text-primary)] font-medium">
                Auto-start break when focus finishes
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={prefAutoFocus}
                onChange={(e) => setPrefAutoFocus(e.target.checked)}
                className="w-4 h-4 accent-[var(--ff-accent)] rounded"
              />
              <span className="text-[var(--ff-text-primary)] font-medium">
                Auto-start next focus when break finishes
              </span>
            </label>
          </div>

          {/* Desktop Notifications Toggle */}
          <div className="pt-2 border-t border-[var(--ff-border-color)] flex items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-semibold text-[var(--ff-text-primary)] block">
                Desktop Notifications
              </span>
              <span className="text-[11px] text-[var(--ff-text-muted)]">
                Status: {notificationPerm === 'granted' ? 'Allowed' : notificationPerm === 'denied' ? 'Blocked' : 'Not Requested'}
              </span>
            </div>
            {notificationPerm === 'granted' ? (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefNotifications}
                  onChange={(e) => setPrefNotifications(e.target.checked)}
                  className="w-4 h-4 accent-[var(--ff-accent)] rounded"
                />
                <span>Active</span>
              </label>
            ) : (
              <ThemeButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRequestNotificationPerm}
                className="min-h-[38px]"
              >
                Request Permission
              </ThemeButton>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreferencesModal(false)}
              className="min-h-[44px]"
            >
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" className="min-h-[44px]">
              Save Preferences
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* Focus Stats & Subject Breakdown Modal */}
      <ThemeModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        title="Focus Records & Subject Analytics"
        subtitle="Authoritative progress based on completed sessions"
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4">
          {/* Key Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-center">
              <span className="text-[11px] text-[var(--ff-text-muted)] flex items-center justify-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500" /> Streak
              </span>
              <span className="text-xl font-bold text-[var(--ff-text-primary)] block mt-0.5">
                {streakSummary.currentStreakDays}d
              </span>
              <span className="text-[10px] text-[var(--ff-text-muted)]">
                Best: {streakSummary.bestStreakDays}d
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-center">
              <span className="text-[11px] text-[var(--ff-text-muted)] flex items-center justify-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-indigo-400" /> Total Time
              </span>
              <span className="text-xl font-bold text-[var(--ff-text-primary)] block mt-0.5">
                {Math.round(streakSummary.totalFocusMinutes / 60)}h
              </span>
              <span className="text-[10px] text-[var(--ff-text-muted)]">
                {streakSummary.totalFocusMinutes} mins
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-center">
              <span className="text-[11px] text-[var(--ff-text-muted)] flex items-center justify-center gap-1">
                <Target className="w-3.5 h-3.5 text-emerald-500" /> Sessions
              </span>
              <span className="text-xl font-bold text-[var(--ff-text-primary)] block mt-0.5">
                {streakSummary.totalFocusSessions}
              </span>
              <span className="text-[10px] text-[var(--ff-text-muted)]">
                Longest: {streakSummary.longestSessionMinutes}m
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-center">
              <span className="text-[11px] text-[var(--ff-text-muted)] flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> Interrupts
              </span>
              <span className="text-xl font-bold text-[var(--ff-text-primary)] block mt-0.5">
                {streakSummary.interruptionRatePct}%
              </span>
              <span className="text-[10px] text-[var(--ff-text-muted)]">
                {streakSummary.interruptedSessionsCount} sessions
              </span>
            </div>
          </div>

          {/* Subject Focus Breakdown */}
          <div className="pt-2">
            <h4 className="text-xs font-semibold text-[var(--ff-text-secondary)] mb-2 flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" /> Subject Focus Distribution
            </h4>
            {subjectBreakdown.length === 0 ? (
              <p className="text-xs text-[var(--ff-text-muted)] py-4 text-center">
                No subject-linked focus sessions recorded yet. Link a subject above to track subject hours!
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {subjectBreakdown.map((item) => (
                  <div
                    key={item.subjectCode}
                    className="p-2.5 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]"
                  >
                    <div className="flex items-center justify-between text-xs font-medium mb-1">
                      <span className="text-[var(--ff-text-primary)] font-semibold">
                        {item.subjectCode}
                      </span>
                      <span className="text-[var(--ff-text-secondary)]">
                        {item.totalMinutes} min ({item.percentage}%) • {item.sessionCount} sessions
                      </span>
                    </div>
                    <div className="w-full bg-[var(--ff-border-color)] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[var(--ff-accent)] h-full rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => setShowStatsModal(false)}
              className="min-h-[44px]"
            >
              Done
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

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
          {(() => {
            const parsedMins = Math.round(Number(customInputMinutes) || 0);
            const previewXP = calculateFocusSessionXP(parsedMins);
            if (parsedMins < 1 || parsedMins > 180) return null;
            return (
              <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-semibold text-amber-400 flex items-center justify-between">
                <span>Completion Reward</span>
                <span className="font-mono">
                  {previewXP > 0 ? `+${previewXP} XP` : 'Min 5m for XP'}
                </span>
              </div>
            );
          })()}
          <ValidationMessage message={customError} tone="error" />
          <div className="flex items-center justify-end gap-2">
            <ThemeButton
              variant="ghost"
              size="sm"
              onClick={() => setShowCustomModal(false)}
              className="min-h-[44px]"
            >
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" className="min-h-[44px]">
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
                      {t.unit ? `[${t.unit}] ` : ''}
                      {t.subtopic || t.topic}
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
                  <ThemeButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowStudyModal(false)}
                    className="min-h-[44px]"
                  >
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

      {/* Preset Manager Modal */}
      <ThemeModal
        isOpen={showPresetModal}
        onClose={() => setShowPresetModal(false)}
        title="Custom Timer Presets"
        subtitle="Manage Pomodoro interval presets or create custom workflows"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          {/* List of existing presets */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[var(--ff-text-secondary)]">Available Presets</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--ff-text-primary)]">{p.name}</span>
                    <span className="text-[11px] text-[var(--ff-text-muted)] font-mono">
                      {p.workDuration}m / {p.shortBreakDuration}m / {p.longBreakDuration}m
                    </span>
                    {p.isSystemPreset ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                        Default
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ThemeButton
                      variant={activePresetId === p.id ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        void handleApplyPresetSafe(p).then((applied) => {
                          if (applied) setShowPresetModal(false);
                        });
                      }}
                      className="text-xs py-1 px-2 min-h-[32px]"
                    >
                      {activePresetId === p.id ? 'Active' : 'Apply'}
                    </ThemeButton>
                    {!p.isSystemPreset && (
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(p.id)}
                        className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400 transition-colors"
                        title="Delete preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form to create new preset */}
          <form onSubmit={handleCreatePreset} className="space-y-3 pt-3 border-t border-[var(--ff-border-color)]">
            <h4 className="text-xs font-semibold text-[var(--ff-text-secondary)]">Create Custom Preset</h4>
            <div>
              <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Preset Name</label>
              <ThemeInput
                type="text"
                placeholder="e.g. Sprint Work"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Work (m)</label>
                <ThemeInput
                  type="number"
                  min="1"
                  max="180"
                  value={presetWork}
                  onChange={(e) => setPresetWork(Number(e.target.value))}
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Short (m)</label>
                <ThemeInput
                  type="number"
                  min="1"
                  max="60"
                  value={presetShort}
                  onChange={(e) => setPresetShort(Number(e.target.value))}
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Long (m)</label>
                <ThemeInput
                  type="number"
                  min="1"
                  max="90"
                  value={presetLong}
                  onChange={(e) => setPresetLong(Number(e.target.value))}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ThemeButton
                variant="ghost"
                size="sm"
                onClick={() => setShowPresetModal(false)}
                className="min-h-[40px]"
              >
                Cancel
              </ThemeButton>
              <ThemeButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={presetSaving || !presetName.trim()}
                className="min-h-[40px]"
              >
                {presetSaving ? 'Saving...' : 'Create Preset'}
              </ThemeButton>
            </div>
          </form>
        </div>
      </ThemeModal>

      {/* Goal Manager Modal */}
      <ThemeModal
        isOpen={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        title="Focus Goals"
        subtitle="Set targets to build sustainable deep work habits"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          {goals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--ff-text-secondary)]">Existing Goals</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {goals.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[var(--ff-text-primary)]">{g.title}</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block capitalize">
                        {g.goalType} • {g.targetValue} {g.metricType === 'session_count' ? 'sessions' : 'minutes'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteGoal(g.id)}
                      className="p-1 text-[var(--ff-text-muted)] hover:text-rose-400 transition-colors"
                      title="Delete goal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form to create new goal */}
          <form onSubmit={handleCreateGoal} className="space-y-3 pt-3 border-t border-[var(--ff-border-color)]">
            <h4 className="text-xs font-semibold text-[var(--ff-text-secondary)]">New Focus Goal</h4>
            <div>
              <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Goal Title</label>
              <ThemeInput
                type="text"
                placeholder="e.g. Daily Deep Work"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Period</label>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as PomodoroGoalType)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] min-h-[40px]"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">Metric</label>
                <select
                  value={goalMetric}
                  onChange={(e) => setGoalMetric(e.target.value as PomodoroGoalMetric)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] min-h-[40px]"
                >
                  <option value="focus_minutes">Minutes</option>
                  <option value="session_count">Sessions</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                Target Value ({goalMetric === 'session_count' ? 'Sessions' : 'Minutes'})
              </label>
              <ThemeInput
                type="number"
                min="1"
                max={goalMetric === 'session_count' ? 100 : 10000}
                value={goalTarget}
                onChange={(e) => setGoalTarget(Number(e.target.value))}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ThemeButton
                variant="ghost"
                size="sm"
                onClick={() => setShowGoalModal(false)}
                className="min-h-[40px]"
              >
                Cancel
              </ThemeButton>
              <ThemeButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={goalSaving || !goalTitle.trim()}
                className="min-h-[40px]"
              >
                {goalSaving ? 'Saving...' : 'Save Goal'}
              </ThemeButton>
            </div>
          </form>
        </div>
      </ThemeModal>

      {/* Interruption History Modal */}
      <ThemeModal
        isOpen={showInterruptionsModal}
        onClose={() => setShowInterruptionsModal(false)}
        title="Session Interruption History"
        subtitle="Immutable append-only record of pause and resume events"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3">
          {sessionInterruptions.length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] py-4 text-center">
              No interruption events recorded for this session.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {sessionInterruptions.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.eventType === 'pause' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span className="font-semibold capitalize text-[var(--ff-text-primary)]">
                      {item.eventType}
                    </span>
                    {item.reason && (
                      <span className="text-[11px] text-[var(--ff-text-muted)]">({item.reason})</span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-[var(--ff-text-secondary)]">
                    {item.occurredAt.split('T')[1]?.slice(0, 8) || item.occurredAt}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => setShowInterruptionsModal(false)}
              className="min-h-[40px]"
            >
              Done
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

      {/* Manual Additional Study / Focus Time Modal */}
      <ThemeModal
        isOpen={showManualLogModal}
        onClose={() => setShowManualLogModal(false)}
        title="Log Additional Study / Focus Time"
        subtitle="Record offline reading, classes, or extra study hours & minutes directly into your Focus Analytics."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveManualLog} className="space-y-4">
          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1.5">
              Quick Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '15m', h: '0', m: '15' },
                { label: '30m', h: '0', m: '30' },
                { label: '45m', h: '0', m: '45' },
                { label: '1h', h: '1', m: '0' },
                { label: '1h 30m', h: '1', m: '30' },
                { label: '2h', h: '2', m: '0' },
                { label: '3h', h: '3', m: '0' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setManualHours(preset.h);
                    setManualMinutes(preset.m);
                    setManualError(null);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] hover:border-[var(--ff-accent-border)] text-[var(--ff-text-primary)] transition-colors"
                >
                  +{preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hours & Minutes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Hours
              </label>
              <ThemeInput
                type="number"
                min={0}
                max={24}
                value={manualHours}
                onChange={(e) => {
                  setManualHours(e.target.value);
                  setManualError(null);
                }}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                Minutes
              </label>
              <ThemeInput
                type="number"
                min={0}
                max={1440}
                value={manualMinutes}
                onChange={(e) => {
                  setManualMinutes(e.target.value);
                  setManualError(null);
                }}
                placeholder="30"
              />
            </div>
          </div>

          {/* Live Total Preview */}
          <div className="px-3 py-2 rounded-lg bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] flex items-center justify-between text-xs">
            <span className="text-[var(--ff-text-muted)]">Total Time &amp; XP</span>
            <span className="font-mono font-bold text-[var(--ff-accent-text)]">
              {(() => {
                const total = Math.max(0, Math.round((Number(manualHours) || 0) * 60 + (Number(manualMinutes) || 0)));
                const hrs = Math.floor(total / 60);
                const mins = total % 60;
                const xp = calculateFocusSessionXP(total);
                return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m${xp > 0 ? ` · ⚡ +${xp} XP` : ''}`;
              })()}
            </span>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
              Date
            </label>
            <ThemeInput
              type="date"
              value={manualDate}
              max={getTodayDateString(userTimezone)}
              onChange={(e) => setManualDate(e.target.value)}
            />
          </div>

          {/* Optional Study Subject & Topic */}
          {studySubjects.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--ff-border-color)]">
              <label className="block text-xs font-semibold text-[var(--ff-text-secondary)]">
                Link to Study Subject (Optional)
              </label>
              <select
                value={manualSubjectCode}
                onChange={(e) => void handleManualSubjectChange(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
              >
                <option value="">Independent Study (No subject)</option>
                {studySubjects.map((sub) => (
                  <option key={sub.code} value={sub.code}>
                    {sub.name} ({sub.code})
                  </option>
                ))}
              </select>

              {manualSubjectCode && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={manualTopicId}
                    onChange={(e) => setManualTopicId(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                  >
                    <option value="">All / General</option>
                    {studyTopics
                      .filter((t) => t.subjectCode === manualSubjectCode)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.unit ? `[${t.unit}] ` : ''}
                          {t.subtopic || t.topic}
                        </option>
                      ))}
                  </select>

                  <select
                    value={manualActivityType}
                    onChange={(e) => setManualActivityType(e.target.value as 'study' | 'practice' | 'theory' | 'revision')}
                    className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                  >
                    <option value="study">General Study</option>
                    <option value="theory">Theory</option>
                    <option value="practice">Practice</option>
                    <option value="revision">Revision</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <ValidationMessage message={manualError} tone="error" />

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => setShowManualLogModal(false)}
              disabled={manualSaving}
            >
              Cancel
            </ThemeButton>
            <ThemeButton
              type="submit"
              variant="primary"
              size="sm"
              loading={manualSaving}
              loadingText="Saving..."
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Study Time</span>
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* 60-Second Code-Typing Mental Warmup Modal */}
      <CodeTypingWarmupModal
        isOpen={isTypingWarmupOpen}
        onClose={() => setIsTypingWarmupOpen(false)}
        onStartFocus={() => {
          setIsTypingWarmupOpen(false);
          startTimer();
        }}
      />
    </>
  );
};
