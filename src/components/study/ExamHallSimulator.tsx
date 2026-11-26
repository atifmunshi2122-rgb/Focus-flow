import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ExamSimulationConfig,
  ExamSimulationState,
  ExamSection,
} from '../../types/features15.ts';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { syncUserLeaderboardStats } from '../../lib/leaderboardService.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Award,
  Printer,
} from 'lucide-react';

const PRESET_EXAMS: ExamSimulationConfig[] = [
  {
    examName: 'GATE Computer Science (Mock)',
    totalMinutes: 180,
    sections: [
      { id: 'sec-1', name: 'General Aptitude', durationMinutes: 30, questionsCount: 10 },
      { id: 'sec-2', name: 'Engineering Mathematics', durationMinutes: 30, questionsCount: 10 },
      { id: 'sec-3', name: 'Core CS & Engineering', durationMinutes: 120, questionsCount: 45 },
    ],
  },
  {
    examName: 'JEE Advanced Sectional Benchmark',
    totalMinutes: 180,
    sections: [
      { id: 'sec-1', name: 'Physics Section', durationMinutes: 60, questionsCount: 18 },
      { id: 'sec-2', name: 'Chemistry Section', durationMinutes: 50, questionsCount: 18 },
      { id: 'sec-3', name: 'Mathematics Section', durationMinutes: 70, questionsCount: 18 },
    ],
  },
  {
    examName: 'GRE General Simulation',
    totalMinutes: 115,
    sections: [
      { id: 'sec-1', name: 'Analytical Writing', durationMinutes: 30, questionsCount: 1 },
      { id: 'sec-2', name: 'Quantitative Reasoning', durationMinutes: 45, questionsCount: 27 },
      { id: 'sec-3', name: 'Verbal Reasoning', durationMinutes: 40, questionsCount: 27 },
    ],
  },
];

export function sanitizeExamSimulationState(
  raw: ExamSimulationState & Record<string, unknown>
): ExamSimulationState {
  const clean: ExamSimulationState = {
    id: raw.id,
    title: raw.title,
    totalDurationMinutes: raw.totalDurationMinutes,
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    currentSectionIndex: Number.isFinite(raw.currentSectionIndex) ? raw.currentSectionIndex : 0,
    status: raw.status,
    sectionElapsedSeconds:
      raw.sectionElapsedSeconds && typeof raw.sectionElapsedSeconds === 'object'
        ? raw.sectionElapsedSeconds
        : {},
    totalElapsedSeconds: Number.isFinite(raw.totalElapsedSeconds) ? raw.totalElapsedSeconds : 0,
  };
  if (raw.userId) clean.userId = raw.userId;
  if (raw.flaggedQuestions) clean.flaggedQuestions = raw.flaggedQuestions;
  if (raw.attemptedQuestions) clean.attemptedQuestions = raw.attemptedQuestions;
  if (raw.startedAt) clean.startedAt = raw.startedAt;
  if (raw.completedAt) clean.completedAt = raw.completedAt;
  return clean;
}

export function restorePersistedExamSimulation(rawJson: string | null): {
  examState: ExamSimulationState;
  config: ExamSimulationConfig;
  sectionTimeRemaining: number;
  totalTimeRemaining: number;
  sectionSpentSeconds: Record<string, number>;
} | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || !parsed.status) return null;
    const examState = sanitizeExamSimulationState(parsed);
    const sections =
      Array.isArray(examState.sections) && examState.sections.length > 0
        ? examState.sections
        : PRESET_EXAMS[0].sections;
    const config: ExamSimulationConfig = {
      examName: examState.title || PRESET_EXAMS[0].examName,
      totalMinutes: examState.totalDurationMinutes || PRESET_EXAMS[0].totalMinutes,
      sections,
    };
    return {
      examState,
      config,
      sectionTimeRemaining: Number(parsed.sectionTimeRemaining) || 0,
      totalTimeRemaining: Number(parsed.totalTimeRemaining) || 0,
      sectionSpentSeconds:
        parsed.sectionSpentSeconds && typeof parsed.sectionSpentSeconds === 'object'
          ? parsed.sectionSpentSeconds
          : {},
    };
  } catch {
    return null;
  }
}

export function buildCompletedExamPayload(
  examState: ExamSimulationState,
  sectionSpentSeconds: Record<string, number>,
  completedAtIso: string = new Date().toISOString()
): ExamSimulationState {
  const cleanSectionElapsed: Record<string, number> = {};
  for (const sec of examState.sections || []) {
    cleanSectionElapsed[sec.id] = Math.max(0, Math.round(sectionSpentSeconds[sec.id] || 0));
  }
  for (const [secId, secs] of Object.entries(sectionSpentSeconds || {})) {
    if (!(secId in cleanSectionElapsed)) {
      cleanSectionElapsed[secId] = Math.max(0, Math.round(secs || 0));
    }
  }
  const totalElapsedSeconds = Math.min(
    86400,
    Math.max(0, Object.values(cleanSectionElapsed).reduce((sum, v) => sum + v, 0))
  );

  return sanitizeExamSimulationState({
    ...examState,
    status: 'completed',
    completedAt: completedAtIso,
    sectionElapsedSeconds: cleanSectionElapsed,
    totalElapsedSeconds,
  });
}

export const ExamHallSimulator: React.FC = () => {
  const { user, firebaseUser, settings, triggerRefresh } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const storageKey = `focusflow_${activeUid}_exam_sim_state_v1`;

  const initialRestored = useMemo(
    () => restorePersistedExamSimulation(localStorage.getItem(storageKey)),
    // Only evaluate initial snapshot for the initial storageKey; account switches sync in useEffect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [studyExamPresets, setStudyExamPresets] = useState<ExamSimulationConfig[]>([]);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [customConfig, setCustomConfig] = useState<ExamSimulationConfig>(
    () => initialRestored?.config || PRESET_EXAMS[0]
  );

  useEffect(() => {
    api.getStudyExams()
      .then((exams) => {
        if (!Array.isArray(exams) || exams.length === 0) return;
        const mapped: ExamSimulationConfig[] = exams.map((ex) => {
          const mins = Math.max(30, Number((ex as any).durationMinutes || 120));
          return {
            examName: `${ex.title} (Study Exam)`,
            totalMinutes: mins,
            sections: [
              { id: `sec-${ex.id}-1`, name: ex.title, durationMinutes: mins, questionsCount: 30 },
            ],
          };
        });
        setStudyExamPresets(mapped);
      })
      .catch(() => {});
  }, []);

  const allExamPresets = useMemo(
    () => [...studyExamPresets, ...PRESET_EXAMS],
    [studyExamPresets]
  );

  // Active state (strictly sanitized without localStorage-only timer keys)
  const [examState, setExamState] = useState<ExamSimulationState | null>(
    () => initialRestored?.examState || null
  );

  const [sectionTimeRemaining, setSectionTimeRemaining] = useState<number>(
    () => initialRestored?.sectionTimeRemaining || 0
  );
  const [totalTimeRemaining, setTotalTimeRemaining] = useState<number>(
    () => initialRestored?.totalTimeRemaining || 0
  );
  const [sectionSpentSeconds, setSectionSpentSeconds] = useState<{ [secId: string]: number }>(
    () => initialRestored?.sectionSpentSeconds || {}
  );
  const [isFinished, setIsFinished] = useState(false);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string>(storageKey);

  const finishedExamIdRef = useRef<string | null>(null);
  const advancingKeyRef = useRef<string | null>(null);

  // Sync user state on account switch before persistence runs for the new key
  useEffect(() => {
    const restored = restorePersistedExamSimulation(localStorage.getItem(storageKey));
    if (restored) {
      setExamState(restored.examState);
      setCustomConfig(restored.config);
      setSectionTimeRemaining(restored.sectionTimeRemaining);
      setTotalTimeRemaining(restored.totalTimeRemaining);
      setSectionSpentSeconds(restored.sectionSpentSeconds);
      setIsFinished(false);
    } else {
      setExamState(null);
      setSectionTimeRemaining(0);
      setTotalTimeRemaining(0);
      setSectionSpentSeconds({});
      setIsFinished(false);
    }
    setHydratedStorageKey(storageKey);
  }, [storageKey]);

  // Sync to localStorage only after state has hydrated for the active storageKey
  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    if (examState && examState.status !== 'completed') {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...examState,
          sectionTimeRemaining,
          totalTimeRemaining,
          sectionSpentSeconds,
        })
      );
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [hydratedStorageKey, storageKey, examState, sectionTimeRemaining, totalTimeRemaining, sectionSpentSeconds]);

  const activeSections = useMemo(
    () => (examState?.sections?.length ? examState.sections : customConfig.sections),
    [examState?.sections, customConfig.sections]
  );
  const activeTotalMinutes = examState?.totalDurationMinutes || customConfig.totalMinutes;

  const handleFinishExam = useCallback(() => {
    if (!examState) return;
    if (finishedExamIdRef.current === examState.id) return;
    finishedExamIdRef.current = examState.id;

    const completedState = buildCompletedExamPayload(examState, sectionSpentSeconds);
    setExamState(completedState);
    setIsFinished(true);
    localStorage.removeItem(storageKey);
    api.saveExamSimulation(completedState).catch(() => {});

    const spentSecs = completedState.totalElapsedSeconds;
    const durationMinutes = Math.max(1, Math.round(spentSecs / 60) || activeTotalMinutes);
    const endedAt = completedState.completedAt || new Date().toISOString();
    const startedAt = new Date(Date.now() - durationMinutes * 60_000).toISOString();

    void api
      .createFocusSession({
        mode: 'work',
        durationMinutes,
        durationSeconds: durationMinutes * 60,
        actualDurationSeconds: spentSecs || durationMinutes * 60,
        completed: true,
        status: 'completed',
        startedAt,
        endedAt,
        activityType: 'practice',
      })
      .then(async (created) => {
        if (firebaseUser?.uid) {
          const allSessions = await api.getFocusSessions().catch(() => [created]);
          await syncUserLeaderboardStats({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || undefined,
            sessions: Array.isArray(allSessions) ? allSessions : [created],
            timezone: settings?.timezone,
            onlyIfExists: true,
          }).catch(() => {});
        }
        triggerRefresh();
      })
      .catch(() => {});
  }, [examState, sectionSpentSeconds, storageKey, activeTotalMinutes, firebaseUser, settings?.timezone, triggerRefresh]);

  // Handle Advance Section
  const handleAdvanceSection = useCallback(() => {
    if (!examState) return;
    const nextIdx = examState.currentSectionIndex + 1;
    if (nextIdx < activeSections.length) {
      const nextSec = activeSections[nextIdx];
      setExamState((prev) => (prev ? { ...prev, currentSectionIndex: nextIdx } : null));
      setSectionTimeRemaining(nextSec.durationMinutes * 60);
    } else {
      handleFinishExam();
    }
  }, [examState, activeSections, handleFinishExam]);

  // Countdown timer loop (pure state updates only; side-effects run in the effect below)
  useEffect(() => {
    if (!examState || (examState.status !== 'in_progress' && examState.status !== 'running')) return;

    const currentSec = activeSections[examState.currentSectionIndex];
    const timer = setInterval(() => {
      setSectionTimeRemaining((prev) => Math.max(0, prev - 1));
      setTotalTimeRemaining((prev) => Math.max(0, prev - 1));

      if (currentSec) {
        setSectionSpentSeconds((map) => ({
          ...map,
          [currentSec.id]: (map[currentSec.id] || 0) + 1,
        }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [examState, activeSections]);

  // Advance or finish outside state updaters when section countdown hits 0
  useEffect(() => {
    if (!examState || (examState.status !== 'in_progress' && examState.status !== 'running')) return;
    if (sectionTimeRemaining > 0) {
      advancingKeyRef.current = null;
      return;
    }
    const key = `${examState.id}:${examState.currentSectionIndex}`;
    if (advancingKeyRef.current === key) return;
    advancingKeyRef.current = key;
    handleAdvanceSection();
  }, [sectionTimeRemaining, examState, handleAdvanceSection]);

  const handleStartExam = () => {
    const totalSecs = customConfig.totalMinutes * 60;
    const firstSecSecs = (customConfig.sections[0]?.durationMinutes || 30) * 60;

    const initial: ExamSimulationState = {
      id: `sim-${Date.now()}`,
      title: customConfig.examName,
      totalDurationMinutes: customConfig.totalMinutes,
      sections: customConfig.sections,
      currentSectionIndex: 0,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      sectionElapsedSeconds: {},
      totalElapsedSeconds: 0,
    };

    finishedExamIdRef.current = null;
    advancingKeyRef.current = null;
    setExamState(initial);
    setTotalTimeRemaining(totalSecs);
    setSectionTimeRemaining(firstSecSecs);
    setSectionSpentSeconds({});
    setIsFinished(false);
  };

  const handlePauseResume = () => {
    if (!examState) return;
    const isCurrentlyRunning = examState.status === 'in_progress' || examState.status === 'running';
    setExamState((prev) =>
      prev
        ? {
            ...prev,
            status: isCurrentlyRunning ? 'paused' : 'in_progress',
          }
        : null
    );
  };

  const handleResetExam = () => {
    if (!window.confirm('Abandon active exam and reset simulation?')) return;
    finishedExamIdRef.current = null;
    advancingKeyRef.current = null;
    setExamState(null);
    setIsFinished(false);
    localStorage.removeItem(storageKey);
  };

  // Format seconds to HH:MM:SS
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentSection = examState ? activeSections[examState.currentSectionIndex] : null;

  // Pace Assessment
  const paceStatus = useMemo(() => {
    if (!currentSection || !examState) return 'on_track';
    const totalSecs = currentSection.durationMinutes * 60;
    const elapsed = totalSecs - sectionTimeRemaining;
    const progressRatio = elapsed / totalSecs;

    if (sectionTimeRemaining <= 300) return 'critical'; // < 5 mins left
    if (progressRatio > 0.8) return 'behind_pace';
    if (progressRatio < 0.3) return 'ahead_of_pace';
    return 'on_track';
  }, [currentSection, examState, sectionTimeRemaining]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">Exam Hall Sectional Simulator</h2>
            <ThemeBadge tone="accent">v1.8 Hall Simulation</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Full-duration timed exam room simulation with sectional pacing indicators and refresh persistence.
          </p>
        </div>

        {!examState && !isFinished && (
          <div className="flex items-center gap-2">
            <select
              value={selectedPresetIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                setSelectedPresetIndex(idx);
                setCustomConfig(allExamPresets[idx] || PRESET_EXAMS[0]);
              }}
              className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-medium"
            >
              {allExamPresets.map((p, idx) => (
                <option key={`${p.examName}-${idx}`} value={idx}>
                  {p.examName} ({p.totalMinutes}m)
                </option>
              ))}
            </select>

            <ThemeButton variant="primary" size="sm" onClick={handleStartExam}>
              <Play className="w-3.5 h-3.5 mr-1" />
              Begin Exam
            </ThemeButton>
          </div>
        )}

        {examState && (
          <div className="flex items-center gap-2">
            <ThemeButton variant="secondary" size="sm" onClick={handlePauseResume}>
              {examState.status === 'in_progress' || examState.status === 'running' ? (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  Resume
                </>
              )}
            </ThemeButton>

            <ThemeButton variant="ghost" size="sm" onClick={handleResetExam}>
              <RotateCcw className="w-3.5 h-3.5 text-rose-400 mr-1" />
              Abandon
            </ThemeButton>
          </div>
        )}
      </div>

      {/* Active Exam Cockpit */}
      {examState && !isFinished && currentSection && (
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-6 shadow-sm">
          {/* Top Timers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-center space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                Active Section: {currentSection.name}
              </span>
              <div className="text-4xl sm:text-5xl font-mono font-bold text-[var(--ff-text-primary)] tracking-tight">
                {formatTime(sectionTimeRemaining)}
              </div>
              <div className="text-xs text-[var(--ff-text-muted)]">
                Allocated: {currentSection.durationMinutes} mins • Section {examState.currentSectionIndex + 1} of{' '}
                {activeSections.length}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-center space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                Total Exam Hall Clock
              </span>
              <div className="text-4xl sm:text-5xl font-mono font-bold text-amber-400 tracking-tight">
                {formatTime(totalTimeRemaining)}
              </div>
              <div className="text-xs text-[var(--ff-text-muted)]">
                Overall Exam Duration: {activeTotalMinutes} mins
              </div>
            </div>
          </div>

          {/* Section Pacing Bar & Status */}
          <div className="p-4 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--ff-text-primary)]">Section Pacing Indicator</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  paceStatus === 'critical'
                    ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                    : paceStatus === 'behind_pace'
                    ? 'bg-amber-500/20 text-amber-300'
                    : paceStatus === 'ahead_of_pace'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {paceStatus === 'critical'
                  ? 'Final 5 Mins Remaining!'
                  : paceStatus === 'behind_pace'
                  ? 'Behind Target Pace'
                  : paceStatus === 'ahead_of_pace'
                  ? 'Ahead of Schedule'
                  : 'On Target Pace'}
              </span>
            </div>

            <div className="w-full bg-[var(--ff-surface)] h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  paceStatus === 'critical' ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      (1 - sectionTimeRemaining / (currentSection.durationMinutes * 60)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Section Step Breadcrumbs & Nav */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-[var(--ff-border)]">
            <div className="flex items-center gap-2 flex-wrap">
              {activeSections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border ${
                    idx === examState.currentSectionIndex
                      ? 'bg-[var(--ff-accent)]/20 border-[var(--ff-accent)] text-[var(--ff-text-primary)]'
                      : idx < examState.currentSectionIndex
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border)] text-[var(--ff-text-muted)]'
                  }`}
                >
                  {idx < examState.currentSectionIndex ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <span>{idx + 1}.</span>
                  )}
                  <span>{sec.name}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={handleAdvanceSection}
              >
                {examState.currentSectionIndex < activeSections.length - 1 ? (
                  <>
                    Next Section
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </>
                ) : (
                  <>
                    Finish Exam
                    <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                  </>
                )}
              </ThemeButton>
            </div>
          </div>
        </div>
      )}

      {/* Finished Scorecard */}
      {isFinished && (
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-emerald-500/40 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400">
                <Award className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-[var(--ff-text-primary)]">Exam Simulation Completed!</h3>
                <p className="text-xs text-[var(--ff-text-muted)]">Official sectional pacing performance report</p>
              </div>
            </div>

            <ThemeButton variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print Scorecard
            </ThemeButton>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--ff-border)] text-[var(--ff-text-muted)]">
                  <th className="py-2.5 px-3">Section Name</th>
                  <th className="py-2.5 px-3">Allocated Time</th>
                  <th className="py-2.5 px-3">Actual Time Spent</th>
                  <th className="py-2.5 px-3">Pacing Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ff-border)]">
                {activeSections.map((sec) => {
                  const spentSecs = sectionSpentSeconds[sec.id] || 0;
                  const allocatedSecs = sec.durationMinutes * 60;
                  const isUnder = spentSecs <= allocatedSecs;

                  return (
                    <tr key={sec.id} className="text-[var(--ff-text-primary)]">
                      <td className="py-3 px-3 font-medium">{sec.name}</td>
                      <td className="py-3 px-3 font-mono">{sec.durationMinutes}m 00s</td>
                      <td className="py-3 px-3 font-mono">{formatTime(spentSecs)}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            isUnder ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {isUnder ? 'Completed in Time' : 'Exceeded Allotted Limit'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => {
                setIsFinished(false);
                setExamState(null);
              }}
            >
              Start Another Exam
            </ThemeButton>
          </div>
        </div>
      )}

      {/* Preset Details Preview */}
      {!examState && !isFinished && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {customConfig.sections.map((sec, idx) => (
            <div key={sec.id} className="p-4 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-1">
              <span className="text-[10px] font-bold text-[var(--ff-accent-text)] uppercase tracking-wider">
                Section {idx + 1}
              </span>
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">{sec.name}</h4>
              <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] pt-1">
                <span>Duration: {sec.durationMinutes} Mins</span>
                {sec.questionsCount && <span>{sec.questionsCount} Questions</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
