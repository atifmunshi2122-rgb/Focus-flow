/**
 * FocusFlow & Finance — Graph Studio Authoritative Data Aggregator
 * Centralizes all deterministic mathematical aggregations, timezone conversions,
 * tenant isolation checks, and deleted record filtering.
 * ZERO AI. ZERO FAKE DATA.
 */

import {
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  BudgetEnvelope,
  SavingsGoal,
  Task,
  Habit,
} from '../../../types/index.ts';
import {
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyExam,
  StudyActivityLog,
} from '../../../types/study.ts';
import {
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  getZonedDateParts,
  getStartOfWeek,
  addDays,
} from '../../../lib/dateTime.ts';
import { getSessionFocusSeconds } from '../../../lib/pomodoroAnalytics.ts';
import { isHabitScheduledOnDate, computeHabitStreak } from '../../../lib/productivityIntelligence.ts';

// ============================================================================
// 1. STUDY ANALYTICS AGGREGATIONS
// ============================================================================

export interface StudyHeatmapCell {
  date: string;
  minutes: number;
  sessionsCount: number;
  subjectsCount: number;
}

export function aggregateStudyActivityHeatmap(
  sessions: FocusSession[],
  activityLogs: StudyActivityLog[],
  startDateStr: string,
  endDateStr: string,
  timezone: string = DEFAULT_TIMEZONE,
  activeUserId?: string | null
): { cells: StudyHeatmapCell[]; totalMinutes: number; activeDaysCount: number } {
  const dayMap = new Map<string, { minutes: number; sessionsCount: number; subjects: Set<string> }>();

  // Filter valid sessions
  sessions.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if ((s as { deletedAt?: string | null }).deletedAt || (!s.completed && s.status !== 'completed') || !s.startedAt) return;
    // Count sessions tagged with study or subjectCode or work mode
    const isStudy = s.activityType === 'study' || Boolean(s.subjectCode) || s.mode === 'work';
    if (!isStudy) return;

    let dateStr = '';
    try {
      dateStr = formatDateInTimezone(s.startedAt, timezone);
    } catch {
      dateStr = s.startedAt.slice(0, 10);
    }
    if (!dateStr) return;

    const current = dayMap.get(dateStr) || { minutes: 0, sessionsCount: 0, subjects: new Set<string>() };
    current.minutes += Math.round(getSessionFocusSeconds(s) / 60);
    current.sessionsCount += 1;
    if (s.subjectCode) current.subjects.add(s.subjectCode);
    dayMap.set(dateStr, current);
  });

  // Filter activity logs
  activityLogs.forEach((log) => {
    if (activeUserId && log.userId && log.userId !== activeUserId) return;
    const dateStr = log.activityDate || (log.createdAt ? log.createdAt.slice(0, 10) : '');
    if (!dateStr) return;

    const current = dayMap.get(dateStr) || { minutes: 0, sessionsCount: 0, subjects: new Set<string>() };
    if (log.subjectId) current.subjects.add(log.subjectId);
    dayMap.set(dateStr, current);
  });

  const cells: StudyHeatmapCell[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
    const cur = new Date(start);
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const data = dayMap.get(dateStr);
      cells.push({
        date: dateStr,
        minutes: data?.minutes || 0,
        sessionsCount: data?.sessionsCount || 0,
        subjectsCount: data?.subjects.size || 0,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

  const totalMinutes = cells.reduce((sum, c) => sum + c.minutes, 0);
  const activeDaysCount = cells.filter((c) => c.minutes > 0).length;

  return { cells, totalMinutes, activeDaysCount };
}

export interface SubjectStudyHourItem {
  subjectCode: string;
  name: string;
  minutes: number;
  hours: string;
  percentage: number;
  sessionCount: number;
  color: string;
}

export function aggregateSubjectStudyHours(
  sessions: FocusSession[],
  subjects: StudySubject[],
  activeUserId?: string | null
): { list: SubjectStudyHourItem[]; totalMinutes: number } {
  const subjectMap = new Map<string, StudySubject>();
  subjects.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if (s.deletedAt) return;
    mapSubject(subjectMap, s.code, s);
    mapSubject(subjectMap, s.id, s);
  });

  const hoursMap = new Map<string, { subjectCode: string; name: string; minutes: number; sessionCount: number; color: string }>();

  sessions.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if ((s as { deletedAt?: string | null }).deletedAt || (!s.completed && s.status !== 'completed')) return;
    const code = s.subjectCode || s.subjectId;
    if (!code) return;

    const sub = subjectMap.get(code);
    const name = sub?.name || code;
    const color = sub?.color || 'var(--ff-accent)';

    const current = hoursMap.get(code) || { subjectCode: code, name, minutes: 0, sessionCount: 0, color };
    current.minutes += Math.round(getSessionFocusSeconds(s) / 60);
    current.sessionCount += 1;
    hoursMap.set(code, current);
  });

  const rawList = Array.from(hoursMap.values()).sort((a, b) => b.minutes - a.minutes);
  const totalMinutes = rawList.reduce((sum, item) => sum + item.minutes, 0);

  const list: SubjectStudyHourItem[] = rawList.map((item) => ({
    ...item,
    hours: (item.minutes / 60).toFixed(1),
    percentage: totalMinutes > 0 ? Math.round((item.minutes / totalMinutes) * 100) : 0,
  }));

  return { list, totalMinutes };
}

function mapSubject(map: Map<string, StudySubject>, key: string | undefined, sub: StudySubject) {
  if (key) map.set(key, sub);
}

export interface StudyTrendBucket {
  periodKey: string; // e.g. "Week 42" or "2026-11"
  periodLabel: string;
  minutes: number;
  hours: number;
  sessionCount: number;
}

export function aggregateStudyTrends(
  sessions: FocusSession[],
  mode: 'weekly' | 'monthly',
  timezone: string = DEFAULT_TIMEZONE,
  activeUserId?: string | null
): { buckets: StudyTrendBucket[]; maxMinutes: number; totalMinutes: number } {
  const bucketMap = new Map<string, { periodKey: string; periodLabel: string; minutes: number; sessionCount: number }>();

  sessions.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if ((s as { deletedAt?: string | null }).deletedAt || (!s.completed && s.status !== 'completed') || !s.startedAt) return;
    const isStudy = s.activityType === 'study' || Boolean(s.subjectCode) || s.mode === 'work';
    if (!isStudy) return;

    let dateStr = '';
    try {
      dateStr = formatDateInTimezone(s.startedAt, timezone);
    } catch {
      dateStr = s.startedAt.slice(0, 10);
    }
    if (!dateStr) return;

    let key = '';
    let label = '';
    if (mode === 'weekly') {
      key = getStartOfWeek(dateStr);
      label = `Wk ${key.slice(5)}`;
    } else {
      key = dateStr.slice(0, 7);
      label = key;
    }

    const curr = bucketMap.get(key) || { periodKey: key, periodLabel: label, minutes: 0, sessionCount: 0 };
    curr.minutes += Math.round(getSessionFocusSeconds(s) / 60);
    curr.sessionCount += 1;
    bucketMap.set(key, curr);
  });

  const sortedKeys = Array.from(bucketMap.keys()).sort();
  const trimmedKeys = mode === 'weekly' ? sortedKeys.slice(-8) : sortedKeys.slice(-6);

  const buckets: StudyTrendBucket[] = trimmedKeys.map((key) => {
    const data = bucketMap.get(key)!;
    return {
      periodKey: data.periodKey,
      periodLabel: data.periodLabel,
      minutes: data.minutes,
      hours: Math.round((data.minutes / 60) * 10) / 10,
      sessionCount: data.sessionCount,
    };
  });

  const maxMinutes = Math.max(60, ...buckets.map((b) => b.minutes));
  const totalMinutes = buckets.reduce((sum, b) => sum + b.minutes, 0);

  return { buckets, maxMinutes, totalMinutes };
}

export interface SyllabusTriadItem {
  code: string;
  name: string;
  color: string;
  totalTopics: number;
  theoryPct: number;
  practicePct: number;
  pyqPct: number;
  readinessIndex: number;
}

export function aggregateSyllabusTriadProgress(
  subjects: StudySubject[],
  topics: StudyTopic[],
  activeUserId?: string | null
): SyllabusTriadItem[] {
  return subjects
    .filter((s) => (!activeUserId || !s.userId || s.userId === activeUserId) && !s.deletedAt)
    .map((sub) => {
      const subTopics = topics.filter(
        (t) =>
          (!activeUserId || !t.userId || t.userId === activeUserId) &&
          !t.deletedAt &&
          t.subjectCode === sub.code
      );
      const total = subTopics.length;

      if (total === 0) {
        return {
          code: sub.code,
          name: sub.name,
          color: sub.color || 'var(--ff-accent)',
          totalTopics: 0,
          theoryPct: 0,
          practicePct: 0,
          pyqPct: 0,
          readinessIndex: 0,
        };
      }

      const theoryCount = subTopics.filter((t) => t.theory).length;
      const practiceCount = subTopics.filter((t) => t.practice).length;
      const pyqCount = subTopics.filter((t) => t.pyq).length;

      const theoryPct = Math.round((theoryCount / total) * 100);
      const practicePct = Math.round((practiceCount / total) * 100);
      const pyqPct = Math.round((pyqCount / total) * 100);
      const readinessIndex = Math.round((theoryPct + practicePct + pyqPct) / 3);

      return {
        code: sub.code,
        name: sub.name,
        color: sub.color || 'var(--ff-accent)',
        totalTopics: total,
        theoryPct,
        practicePct,
        pyqPct,
        readinessIndex,
      };
    })
    .sort((a, b) => b.readinessIndex - a.readinessIndex);
}

export interface SubjectPerformanceItem {
  subjectCode: string;
  subjectName: string;
  examAvgPct: number | null;
  revisionRecallAvg: number | null;
  overallScore: number;
}

export function aggregateSubjectPerformance(
  exams: StudyExam[],
  revisions: StudyRevision[],
  subjects: StudySubject[],
  activeUserId?: string | null
): SubjectPerformanceItem[] {
  const list: SubjectPerformanceItem[] = [];

  subjects
    .filter((s) => (!activeUserId || !s.userId || s.userId === activeUserId) && !s.deletedAt)
    .forEach((sub) => {
      // Find published exams for this subject with valid obtainedMarks
      const subExams = exams.filter(
        (e) =>
          (!activeUserId || !e.userId || e.userId === activeUserId) &&
          !e.deletedAt &&
          e.resultStatus === 'published' &&
          typeof e.obtainedMarks === 'number' &&
          e.totalMarks > 0 &&
          (e.subjectIds.includes(sub.id) || e.subjectIds.includes(sub.code))
      );

      const examAvgPct =
        subExams.length > 0
          ? Math.round(
              subExams.reduce((acc, e) => acc + ((e.obtainedMarks || 0) / e.totalMarks) * 100, 0) /
                subExams.length
            )
          : null;

      // Find revisions with documented recallScore
      const subRevisions = revisions.filter(
        (r) =>
          (!activeUserId || !r.userId || r.userId === activeUserId) &&
          !r.deletedAt &&
          r.subjectCode === sub.code &&
          typeof r.recallScore === 'number' &&
          r.recallScore >= 0
      );

      const revisionRecallAvg =
        subRevisions.length > 0
          ? Math.round(
              subRevisions.reduce((acc, r) => acc + (r.recallScore || 0), 0) / subRevisions.length
            )
          : null;

      // Only gate and include if at least ONE verified empirical score exists
      if (examAvgPct !== null || revisionRecallAvg !== null) {
        const scores = [examAvgPct, revisionRecallAvg].filter((s): s is number => s !== null);
        const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

        list.push({
          subjectCode: sub.code,
          subjectName: sub.name,
          examAvgPct,
          revisionRecallAvg,
          overallScore,
        });
      }
    });

  return list.sort((a, b) => b.overallScore - a.overallScore);
}

// ============================================================================
// 2. FINANCE ANALYTICS AGGREGATIONS
// ============================================================================

export interface MonthlyCashflowItem {
  month: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  savingsRate: number;
}

export function aggregateMonthlyCashflow(
  incomes: IncomeTransaction[],
  expenses: ExpenseTransaction[],
  monthsCount = 6,
  activeUserId?: string | null
): { months: MonthlyCashflowItem[]; maxVal: number } {
  const map = new Map<string, { month: string; incomePaise: number; expensePaise: number }>();

  incomes.forEach((i) => {
    if (activeUserId && i.userId && i.userId !== activeUserId) return;
    if (i.deletedAt || !i.date) return;
    const m = i.date.slice(0, 7);
    const curr = map.get(m) || { month: m, incomePaise: 0, expensePaise: 0 };
    curr.incomePaise += i.amountPaise;
    map.set(m, curr);
  });

  expenses.forEach((e) => {
    if (activeUserId && e.userId && e.userId !== activeUserId) return;
    if (e.deletedAt || !e.date) return;
    const m = e.date.slice(0, 7);
    const curr = map.get(m) || { month: m, incomePaise: 0, expensePaise: 0 };
    curr.expensePaise += e.amountPaise;
    map.set(m, curr);
  });

  const sorted = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  const trimmed = sorted.slice(-monthsCount);

  const months: MonthlyCashflowItem[] = trimmed.map((d) => {
    const netPaise = d.incomePaise - d.expensePaise;
    const savingsRate = d.incomePaise > 0 ? Math.round((netPaise / d.incomePaise) * 100) : 0;
    return {
      month: d.month,
      incomePaise: d.incomePaise,
      expensePaise: d.expensePaise,
      netPaise,
      savingsRate,
    };
  });

  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.incomePaise, m.expensePaise)));
  return { months, maxVal };
}

export interface BudgetVsActualItem {
  id: string;
  name: string;
  allocatedPaise: number;
  spentPaise: number;
  burnPct: number;
  tone: 'success' | 'warning' | 'danger';
  color: string;
}

export function aggregateBudgetVsActual(
  envelopes: BudgetEnvelope[],
  expenses: ExpenseTransaction[],
  monthKey: string,
  activeUserId?: string | null
): BudgetVsActualItem[] {
  const monthExpenses = expenses.filter(
    (e) =>
      (!activeUserId || !e.userId || e.userId === activeUserId) &&
      !e.deletedAt &&
      e.date.startsWith(monthKey)
  );

  return envelopes
    .filter(
      (env) =>
        (!activeUserId || !env.userId || env.userId === activeUserId) &&
        !env.deletedAt &&
        (!env.monthKey || env.monthKey === monthKey)
    )
    .map((env) => {
      const spentPaise = monthExpenses
        .filter((e) => e.categoryId === env.categoryId || e.categoryName === env.name)
        .reduce((sum, e) => sum + e.amountPaise, 0);

      const burnPct = env.allocatedPaise > 0 ? Math.round((spentPaise / env.allocatedPaise) * 100) : 0;

      let tone: 'success' | 'warning' | 'danger' = 'success';
      if (burnPct >= 100) tone = 'danger';
      else if (burnPct >= 80) tone = 'warning';

      return {
        id: env.id,
        name: env.name,
        allocatedPaise: env.allocatedPaise,
        spentPaise,
        burnPct,
        tone,
        color: env.color || 'var(--ff-accent)',
      };
    })
    .sort((a, b) => b.burnPct - a.burnPct);
}

// ============================================================================
// 3. PRODUCTIVITY ANALYTICS AGGREGATIONS
// ============================================================================

export interface DailyFocusHourItem {
  date: string;
  dayName: string;
  minutes: number;
  hours: number;
  sessionsCount: number;
  movingAvgMinutes: number;
}

export function aggregateFocusHoursTrend(
  sessions: FocusSession[],
  startDateStr: string,
  endDateStr: string,
  timezone: string = DEFAULT_TIMEZONE,
  activeUserId?: string | null
): { days: DailyFocusHourItem[]; maxMinutes: number; totalMinutes: number } {
  const dayMap = new Map<string, { minutes: number; count: number }>();

  sessions.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if ((s as { deletedAt?: string | null }).deletedAt || (!s.completed && s.status !== 'completed') || s.mode !== 'work' || !s.startedAt) return;

    let dateStr = '';
    try {
      dateStr = formatDateInTimezone(s.startedAt, timezone);
    } catch {
      dateStr = s.startedAt.slice(0, 10);
    }
    if (!dateStr) return;

    const curr = dayMap.get(dateStr) || { minutes: 0, count: 0 };
    curr.minutes += Math.round(getSessionFocusSeconds(s) / 60);
    curr.count += 1;
    dayMap.set(dateStr, curr);
  });

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const days: DailyFocusHourItem[] = [];

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
    const cur = new Date(start);
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const data = dayMap.get(dateStr) || { minutes: 0, count: 0 };
      const dayName = cur.toLocaleDateString(undefined, { weekday: 'short' });

      days.push({
        date: dateStr,
        dayName,
        minutes: data.minutes,
        hours: Math.round((data.minutes / 60) * 10) / 10,
        sessionsCount: data.count,
        movingAvgMinutes: 0,
      });

      cur.setDate(cur.getDate() + 1);
    }
  }

  // Calculate 7-day rolling moving average
  days.forEach((day, idx) => {
    const windowStart = Math.max(0, idx - 6);
    const windowSlice = days.slice(windowStart, idx + 1);
    const sum = windowSlice.reduce((acc, d) => acc + d.minutes, 0);
    day.movingAvgMinutes = Math.round(sum / windowSlice.length);
  });

  const maxMinutes = Math.max(60, ...days.map((d) => Math.max(d.minutes, d.movingAvgMinutes)));
  const totalMinutes = days.reduce((acc, d) => acc + d.minutes, 0);

  return { days, maxMinutes, totalMinutes };
}

export interface HourlyProductivityItem {
  hour: number;
  label: string;
  minutes: number;
  sessionCount: number;
  heightPct: number;
  isPeak: boolean;
}

export function aggregateCircadianHourlyFocus(
  sessions: FocusSession[],
  timezone: string = DEFAULT_TIMEZONE,
  activeUserId?: string | null
): { hours: HourlyProductivityItem[]; peakHour: HourlyProductivityItem } {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    minutes: 0,
    sessionCount: 0,
    heightPct: 0,
    isPeak: false,
  }));

  sessions.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if ((s as { deletedAt?: string | null }).deletedAt || (!s.completed && s.status !== 'completed') || s.mode !== 'work' || !s.startedAt) return;

    try {
      const parts = getZonedDateParts(s.startedAt, timezone);
      const h = parts.hour;
      if (h >= 0 && h < 24) {
        hours[h].minutes += Math.round(getSessionFocusSeconds(s) / 60);
        hours[h].sessionCount += 1;
      }
    } catch {
      // ignore
    }
  });

  const maxMinutes = Math.max(1, ...hours.map((h) => h.minutes));
  let peakIndex = 0;
  let highestMins = -1;

  hours.forEach((h, idx) => {
    h.heightPct = Math.max(4, Math.round((h.minutes / maxMinutes) * 100));
    if (h.minutes > highestMins) {
      highestMins = h.minutes;
      peakIndex = idx;
    }
  });

  if (highestMins > 0) {
    hours[peakIndex].isPeak = true;
  }

  return { hours, peakHour: hours[peakIndex] };
}

// ============================================================================
// 4. HABIT ANALYTICS AGGREGATIONS
// ============================================================================

export interface HabitCompletionTrendItem {
  periodKey: string;
  periodLabel: string;
  scheduledCount: number;
  completedCount: number;
  completionRate: number; // 0 - 100
}

export function aggregateHabitCompletionTrends(
  habits: Habit[],
  mode: 'weekly' | 'monthly',
  activeUserId?: string | null
): HabitCompletionTrendItem[] {
  const activeHabits = habits.filter(
    (h) => (!activeUserId || !h.userId || h.userId === activeUserId) && !h.archived && !h.deletedAt
  );

  const bucketMap = new Map<string, { periodKey: string; scheduled: number; completed: number }>();

  // Look back across last 60 days
  const now = new Date();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const bucketKey = mode === 'weekly' ? getStartOfWeek(dateStr) : dateStr.slice(0, 7);
    const curr = bucketMap.get(bucketKey) || { periodKey: bucketKey, scheduled: 0, completed: 0 };

    activeHabits.forEach((h) => {
      if (isHabitScheduledOnDate(h, dateStr)) {
        curr.scheduled += 1;
        if (h.completedDates.includes(dateStr)) {
          curr.completed += 1;
        }
      }
    });

    bucketMap.set(bucketKey, curr);
  }

  const sortedKeys = Array.from(bucketMap.keys()).sort();
  const trimmedKeys = mode === 'weekly' ? sortedKeys.slice(-8) : sortedKeys.slice(-6);

  return trimmedKeys.map((key) => {
    const b = bucketMap.get(key)!;
    const completionRate = b.scheduled > 0 ? Math.round((b.completed / b.scheduled) * 100) : 0;
    return {
      periodKey: b.periodKey,
      periodLabel: mode === 'weekly' ? `Wk ${b.periodKey.slice(5)}` : b.periodKey,
      scheduledCount: b.scheduled,
      completedCount: b.completed,
      completionRate,
    };
  });
}

// ============================================================================
// 5. CROSS-DOMAIN INTELLIGENCE AGGREGATIONS
// ============================================================================

export interface CorrelationResult {
  pairs: Array<{ date: string; focusMinutes: number; spendPaise: number }>;
  pearsonR: number;
  explanation: string;
}

export function aggregateFocusVsSpendCorrelation(
  sessions: FocusSession[],
  expenses: ExpenseTransaction[],
  startDateStr: string,
  endDateStr: string,
  timezone: string = DEFAULT_TIMEZONE,
  activeUserId?: string | null
): CorrelationResult {
  const focusMap = new Map<string, number>();
  const spendMap = new Map<string, number>();

  sessions.forEach((s) => {
    if (activeUserId && s.userId && s.userId !== activeUserId) return;
    if ((s as { deletedAt?: string | null }).deletedAt || (!s.completed && s.status !== 'completed') || s.mode !== 'work' || !s.startedAt) return;
    let d = '';
    try {
      d = formatDateInTimezone(s.startedAt, timezone);
    } catch {
      d = s.startedAt.slice(0, 10);
    }
    if (!d) return;
    focusMap.set(d, (focusMap.get(d) || 0) + Math.round(getSessionFocusSeconds(s) / 60));
  });

  expenses.forEach((e) => {
    if (activeUserId && e.userId && e.userId !== activeUserId) return;
    if (e.deletedAt || e.type !== 'variable' || !e.date) return;
    spendMap.set(e.date, (spendMap.get(e.date) || 0) + e.amountPaise);
  });

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const pairs: Array<{ date: string; focusMinutes: number; spendPaise: number }> = [];

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
    const cur = new Date(start);
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      pairs.push({
        date: dateStr,
        focusMinutes: focusMap.get(dateStr) || 0,
        spendPaise: spendMap.get(dateStr) || 0,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

  const activePairs = pairs.slice(-14);
  const n = activePairs.length;
  let pearsonR = 0;

  if (n > 2) {
    const meanX = activePairs.reduce((s, p) => s + p.focusMinutes, 0) / n;
    const meanY = activePairs.reduce((s, p) => s + p.spendPaise, 0) / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    activePairs.forEach((p) => {
      const dx = p.focusMinutes - meanX;
      const dy = p.spendPaise - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    });

    const denom = Math.sqrt(denX * denY);
    pearsonR = denom > 0 ? Math.round((num / denom) * 100) / 100 : 0;
  }

  let explanation = 'Insufficient variation to determine behavioral correlation.';
  if (pearsonR < -0.2) {
    explanation = `Moderate inverse correlation (r = ${pearsonR}) — days with lower deep work show higher discretionary spending.`;
  } else if (pearsonR > 0.2) {
    explanation = `Positive correlation (r = ${pearsonR}) — higher focus days show higher recorded discretionary spend.`;
  } else {
    explanation = `Neutral correlation (r = ${pearsonR}) — daily spending shows no direct dependence on focus duration.`;
  }

  return { pairs: activePairs, pearsonR, explanation };
}

// ============================================================================
// 6. GENERAL MATHEMATICAL PRIMITIVES & ADDITIONAL DOMAIN AGGREGATORS
// ============================================================================

export function calculatePearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n <= 1) return 0;

  const meanX = xs.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const meanY = ys.slice(0, n).reduce((s, y) => s + y, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  return denom > 0 ? num / denom : 0;
}

export interface SavingsGrowthResult {
  goals: Array<{
    id: string;
    title: string;
    savedPaise: number;
    targetPaise: number;
    progressPct: number;
    targetDate: string;
  }>;
  totalSavedPaise: number;
  totalTargetPaise: number;
  overallProgressPct: number;
}

export function aggregateSavingsGrowth(goals: SavingsGoal[], activeUserId?: string | null): SavingsGrowthResult {
  const activeGoals = goals.filter((g) => (!activeUserId || !g.userId || g.userId === activeUserId) && !(g as { deletedAt?: string | null }).deletedAt);
  const list = activeGoals.map((g) => {
    const progressPct = g.targetPaise > 0 ? Math.round((g.savedPaise / g.targetPaise) * 100) : 0;
    return {
      id: g.id,
      title: g.title,
      savedPaise: g.savedPaise,
      targetPaise: g.targetPaise,
      progressPct,
      targetDate: g.targetDate || 'Unspecified',
    };
  });
  const totalSavedPaise = list.reduce((s, g) => s + g.savedPaise, 0);
  const totalTargetPaise = list.reduce((s, g) => s + g.targetPaise, 0);
  const overallProgressPct = totalTargetPaise > 0 ? Math.round((totalSavedPaise / totalTargetPaise) * 100) : 0;

  return { goals: list, totalSavedPaise, totalTargetPaise, overallProgressPct };
}

export interface CategorySpendingItem {
  category: string;
  amountPaise: number;
  sharePct: number;
  count: number;
}

export function aggregateCategorySpending(
  expenses: ExpenseTransaction[],
  startDateStr?: string,
  endDateStr?: string,
  activeUserId?: string | null
): CategorySpendingItem[] {
  const catMap = new Map<string, { amount: number; count: number }>();
  let total = 0;

  expenses.forEach((e) => {
    if (activeUserId && e.userId && e.userId !== activeUserId) return;
    if (e.deletedAt || !e.date) return;
    if (startDateStr && e.date < startDateStr) return;
    if (endDateStr && e.date > endDateStr) return;

    const cat = e.categoryName || e.categoryId || 'General';
    const curr = catMap.get(cat) || { amount: 0, count: 0 };
    curr.amount += e.amountPaise;
    curr.count += 1;
    total += e.amountPaise;
    catMap.set(cat, curr);
  });

  return Array.from(catMap.entries())
    .map(([category, data]) => ({
      category,
      amountPaise: data.amount,
      sharePct: total > 0 ? Math.round((data.amount / total) * 100) : 0,
      count: data.count,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export interface LiquidTimelinePoint {
  date: string;
  balancePaise: number;
  changePaise: number;
}

export interface LiquidTimelineResult {
  points: LiquidTimelinePoint[];
  currentLiquidPaise: number;
  disclaimer: string;
}

export function aggregateNetWorthLiquidTimeline(
  incomes: IncomeTransaction[],
  expenses: ExpenseTransaction[],
  activeUserId?: string | null
): LiquidTimelineResult {
  const dayMap = new Map<string, number>();

  incomes.forEach((i) => {
    if (activeUserId && i.userId && i.userId !== activeUserId) return;
    if (i.deletedAt || !i.date) return;
    dayMap.set(i.date, (dayMap.get(i.date) || 0) + i.amountPaise);
  });

  expenses.forEach((e) => {
    if (activeUserId && e.userId && e.userId !== activeUserId) return;
    if (e.deletedAt || !e.date) return;
    dayMap.set(e.date, (dayMap.get(e.date) || 0) - e.amountPaise);
  });

  const sortedDates = Array.from(dayMap.keys()).sort();
  let running = 0;
  const points: LiquidTimelinePoint[] = [];

  sortedDates.forEach((date) => {
    const delta = dayMap.get(date) || 0;
    running += delta;
    points.push({ date, balancePaise: running, changePaise: delta });
  });

  return {
    points,
    currentLiquidPaise: running,
    disclaimer: 'Liquid Operating Ledger Only: institutional banking/mortgage assets unintegrated.',
  };
}

export interface TaskCompletionTrendPoint {
  dateStr: string;
  completedCount: number;
  cumulativeCompleted: number;
}

export interface TaskCompletionTrendResult {
  points: TaskCompletionTrendPoint[];
  totalCompleted: number;
}

export function aggregateTaskCompletionTrend(
  tasks: Task[],
  startDateStr: string,
  endDateStr: string,
  activeUserId?: string | null
): TaskCompletionTrendResult {
  const completedMap = new Map<string, number>();
  let total = 0;

  tasks.forEach((t) => {
    if (activeUserId && t.userId && t.userId !== activeUserId) return;
    if (t.deletedAt || t.status !== 'completed' || !t.completedAt) return;
    const date = t.completedAt.slice(0, 10);
    completedMap.set(date, (completedMap.get(date) || 0) + 1);
    total += 1;
  });

  const points: TaskCompletionTrendPoint[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  let cum = 0;

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
    const cur = new Date(start);
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      const cnt = completedMap.get(d) || 0;
      cum += cnt;
      points.push({ dateStr: d, completedCount: cnt, cumulativeCompleted: cum });
      cur.setDate(cur.getDate() + 1);
    }
  }

  return { points, totalCompleted: total };
}

export interface TaskBurndownPoint {
  dateStr: string;
  remainingCount: number;
}

export interface TaskBurndownResult {
  points: TaskBurndownPoint[];
  initialBacklog: number;
  finalRemaining: number;
}

export function aggregateTaskBurndown(
  tasks: Task[],
  startDateStr: string,
  endDateStr: string,
  activeUserId?: string | null
): TaskBurndownResult {
  const activeTasks = tasks.filter((t) => (!activeUserId || !t.userId || t.userId === activeUserId) && !t.deletedAt);
  const initialBacklog = activeTasks.length;

  const points: TaskBurndownPoint[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  let currentRemaining = initialBacklog;
  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
    const cur = new Date(start);
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      const completedSoFar = activeTasks.filter(
        (t) => t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) <= d
      ).length;
      currentRemaining = Math.max(0, initialBacklog - completedSoFar);
      points.push({ dateStr: d, remainingCount: currentRemaining });
      cur.setDate(cur.getDate() + 1);
    }
  }

  return { points, initialBacklog, finalRemaining: currentRemaining };
}

export interface EstimatedVsActualFocusResult {
  underestimatedCount: number;
  overestimatedCount: number;
  accurateCount: number;
  totalEstimatedPoms: number;
  totalActualPoms: number;
  accuracyRatio: number;
}

export function aggregateEstimatedVsActualFocus(
  tasks: Task[],
  activeUserId?: string | null
): EstimatedVsActualFocusResult {
  let under = 0;
  let over = 0;
  let accurate = 0;
  let totalEst = 0;
  let totalAct = 0;

  tasks.forEach((t) => {
    if (activeUserId && t.userId && t.userId !== activeUserId) return;
    if (t.deletedAt) return;
    if (t.estimatedPomodoros > 0 || t.completedPomodoros > 0) {
      totalEst += t.estimatedPomodoros;
      totalAct += t.completedPomodoros;
      const diff = t.completedPomodoros - t.estimatedPomodoros;
      if (diff > 0) under += 1;
      else if (diff < 0) over += 1;
      else accurate += 1;
    }
  });

  const accuracyRatio = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) / 100 : 1;
  return {
    underestimatedCount: under,
    overestimatedCount: over,
    accurateCount: accurate,
    totalEstimatedPoms: totalEst,
    totalActualPoms: totalAct,
    accuracyRatio,
  };
}

// Canonical Aliases
export const aggregateStudyHeatmap = aggregateStudyActivityHeatmap;
export const aggregateSyllabusTriad = aggregateSyllabusTriadProgress;
export const aggregateSubjectScoreComparison = aggregateSubjectPerformance;
export const aggregateHourlyFocusHeatmap = aggregateCircadianHourlyFocus;

