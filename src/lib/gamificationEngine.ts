import type {
  Bill,
  FocusSession,
  SavingsGoal,
  Task,
} from '../types/index.ts';

export interface GamificationBadge {
  id: string;
  title: string;
  description: string;
  category: 'focus' | 'tasks' | 'finance' | 'consistency';
  earned: boolean;
  progress: number;
  target: number;
}

export interface GamificationChallenge {
  id: string;
  cadence: 'daily' | 'weekly';
  title: string;
  progress: number;
  target: number;
  unit: string;
  rewardXp: number;
  completed: boolean;
}

export interface GamificationSummary {
  xp: number;
  level: number;
  rankTitle: string;
  currentLevelXp: number;
  nextLevelXp: number;
  levelProgressPercent: number;
  badges: GamificationBadge[];
  earnedCount: number;
  challenges: GamificationChallenge[];
  records: {
    bestStreakDays: number;
    currentStreakDays: number;
    totalFocusMinutes: number;
    completedTasksTotal: number;
    paidBillsTotal: number;
    goalsCompletedTotal: number;
  };
}

const RANK_TITLES = [
  'Initiate',
  'Tracker',
  'Builder',
  'Operator',
  'Deep Worker',
  'Strategist',
  'Architect',
  'Maestro',
  'Grandmaster',
];

function getRankTitle(level: number): string {
  const idx = Math.min(RANK_TITLES.length - 1, Math.max(0, Math.floor((level - 1) / 2)));
  return RANK_TITLES[idx];
}

export function computeGamificationState(input: {
  sessions: FocusSession[];
  tasks: Task[];
  bills: Bill[];
  savingsGoals: SavingsGoal[];
  focusStreakDays: number;
  bestStreakDays?: number;
  dailyFocusGoalMinutes?: number;
}): GamificationSummary {
  const {
    sessions,
    tasks,
    bills,
    savingsGoals,
    focusStreakDays,
    bestStreakDays = focusStreakDays,
    dailyFocusGoalMinutes = 100,
  } = input;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diffToMonday);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const workSessions = sessions.filter((s) => s.completed && s.mode === 'work');
  const totalFocusMinutes = Math.round(
    workSessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
  );
  const todayFocusMinutes = Math.round(
    workSessions
      .filter((s) => s.startedAt.startsWith(todayStr))
      .reduce((acc, s) => acc + s.durationSeconds, 0) / 60
  );
  const weekFocusMinutes = Math.round(
    workSessions
      .filter((s) => s.startedAt.slice(0, 10) >= weekStartStr)
      .reduce((acc, s) => acc + s.durationSeconds, 0) / 60
  );

  const activeTasks = tasks.filter((t) => !t.deletedAt);
  const completedTasks = activeTasks.filter((t) => t.status === 'completed');
  const todayCompletedTasks = completedTasks.filter((t) =>
    (t.completedAt || t.updatedAt).startsWith(todayStr)
  ).length;
  const weekCompletedTasks = completedTasks.filter(
    (t) => (t.completedAt || t.updatedAt).slice(0, 10) >= weekStartStr
  ).length;

  const activeBills = bills.filter((b) => !b.deletedAt);
  const paidBills = activeBills.filter((b) => b.status === 'PAID');
  const onTimePaidBills = paidBills.filter(
    (b) => !b.paymentDate || b.paymentDate <= b.dueDate
  );

  const goalsCompleted = savingsGoals.filter(
    (g) => g.targetPaise > 0 && g.savedPaise >= g.targetPaise
  );

  const xp =
    workSessions.length * 25 +
    completedTasks.length * 40 +
    paidBills.length * 15 +
    onTimePaidBills.length * 10 +
    goalsCompleted.length * 100 +
    Math.max(focusStreakDays, bestStreakDays) * 15;

  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const currentLevelBase = (level - 1) * (level - 1) * 100;
  const nextLevelXp = level * level * 100;
  const span = Math.max(1, nextLevelXp - currentLevelBase);
  const levelProgressPercent = Math.min(
    100,
    Math.max(0, Math.round(((xp - currentLevelBase) / span) * 100))
  );

  const peakStreak = Math.max(focusStreakDays, bestStreakDays);

  const badges: GamificationBadge[] = [
    {
      id: 'first_spark',
      title: 'First Spark',
      description: 'Complete your first deep focus session',
      category: 'focus',
      earned: workSessions.length >= 1,
      progress: Math.min(1, workSessions.length),
      target: 1,
    },
    {
      id: 'century_minutes',
      title: 'Century Focus',
      description: 'Accumulate 100 minutes of deep work',
      category: 'focus',
      earned: totalFocusMinutes >= 100,
      progress: Math.min(100, totalFocusMinutes),
      target: 100,
    },
    {
      id: 'marathon_focus',
      title: 'Deep Work Marathon',
      description: 'Accumulate 1,000 minutes (16.6 hrs) of focus',
      category: 'focus',
      earned: totalFocusMinutes >= 1000,
      progress: Math.min(1000, totalFocusMinutes),
      target: 1000,
    },
    {
      id: 'task_starter',
      title: 'Execution Engine',
      description: 'Complete 5 tracked tasks',
      category: 'tasks',
      earned: completedTasks.length >= 5,
      progress: Math.min(5, completedTasks.length),
      target: 5,
    },
    {
      id: 'task_master',
      title: 'Momentum Finisher',
      description: 'Complete 25 tasks cleanly',
      category: 'tasks',
      earned: completedTasks.length >= 25,
      progress: Math.min(25, completedTasks.length),
      target: 25,
    },
    {
      id: 'streak_3',
      title: 'Three-Day Cadence',
      description: 'Reach a 3-day focus streak (retained forever)',
      category: 'consistency',
      earned: peakStreak >= 3,
      progress: Math.min(3, peakStreak),
      target: 3,
    },
    {
      id: 'streak_7',
      title: 'Weekly Rhythm',
      description: 'Reach a 7-day focus streak milestone',
      category: 'consistency',
      earned: peakStreak >= 7,
      progress: Math.min(7, peakStreak),
      target: 7,
    },
    {
      id: 'streak_30',
      title: 'Iron Habit',
      description: 'Reach a 30-day focus streak milestone',
      category: 'consistency',
      earned: peakStreak >= 30,
      progress: Math.min(30, peakStreak),
      target: 30,
    },
    {
      id: 'bill_guardian',
      title: 'Zero Late Fees',
      description: 'Pay 3 bills cleanly on or before their due date',
      category: 'finance',
      earned: onTimePaidBills.length >= 3,
      progress: Math.min(3, onTimePaidBills.length),
      target: 3,
    },
    {
      id: 'saver_initiate',
      title: 'Reserve Builder',
      description: 'Create and fund a dedicated savings goal',
      category: 'finance',
      earned: savingsGoals.some((g) => g.savedPaise > 0),
      progress: savingsGoals.some((g) => g.savedPaise > 0) ? 1 : 0,
      target: 1,
    },
    {
      id: 'goal_crusher',
      title: 'Target Achieved',
      description: 'Reach 100% on a savings goal',
      category: 'finance',
      earned: goalsCompleted.length >= 1,
      progress: Math.min(1, goalsCompleted.length),
      target: 1,
    },
    {
      id: 'polymath',
      title: 'Balanced Operator',
      description: 'Log focus work, finish a task, and settle a bill',
      category: 'consistency',
      earned:
        workSessions.length >= 1 && completedTasks.length >= 1 && paidBills.length >= 1,
      progress:
        (workSessions.length >= 1 ? 1 : 0) +
        (completedTasks.length >= 1 ? 1 : 0) +
        (paidBills.length >= 1 ? 1 : 0),
      target: 3,
    },
  ];

  const challenges: GamificationChallenge[] = [
    {
      id: 'daily_focus',
      cadence: 'daily',
      title: 'Hit Daily Focus Goal',
      progress: todayFocusMinutes,
      target: Math.max(15, dailyFocusGoalMinutes),
      unit: 'min',
      rewardXp: 50,
      completed: todayFocusMinutes >= Math.max(15, dailyFocusGoalMinutes),
    },
    {
      id: 'daily_tasks',
      cadence: 'daily',
      title: 'Complete 2 Tasks Today',
      progress: todayCompletedTasks,
      target: 2,
      unit: 'tasks',
      rewardXp: 40,
      completed: todayCompletedTasks >= 2,
    },
    {
      id: 'weekly_focus',
      cadence: 'weekly',
      title: 'Weekly Deep Work Sprint',
      progress: weekFocusMinutes,
      target: 300,
      unit: 'min',
      rewardXp: 150,
      completed: weekFocusMinutes >= 300,
    },
    {
      id: 'weekly_tasks',
      cadence: 'weekly',
      title: 'Weekly Task Closure',
      progress: weekCompletedTasks,
      target: 10,
      unit: 'tasks',
      rewardXp: 120,
      completed: weekCompletedTasks >= 10,
    },
  ];

  return {
    xp,
    level,
    rankTitle: getRankTitle(level),
    currentLevelXp: xp - currentLevelBase,
    nextLevelXp: nextLevelXp - currentLevelBase,
    levelProgressPercent,
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    challenges,
    records: {
      bestStreakDays: peakStreak,
      currentStreakDays: focusStreakDays,
      totalFocusMinutes,
      completedTasksTotal: completedTasks.length,
      paidBillsTotal: paidBills.length,
      goalsCompletedTotal: goalsCompleted.length,
    },
  };
}
