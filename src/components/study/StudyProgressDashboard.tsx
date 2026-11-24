import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  TrendingUp,
  ListChecks,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowUpRight,
  AlertCircle,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { StudySubject, StudyTopic } from '../../types/study.ts';
import { FocusSession } from '../../types/index.ts';
import { StudySheetSyncState } from '../../types/sheetHub.ts';
import {
  ThemeCard,
  ThemeButton,
  ThemeBadge,
} from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  MotionStaggerGrid,
  MotionStaggerItem,
} from '../ui/MotionPrimitives.tsx';

export interface StudyProgressDashboardProps {
  subjects: StudySubject[];
  topics: StudyTopic[];
  focusSessions?: FocusSession[];
  syncState?: StudySheetSyncState;
  isSyncing?: boolean;
  onSyncNow?: () => Promise<void>;
  onSelectSubject?: (subjectCode: string) => void;
  selectedSubjectCode?: string;
  onNavigateToSheetHub?: () => void;
}

export const StudyProgressDashboard: React.FC<StudyProgressDashboardProps> = ({
  subjects,
  topics,
  focusSessions,
  syncState,
  isSyncing = false,
  onSyncNow,
  onSelectSubject,
  selectedSubjectCode = 'all',
  onNavigateToSheetHub,
}) => {
  const [activeUnitSubject, setActiveUnitSubject] = useState<string>('all');
  const [isUnitBreakdownExpanded, setIsUnitBreakdownExpanded] = useState<boolean>(true);

  // Active records only (filter soft-deleted)
  const activeSubjects = useMemo(() => subjects.filter((s) => !s.deletedAt), [subjects]);
  const activeTopics = useMemo(() => topics.filter((t) => !t.deletedAt), [topics]);

  // Overall metrics calculation (strictly based on actual topics)
  const metrics = useMemo(() => {
    const totalSubjects = activeSubjects.length;
    const totalTopics = activeTopics.length;
    const completedTopics = activeTopics.filter((t) => Boolean(t.theory && t.practice)).length;
    const remainingTopics = Math.max(0, totalTopics - completedTopics);
    const overallCompletionPct =
      totalTopics > 0 ? Math.min(100, Math.round((completedTopics / totalTopics) * 100)) : 0;

    const theoryCompleted = activeTopics.filter((t) => t.theory).length;
    const practiceCompleted = activeTopics.filter((t) => t.practice).length;
    const pyqCompleted = activeTopics.filter((t) => t.pyq).length;

    return {
      totalSubjects,
      totalTopics,
      completedTopics,
      remainingTopics,
      overallCompletionPct,
      theoryCompleted,
      practiceCompleted,
      pyqCompleted,
    };
  }, [activeSubjects, activeTopics]);

  // Subject-wise progress breakdown
  const subjectProgressList = useMemo(() => {
    return activeSubjects.map((sub) => {
      const subTopics = activeTopics.filter((t) => t.subjectCode === sub.code);
      const total = subTopics.length;
      const completed = subTopics.filter((t) => Boolean(t.theory && t.practice)).length;
      const remaining = Math.max(0, total - completed);
      const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
      const theory = subTopics.filter((t) => t.theory).length;
      const practice = subTopics.filter((t) => t.practice).length;

      let status: 'Completed' | 'In Progress' | 'Not Started' = 'Not Started';
      if (pct === 100 && total > 0) status = 'Completed';
      else if (completed > 0 || theory > 0 || practice > 0) status = 'In Progress';

      return {
        id: sub.id,
        code: sub.code,
        name: sub.name,
        color: sub.color || '#6366f1',
        total,
        completed,
        remaining,
        pct,
        theory,
        practice,
        status,
      };
    });
  }, [activeSubjects, activeTopics]);

  // Chapter / Unit Level Progress Breakdown for selected subject
  const unitBreakdown = useMemo(() => {
    const targetCode = activeUnitSubject !== 'all' ? activeUnitSubject : selectedSubjectCode !== 'all' ? selectedSubjectCode : null;
    const relevantTopics = targetCode
      ? activeTopics.filter((t) => t.subjectCode === targetCode)
      : activeTopics;

    const map = new Map<
      string,
      { unit: string; subjectCode: string; total: number; completed: number; remaining: number; pct: number }
    >();

    for (const t of relevantTopics) {
      const unitName = (t.unit || 'General').trim();
      const key = `${t.subjectCode}::${unitName}`;
      const entry = map.get(key) || {
        unit: unitName,
        subjectCode: t.subjectCode,
        total: 0,
        completed: 0,
        remaining: 0,
        pct: 0,
      };

      entry.total += 1;
      if (t.theory && t.practice) {
        entry.completed += 1;
      }
      map.set(key, entry);
    }

    return Array.from(map.values())
      .map((u) => ({
        ...u,
        remaining: Math.max(0, u.total - u.completed),
        pct: u.total > 0 ? Math.min(100, Math.round((u.completed / u.total) * 100)) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [activeTopics, activeUnitSubject, selectedSubjectCode]);

  // Format relative or absolute timestamp
  const formatSyncTime = (timestamp?: string | null) => {
    if (!timestamp) return 'Never';
    try {
      const date = new Date(timestamp);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return timestamp;
    }
  };

  // SVG Circular Donut calculations
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutCompletedDash = (metrics.overallCompletionPct / 100) * donutCircumference;
  const donutRemainingDash = donutCircumference - donutCompletedDash;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------------- */}
      {/* SYNC STATUS TOOLBAR                                                    */}
      {/* ---------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isSyncing
                  ? 'bg-blue-400 animate-pulse'
                  : syncState?.status === 'synced' || syncState?.status === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                  : syncState?.status === 'pending_changes'
                  ? 'bg-amber-400'
                  : syncState?.status === 'read_only'
                  ? 'bg-sky-400'
                  : syncState?.status === 'permission_required'
                  ? 'bg-orange-400 animate-pulse'
                  : 'bg-zinc-400'
              }`}
            />
            <span className="text-xs font-semibold text-[var(--ff-text-primary)]">
              {isSyncing
                ? 'Syncing with Google Sheets...'
                : syncState?.status === 'synced'
                ? 'Google Sheets Synced'
                : syncState?.status === 'pending_changes'
                ? 'Pending Changes'
                : syncState?.status === 'read_only'
                ? 'Read-Only Mode'
                : syncState?.status === 'permission_required'
                ? 'Authorization Required'
                : syncState?.status === 'sync_failed'
                ? 'Sync Failed'
                : 'Connected to Sheets'}
            </span>
          </div>

          {syncState?.connectedSheetTitle && (
            <span className="text-xs text-[var(--ff-text-muted)] truncate max-w-[200px]" title={syncState.connectedSheetTitle}>
              • {syncState.connectedSheetTitle}
            </span>
          )}

          <span className="text-xs text-[var(--ff-text-muted)]">
            • Last synced: {formatSyncTime(syncState?.lastSyncedAt)}
          </span>

          {Boolean(syncState?.pendingCount && syncState.pendingCount > 0) && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {syncState?.pendingCount} pending {syncState?.pendingCount === 1 ? 'write' : 'writes'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSyncNow && (
            <ThemeButton
              variant="secondary"
              size="sm"
              loading={isSyncing}
              onClick={() => void onSyncNow()}
              className="text-xs flex items-center gap-1.5"
              title="Force two-way synchronization with Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync Now</span>
            </ThemeButton>
          )}

          {onNavigateToSheetHub && (
            <ThemeButton
              variant="ghost"
              size="sm"
              onClick={onNavigateToSheetHub}
              className="text-xs text-[var(--ff-accent-text)] hover:bg-[var(--ff-accent-soft)] flex items-center gap-1"
              title="Manage Google Sheets Connection in Sheet Hub"
            >
              <span>Sheet Hub</span>
              <ExternalLink className="w-3 h-3" />
            </ThemeButton>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 1. SUMMARY CARDS (5 KPI CARDS)                                         */}
      {/* ---------------------------------------------------------------------- */}
      <MotionStaggerGrid className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Subjects */}
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full border border-[var(--ff-border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Total Subjects</span>
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber value={metrics.totalSubjects} />
              </div>
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                Active syllabus courses
              </p>
            </div>
          </ThemeCard>
        </MotionStaggerItem>

        {/* Total Topics */}
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full border border-[var(--ff-border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Total Topics</span>
              <ListChecks className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber value={metrics.totalTopics} />
              </div>
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                Actual syllabus items
              </p>
            </div>
          </ThemeCard>
        </MotionStaggerItem>

        {/* Completed Topics */}
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full border border-[var(--ff-border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Completed Topics</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-500 dark:text-emerald-400">
                <AnimatedNumber value={metrics.completedTopics} />
              </div>
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                Theory & practice covered
              </p>
            </div>
          </ThemeCard>
        </MotionStaggerItem>

        {/* Remaining Topics */}
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full border border-[var(--ff-border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Remaining Topics</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-500 dark:text-amber-400">
                <AnimatedNumber value={metrics.remainingTopics} />
              </div>
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                Total - Completed
              </p>
            </div>
          </ThemeCard>
        </MotionStaggerItem>

        {/* Overall Completion Percentage */}
        <MotionStaggerItem className="col-span-2 md:col-span-1">
          <ThemeCard variant="3d" className="p-4 flex flex-col justify-between h-full border border-[var(--ff-border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-2">
              <span className="font-medium">Completion Rate</span>
              <TrendingUp className="w-4 h-4 text-accent-indigo" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber value={metrics.overallCompletionPct} format={(v) => `${Math.round(v)}%`} />
              </div>
              <div className="mt-2">
                <AnimatedProgressBar
                  value={metrics.overallCompletionPct}
                  max={100}
                  heightClass="h-1.5"
                  customColor="#6366f1"
                  ariaLabel="Overall completion percentage"
                />
              </div>
            </div>
          </ThemeCard>
        </MotionStaggerItem>
      </MotionStaggerGrid>

      {/* ---------------------------------------------------------------------- */}
      {/* 2. VISUAL PROGRESS INDICATORS                                          */}
      {/* ---------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut Chart: Completed vs Remaining */}
        <ThemeCard variant="default" className="p-5 flex flex-col justify-between border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">Completed vs Remaining</h4>
              <p className="text-xs text-[var(--ff-text-muted)]">Topic distribution breakdown</p>
            </div>
            <span className="text-xs font-mono font-bold text-[var(--ff-accent-text)]">
              {metrics.overallCompletionPct}%
            </span>
          </div>

          <div className="flex items-center justify-center my-3">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius}
                  className="stroke-[var(--ff-surface-muted)] text-[var(--ff-surface-muted)] fill-none"
                  strokeWidth="12"
                />
                {/* Remaining Slice (Subtle) */}
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="12"
                  strokeDasharray={`${donutCircumference} ${donutCircumference}`}
                  strokeDashoffset="0"
                  className="opacity-40"
                />
                {/* Completed Slice (Accent/Emerald) */}
                <circle
                  cx="50"
                  cy="50"
                  r={donutRadius}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={`${donutCompletedDash} ${donutRemainingDash}`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
                  {metrics.overallCompletionPct}%
                </span>
                <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider font-semibold">
                  Done
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--ff-border-color)] text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <span className="text-[var(--ff-text-muted)] block text-[10px]">Completed</span>
                <span className="font-bold font-mono text-emerald-400">{metrics.completedTopics} topics</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0" />
              <div>
                <span className="text-[var(--ff-text-muted)] block text-[10px]">Remaining</span>
                <span className="font-bold font-mono text-[var(--ff-text-secondary)]">{metrics.remainingTopics} topics</span>
              </div>
            </div>
          </div>
        </ThemeCard>

        {/* Subject-wise Progress Bar Chart */}
        <ThemeCard variant="default" className="p-5 lg:col-span-2 flex flex-col justify-between border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">Subject-wise Progress</h4>
              <p className="text-xs text-[var(--ff-text-muted)]">Relative completion across courses</p>
            </div>
            <span className="text-xs text-[var(--ff-text-muted)]">
              {subjectProgressList.length} subjects
            </span>
          </div>

          <div className="space-y-3.5 my-2">
            {subjectProgressList.length === 0 ? (
              <div className="text-center py-8 text-xs text-[var(--ff-text-muted)]">
                No syllabus subjects imported yet.
              </div>
            ) : (
              subjectProgressList.map((sub) => (
                <div
                  key={sub.code}
                  onClick={() => onSelectSubject?.(sub.code)}
                  className="cursor-pointer group p-2 rounded-xl hover:bg-[var(--ff-surface-muted)] transition-colors"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color }}
                      />
                      <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                        {sub.name}
                      </span>
                      <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                        ({sub.code})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                      <span className="text-[var(--ff-text-muted)]">
                        {sub.completed}/{sub.total}
                      </span>
                      <span className="font-bold text-[var(--ff-text-primary)] w-10 text-right">
                        {sub.pct}%
                      </span>
                    </div>
                  </div>
                  <AnimatedProgressBar
                    value={sub.pct}
                    max={100}
                    heightClass="h-2"
                    customColor={sub.color}
                    ariaLabel={`${sub.name} progress`}
                  />
                </div>
              ))
            )}
          </div>

          <div className="pt-2 text-[11px] text-[var(--ff-text-muted)] text-right">
            Click any subject to view detailed topics
          </div>
        </ThemeCard>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 3. SUBJECT-WISE OVERVIEW TABLE / CARDS                                 */}
      {/* ---------------------------------------------------------------------- */}
      <ThemeCard variant="default" className="p-5 border border-[var(--ff-border-color)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">Syllabus Overview Table</h4>
            <p className="text-xs text-[var(--ff-text-muted)]">Accurate subject topic metrics and status</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[var(--ff-border-color)] text-[var(--ff-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Subject Name</th>
                <th className="py-2.5 px-3 text-center">Total Topics</th>
                <th className="py-2.5 px-3 text-center">Completed</th>
                <th className="py-2.5 px-3 text-center">Remaining</th>
                <th className="py-2.5 px-3">Progress</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ff-border-color)]">
              {subjectProgressList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--ff-text-muted)]">
                    No subjects found.
                  </td>
                </tr>
              ) : (
                subjectProgressList.map((sub) => (
                  <tr
                    key={sub.code}
                    className="hover:bg-[var(--ff-surface-muted)] transition-colors group cursor-pointer"
                    onClick={() => onSelectSubject?.(sub.code)}
                  >
                    <td className="py-3 px-3 font-semibold text-[var(--ff-text-primary)]">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sub.color }}
                        />
                        <span>{sub.name}</span>
                        <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                          {sub.code}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-[var(--ff-text-primary)]">
                      {sub.total}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-emerald-500 dark:text-emerald-400">
                      {sub.completed}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-500 dark:text-amber-400">
                      {sub.remaining}
                    </td>
                    <td className="py-3 px-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <AnimatedProgressBar
                            value={sub.pct}
                            max={100}
                            heightClass="h-1.5"
                            customColor={sub.color}
                            ariaLabel={`${sub.name} completion`}
                          />
                        </div>
                        <span className="font-mono text-[10px] font-bold text-[var(--ff-text-muted)] w-8 text-right">
                          {sub.pct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          sub.status === 'Completed'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : sub.status === 'In Progress'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-[var(--ff-accent-text)] group-hover:underline text-xs flex items-center justify-end gap-0.5">
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ThemeCard>

      {/* ---------------------------------------------------------------------- */}
      {/* 4. CHAPTER / UNIT LEVEL BREAKDOWN                                      */}
      {/* ---------------------------------------------------------------------- */}
      <ThemeCard variant="default" className="p-5 border border-[var(--ff-border-color)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-indigo" />
            <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">Chapter / Unit Progress Breakdown</h4>
            <span className="text-xs text-[var(--ff-text-muted)] font-mono">
              ({unitBreakdown.length} units)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={activeUnitSubject}
              onChange={(e) => setActiveUnitSubject(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="all">All Subjects</option>
              {activeSubjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setIsUnitBreakdownExpanded(!isUnitBreakdownExpanded)}
              className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              title={isUnitBreakdownExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown
                className={`w-4 h-4 transform transition-transform ${
                  isUnitBreakdownExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {isUnitBreakdownExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unitBreakdown.length === 0 ? (
              <div className="col-span-full py-6 text-center text-xs text-[var(--ff-text-muted)]">
                No units found for this selection.
              </div>
            ) : (
              unitBreakdown.map((u) => {
                const isFullyDone = u.completed === u.total && u.total > 0;
                return (
                  <div
                    key={`${u.subjectCode}::${u.unit}`}
                    className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-[var(--ff-text-primary)] truncate max-w-[180px]" title={u.unit}>
                          {u.unit}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                          {u.subjectCode}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] font-mono mb-2">
                        <span>
                          {u.completed}/{u.total} completed
                        </span>
                        <span className={isFullyDone ? 'text-emerald-400 font-bold' : ''}>
                          {u.remaining} left
                        </span>
                      </div>
                    </div>

                    <div>
                      <AnimatedProgressBar
                        value={u.pct}
                        max={100}
                        heightClass="h-1.5"
                        customColor={isFullyDone ? '#10b981' : '#6366f1'}
                        ariaLabel={`${u.unit} progress`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
