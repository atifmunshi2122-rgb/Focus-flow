import { calculateLevel, XP_PER_LEVEL } from '../gamification/xp-calculator.ts';
import type { HomeZoneId } from './homeRoutineEngine.ts';
import type { ProceduralPoseActivity } from '../study-room/humanoidRigController.ts';
import type { StudyActivity } from '../study-room/types.ts';
import type { LeaderboardProfile } from '../../types/leaderboard.ts';
import type { TimerEngineMode, TimerMode } from '../../lib/timerEngine.ts';
import type { Bill, ExpenseTransaction, FocusSession, Habit, SavingsGoal, Task } from '../../types/index.ts';
import type { StudyExam, StudySubject, StudyTopic } from '../../types/study.ts';
import type { DoomscrollTaxEntry, TimeCapsuleLetter } from '../../types/features15.ts';
import { formatDateInTimezone, parseDateString } from '../../lib/dateTime.ts';

export type PetSpecies = 'cat' | 'dog';
export type HomeAvatarActivity = StudyActivity | ProceduralPoseActivity;

export interface CleanlinessTaskItem {
  id: string;
  title: string;
  dueDate: string | null;
  priority: Task['priority'];
  status: Task['status'];
  isOverdue: boolean;
}

export interface CleanlinessBillItem {
  id: string;
  name: string;
  dueDate: string;
  amountPaise: number;
  status: Bill['status'];
  isOverdue: boolean;
}

export interface RoomCleanlinessState {
  overdueTasksCount: number;
  dueTodayTasksCount: number;
  unpaidBillsCount: number;
  overdueBillsCount: number;
  /** 0 = spotless & bright, 1 = mild paper scatter, 2 = messy desk, 3 = cluttered & dim */
  clutterLevel: 0 | 1 | 2 | 3;
  /** 1.0 when clean, down to 0.48 when cluttered */
  lampDimFactor: number;
  isNeatAndBright: boolean;
  actionableTasks: CleanlinessTaskItem[];
  actionableBills: CleanlinessBillItem[];
}

export interface SimsNeedsState {
  energy: number;
  focus: number;
  mood: number;
}

export interface SimsNeedsContext {
  isRunning: boolean;
  timerMode: TimerMode;
  timerEngine: TimerEngineMode;
  activeZone: HomeZoneId;
  activity: HomeAvatarActivity;
  isWalking: boolean;
  completedHabitsToday: number;
  totalActiveHabits: number;
  streakDays: number;
  clutterLevel: number;
  currentHour: number;
}

export interface HomeDecorUnlocks {
  mechKeyboard: boolean;
  dualMonitor: boolean;
  extraPlants: boolean;
  fairyLights: boolean;
  espressoUpgrade: boolean;
  gamingChair: boolean;
}

export interface PetProgressState {
  unlocked: boolean;
  streakDays: number;
  hasCollar: boolean;
  hasLuxuryPetBed: boolean;
  tier: 'starter' | 'bonded' | 'legendary';
  tierLabel: string;
}

export interface HomeUnlocksSummary {
  totalXP: number;
  level: number;
  nextLevelXP: number;
  bestSavingsPct: number;
  unlockedCount: number;
  totalDecorCount: number;
  unlocks: HomeDecorUnlocks;
  pet: PetProgressState;
}

export type FurnitureShortcutId =
  | 'laptop'
  | 'bookshelf'
  | 'kitchen_dining'
  | 'wall_schedule'
  | 'window_speaker'
  | 'bed'
  | 'exam_frame'
  | 'vault_safe'
  | 'parcel_mail'
  | 'mini_whiteboard'
  | 'doomscroll_jar'
  | 'time_capsule'
  | 'vinyl_player'
  | 'hydration_bottle'
  | 'balcony_chair'
  | 'pet';

export type LivingPlantStage = 'sprout' | 'leafy' | 'blooming' | 'wilted';

export interface LivingPlantState {
  stage: LivingPlantStage;
  streakDays: number;
  daysSinceLastHabit: number;
  label: string;
}

export type VaultSafeTier = 'starter' | 'bronze' | 'silver' | 'gold';

export interface VaultSafeState {
  tier: VaultSafeTier;
  bestSavingsPct: number;
  label: string;
}

export interface DoorstepDeliveriesState {
  hasParcel: boolean;
  hasMail: boolean;
  parcelCount: number;
  mailCount: number;
  recentShoppingParcels: Array<{ id: string; description: string; amountPaise: number; date: string }>;
  upcomingBills: CleanlinessBillItem[];
}

export interface FlowStateAuraSummary {
  isFlowStateActive: boolean;
  elapsedUninterruptedMinutes: number;
  completedWorkCyclesToday: number;
  hasFourCycleLantern: boolean;
}

export interface DoomscrollJarState {
  totalTaxAmount: number;
  totalMinutes: number;
  entryCount: number;
  coinCount: number;
  isEmpty: boolean;
}

export interface LivingBookshelfSlot {
  color: string;
  subjectCode: string;
  heightScale: number;
}

export interface LivingBookshelfState {
  completedTopicCount: number;
  totalTopicCount: number;
  completionPct: number;
  books: LivingBookshelfSlot[];
}

export interface TimeCapsuleChestState {
  totalCount: number;
  readyCount: number;
  lockedCount: number;
  openedCount: number;
  shouldGlow: boolean;
  readyCapsules: TimeCapsuleLetter[];
  lockedCapsules: TimeCapsuleLetter[];
}

export interface HydrationHabitState {
  hasHydrationHabit: boolean;
  hydratedToday: boolean;
  waterFillRatio: number;
}

export type ApartmentExpansionTier = 'studio' | 'balcony' | 'penthouse';
export type ApartmentTierOverride = 'auto' | ApartmentExpansionTier;

export interface ApartmentExpansionState {
  tier: ApartmentExpansionTier;
  hasBalcony: boolean;
  hasPenthouse: boolean;
  effectiveLevel: number;
  tierLabel: string;
}

export interface CorkboardTaskNote {
  id: string;
  title: string;
  priority: Task['priority'];
  dueDate: string | null;
  isOverdue: boolean;
  noteColor: string;
}

export interface ExamCountdownSummary {
  hasExam: boolean;
  examTitle: string;
  examDate: string | null;
  daysLeft: number | null;
  isExamWeek: boolean;
  todayFocusMinutes: number;
  dailyGoalMinutes: number;
  dailyTargetPct: number;
}

export interface DailyWrapUpStats {
  todayStr: string;
  focusMinutesToday: number;
  spentPaiseToday: number;
  habitsDoneToday: number;
  habitsTotalToday: number;
  tasksCompletedToday: number;
}

export type HomeSeason = 'monsoon' | 'winter' | 'spring_clear';
export type SeasonOverrideMode = 'auto' | HomeSeason;

export interface CalendarSeasonState {
  season: HomeSeason;
  seasonLabel: string;
  showRainWindow: boolean;
  showSnowWindow: boolean;
  showHotTeaMug: boolean;
  forceFairyLights: boolean;
  showExamWeekBooks: boolean;
  isBirthdayToday: boolean;
  birthDateConfigured: boolean;
}

export interface MorningSequenceFrame {
  stepIndex: 0 | 1 | 2 | 3;
  zone: HomeZoneId;
  activity: HomeAvatarActivity;
  label: string;
  durationSeconds: number;
}

export const MORNING_SEQUENCE_TOTAL_SECONDS = 10;

export interface VisitorHomeTarget {
  uid: string;
  displayName: string;
  source: 'squad' | 'joint_vault_partner' | 'friend';
  sourceLabel: string;
  avatarConfig?: LeaderboardProfile['avatarConfig'];
  streakDays: number;
  estimatedXP: number;
  isStudyingLive: boolean;
  studyActivity: HomeAvatarActivity;
  activeSubject?: string;
  petSpecies: PetSpecies;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Evaluates Study Desk cleanliness & lamp brightness deterministically
 * from real incomplete overdue/today tasks and unpaid/overdue bills.
 */
export function computeRoomCleanliness(params: {
  tasks: ReadonlyArray<Pick<Task, 'id' | 'title' | 'status' | 'dueDate' | 'priority' | 'deletedAt'>>;
  bills: ReadonlyArray<Pick<Bill, 'id' | 'name' | 'status' | 'dueDate' | 'amountPaise' | 'deletedAt'>>;
  todayStr: string;
}): RoomCleanlinessState {
  const { tasks, bills, todayStr } = params;

  let overdueTasksCount = 0;
  let dueTodayTasksCount = 0;
  const actionableTasks: CleanlinessTaskItem[] = [];

  for (const t of tasks) {
    if (!t || t.deletedAt || t.status === 'completed') continue;
    const isOverdue = Boolean(t.dueDate && t.dueDate < todayStr);
    const isDueToday = Boolean(t.dueDate && t.dueDate === todayStr);
    if (isOverdue) overdueTasksCount += 1;
    if (isDueToday) dueTodayTasksCount += 1;
    if (isOverdue || isDueToday) {
      actionableTasks.push({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        status: t.status,
        isOverdue,
      });
    }
  }

  let unpaidBillsCount = 0;
  let overdueBillsCount = 0;
  const actionableBills: CleanlinessBillItem[] = [];

  for (const b of bills) {
    if (!b || b.deletedAt || b.status === 'PAID') continue;
    const isOverdue = b.status === 'OVERDUE' || Boolean(b.dueDate && b.dueDate < todayStr);
    unpaidBillsCount += 1;
    if (isOverdue) overdueBillsCount += 1;
    actionableBills.push({
      id: b.id,
      name: b.name,
      dueDate: b.dueDate,
      amountPaise: Number(b.amountPaise || 0),
      status: b.status,
      isOverdue,
    });
  }

  actionableTasks.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });
  actionableBills.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const clutterScore = overdueTasksCount + unpaidBillsCount + (overdueBillsCount > 0 ? 1 : 0);
  const clutterLevel: 0 | 1 | 2 | 3 =
    clutterScore <= 0 ? 0 : clutterScore <= 2 ? 1 : clutterScore <= 5 ? 2 : 3;

  const lampDimFactor =
    clutterLevel === 0 ? 1.0 : clutterLevel === 1 ? 0.82 : clutterLevel === 2 ? 0.64 : 0.46;

  return {
    overdueTasksCount,
    dueTodayTasksCount,
    unpaidBillsCount,
    overdueBillsCount,
    clutterLevel,
    lampDimFactor,
    isNeatAndBright: clutterLevel === 0,
    actionableTasks: actionableTasks.slice(0, 8),
    actionableBills: actionableBills.slice(0, 8),
  };
}

/**
 * Computes habit completion progress for today using non-archived habits.
 */
export function summarizeTodayHabits(
  habits: ReadonlyArray<Pick<Habit, 'archived' | 'deletedAt' | 'completedDates' | 'bestStreakDays'>>,
  todayStr: string
): { completedHabitsToday: number; totalActiveHabits: number; bestHabitStreak: number } {
  let completedHabitsToday = 0;
  let totalActiveHabits = 0;
  let bestHabitStreak = 0;

  for (const h of habits) {
    if (!h || h.archived || h.deletedAt) continue;
    totalActiveHabits += 1;
    if (Array.isArray(h.completedDates) && h.completedDates.includes(todayStr)) {
      completedHabitsToday += 1;
    }
    if (typeof h.bestStreakDays === 'number' && h.bestStreakDays > bestHabitStreak) {
      bestHabitStreak = h.bestStreakDays;
    }
  }

  return { completedHabitsToday, totalActiveHabits, bestHabitStreak };
}

/**
 * Deterministic initial baseline for Sims-style Needs bars (Energy, Focus, Mood).
 */
export function computeInitialSimsNeeds(ctx: SimsNeedsContext): SimsNeedsState {
  const habitRatio =
    ctx.totalActiveHabits > 0
      ? clamp(ctx.completedHabitsToday / ctx.totalActiveHabits, 0, 1)
      : ctx.streakDays > 0
        ? 0.65
        : 0.45;

  const isLateNight = ctx.currentHour >= 23 || ctx.currentHour < 5;
  const isMorning = ctx.currentHour >= 6 && ctx.currentHour < 11;
  const baseEnergy = isLateNight ? 62 : isMorning ? 90 : 80;
  const energy = clamp(Math.round(baseEnergy + Math.min(ctx.streakDays, 10) * 0.6), 20, 100);

  const isWorkFocus =
    (ctx.isRunning &&
      (ctx.timerEngine === 'stopwatch' ||
        ctx.timerEngine === 'countdown' ||
        ctx.timerMode === 'work')) ||
    ctx.activity === 'studying' ||
    ctx.activity === 'typing' ||
    ctx.activity === 'reading';

  const focus = clamp(
    Math.round((isWorkFocus ? 82 : 66) - ctx.clutterLevel * 4 + habitRatio * 8),
    20,
    100
  );

  const mood = clamp(
    Math.round(
      56 +
        habitRatio * 28 +
        Math.min(ctx.streakDays, 14) * 0.9 -
        ctx.clutterLevel * 5
    ),
    22,
    100
  );

  return { energy, focus, mood };
}

/**
 * Advances Sims-style Needs bars over `deltaSeconds` deterministically based on
 * current Pomodoro state, active apartment zone, habits, streak, and clutter.
 */
export function stepSimsNeeds(
  prev: SimsNeedsState,
  ctx: SimsNeedsContext,
  deltaSeconds: number
): SimsNeedsState {
  const dt = clamp(deltaSeconds, 0, 5);
  if (dt <= 0) return prev;

  const isBreakTimer =
    ctx.isRunning &&
    (ctx.timerEngine === 'short_break' ||
      ctx.timerEngine === 'long_break' ||
      (ctx.timerEngine === 'pomodoro' &&
        (ctx.timerMode === 'short_break' || ctx.timerMode === 'long_break')));

  const isWorkFocus =
    (ctx.isRunning &&
      !isBreakTimer &&
      (ctx.timerEngine === 'stopwatch' ||
        ctx.timerEngine === 'countdown' ||
        ctx.timerMode === 'work')) ||
    ctx.activity === 'studying' ||
    ctx.activity === 'typing' ||
    ctx.activity === 'reading';

  // 1. Energy
  let energyDelta = 0;
  if (ctx.activeZone === 'bedroom' && ctx.activity === 'sleeping') {
    energyDelta = 1.6 * dt;
  } else if (ctx.activeZone === 'kitchen' || ctx.activeZone === 'dining' || ctx.activity === 'coffee' || ctx.activity === 'eating') {
    energyDelta = 1.15 * dt;
  } else if (ctx.activeZone === 'washroom') {
    energyDelta = 0.85 * dt;
  } else if (isWorkFocus) {
    energyDelta = -0.14 * dt;
  } else if (isBreakTimer) {
    energyDelta = 0.4 * dt;
  } else if (ctx.isWalking) {
    energyDelta = -0.02 * dt;
  }
  const nextEnergy = clamp(prev.energy + energyDelta, 12, 100);

  // 2. Focus
  let focusDelta = 0;
  const focusCap = clamp(98 - ctx.clutterLevel * 4 - (nextEnergy < 25 ? 18 : 0), 55, 100);
  if (ctx.activity === 'coffee' || ctx.activeZone === 'kitchen') {
    focusDelta = prev.focus < 90 ? 0.55 * dt : 0;
  } else if (ctx.activeZone === 'washroom') {
    focusDelta = prev.focus < 84 ? 0.35 * dt : 0;
  } else if (isWorkFocus) {
    const rate = nextEnergy < 25 ? 0.08 : 0.34;
    focusDelta = prev.focus < focusCap ? rate * dt : -0.1 * dt;
  } else if (ctx.activeZone === 'bedroom' && ctx.activity === 'sleeping') {
    const target = 62;
    focusDelta = (target - prev.focus) * Math.min(1, 0.08 * dt);
  } else {
    const idleTarget = 64 - ctx.clutterLevel * 3;
    focusDelta = (idleTarget - prev.focus) * Math.min(1, 0.06 * dt);
  }
  const nextFocus = clamp(prev.focus + focusDelta, 15, 100);

  // 3. Mood
  const habitRatio =
    ctx.totalActiveHabits > 0
      ? clamp(ctx.completedHabitsToday / ctx.totalActiveHabits, 0, 1)
      : ctx.streakDays > 0
        ? 0.65
        : 0.5;
  const breakBoost =
    ctx.activeZone === 'kitchen' || ctx.activeZone === 'dining' || ctx.activeZone === 'washroom' || isBreakTimer
      ? 10
      : 0;
  const fatiguePenalty = nextEnergy < 25 ? 12 : nextEnergy < 40 ? 5 : 0;
  const moodAnchor = clamp(
    52 +
      habitRatio * 28 +
      Math.min(ctx.streakDays, 15) * 1.1 -
      ctx.clutterLevel * 6 +
      breakBoost -
      fatiguePenalty,
    18,
    100
  );
  const moodRate = breakBoost > 0 ? 0.14 : 0.07;
  const nextMood = clamp(prev.mood + (moodAnchor - prev.mood) * Math.min(1, moodRate * dt), 18, 100);

  return {
    energy: Math.round(nextEnergy * 10) / 10,
    focus: Math.round(nextFocus * 10) / 10,
    mood: Math.round(nextMood * 10) / 10,
  };
}

export function getNeedStatusLabel(value: number): 'Optimal' | 'Steady' | 'Low' | 'Critical' {
  if (value >= 75) return 'Optimal';
  if (value >= 45) return 'Steady';
  if (value >= 25) return 'Low';
  return 'Critical';
}

/**
 * Evaluates 3D furniture upgrades and Streak Companion Pet accessories
 * strictly from deterministic XP/Level, Savings Goal progress (25/50/100%), and streak.
 */
export function computeHomeUnlocks(params: {
  totalXP: number;
  savingsGoals: ReadonlyArray<Pick<SavingsGoal, 'targetPaise' | 'savedPaise'>>;
  streakDays: number;
}): HomeUnlocksSummary {
  const safeXP = Math.max(0, Math.floor(Number(params.totalXP) || 0));
  const level = calculateLevel(safeXP);
  const nextLevelXP = level * XP_PER_LEVEL;

  let bestSavingsPct = 0;
  for (const goal of params.savingsGoals) {
    if (!goal || typeof goal.targetPaise !== 'number' || goal.targetPaise <= 0) continue;
    const saved = Math.max(0, Number(goal.savedPaise || 0));
    const pct = clamp((saved / goal.targetPaise) * 100, 0, 100);
    if (pct > bestSavingsPct) bestSavingsPct = pct;
  }

  const streakDays = Math.max(0, Math.floor(Number(params.streakDays) || 0));

  const unlocks: HomeDecorUnlocks = {
    mechKeyboard: safeXP >= 200 || level >= 2,
    dualMonitor: level >= 2 || bestSavingsPct >= 25,
    extraPlants: level >= 2 || bestSavingsPct >= 25 || streakDays >= 5,
    fairyLights: level >= 3 || bestSavingsPct >= 50 || streakDays >= 7,
    espressoUpgrade: level >= 4 || bestSavingsPct >= 50,
    gamingChair: level >= 5 || bestSavingsPct >= 100,
  };

  const unlockedCount = Object.values(unlocks).filter(Boolean).length;
  const totalDecorCount = Object.keys(unlocks).length;

  const hasCollar = streakDays >= 7;
  const hasLuxuryPetBed = streakDays >= 30;
  const tier: PetProgressState['tier'] = hasLuxuryPetBed
    ? 'legendary'
    : hasCollar
      ? 'bonded'
      : 'starter';
  const tierLabel = hasLuxuryPetBed
    ? '30d+ Royal Bed & Golden Tag'
    : hasCollar
      ? '7d+ Companion Collar'
      : streakDays > 0
        ? `${streakDays}d Streak Buddy`
        : 'Starter Buddy';

  return {
    totalXP: safeXP,
    level,
    nextLevelXP,
    bestSavingsPct: Math.round(bestSavingsPct),
    unlockedCount,
    totalDecorCount,
    unlocks,
    pet: {
      unlocked: true,
      streakDays,
      hasCollar,
      hasLuxuryPetBed,
      tier,
      tierLabel,
    },
  };
}

function deriveDeterministicPetSpecies(uid: string): PetSpecies {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'cat' : 'dog';
}

/**
 * Privacy-safe visitor model constructor from public Study Squad LeaderboardProfile.
 * Never consumes or leaks private finance data.
 */
export function buildVisitorHomeFromLeaderboardProfile(
  profile: LeaderboardProfile,
  options: {
    source: 'squad' | 'friend';
    sourceLabel: string;
    isStudyingLive: boolean;
  }
): VisitorHomeTarget {
  const safeStreak = Math.max(0, Math.floor(Number(profile.streakDays || 0)));
  const safeSessions = Math.max(0, Math.floor(Number(profile.totalSessionsCount || 0)));
  const estimatedXP = safeSessions * 65 + safeStreak * 45;
  const liveActivity: HomeAvatarActivity = options.isStudyingLive
    ? profile.studyActivity || 'studying'
    : 'coffee';

  return {
    uid: profile.uid,
    displayName: profile.displayName || 'Study Partner',
    source: options.source,
    sourceLabel: options.sourceLabel,
    avatarConfig: profile.avatarConfig,
    streakDays: safeStreak,
    estimatedXP,
    isStudyingLive: options.isStudyingLive,
    studyActivity: liveActivity,
    activeSubject: options.isStudyingLive ? profile.activeSubject : undefined,
    petSpecies: deriveDeterministicPetSpecies(profile.uid),
  };
}

/**
 * Privacy-safe visitor model constructor for a Joint Vault Partner.
 * Explicitly accepts ONLY partner UID + display name (+ optional public squad profile)
 * and NEVER reads vault balances, contributions, or transactions.
 */
export function buildVisitorHomeFromVaultPartner(params: {
  uid: string;
  name: string;
  vaultName: string;
  publicProfile?: LeaderboardProfile | null;
  isStudyingLive?: boolean;
}): VisitorHomeTarget {
  if (params.publicProfile) {
    return buildVisitorHomeFromLeaderboardProfile(params.publicProfile, {
      source: 'squad',
      sourceLabel: `Partner · ${params.vaultName || 'Joint Vault'}`,
      isStudyingLive: Boolean(params.isStudyingLive),
    });
  }

  return {
    uid: params.uid,
    displayName: params.name || 'Vault Partner',
    source: 'joint_vault_partner',
    sourceLabel: `Partner · ${params.vaultName || 'Joint Vault'}`,
    streakDays: 0,
    estimatedXP: 0,
    isStudyingLive: false,
    studyActivity: 'coffee',
    petSpecies: deriveDeterministicPetSpecies(params.uid),
  };
}

/**
 * Selects top 3–4 highest-priority active tasks for 3D Corkboard sticky notes.
 */
export function selectCorkboardTasks(
  tasks: ReadonlyArray<Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'dueDate' | 'deletedAt'>>,
  todayStr: string,
  limit = 4
): CorkboardTaskNote[] {
  const priorityRank: Record<Task['priority'], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  const active = tasks.filter((t) => t && !t.deletedAt && t.status !== 'completed');
  active.sort((a, b) => {
    const aOverdue = Boolean(a.dueDate && a.dueDate < todayStr);
    const bOverdue = Boolean(b.dueDate && b.dueDate < todayStr);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    const pDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (pDiff !== 0) return pDiff;

    return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
  });

  return active.slice(0, Math.max(1, Math.min(4, limit))).map((t) => {
    const isOverdue = Boolean(t.dueDate && t.dueDate < todayStr);
    const noteColor = isOverdue
      ? '#fed7aa' // urgent peach
      : t.priority === 'high'
        ? '#fecdd3' // soft rose
        : t.priority === 'medium'
          ? '#fef08a' // classic yellow sticky note
          : '#bae6fd'; // sky pastel
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      isOverdue,
      noteColor,
    };
  });
}

function diffCalendarDaysUTC(fromYmd: string, toYmd: string): number {
  const pFrom = parseDateString(fromYmd);
  const pTo = parseDateString(toYmd);
  if (!pFrom || !pTo) return 0;
  const a = Date.UTC(pFrom.year, pFrom.month - 1, pFrom.day);
  const b = Date.UTC(pTo.year, pTo.month - 1, pTo.day);
  return Math.round((b - a) / 86400000);
}

/**
 * Computes Exam Countdown (nearest active StudyExam or optional user override)
 * plus today's Focus progress against daily focus goal.
 */
export function computeExamAndTargetSummary(params: {
  exams: ReadonlyArray<Pick<StudyExam, 'id' | 'title' | 'examDate' | 'examType' | 'deletedAt'>>;
  todayStr: string;
  todayFocusMinutes: number;
  dailyGoalMinutes?: number;
  customExamOverride?: { title: string; examDate: string } | null;
}): ExamCountdownSummary {
  const { exams, todayStr, todayFocusMinutes } = params;
  const dailyGoalMinutes = Math.max(15, Math.round(Number(params.dailyGoalMinutes) || 120));
  const dailyTargetPct = clamp(Math.round((todayFocusMinutes / dailyGoalMinutes) * 100), 0, 100);

  const candidates = exams
    .filter((e) => e && !e.deletedAt && Boolean(e.examDate) && e.examDate >= todayStr)
    .sort((a, b) => a.examDate.localeCompare(b.examDate));

  if (candidates.length > 0) {
    const nextExam = candidates[0];
    const daysLeft = Math.max(0, diffCalendarDaysUTC(todayStr, nextExam.examDate));
    return {
      hasExam: true,
      examTitle: nextExam.title || 'Upcoming Exam',
      examDate: nextExam.examDate,
      daysLeft,
      isExamWeek: daysLeft <= 7,
      todayFocusMinutes: Math.max(0, Math.round(todayFocusMinutes)),
      dailyGoalMinutes,
      dailyTargetPct,
    };
  }

  if (
    params.customExamOverride &&
    params.customExamOverride.examDate &&
    parseDateString(params.customExamOverride.examDate) &&
    params.customExamOverride.examDate >= todayStr
  ) {
    const daysLeft = Math.max(0, diffCalendarDaysUTC(todayStr, params.customExamOverride.examDate));
    return {
      hasExam: true,
      examTitle: params.customExamOverride.title.trim() || 'Target Exam',
      examDate: params.customExamOverride.examDate,
      daysLeft,
      isExamWeek: daysLeft <= 7,
      todayFocusMinutes: Math.max(0, Math.round(todayFocusMinutes)),
      dailyGoalMinutes,
      dailyTargetPct,
    };
  }

  return {
    hasExam: false,
    examTitle: 'Set Target Exam',
    examDate: null,
    daysLeft: null,
    isExamWeek: false,
    todayFocusMinutes: Math.max(0, Math.round(todayFocusMinutes)),
    dailyGoalMinutes,
    dailyTargetPct,
  };
}

/**
 * Aggregates real Daily Wrap-Up metrics for today (used by 1-Click End Day Sleep Ritual & laptop/countdown surfaces).
 */
export function computeDailyWrapUpStats(params: {
  sessions: ReadonlyArray<Pick<FocusSession, 'mode' | 'startedAt' | 'actualDurationSeconds' | 'durationSeconds' | 'completed'>>;
  expenses: ReadonlyArray<Pick<ExpenseTransaction, 'amountPaise' | 'date' | 'deletedAt'>>;
  habits: ReadonlyArray<Pick<Habit, 'archived' | 'deletedAt' | 'completedDates' | 'bestStreakDays'>>;
  tasks: ReadonlyArray<Pick<Task, 'status' | 'completedAt' | 'deletedAt'>>;
  todayStr: string;
  timezone: string;
}): DailyWrapUpStats {
  const { sessions, expenses, habits, tasks, todayStr, timezone } = params;

  let focusSecToday = 0;
  for (const s of sessions) {
    if (!s || s.mode !== 'work' || !s.startedAt) continue;
    try {
      const sDate = formatDateInTimezone(s.startedAt, timezone);
      if (sDate !== todayStr) continue;
      if (!s.completed && !s.actualDurationSeconds) continue;
      focusSecToday += Math.max(0, Number(s.actualDurationSeconds ?? s.durationSeconds ?? 0));
    } catch {
      // ignore invalid session timestamp
    }
  }

  let spentPaiseToday = 0;
  for (const e of expenses) {
    if (!e || e.deletedAt) continue;
    if (e.date === todayStr) {
      spentPaiseToday += Math.max(0, Number(e.amountPaise || 0));
    }
  }

  const habitSummary = summarizeTodayHabits(habits, todayStr);

  let tasksCompletedToday = 0;
  for (const t of tasks) {
    if (!t || t.deletedAt || t.status !== 'completed' || !t.completedAt) continue;
    try {
      if (formatDateInTimezone(t.completedAt, timezone) === todayStr) {
        tasksCompletedToday += 1;
      }
    } catch {
      // ignore invalid timestamp
    }
  }

  return {
    todayStr,
    focusMinutesToday: Math.round(focusSecToday / 60),
    spentPaiseToday,
    habitsDoneToday: habitSummary.completedHabitsToday,
    habitsTotalToday: habitSummary.totalActiveHabits,
    tasksCompletedToday,
  };
}

/**
 * Evaluates calendar seasons (Monsoon June–Sep, Winter Dec–Feb, Clear Mar–May/Oct–Nov)
 * plus Birthday and Exam Week environmental props.
 */
export function computeCalendarSeasonState(params: {
  todayStr: string;
  birthDate?: string | null;
  isExamWeek: boolean;
  seasonOverride?: SeasonOverrideMode;
}): CalendarSeasonState {
  const parsedToday = parseDateString(params.todayStr);
  const month = parsedToday?.month ?? 11;

  let season: HomeSeason;
  if (params.seasonOverride && params.seasonOverride !== 'auto') {
    season = params.seasonOverride;
  } else if (month >= 6 && month <= 9) {
    season = 'monsoon';
  } else if (month === 12 || month <= 2) {
    season = 'winter';
  } else {
    season = 'spring_clear';
  }

  const seasonLabel =
    season === 'monsoon' ? 'Monsoon' : season === 'winter' ? 'Winter' : 'Clear Season';

  let isBirthdayToday = false;
  let birthDateConfigured = false;
  if (params.birthDate && typeof params.birthDate === 'string') {
    const cleanBday = params.birthDate.trim();
    const mmddMatch = cleanBday.match(/(?:^\d{4}-)?(\d{2}-\d{2})$/);
    if (mmddMatch) {
      birthDateConfigured = true;
      isBirthdayToday = params.todayStr.slice(5) === mmddMatch[1];
    }
  }

  return {
    season,
    seasonLabel,
    showRainWindow: season === 'monsoon',
    showSnowWindow: season === 'winter',
    showHotTeaMug: season === 'monsoon' || season === 'winter',
    forceFairyLights: season === 'winter',
    showExamWeekBooks: params.isExamWeek,
    isBirthdayToday,
    birthDateConfigured,
  };
}

/**
 * Deterministic ~10-second choreographed morning opening sequence:
 * Bed (0–2.4s) -> Washroom (2.4–5.2s) -> Kitchen Coffee (5.2–7.8s) -> Study Desk (7.8–10.0s).
 */
export function getMorningSequenceStep(elapsedSeconds: number): MorningSequenceFrame | null {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= MORNING_SEQUENCE_TOTAL_SECONDS) {
    return null;
  }
  if (elapsedSeconds < 2.4) {
    return {
      stepIndex: 0,
      zone: 'bedroom',
      activity: 'idle',
      label: 'Good Morning! Rising from bed',
      durationSeconds: 2.4,
    };
  }
  if (elapsedSeconds < 5.2) {
    return {
      stepIndex: 1,
      zone: 'washroom',
      activity: 'freshening_up',
      label: 'Morning Prep • Washroom freshen-up',
      durationSeconds: 2.8,
    };
  }
  if (elapsedSeconds < 7.8) {
    return {
      stepIndex: 2,
      zone: 'kitchen',
      activity: 'coffee',
      label: 'Morning Fuel • Pouring fresh coffee',
      durationSeconds: 2.6,
    };
  }
  return {
    stepIndex: 3,
    zone: 'study',
    activity: 'typing',
    label: 'Ready at Study Desk • Let’s begin!',
    durationSeconds: 2.2,
  };
}

/**
 * Batch 3 #1 — Streak-Powered Living Plants (sprout -> leafy -> blooming, or wilted after 3+ missed days).
 */
export function computeLivingPlantState(params: {
  streakDays: number;
  habits: ReadonlyArray<Pick<Habit, 'archived' | 'deletedAt' | 'completedDates'>>;
  todayStr: string;
}): LivingPlantState {
  const activeHabits = params.habits.filter((h) => h && !h.archived && !h.deletedAt);
  let latestCompletedDate: string | null = null;
  let anyCompletedToday = false;

  for (const h of activeHabits) {
    for (const d of h.completedDates || []) {
      if (d === params.todayStr) anyCompletedToday = true;
      if (!latestCompletedDate || d > latestCompletedDate) {
        latestCompletedDate = d;
      }
    }
  }

  const daysSinceLastHabit = latestCompletedDate
    ? Math.max(0, diffCalendarDaysUTC(latestCompletedDate, params.todayStr))
    : 0;

  if (activeHabits.length > 0 && !anyCompletedToday && latestCompletedDate && daysSinceLastHabit >= 3) {
    return {
      stage: 'wilted',
      streakDays: params.streakDays,
      daysSinceLastHabit,
      label: `Droopy Plants (${daysSinceLastHabit}d without habit)`,
    };
  }

  if (params.streakDays >= 30) {
    return {
      stage: 'blooming',
      streakDays: params.streakDays,
      daysSinceLastHabit,
      label: '30d+ Blooming Plants',
    };
  }
  if (params.streakDays >= 7) {
    return {
      stage: 'leafy',
      streakDays: params.streakDays,
      daysSinceLastHabit,
      label: '7d+ Lush Leafy Plants',
    };
  }
  return {
    stage: 'sprout',
    streakDays: params.streakDays,
    daysSinceLastHabit,
    label: 'Starter Young Sprouts',
  };
}

/**
 * Batch 3 #2 — 3D Vault Safe Tier from Savings Goal progress (25% Bronze -> 50% Silver -> 100% Gold).
 */
export function computeVaultSafeState(bestSavingsPct: number): VaultSafeState {
  const pct = clamp(Math.round(bestSavingsPct || 0), 0, 100);
  if (pct >= 100) return { tier: 'gold', bestSavingsPct: pct, label: 'Gold Vault (100% Goal!)' };
  if (pct >= 50) return { tier: 'silver', bestSavingsPct: pct, label: 'Silver Vault (50%+)' };
  if (pct >= 25) return { tier: 'bronze', bestSavingsPct: pct, label: 'Bronze Vault (25%+)' };
  return { tier: 'starter', bestSavingsPct: pct, label: 'Starter Steel Safe (<25%)' };
}

/**
 * Batch 3 #3 — Doorstep Parcel & Red-Ribbon Mail from real Shopping/Gadget expenses & Unpaid Bills.
 */
export function computeDoorstepDeliveries(params: {
  expenses: ReadonlyArray<Pick<ExpenseTransaction, 'id' | 'description' | 'categoryName' | 'amountPaise' | 'date' | 'deletedAt'>>;
  bills: ReadonlyArray<Pick<Bill, 'id' | 'name' | 'status' | 'dueDate' | 'amountPaise' | 'deletedAt'>>;
  todayStr: string;
}): DoorstepDeliveriesState {
  const shoppingRegex = /shop|gadget|amazon|flipkart|electronics|tech|device|keyboard|mouse|headphone|laptop|phone|order|parcel|delivery|clothes|gear/i;

  const recentShoppingParcels = params.expenses
    .filter((e) => {
      if (!e || e.deletedAt || !e.date) return false;
      const daysAgo = diffCalendarDaysUTC(e.date, params.todayStr);
      if (daysAgo < 0 || daysAgo > 14) return false;
      return shoppingRegex.test(e.categoryName || '') || shoppingRegex.test(e.description || '');
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      description: e.description || e.categoryName || 'Shopping Order',
      amountPaise: Number(e.amountPaise || 0),
      date: e.date,
    }));

  const upcomingBills: CleanlinessBillItem[] = params.bills
    .filter((b) => b && !b.deletedAt && b.status !== 'PAID')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6)
    .map((b) => ({
      id: b.id,
      name: b.name,
      dueDate: b.dueDate,
      amountPaise: Number(b.amountPaise || 0),
      status: b.status,
      isOverdue: b.status === 'OVERDUE' || Boolean(b.dueDate && b.dueDate < params.todayStr),
    }));

  return {
    hasParcel: recentShoppingParcels.length > 0,
    hasMail: upcomingBills.length > 0,
    parcelCount: recentShoppingParcels.length,
    mailCount: upcomingBills.length,
    recentShoppingParcels,
    upcomingBills,
  };
}

/**
 * Batch 3 #5 — "Flow State" Golden Aura (25+ uninterrupted min, zero pause) + 4-cycle Lantern celebration.
 */
export function computeFlowStateStatus(params: {
  isRunning: boolean;
  timerMode: TimerMode;
  timerEngine: TimerEngineMode;
  totalDuration: number;
  timeLeft: number;
  stopwatchElapsed: number;
  wasPausedThisRun: boolean;
  sessions: ReadonlyArray<Pick<FocusSession, 'mode' | 'startedAt' | 'completed'>>;
  todayStr: string;
  timezone: string;
}): FlowStateAuraSummary {
  const isBreak =
    params.timerEngine === 'short_break' ||
    params.timerEngine === 'long_break' ||
    params.timerMode === 'short_break' ||
    params.timerMode === 'long_break';

  const elapsedSeconds =
    params.isRunning && !isBreak
      ? params.timerEngine === 'stopwatch'
        ? Math.max(0, params.stopwatchElapsed)
        : Math.max(0, params.totalDuration - params.timeLeft)
      : 0;

  const elapsedUninterruptedMinutes = params.wasPausedThisRun ? 0 : Math.floor(elapsedSeconds / 60);
  const isFlowStateActive = params.isRunning && !isBreak && !params.wasPausedThisRun && elapsedSeconds >= 25 * 60;

  let completedWorkCyclesToday = 0;
  for (const s of params.sessions) {
    if (!s || s.mode !== 'work' || !s.completed || !s.startedAt) continue;
    try {
      if (formatDateInTimezone(s.startedAt, params.timezone) === params.todayStr) {
        completedWorkCyclesToday += 1;
      }
    } catch {
      // ignore invalid date
    }
  }

  return {
    isFlowStateActive,
    elapsedUninterruptedMinutes,
    completedWorkCyclesToday,
    hasFourCycleLantern: completedWorkCyclesToday >= 4,
  };
}

/**
 * Batch 4 #1 — 3D Doomscroll Tax Jar coin visual state.
 */
export function computeDoomscrollJarState(entries: ReadonlyArray<DoomscrollTaxEntry>): DoomscrollJarState {
  let totalTaxAmount = 0;
  let totalMinutes = 0;

  for (const e of entries) {
    if (!e) continue;
    const taxVal =
      typeof e.amountTaxed === 'number' && e.amountTaxed > 0
        ? e.amountTaxed
        : Number(e.taxAmountPaise || 0) / 100;
    totalTaxAmount += Math.max(0, taxVal);
    totalMinutes += Math.max(0, Number(e.minutes || e.durationMinutes || 0));
  }

  const roundedTax = Math.round(totalTaxAmount);
  const coinCount = roundedTax <= 0 ? 0 : Math.min(18, Math.max(2, Math.ceil(roundedTax / 25)));

  return {
    totalTaxAmount: roundedTax,
    totalMinutes: Math.round(totalMinutes),
    entryCount: entries.length,
    coinCount,
    isEmpty: entries.length === 0 || roundedTax <= 0,
  };
}

const BOOKSHELF_FALLBACK_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

/**
 * Batch 4 #2 — Living Bookshelf populated dynamically by Study OS topic completions.
 */
export function computeLivingBookshelfState(params: {
  subjects: ReadonlyArray<Pick<StudySubject, 'code' | 'color' | 'totalSubtopics' | 'completedSubtopics' | 'deletedAt'>>;
  topics: ReadonlyArray<Pick<StudyTopic, 'subjectCode' | 'theory' | 'practice' | 'pyq' | 'deletedAt'>>;
}): LivingBookshelfState {
  const activeSubjects = params.subjects.filter((s) => s && !s.deletedAt);
  const activeTopics = params.topics.filter((t) => t && !t.deletedAt);

  const books: LivingBookshelfSlot[] = [];
  let completedTopicCount = 0;
  let totalTopicCount = 0;

  if (activeTopics.length > 0) {
    const colorByCode = new Map<string, string>();
    activeSubjects.forEach((s, idx) => {
      colorByCode.set(s.code, s.color || BOOKSHELF_FALLBACK_COLORS[idx % BOOKSHELF_FALLBACK_COLORS.length]);
    });

    totalTopicCount = activeTopics.length;
    for (const t of activeTopics) {
      const done = Boolean(t.theory && t.practice) || Boolean(t.theory && t.pyq);
      if (done) {
        completedTopicCount += 1;
        if (books.length < 36) {
          books.push({
            color: colorByCode.get(t.subjectCode) || BOOKSHELF_FALLBACK_COLORS[books.length % BOOKSHELF_FALLBACK_COLORS.length],
            subjectCode: t.subjectCode,
            heightScale: 0.85 + ((books.length * 7) % 4) * 0.08,
          });
        }
      }
    }
  } else if (activeSubjects.length > 0) {
    activeSubjects.forEach((s, idx) => {
      const total = Math.max(0, Number(s.totalSubtopics || 0));
      const done = Math.max(0, Math.min(total, Number(s.completedSubtopics || 0)));
      totalTopicCount += total;
      completedTopicCount += done;
      const c = s.color || BOOKSHELF_FALLBACK_COLORS[idx % BOOKSHELF_FALLBACK_COLORS.length];
      for (let i = 0; i < Math.min(8, done) && books.length < 36; i += 1) {
        books.push({
          color: c,
          subjectCode: s.code,
          heightScale: 0.88 + ((i * 5) % 4) * 0.07,
        });
      }
    });
  }

  // Starter shelf shows 4 sleek handbooks if Study OS has 0 completed topics yet
  if (books.length === 0) {
    for (let i = 0; i < 4; i += 1) {
      books.push({
        color: BOOKSHELF_FALLBACK_COLORS[i],
        subjectCode: 'STARTER',
        heightScale: 0.92 + (i % 2) * 0.1,
      });
    }
  }

  const completionPct = totalTopicCount > 0 ? clamp(Math.round((completedTopicCount / totalTopicCount) * 100), 0, 100) : 0;

  return {
    completedTopicCount,
    totalTopicCount,
    completionPct,
    books,
  };
}

/**
 * Batch 4 #3 — Glowing Time Capsule Chest state.
 */
export function computeTimeCapsuleChestState(params: {
  capsules: ReadonlyArray<TimeCapsuleLetter>;
  todayStr: string;
}): TimeCapsuleChestState {
  const readyCapsules: TimeCapsuleLetter[] = [];
  const lockedCapsules: TimeCapsuleLetter[] = [];
  let openedCount = 0;

  for (const c of params.capsules) {
    if (!c) continue;
    if (c.isUnlocked || c.openedAt) {
      openedCount += 1;
    } else if (c.unlockDate && c.unlockDate <= params.todayStr) {
      readyCapsules.push(c);
    } else {
      lockedCapsules.push(c);
    }
  }

  return {
    totalCount: params.capsules.length,
    readyCount: readyCapsules.length,
    lockedCount: lockedCapsules.length,
    openedCount,
    shouldGlow: readyCapsules.length > 0,
    readyCapsules,
    lockedCapsules,
  };
}

/**
 * Batch 4 #5 — Hydration & Coffee Habit detector & bottle fill level.
 */
export function isHydrationOrCoffeeHabitTitle(title: string): 'hydration' | 'coffee' | null {
  if (/\b(water|hydrat|h2o|drink\s*water|litre|liter|glasses)\b/i.test(title)) return 'hydration';
  if (/\b(coffee|chai|tea|matcha|espresso)\b/i.test(title)) return 'coffee';
  return null;
}

export function computeHydrationHabitState(params: {
  habits: ReadonlyArray<Pick<Habit, 'title' | 'category' | 'archived' | 'deletedAt' | 'completedDates'>>;
  todayStr: string;
}): HydrationHabitState {
  const activeHydration = params.habits.filter(
    (h) => !h.archived && !h.deletedAt && isHydrationOrCoffeeHabitTitle(`${h.title} ${h.category || ''}`) === 'hydration'
  );
  if (activeHydration.length === 0) {
    return { hasHydrationHabit: false, hydratedToday: false, waterFillRatio: 0.72 };
  }
  const doneCount = activeHydration.filter((h) => (h.completedDates || []).includes(params.todayStr)).length;
  const hydratedToday = doneCount === activeHydration.length;
  const waterFillRatio = doneCount === 0 ? 0.25 : clamp(0.35 + (doneCount / activeHydration.length) * 0.65, 0.25, 1);
  return { hasHydrationHabit: true, hydratedToday, waterFillRatio };
}

/**
 * Batch 4 #6 — Level-Up Apartment Expansion (Lv 1-9 Studio, Lv 10+ Balcony, Lv 20+ Penthouse Loft).
 */
export function computeApartmentExpansion(params: {
  level: number;
  override?: ApartmentTierOverride;
}): ApartmentExpansionState {
  const effectiveLevel = Math.max(1, Math.floor(params.level || 1));
  const tier: ApartmentExpansionTier =
    params.override && params.override !== 'auto'
      ? params.override
      : effectiveLevel >= 20
        ? 'penthouse'
        : effectiveLevel >= 10
          ? 'balcony'
          : 'studio';

  return {
    tier,
    hasBalcony: tier === 'balcony' || tier === 'penthouse',
    hasPenthouse: tier === 'penthouse',
    effectiveLevel,
    tierLabel:
      tier === 'penthouse'
        ? 'Lv 20+ Penthouse Loft'
        : tier === 'balcony'
          ? 'Lv 10+ Balcony Suite'
          : 'Cozy Studio',
  };
}

