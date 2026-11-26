import type { Bill, FocusSession, Habit, SavingsGoal, StudySubject, StudyTopic, Task } from '../../types/index.ts';
import type { StudyPlanTask, StudyRevision } from '../../types/study.ts';
import type { LeaderboardProfile } from '../../types/leaderboard.ts';
import { computeFocusStreaks } from '../../lib/pomodoroAnalytics.ts';
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  getTodayDateString,
  getZonedDateParts,
} from '../../lib/dateTime.ts';
import { computeHabitStreak } from '../../lib/productivityIntelligence.ts';
import { getCurrentPeriodKeys, getEffectivePeriodMinutes } from '../../lib/leaderboardService.ts';
import {
  ACHIEVEMENT_CATALOG,
  STREAK_REWARDS,
  XP_REWARDS,
} from './reward-config.ts';
import type {
  Achievement,
  GamificationLeaderboardCategory,
  UserGamificationProfile,
  XPProgress,
  XPTransaction,
} from './types.ts';
import { calculateXPProgress } from './xp-calculator.ts';
import type { LeaderboardEntry } from '../../components/gamification/Leaderboard.tsx';

export interface ComputedGamificationData {
  profile: UserGamificationProfile;
  progress: XPProgress;
  achievements: Achievement[];
  transactions: XPTransaction[];
}

function toTimestampMs(val: unknown, fallbackMs = Date.now()): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackMs;
}

export function computeGamificationFromRealData(input: {
  userId: string;
  tasks: Task[];
  focusSessions: FocusSession[];
  subjects: StudySubject[];
  topics?: StudyTopic[];
  studyPlanTasks?: StudyPlanTask[];
  studyRevisions?: StudyRevision[];
  habits: Habit[];
  bills?: Bill[];
  savingsGoals?: SavingsGoal[];
  leaderboardProfile?: LeaderboardProfile | null;
  timezone?: string;
  now?: Date;
}): ComputedGamificationData {
  const {
    userId,
    tasks,
    focusSessions,
    subjects,
    topics = [],
    studyPlanTasks = [],
    studyRevisions = [],
    habits,
    bills = [],
    savingsGoals = [],
    leaderboardProfile,
    timezone = DEFAULT_TIMEZONE,
    now,
  } = input;
  const nowDate = now || new Date();
  const nowMs = nowDate.getTime();
  const transactions: XPTransaction[] = [];
  const taskCompletionTimestamps: number[] = [];
  const sessionCompletionTimestamps: number[] = [];
  const topicCompletionTimestamps: number[] = [];
  const nightOwlTimestamps: number[] = [];
  const earlyBirdTimestamps: number[] = [];

  const completedTasks = tasks.filter(
    (t) => !t.deletedAt && (t.status === 'completed' || (t as any).completed === true)
  );
  for (const t of completedTasks) {
    const ts = toTimestampMs((t as any).completedAt || t.updatedAt || t.createdAt, nowMs);
    taskCompletionTimestamps.push(ts);
    transactions.push({
      id: `xp_task_${t.id}`,
      userId,
      source: 'task_completion',
      sourceId: t.id,
      amount: XP_REWARDS.task_completion,
      createdAt: ts,
      description: `Completed task: ${t.title}`,
    });
  }

  // Completed Study Plan Tasks
  const completedPlanTasks = studyPlanTasks.filter(
    (pt: any) => !pt.deletedAt && (pt.completed === true || pt.status === 'completed')
  );
  for (const pt of completedPlanTasks as any[]) {
    const ts = toTimestampMs(pt.completedAt || pt.updatedAt || pt.createdAt, nowMs);
    taskCompletionTimestamps.push(ts);
    transactions.push({
      id: `xp_plan_${pt.id}`,
      userId,
      source: 'task_completion',
      sourceId: pt.id,
      amount: XP_REWARDS.task_completion,
      createdAt: ts,
      description: `Completed study plan: ${pt.title || pt.topicName || 'Study Task'}`,
    });
  }

  // Only count completed work focus sessions (never short/long breaks)
  const completedSessions = focusSessions.filter(
    (s) =>
      (s.mode === 'work' || !s.mode) &&
      (s.status === 'completed' || (s as any).completed === true)
  );
  let nightOwlCount = 0;
  let earlyBirdCount = 0;
  for (const s of completedSessions) {
    const ts = toTimestampMs((s as any).endedAt || (s as any).completedAt || s.startedAt || (s as any).createdAt, nowMs);
    sessionCompletionTimestamps.push(ts);
    const hr = getZonedDateParts(ts, timezone).hour;
    if (hr >= 22 || hr < 4) {
      nightOwlCount += 1;
      nightOwlTimestamps.push(ts);
    }
    if (hr >= 5 && hr < 8) {
      earlyBirdCount += 1;
      earlyBirdTimestamps.push(ts);
    }

    const mins = s.durationMinutes || Math.max(1, Math.round((s.durationSeconds || 1500) / 60));
    transactions.push({
      id: `xp_focus_${s.id}`,
      userId,
      source: 'focus_session',
      sourceId: s.id,
      amount: XP_REWARDS.focus_session,
      createdAt: ts,
      description: `Verified focus session (${mins}m)`,
    });
  }

  // Count mastered & in-progress study topics from both the real StudyTopic[] collection
  // and any legacy embedded subject.topics arrays (deduplicated by topic id)
  const seenTopicIds = new Set<string>();
  let completedTopicsCount = 0;

  for (const topic of topics) {
    if (topic.deletedAt || seenTopicIds.has(topic.id)) continue;
    const isMastered =
      Boolean(topic.theory && topic.practice) ||
      (topic as any).status === 'mastered' ||
      (topic as any).status === 'completed' ||
      (topic as any).completed === true;
    const hasPartialProgress = !isMastered && Boolean(topic.theory || topic.practice || topic.pyq);

    if (isMastered) {
      seenTopicIds.add(topic.id);
      completedTopicsCount += 1;
      const ts = toTimestampMs(topic.updatedAt || topic.createdAt, nowMs);
      topicCompletionTimestamps.push(ts);
      transactions.push({
        id: `xp_topic_${topic.id}`,
        userId,
        source: 'topic_completion',
        sourceId: topic.id,
        amount: XP_REWARDS.topic_completion,
        createdAt: ts,
        description: `Mastered topic: ${topic.subtopic || topic.topic || topic.subjectCode}`,
      });
    } else if (hasPartialProgress) {
      seenTopicIds.add(topic.id);
      const ts = toTimestampMs(topic.updatedAt || topic.createdAt, nowMs);
      const flags = [topic.theory && 'Theory', topic.practice && 'Practice', topic.pyq && 'PYQ']
        .filter(Boolean)
        .join(' + ');
      transactions.push({
        id: `xp_topic_prog_${topic.id}`,
        userId,
        source: 'topic_completion',
        sourceId: topic.id,
        amount: 15,
        createdAt: ts,
        description: `Studied topic (${flags}): ${topic.subtopic || topic.topic || topic.subjectCode}`,
      });
    }
  }

  for (const subj of subjects) {
    const embeddedTopics = Array.isArray((subj as any).topics) ? (subj as any).topics : [];
    for (const topic of embeddedTopics) {
      if (topic?.id && seenTopicIds.has(topic.id)) continue;
      if (topic.status === 'mastered' || topic.status === 'completed' || topic.completed === true) {
        if (topic?.id) seenTopicIds.add(topic.id);
        completedTopicsCount += 1;
        const ts = toTimestampMs(topic.updatedAt || subj.updatedAt || subj.createdAt, nowMs);
        topicCompletionTimestamps.push(ts);
        transactions.push({
          id: `xp_topic_${topic.id}`,
          userId,
          source: 'topic_completion',
          sourceId: topic.id,
          amount: XP_REWARDS.topic_completion,
          createdAt: ts,
          description: `Mastered topic: ${topic.name || topic.title || subj.name}`,
        });
      }
    }
  }

  // Completed / Reviewed Study Revisions
  for (const rev of studyRevisions as any[]) {
    if (rev.deletedAt) continue;
    if (rev.status === 'mastered' || rev.status === 'completed' || (rev.repetition ?? 0) > 0) {
      const ts = toTimestampMs(rev.lastReviewedAt || rev.updatedAt || rev.createdAt, nowMs);
      transactions.push({
        id: `xp_rev_${rev.id}`,
        userId,
        source: 'topic_completion',
        sourceId: rev.id,
        amount: 15,
        createdAt: ts,
        description: `Revision review: ${rev.topicTitle || rev.subjectCode || 'Study Revision'}`,
      });
    }
  }

  // Habit Check-ins (real completedDates)
  for (const h of habits) {
    if (h.deletedAt || !Array.isArray(h.completedDates)) continue;
    for (const dateStr of h.completedDates) {
      if (!dateStr) continue;
      const ts = toTimestampMs(`${dateStr.slice(0, 10)}T12:00:00Z`, nowMs);
      transactions.push({
        id: `xp_habit_${h.id}_${dateStr.slice(0, 10)}`,
        userId,
        source: 'daily_goal',
        sourceId: h.id,
        amount: 10,
        createdAt: ts,
        description: `Habit completed: ${h.title} (${dateStr.slice(0, 10)})`,
      });
    }
  }

  // Paid Bills & Savings Goals (aligns with Dashboard GamificationCard)
  for (const bill of bills) {
    if (bill.deletedAt || bill.status !== 'PAID') continue;
    const ts = toTimestampMs(bill.paymentDate || bill.updatedAt || bill.createdAt, nowMs);
    transactions.push({
      id: `xp_bill_${bill.id}`,
      userId,
      source: 'daily_goal',
      sourceId: bill.id,
      amount: 15,
      createdAt: ts,
      description: `Paid bill: ${bill.name}`,
    });
  }

  for (const goal of savingsGoals) {
    if (goal.savedPaise <= 0) continue;
    const reached = goal.targetPaise > 0 && goal.savedPaise >= goal.targetPaise;
    const ts = toTimestampMs(goal.updatedAt || goal.createdAt, nowMs);
    transactions.push({
      id: `xp_goal_${goal.id}`,
      userId,
      source: 'daily_goal',
      sourceId: goal.id,
      amount: reached ? 100 : 25,
      createdAt: ts,
      description: reached ? `Savings goal achieved: ${goal.title}` : `Funded savings goal: ${goal.title}`,
    });
  }

  const todayKeyStr = formatDateInTimezone(nowDate, timezone);
  const focusStreakSummary = computeFocusStreaks(focusSessions, todayKeyStr, timezone);

  let maxHabitStreak = 0;
  let habitLongestStreak = 0;
  let latestHabitAnchorDate: string | null = null;
  for (const h of habits) {
    if (h.deletedAt) continue;
    const streakInfo = computeHabitStreak(h, todayKeyStr);
    const currentFromHabit = Math.max(
      !h.archived ? streakInfo.currentStreak : 0,
      Number((h as any).currentStreak || (h as any).streak || 0)
    );
    if (currentFromHabit > maxHabitStreak) {
      maxHabitStreak = currentFromHabit;
      const dates = (h.completedDates || []).filter(Boolean).sort();
      if (dates.length > 0) {
        latestHabitAnchorDate = dates[dates.length - 1].slice(0, 10);
      }
    }
    habitLongestStreak = Math.max(
      habitLongestStreak,
      streakInfo.longestStreak,
      Number(h.bestStreakDays || 0),
      Number((h as any).longestStreak || 0)
    );
  }

  const currentStreak = Math.max(
    focusStreakSummary.currentStreakDays,
    Number(leaderboardProfile?.streakDays || 0),
    maxHabitStreak
  );
  const longestStreak = Math.max(
    currentStreak,
    focusStreakSummary.bestStreakDays,
    habitLongestStreak
  );

  // Derive deterministic historical unlock timestamps from actual underlying activities
  const sortedActivityTs = transactions.map((tx) => tx.createdAt).sort((a, b) => a - b);
  const leaderboardUpdatedTs =
    leaderboardProfile?.updatedAt && Number.isFinite(Date.parse(leaderboardProfile.updatedAt))
      ? Date.parse(leaderboardProfile.updatedAt)
      : undefined;
  const fallbackActivityTs =
    sortedActivityTs.length > 0
      ? sortedActivityTs[sortedActivityTs.length - 1]
      : leaderboardUpdatedTs ?? nowMs;

  const streakAnchorDate =
    focusStreakSummary.currentStreakDays >= currentStreak && focusStreakSummary.lastActiveDate
      ? focusStreakSummary.lastActiveDate
      : latestHabitAnchorDate || focusStreakSummary.lastActiveDate || todayKeyStr;

  const resolveStreakMilestoneTs = (milestoneDays: number): number => {
    const daysAgoFromAnchor = Math.max(0, currentStreak - milestoneDays);
    const unlockedDate = addDays(streakAnchorDate, -daysAgoFromAnchor);
    let bestSameDayTs = -1;
    let bestPriorTs = -1;
    for (const tx of transactions) {
      const txDay = formatDateInTimezone(tx.createdAt, timezone);
      if (txDay === unlockedDate && tx.createdAt > bestSameDayTs) {
        bestSameDayTs = tx.createdAt;
      } else if (txDay < unlockedDate && tx.createdAt > bestPriorTs) {
        bestPriorTs = tx.createdAt;
      }
    }
    if (bestSameDayTs >= 0) return bestSameDayTs;
    const parsedUnlocked = Date.parse(`${unlockedDate}T12:00:00Z`);
    if (Number.isFinite(parsedUnlocked)) return parsedUnlocked;
    return bestPriorTs >= 0 ? bestPriorTs : fallbackActivityTs;
  };

  // Streak milestone bonuses
  for (const [daysStr, bonusXP] of Object.entries(STREAK_REWARDS)) {
    const days = Number(daysStr);
    if (currentStreak >= days) {
      transactions.push({
        id: `xp_streak_${days}`,
        userId,
        source: 'streak',
        sourceId: `streak_${days}`,
        amount: bonusXP,
        createdAt: resolveStreakMilestoneTs(days),
        description: `${days}-day study streak milestone`,
      });
    }
  }

  const baseXP = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  taskCompletionTimestamps.sort((a, b) => a - b);
  sessionCompletionTimestamps.sort((a, b) => a - b);
  topicCompletionTimestamps.sort((a, b) => a - b);
  nightOwlTimestamps.sort((a, b) => a - b);
  earlyBirdTimestamps.sort((a, b) => a - b);

  const resolveAchievementTimestamp = (metric: string, requirement: number): number => {
    const idx = Math.max(0, requirement - 1);
    switch (metric) {
      case 'completed_tasks':
        return taskCompletionTimestamps[idx] ?? fallbackActivityTs;
      case 'completed_sessions':
        return sessionCompletionTimestamps[idx] ?? leaderboardUpdatedTs ?? fallbackActivityTs;
      case 'completed_topics':
        return topicCompletionTimestamps[idx] ?? fallbackActivityTs;
      case 'streak_days':
        return resolveStreakMilestoneTs(requirement);
      case 'night_owl_sessions':
        return nightOwlTimestamps[idx] ?? fallbackActivityTs;
      case 'early_bird_sessions':
        return earlyBirdTimestamps[idx] ?? fallbackActivityTs;
      default:
        return fallbackActivityTs;
    }
  };

  // Evaluate achievements (two-pass for total_xp achievement)
  const metricValue = (metric: string, xpSoFar: number): number => {
    switch (metric) {
      case 'completed_tasks':
        return completedTasks.length + completedPlanTasks.length;
      case 'completed_sessions':
        return Math.max(completedSessions.length, Number(leaderboardProfile?.totalSessionsCount || 0));
      case 'completed_topics':
        return completedTopicsCount;
      case 'streak_days':
        return currentStreak;
      case 'night_owl_sessions':
        return nightOwlCount;
      case 'early_bird_sessions':
        return earlyBirdCount;
      case 'total_xp':
        return xpSoFar;
      default:
        return 0;
    }
  };

  let achievementBonusXP = 0;
  const prelimAchievements = ACHIEVEMENT_CATALOG.map((def) => {
    const prog = def.metric === 'total_xp' ? baseXP : metricValue(def.metric, baseXP);
    const unlocked = prog >= def.requirement;
    if (unlocked && def.metric !== 'total_xp') {
      achievementBonusXP += def.rewardXP;
    }
    return { def, prog, unlocked };
  });

  const nonTotalAchEntries: Array<{
    def: (typeof ACHIEVEMENT_CATALOG)[number];
    prog: number;
    unlocked: boolean;
    ts?: number;
  }> = [];
  for (const item of prelimAchievements) {
    if (item.def.metric === 'total_xp') continue;
    const ts = item.unlocked ? resolveAchievementTimestamp(item.def.metric, item.def.requirement) : undefined;
    if (item.unlocked && ts !== undefined) {
      transactions.push({
        id: `xp_ach_${item.def.id}`,
        userId,
        source: 'achievement',
        sourceId: item.def.id,
        amount: item.def.rewardXP,
        createdAt: ts,
        description: `Achievement unlocked: ${item.def.title}`,
      });
    }
    nonTotalAchEntries.push({ ...item, ts });
  }

  // Now resolve total_xp achievements using chronological running total across all earned transactions
  const sortedBeforeTotalXp = [...transactions].sort((a, b) => a.createdAt - b.createdAt);
  const resolveTotalXpTimestamp = (requirement: number): number => {
    let acc = 0;
    for (const tx of sortedBeforeTotalXp) {
      acc += tx.amount;
      if (acc >= requirement) return tx.createdAt;
    }
    return sortedBeforeTotalXp.length > 0
      ? sortedBeforeTotalXp[sortedBeforeTotalXp.length - 1].createdAt
      : fallbackActivityTs;
  };

  const totalBeforeCentury = baseXP + achievementBonusXP;
  const totalAchEntries = prelimAchievements
    .filter((item) => item.def.metric === 'total_xp')
    .map(({ def, prog }) => {
      const finalProg = totalBeforeCentury;
      const finalUnlocked = finalProg >= def.requirement;
      const ts = finalUnlocked ? resolveTotalXpTimestamp(def.requirement) : undefined;
      if (finalUnlocked && ts !== undefined) {
        transactions.push({
          id: `xp_ach_${def.id}`,
          userId,
          source: 'achievement',
          sourceId: def.id,
          amount: def.rewardXP,
          createdAt: ts,
          description: `Achievement unlocked: ${def.title}`,
        });
      }
      return { def, prog: finalProg, unlocked: finalUnlocked, ts };
    });

  const resolvedMap = new Map([...nonTotalAchEntries, ...totalAchEntries].map((e) => [e.def.id, e]));
  const achievements: Achievement[] = ACHIEVEMENT_CATALOG.map((def) => {
    const entry = resolvedMap.get(def.id)!;
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      requirement: def.requirement,
      rewardXP: def.rewardXP,
      unlocked: entry.unlocked,
      progress: entry.prog,
      unlockedAt: entry.ts,
    };
  });

  transactions.sort((a, b) => b.createdAt - a.createdAt);

  const totalXP = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const progress = calculateXPProgress(totalXP);

  const todayKey = todayKeyStr;
  const weekAgoMs = nowMs - 7 * 86400_000;
  const monthAgoMs = nowMs - 30 * 86400_000;

  const dailyXP = transactions
    .filter((tx) => formatDateInTimezone(tx.createdAt, timezone) === todayKey)
    .reduce((s, tx) => s + tx.amount, 0);
  const weeklyXP = transactions
    .filter((tx) => tx.createdAt >= weekAgoMs)
    .reduce((s, tx) => s + tx.amount, 0);
  const monthlyXP = transactions
    .filter((tx) => tx.createdAt >= monthAgoMs)
    .reduce((s, tx) => s + tx.amount, 0);

  const profile: UserGamificationProfile = {
    userId,
    totalXP,
    level: progress.level,
    dailyXP,
    weeklyXP,
    monthlyXP,
    dailyKey: todayKey,
    longestStreak,
    currentStreak,
    unlockedAchievementIds: achievements.filter((a) => a.unlocked).map((a) => a.id),
  };

  return {
    profile,
    progress,
    achievements,
    transactions,
  };
}

export function computeLeaderboardEntriesFromProfiles(input: {
  profiles: LeaderboardProfile[];
  category: GamificationLeaderboardCategory;
  currentUid: string;
  currentUserXP?: number;
  timezone?: string;
  now?: Date;
}): LeaderboardEntry[] {
  const { profiles, category, currentUid, currentUserXP } = input;
  const tz = input.timezone || DEFAULT_TIMEZONE;
  const periodKeys = getCurrentPeriodKeys(tz, input.now || new Date());

  const mapped = profiles.map((p) => {
    const effectiveWeekMinutes = getEffectivePeriodMinutes(p, 'week', periodKeys);
    const effectiveMonthMinutes = getEffectivePeriodMinutes(p, 'month', periodKeys);
    const isCurrentWeek = p.weekKey === periodKeys.weekKey;
    const isCurrentMonth = p.monthKey === periodKeys.monthKey;

    let xp = 0;
    if (category === 'weekly') {
      xp = isCurrentWeek
        ? Math.round(effectiveWeekMinutes * 0.8) + (p.streakDays || 0) * 10
        : 0;
    } else if (category === 'monthly') {
      xp = isCurrentMonth
        ? Math.round(effectiveMonthMinutes * 0.8) + (p.streakDays || 0) * 10
        : 0;
    } else {
      xp =
        (p.totalSessionsCount || 0) * XP_REWARDS.focus_session +
        Math.round(effectiveMonthMinutes * 0.4) +
        (p.streakDays || 0) * 15;
    }
    if (p.uid === currentUid && typeof currentUserXP === 'number') {
      xp = Math.max(xp, currentUserXP);
    }
    const lvl = calculateXPProgress(xp).level;
    return {
      userId: p.uid,
      displayName: p.displayName || 'FocusFlow Scholar',
      level: lvl,
      totalXP: xp,
      streak: p.streakDays || 0,
      rank: 0,
    };
  });

  mapped.sort((a, b) => b.totalXP - a.totalXP);
  return mapped.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}
