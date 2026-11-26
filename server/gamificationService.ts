/**
 * FocusFlow & Finance — Authoritative Server-Side Gamification Service (Phase 5)
 *
 * Security & Integrity Invariants:
 * - Never trusts client-submitted XP, level, or streak values.
 * - Verifies ownership and completion of every source entity (task, focus session, topic, streak).
 * - Enforces idempotency by both eventId and (source, sourceId) so rewards cannot be farmed.
 * - Uses user's configured timezone for daily/weekly/monthly XP and streak boundaries.
 */

import type { DatabaseSchema, FocusSession, Task } from './db.ts';
import type {
  Achievement,
  AwardXPRequest,
  AwardXPResponse,
  GamificationLeaderboardCategory,
  UserGamificationProfile,
  XPSource,
  XPTransaction,
} from '../src/features/gamification/types.ts';
import { calculateLevel, calculateXPProgress } from '../src/features/gamification/xp-calculator.ts';
import {
  ACHIEVEMENT_CATALOG,
  STREAK_REWARDS,
  XP_REWARDS,
} from '../src/features/gamification/reward-config.ts';
import { DEFAULT_TIMEZONE, formatDateInTimezone } from '../src/lib/dateTime.ts';

function getIsoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getPeriodKeys(timezone: string, now: Date = new Date()) {
  const dailyKey = formatDateInTimezone(now, timezone);
  return {
    dailyKey,
    weekKey: getIsoWeekKey(dailyKey),
    monthKey: dailyKey.slice(0, 7),
  };
}

function getHourInTimezone(iso: string, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(iso));
    const hrPart = parts.find((p) => p.type === 'hour');
    const hr = Number(hrPart?.value ?? 12);
    return Number.isFinite(hr) ? hr % 24 : 12;
  } catch {
    return 12;
  }
}

export function computeUserStreaksFromSessions(
  sessions: FocusSession[],
  timezone: string,
  now: Date = new Date()
): { currentStreak: number; longestStreak: number; todayMinutes: number } {
  const todayKey = formatDateInTimezone(now, timezone);
  const minutesByDay = new Map<string, number>();

  for (const s of sessions) {
    if (!s.completed || s.mode !== 'work') continue;
    const mins = Math.max(0, Math.round(s.durationMinutes || 0));
    if (mins < 5) continue;
    const dayKey = formatDateInTimezone(s.startedAt, timezone);
    minutesByDay.set(dayKey, (minutesByDay.get(dayKey) || 0) + mins);
  }

  const qualifyingDays = Array.from(minutesByDay.entries())
    .filter(([, mins]) => mins >= 5)
    .map(([day]) => day)
    .sort();

  const todayMinutes = minutesByDay.get(todayKey) || 0;
  if (qualifyingDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0, todayMinutes };
  }

  // Longest streak
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < qualifyingDays.length; i++) {
    const prevMs = Date.parse(`${qualifyingDays[i - 1]}T12:00:00Z`);
    const currMs = Date.parse(`${qualifyingDays[i]}T12:00:00Z`);
    const diffDays = Math.round((currMs - prevMs) / 86400000);
    if (diffDays === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else if (diffDays > 1) {
      run = 1;
    }
  }

  // Current streak (includes today or yesterday)
  const daySet = new Set(qualifyingDays);
  let currentStreak = 0;
  const cursor = new Date(`${todayKey}T12:00:00Z`);
  if (!daySet.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!daySet.has(key)) break;
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { currentStreak, longestStreak, todayMinutes };
}

function getOrCreateProfile(db: DatabaseSchema, userId: string, timezone: string): UserGamificationProfile {
  if (!Array.isArray(db.gamificationProfiles)) db.gamificationProfiles = [];
  if (!Array.isArray(db.xpTransactions)) db.xpTransactions = [];

  const keys = getPeriodKeys(timezone);
  let profile = db.gamificationProfiles.find((p) => p.userId === userId);
  if (!profile) {
    profile = {
      userId,
      totalXP: 0,
      level: 1,
      dailyXP: 0,
      weeklyXP: 0,
      monthlyXP: 0,
      dailyKey: keys.dailyKey,
      weekKey: keys.weekKey,
      monthKey: keys.monthKey,
      longestStreak: 0,
      currentStreak: 0,
      unlockedAchievementIds: [],
      achievementUnlockedAt: {},
      awardedMilestoneLevels: [],
    };
    db.gamificationProfiles.push(profile);
  }

  // Rollover period counters if day/week/month changed
  if (profile.dailyKey !== keys.dailyKey) {
    profile.dailyKey = keys.dailyKey;
    profile.dailyXP = 0;
  }
  if (profile.weekKey !== keys.weekKey) {
    profile.weekKey = keys.weekKey;
    profile.weeklyXP = 0;
  }
  if (profile.monthKey !== keys.monthKey) {
    profile.monthKey = keys.monthKey;
    profile.monthlyXP = 0;
  }

  const userSessions = db.focusSessions.filter((s) => s.userId === userId);
  const streakStats = computeUserStreaksFromSessions(userSessions, timezone);
  profile.currentStreak = streakStats.currentStreak;
  profile.longestStreak = Math.max(profile.longestStreak || 0, streakStats.longestStreak);
  profile.level = calculateLevel(profile.totalXP);

  return profile;
}

function computeAchievementMetrics(db: DatabaseSchema, userId: string, profile: UserGamificationProfile, timezone: string) {
  const completedTasks = db.tasks.filter(
    (t: Task) => t.userId === userId && !t.deletedAt && t.status === 'completed'
  ).length;
  const completedSessions = db.focusSessions.filter(
    (s: FocusSession) =>
      s.userId === userId && s.completed && s.mode === 'work' && (s.durationMinutes || 0) >= 5
  );
  const completedTopics = (db.studyTopics || []).filter(
    (t) => t.userId === userId && t.theory && t.practice
  ).length;

  let nightOwlSessions = 0;
  let earlyBirdSessions = 0;
  for (const s of completedSessions) {
    const hr = getHourInTimezone(s.startedAt, timezone);
    if (hr >= 22 || hr < 4) nightOwlSessions++;
    if (hr >= 5 && hr < 8) earlyBirdSessions++;
  }

  return {
    completed_tasks: completedTasks,
    completed_sessions: completedSessions.length,
    completed_topics: completedTopics,
    streak_days: Math.max(profile.currentStreak, profile.longestStreak),
    night_owl_sessions: nightOwlSessions,
    early_bird_sessions: earlyBirdSessions,
    total_xp: profile.totalXP,
  };
}

export function buildUserAchievements(
  db: DatabaseSchema,
  userId: string,
  profile: UserGamificationProfile,
  timezone: string
): Achievement[] {
  const metrics = computeAchievementMetrics(db, userId, profile, timezone);
  const unlockedSet = new Set(profile.unlockedAchievementIds || []);

  return ACHIEVEMENT_CATALOG.map((def) => {
    const val = metrics[def.metric] || 0;
    const unlocked = unlockedSet.has(def.id) || val >= def.requirement;
    const progress = unlocked
      ? 100
      : Math.min(99, Math.round((val / Math.max(1, def.requirement)) * 100));

    return {
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      requirement: def.requirement,
      rewardXP: def.rewardXP,
      unlocked,
      progress,
      unlockedAt: profile.achievementUnlockedAt?.[def.id],
    };
  });
}

export function getGamificationSnapshot(db: DatabaseSchema, userId: string) {
  const settings = db.userSettings.find((s) => s.userId === userId);
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const profile = getOrCreateProfile(db, userId, timezone);
  const achievements = buildUserAchievements(db, userId, profile, timezone);
  const transactions = (db.xpTransactions || [])
    .filter((tx) => tx.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);

  return {
    profile,
    progress: calculateXPProgress(profile.totalXP),
    achievements,
    transactions,
  };
}

function addXPTransaction(
  db: DatabaseSchema,
  profile: UserGamificationProfile,
  input: {
    id: string;
    source: XPSource;
    sourceId: string;
    amount: number;
    description: string;
  }
): XPTransaction {
  const now = Date.now();
  const tx: XPTransaction = {
    id: input.id,
    userId: profile.userId,
    source: input.source,
    sourceId: input.sourceId,
    amount: input.amount,
    createdAt: now,
    description: input.description,
  };
  db.xpTransactions.push(tx);
  profile.totalXP += input.amount;
  profile.dailyXP += input.amount;
  profile.weeklyXP += input.amount;
  profile.monthlyXP += input.amount;
  profile.level = calculateLevel(profile.totalXP);
  return tx;
}

export function awardAuthoritativeXP(
  db: DatabaseSchema,
  userId: string,
  req: AwardXPRequest
): AwardXPResponse {
  const settings = db.userSettings.find((s) => s.userId === userId);
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const profile = getOrCreateProfile(db, userId, timezone);
  const previousLevel = profile.level;
  const periodKeys = getPeriodKeys(timezone);

  const eventId = (req.eventId || '').trim();
  const sourceId = (req.sourceId || '').trim();
  const source = req.source;

  const emptyFailure = (alreadyAwarded = false): AwardXPResponse => ({
    awarded: false,
    alreadyAwarded,
    xpAdded: 0,
    previousLevel,
    newLevel: profile.level,
    leveledUp: false,
    profile,
    progress: calculateXPProgress(profile.totalXP),
    unlockedAchievements: [],
    transactions: [],
  });

  if (!eventId || !sourceId || !source) {
    return emptyFailure(false);
  }

  // Enforce strict canonical sourceId rules before idempotency checks so clients
  // cannot farm repeatable rewards using arbitrary aliases (e.g. daily_goal "day_1", "day_2").
  if (source === 'daily_goal' && sourceId !== periodKeys.dailyKey) {
    return emptyFailure(false);
  }
  if (source === 'streak' && (!/^\d+$/.test(sourceId) || sourceId !== String(Number(sourceId)))) {
    return emptyFailure(false);
  }

  // Idempotency check: never award twice for same eventId or (source, sourceId)
  const duplicate = (db.xpTransactions || []).find(
    (tx) =>
      tx.userId === userId &&
      (tx.id === eventId || (tx.source === source && tx.sourceId === sourceId))
  );
  if (duplicate) {
    return emptyFailure(true);
  }

  // Verify source event & calculate server-side reward
  let rewardAmount = 0;
  let description = '';

  if (source === 'task_completion') {
    const task = db.tasks.find((t) => t.id === sourceId && t.userId === userId && !t.deletedAt);
    if (!task || task.status !== 'completed') {
      return {
        awarded: false,
        alreadyAwarded: false,
        xpAdded: 0,
        previousLevel,
        newLevel: previousLevel,
        leveledUp: false,
        profile,
        progress: calculateXPProgress(profile.totalXP),
        unlockedAchievements: [],
        transactions: [],
      };
    }
    rewardAmount = XP_REWARDS.task_completion;
    description = `Completed task: ${task.title.slice(0, 48)}`;
  } else if (source === 'focus_session') {
    const session = db.focusSessions.find(
      (s) => s.id === sourceId && s.userId === userId
    );
    if (!session || !session.completed || session.mode !== 'work' || (session.durationMinutes || 0) < 5) {
      return {
        awarded: false,
        alreadyAwarded: false,
        xpAdded: 0,
        previousLevel,
        newLevel: previousLevel,
        leveledUp: false,
        profile,
        progress: calculateXPProgress(profile.totalXP),
        unlockedAchievements: [],
        transactions: [],
      };
    }
    rewardAmount = XP_REWARDS.focus_session;
    description = `Completed ${session.durationMinutes}m focus session`;
  } else if (source === 'topic_completion') {
    const topic = (db.studyTopics || []).find((t) => t.id === sourceId && t.userId === userId);
    if (!topic || !topic.theory || !topic.practice) {
      return {
        awarded: false,
        alreadyAwarded: false,
        xpAdded: 0,
        previousLevel,
        newLevel: previousLevel,
        leveledUp: false,
        profile,
        progress: calculateXPProgress(profile.totalXP),
        unlockedAchievements: [],
        transactions: [],
      };
    }
    rewardAmount = XP_REWARDS.topic_completion;
    description = `Mastered topic: ${(topic.subtopic || topic.topic).slice(0, 48)}`;
  } else if (source === 'daily_goal') {
    const userSessions = db.focusSessions.filter((s) => s.userId === userId);
    const { todayMinutes } = computeUserStreaksFromSessions(userSessions, timezone);
    const goalMins = settings?.dailyFocusGoalMinutes || 120;
    if (todayMinutes < goalMins) {
      return {
        awarded: false,
        alreadyAwarded: false,
        xpAdded: 0,
        previousLevel,
        newLevel: previousLevel,
        leveledUp: false,
        profile,
        progress: calculateXPProgress(profile.totalXP),
        unlockedAchievements: [],
        transactions: [],
      };
    }
    rewardAmount = XP_REWARDS.daily_goal;
    description = `Reached daily study goal (${goalMins}m)`;
  } else if (source === 'streak') {
    const milestone = Number(sourceId);
    const milestoneXP = STREAK_REWARDS[milestone];
    if (!milestoneXP || profile.currentStreak < milestone) {
      return {
        awarded: false,
        alreadyAwarded: false,
        xpAdded: 0,
        previousLevel,
        newLevel: previousLevel,
        leveledUp: false,
        profile,
        progress: calculateXPProgress(profile.totalXP),
        unlockedAchievements: [],
        transactions: [],
      };
    }
    rewardAmount = milestoneXP;
    description = `Maintained ${milestone}-day study streak`;
  } else {
    return {
      awarded: false,
      alreadyAwarded: false,
      xpAdded: 0,
      previousLevel,
      newLevel: previousLevel,
      leveledUp: false,
      profile,
      progress: calculateXPProgress(profile.totalXP),
      unlockedAchievements: [],
      transactions: [],
    };
  }

  const createdTransactions: XPTransaction[] = [];
  createdTransactions.push(
    addXPTransaction(db, profile, {
      id: eventId,
      source,
      sourceId,
      amount: rewardAmount,
      description,
    })
  );

  // Check newly unlocked achievements (once per achievement)
  const unlockedSet = new Set(profile.unlockedAchievementIds || []);
  const metrics = computeAchievementMetrics(db, userId, profile, timezone);
  const newlyUnlocked: Achievement[] = [];

  for (const def of ACHIEVEMENT_CATALOG) {
    if (unlockedSet.has(def.id)) continue;
    if ((metrics[def.metric] || 0) >= def.requirement) {
      unlockedSet.add(def.id);
      if (!profile.achievementUnlockedAt) profile.achievementUnlockedAt = {};
      const nowMs = Date.now();
      profile.achievementUnlockedAt[def.id] = nowMs;
      createdTransactions.push(
        addXPTransaction(db, profile, {
          id: `ach_${userId}_${def.id}`,
          source: 'achievement',
          sourceId: def.id,
          amount: def.rewardXP,
          description: `Unlocked achievement: ${def.title}`,
        })
      );
      newlyUnlocked.push({
        id: def.id,
        title: def.title,
        description: def.description,
        icon: def.icon,
        requirement: def.requirement,
        rewardXP: def.rewardXP,
        unlocked: true,
        progress: 100,
        unlockedAt: nowMs,
      });
    }
  }
  profile.unlockedAchievementIds = Array.from(unlockedSet);

  const xpAdded = createdTransactions.reduce((acc, t) => acc + t.amount, 0);
  const newLevel = profile.level;

  return {
    awarded: true,
    alreadyAwarded: false,
    xpAdded,
    previousLevel,
    newLevel,
    leveledUp: newLevel > previousLevel,
    profile,
    progress: calculateXPProgress(profile.totalXP),
    unlockedAchievements: newlyUnlocked,
    transactions: createdTransactions,
  };
}

export function getPaginatedGamificationLeaderboard(
  db: DatabaseSchema,
  currentUserId: string,
  options: {
    category?: GamificationLeaderboardCategory;
    page?: number;
    limit?: number;
  } = {}
) {
  const category = options.category || 'all_time';
  const page = Math.max(1, Math.floor(options.page || 1));
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit || 10)));

  const profiles = db.gamificationProfiles || [];
  const periodKeysByTz = new Map<string, ReturnType<typeof getPeriodKeys>>();
  const getKeysForTimezone = (tz: string) => {
    let cached = periodKeysByTz.get(tz);
    if (!cached) {
      cached = getPeriodKeys(tz);
      periodKeysByTz.set(tz, cached);
    }
    return cached;
  };

  const rows = profiles
    .map((p) => {
      const user = (db.users || []).find((u) => u.id === p.userId);
      const userTz = (db.userSettings || []).find((s) => s.userId === p.userId)?.timezone || DEFAULT_TIMEZONE;
      const currentKeys = getKeysForTimezone(userTz);
      const effectiveWeeklyXP = p.weekKey === currentKeys.weekKey ? p.weeklyXP || 0 : 0;
      const effectiveMonthlyXP = p.monthKey === currentKeys.monthKey ? p.monthlyXP || 0 : 0;

      const sortXP =
        category === 'weekly'
          ? effectiveWeeklyXP
          : category === 'monthly'
          ? effectiveMonthlyXP
          : p.totalXP || 0;
      return {
        userId: p.userId,
        displayName: user?.name || 'Focus Student',
        avatarUrl: user?.avatarUrl || undefined,
        level: calculateLevel(p.totalXP || 0),
        totalXP: sortXP,
        streak: p.currentStreak || 0,
      };
    })
    .sort((a, b) => {
      if (b.totalXP !== a.totalXP) return b.totalXP - a.totalXP;
      if (b.streak !== a.streak) return b.streak - a.streak;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));

  const currentUserEntry = rows.find((r) => r.userId === currentUserId) || null;
  const start = (page - 1) * limit;
  const paged = rows.slice(start, start + limit);

  return {
    category,
    page,
    limit,
    total: rows.length,
    hasMore: start + limit < rows.length,
    currentUserRank: currentUserEntry?.rank ?? null,
    entries: paged,
  };
}
