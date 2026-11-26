import type { Bill, FocusSession, Habit, SavingsGoal, StudySubject, StudyTopic, Task } from '../../types/index.ts';
import type { StudyPlanTask, StudyRevision } from '../../types/study.ts';
import type { LeaderboardProfile } from '../../types/leaderboard.ts';
import { computeFocusStreaks } from '../../lib/pomodoroAnalytics.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
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

function toTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function getLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  } = input;
  const transactions: XPTransaction[] = [];

  const completedTasks = tasks.filter(
    (t) => !t.deletedAt && (t.status === 'completed' || (t as any).completed === true)
  );
  for (const t of completedTasks) {
    const ts = toTimestampMs((t as any).completedAt || t.updatedAt || t.createdAt);
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
    const ts = toTimestampMs(pt.completedAt || pt.updatedAt || pt.createdAt);
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
    const ts = toTimestampMs((s as any).endedAt || (s as any).completedAt || s.startedAt || (s as any).createdAt);
    const hr = new Date(ts).getHours();
    if (hr >= 22 || hr < 4) nightOwlCount += 1;
    if (hr >= 5 && hr < 8) earlyBirdCount += 1;

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
      const ts = toTimestampMs(topic.updatedAt || topic.createdAt);
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
      const ts = toTimestampMs(topic.updatedAt || topic.createdAt);
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
        const ts = toTimestampMs(topic.updatedAt || subj.updatedAt || subj.createdAt);
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
      const ts = toTimestampMs(rev.lastReviewedAt || rev.updatedAt || rev.createdAt);
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
      const ts = toTimestampMs(`${dateStr.slice(0, 10)}T12:00:00`);
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
    const ts = toTimestampMs(bill.paymentDate || bill.updatedAt || bill.createdAt);
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
    const ts = toTimestampMs(goal.updatedAt || goal.createdAt);
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

  const todayKeyStr = getTodayDateString(timezone);
  const focusStreakSummary = computeFocusStreaks(focusSessions, todayKeyStr, timezone);

  const maxHabitStreak = habits.reduce(
    (max, h) => Math.max(max, Number((h as any).currentStreak || (h as any).streak || 0)),
    0
  );
  const currentStreak = Math.max(
    focusStreakSummary.currentStreakDays,
    Number(leaderboardProfile?.streakDays || 0),
    maxHabitStreak
  );
  const longestStreak = Math.max(
    currentStreak,
    focusStreakSummary.bestStreakDays,
    habits.reduce((max, h) => Math.max(max, Number((h as any).longestStreak || 0)), 0)
  );

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
        createdAt: Date.now(),
        description: `${days}-day study streak milestone`,
      });
    }
  }

  const baseXP = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  // Evaluate achievements (two-pass for total_xp achievement)
  const metricValue = (metric: string, xpSoFar: number): number => {
    switch (metric) {
      case 'completed_tasks':
        return completedTasks.length;
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

  const totalBeforeCentury = baseXP + achievementBonusXP;
  const achievements: Achievement[] = prelimAchievements.map(({ def, prog, unlocked }) => {
    const finalProg = def.metric === 'total_xp' ? totalBeforeCentury : prog;
    const finalUnlocked = def.metric === 'total_xp' ? finalProg >= def.requirement : unlocked;
    if (finalUnlocked) {
      transactions.push({
        id: `xp_ach_${def.id}`,
        userId,
        source: 'achievement',
        sourceId: def.id,
        amount: def.rewardXP,
        createdAt: Date.now(),
        description: `Achievement unlocked: ${def.title}`,
      });
    }
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      requirement: def.requirement,
      rewardXP: def.rewardXP,
      unlocked: finalUnlocked,
      progress: finalProg,
      unlockedAt: finalUnlocked ? Date.now() : undefined,
    };
  });

  transactions.sort((a, b) => b.createdAt - a.createdAt);

  const totalXP = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const progress = calculateXPProgress(totalXP);

  const todayKey = getLocalDateKey(Date.now());
  const nowMs = Date.now();
  const weekAgoMs = nowMs - 7 * 86400_000;
  const monthAgoMs = nowMs - 30 * 86400_000;

  const dailyXP = transactions
    .filter((tx) => getLocalDateKey(tx.createdAt) === todayKey)
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
}): LeaderboardEntry[] {
  const { profiles, category, currentUid, currentUserXP } = input;

  const mapped = profiles.map((p) => {
    let xp = 0;
    if (category === 'weekly') {
      xp = Math.round((p.weekMinutes || 0) * 0.8) + (p.streakDays || 0) * 10;
    } else if (category === 'monthly') {
      xp = Math.round((p.monthMinutes || 0) * 0.8) + (p.streakDays || 0) * 10;
    } else {
      xp = (p.totalSessionsCount || 0) * XP_REWARDS.focus_session + Math.round((p.monthMinutes || 0) * 0.4) + (p.streakDays || 0) * 15;
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
