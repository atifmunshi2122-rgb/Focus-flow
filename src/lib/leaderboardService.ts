/**
 * FocusFlow & Finance — Deterministic Study Leaderboard Service (Phase 1)
 *
 * 100% zero-AI, deterministic aggregator & Firestore sync:
 * - Computes verified focus minutes from completed `mode === 'work'` FocusSessions.
 * - Enforces anti-cheat caps: 960 min/day (16h), 6720 min/week, 29760 min/month.
 * - Uses IST/user-timezone date keys (`todayKey`, `weekKey`, `monthKey`) with automatic
 *   client-side rollover so stale yesterday/last-week stats always display as 0 without cron jobs.
 * - Supports Private Study Squads (6-character invite code) & Global Opt-In Leaderboard.
 */

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase.ts';
import { DEFAULT_TIMEZONE, formatDateInTimezone, getTodayDateString } from './dateTime.ts';
import { computeFocusStreaks, getSessionFocusSeconds } from './pomodoroAnalytics.ts';
import type { FocusSession } from '../types/index.ts';
import type {
  LeaderboardPeriod,
  LeaderboardProfile,
  RankedLeaderboardEntry,
  SquadChallengeProgress,
  StudySquad,
} from '../types/leaderboard.ts';
import {
  isValidStudyActivity,
  type AvatarEmote,
  type StudyActivity,
} from '../features/study-room/types.ts';

export const DAILY_FOCUS_CAP_MINUTES = 960; // 16 hours/day anti-cheat sanity cap
export const WEEKLY_FOCUS_CAP_MINUTES = 6720; // 16h * 7
export const MONTHLY_FOCUS_CAP_MINUTES = 29760; // 16h * 31
export const MAX_SQUAD_MEMBERS = 25;
export const LIVE_PRESENCE_STALE_MS = 5 * 60 * 1000; // 5-minute heartbeat auto-expiration

export const LEADERBOARD_AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ef4444', // Rose
];

/**
 * Deterministic ISO week key (YYYY-Www) from a YYYY-MM-DD date string.
 */
export function getIsoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '1970-W01';
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7; // Mon=1 .. Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getCurrentPeriodKeys(
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): { todayKey: string; weekKey: string; monthKey: string } {
  const todayKey = formatDateInTimezone(now, timezone);
  const weekKey = getIsoWeekKey(todayKey);
  const monthKey = todayKey.slice(0, 7);
  return { todayKey, weekKey, monthKey };
}

export function formatFocusMinutesShort(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hrs = safe / 60;
  return Number.isInteger(hrs) ? `${hrs}h` : `${hrs.toFixed(1)}h`;
}

function packTopSubjects(
  source: Map<string, number>,
  capPerSubject: number,
  maxSubjects = 20
): Record<string, number> {
  const entries = Array.from(source.entries())
    .filter(([, mins]) => mins > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSubjects);
  const out: Record<string, number> = {};
  for (const [code, mins] of entries) {
    out[code] = Math.min(capPerSubject, Math.round(mins));
  }
  return out;
}

/**
 * Deterministically aggregates completed work FocusSessions into today/week/month
 * totals (plus per-subject breakdowns) with per-day anti-cheat capping (max 16h/day).
 */
export function aggregateFocusStatsForLeaderboard(input: {
  sessions: FocusSession[];
  timezone?: string;
  now?: Date;
}): {
  todayKey: string;
  todayMinutes: number;
  weekKey: string;
  weekMinutes: number;
  monthKey: string;
  monthMinutes: number;
  todaySubjectMinutes: Record<string, number>;
  weekSubjectMinutes: Record<string, number>;
  monthSubjectMinutes: Record<string, number>;
  streakDays: number;
  totalSessionsCount: number;
} {
  const tz = input.timezone || DEFAULT_TIMEZONE;
  const now = input.now || new Date();
  const { todayKey, weekKey, monthKey } = getCurrentPeriodKeys(tz, now);

  // Sum completed work sessions per calendar day first so the 16h daily cap applies per day
  const minutesByDay = new Map<string, number>();
  const todaySubMap = new Map<string, number>();
  const weekSubMap = new Map<string, number>();
  const monthSubMap = new Map<string, number>();
  let totalSessionsCount = 0;

  for (const s of input.sessions || []) {
    if ((!s.completed && s.status !== 'completed') || s.mode !== 'work') continue;
    const rawDate = s.startedAt ? formatDateInTimezone(s.startedAt, tz) : '';
    if (!rawDate) continue;

    const secs = getSessionFocusSeconds(s);
    const mins = Math.max(0, Math.round(secs / 60));
    if (mins <= 0) continue;

    totalSessionsCount++;
    const prev = minutesByDay.get(rawDate) || 0;
    const nextDayTotal = Math.min(DAILY_FOCUS_CAP_MINUTES, prev + mins);
    const acceptedMins = Math.max(0, nextDayTotal - prev);
    minutesByDay.set(rawDate, nextDayTotal);

    const rawSub = (s.subjectCode || '').trim().slice(0, 32);
    if (rawSub && acceptedMins > 0) {
      if (rawDate === todayKey) {
        todaySubMap.set(rawSub, (todaySubMap.get(rawSub) || 0) + acceptedMins);
      }
      if (getIsoWeekKey(rawDate) === weekKey) {
        weekSubMap.set(rawSub, (weekSubMap.get(rawSub) || 0) + acceptedMins);
      }
      if (rawDate.slice(0, 7) === monthKey) {
        monthSubMap.set(rawSub, (monthSubMap.get(rawSub) || 0) + acceptedMins);
      }
    }
  }

  let todayMinutes = 0;
  let weekMinutes = 0;
  let monthMinutes = 0;

  for (const [dayStr, cappedMins] of minutesByDay.entries()) {
    if (dayStr === todayKey) {
      todayMinutes += cappedMins;
    }
    if (getIsoWeekKey(dayStr) === weekKey) {
      weekMinutes += cappedMins;
    }
    if (dayStr.slice(0, 7) === monthKey) {
      monthMinutes += cappedMins;
    }
  }

  todayMinutes = Math.min(DAILY_FOCUS_CAP_MINUTES, Math.round(todayMinutes));
  weekMinutes = Math.min(WEEKLY_FOCUS_CAP_MINUTES, Math.round(weekMinutes));
  monthMinutes = Math.min(MONTHLY_FOCUS_CAP_MINUTES, Math.round(monthMinutes));

  const streakSummary = computeFocusStreaks(input.sessions || [], todayKey, tz);

  return {
    todayKey,
    todayMinutes,
    weekKey,
    weekMinutes,
    monthKey,
    monthMinutes,
    todaySubjectMinutes: packTopSubjects(todaySubMap, DAILY_FOCUS_CAP_MINUTES),
    weekSubjectMinutes: packTopSubjects(weekSubMap, WEEKLY_FOCUS_CAP_MINUTES),
    monthSubjectMinutes: packTopSubjects(monthSubMap, MONTHLY_FOCUS_CAP_MINUTES),
    streakDays: streakSummary.currentStreakDays,
    totalSessionsCount,
  };
}

/**
 * Computes effective minutes for a profile for the chosen period (and optional subject filter),
 * applying deterministic date-key rollover.
 */
export function getEffectivePeriodMinutes(
  profile: LeaderboardProfile,
  period: LeaderboardPeriod,
  currentKeys: { todayKey: string; weekKey: string; monthKey: string },
  subjectFilter?: string
): number {
  const filterCode = subjectFilter && subjectFilter !== 'ALL' ? subjectFilter : null;

  if (period === 'today') {
    if (profile.todayKey !== currentKeys.todayKey) return 0;
    const raw = filterCode
      ? (profile.todaySubjectMinutes?.[filterCode] || 0)
      : (profile.todayMinutes || 0);
    return Math.min(DAILY_FOCUS_CAP_MINUTES, Math.max(0, Math.round(raw)));
  }
  if (period === 'week') {
    if (profile.weekKey !== currentKeys.weekKey) return 0;
    const raw = filterCode
      ? (profile.weekSubjectMinutes?.[filterCode] || 0)
      : (profile.weekMinutes || 0);
    return Math.min(WEEKLY_FOCUS_CAP_MINUTES, Math.max(0, Math.round(raw)));
  }
  if (profile.monthKey !== currentKeys.monthKey) return 0;
  const raw = filterCode
    ? (profile.monthSubjectMinutes?.[filterCode] || 0)
    : (profile.monthMinutes || 0);
  return Math.min(MONTHLY_FOCUS_CAP_MINUTES, Math.max(0, Math.round(raw)));
}

/**
 * Extracts all subjects with > 0 focus minutes in the active period across the given profiles,
 * sorted by combined focus minutes descending.
 */
export function extractAvailableSubjects(input: {
  profiles: LeaderboardProfile[];
  period: LeaderboardPeriod;
  timezone?: string;
  now?: Date;
}): Array<{ code: string; totalMinutes: number }> {
  const keys = getCurrentPeriodKeys(input.timezone || DEFAULT_TIMEZONE, input.now || new Date());
  const totals = new Map<string, number>();

  for (const p of input.profiles || []) {
    let map: Record<string, number> | undefined;
    if (input.period === 'today' && p.todayKey === keys.todayKey) map = p.todaySubjectMinutes;
    else if (input.period === 'week' && p.weekKey === keys.weekKey) map = p.weekSubjectMinutes;
    else if (input.period === 'month' && p.monthKey === keys.monthKey) map = p.monthSubjectMinutes;
    if (!map) continue;

    for (const [code, mins] of Object.entries(map)) {
      const clean = Math.max(0, Math.round(mins || 0));
      if (clean > 0) {
        totals.set(code, (totals.get(code) || 0) + clean);
      }
    }
  }

  return Array.from(totals.entries())
    .map(([code, totalMinutes]) => ({ code, totalMinutes }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.code.localeCompare(b.code));
}

/**
 * Deterministically computes combined weekly progress toward a Study Squad's weekly hour goal.
 */
export function computeSquadChallengeProgress(input: {
  squad: StudySquad;
  memberProfiles: LeaderboardProfile[];
  timezone?: string;
  now?: Date;
}): SquadChallengeProgress | null {
  const goalHours = Math.max(0, Math.round(input.squad.weeklyGoalHours || 0));
  if (goalHours <= 0) return null;

  const keys = getCurrentPeriodKeys(input.timezone || DEFAULT_TIMEZONE, input.now || new Date());
  const goalMinutes = goalHours * 60;
  let completedMinutes = 0;
  let activeContributorsCount = 0;
  let topContributorName: string | null = null;
  let topContributorMinutes = 0;

  for (const p of input.memberProfiles || []) {
    const mins = getEffectivePeriodMinutes(p, 'week', keys);
    completedMinutes += mins;
    if (mins > 0) {
      activeContributorsCount++;
      if (mins > topContributorMinutes) {
        topContributorMinutes = mins;
        topContributorName = p.displayName || 'Focus Student';
      }
    }
  }

  const remainingMinutes = Math.max(0, goalMinutes - completedMinutes);
  const progressPct = Math.min(100, Math.round((completedMinutes / goalMinutes) * 100));

  return {
    goalHours,
    goalMinutes,
    completedMinutes,
    completedHoursFormatted: formatFocusMinutesShort(completedMinutes),
    remainingMinutes,
    remainingHoursFormatted: formatFocusMinutesShort(remainingMinutes),
    progressPct,
    isCompleted: completedMinutes >= goalMinutes,
    activeContributorsCount,
    topContributorName,
    topContributorMinutes,
  };
}

/**
 * Deterministically checks if a profile is actively studying right now.
 * Auto-expires after LIVE_PRESENCE_STALE_MS (5 minutes) without a heartbeat so closed tabs
 * never leave stuck "Studying Now" badges.
 */
export function isProfileStudyingLive(
  profile: Pick<LeaderboardProfile, 'isStudyingNow' | 'lastHeartbeatAt'>,
  now: Date = new Date()
): boolean {
  if (!profile.isStudyingNow || !profile.lastHeartbeatAt) return false;
  const hbMs = Date.parse(profile.lastHeartbeatAt);
  if (Number.isNaN(hbMs)) return false;
  const ageMs = now.getTime() - hbMs;
  return ageMs <= LIVE_PRESENCE_STALE_MS;
}

/**
 * Computes elapsed minutes for an active live study session.
 */
export function getLiveElapsedMinutes(
  profile: Pick<LeaderboardProfile, 'isStudyingNow' | 'lastHeartbeatAt' | 'sessionStartedAt'>,
  now: Date = new Date()
): number {
  if (!isProfileStudyingLive(profile, now)) return 0;
  const startRaw = profile.sessionStartedAt || profile.lastHeartbeatAt;
  if (!startRaw) return 0;
  const startMs = Date.parse(startRaw);
  if (Number.isNaN(startMs)) return 0;
  const diffMins = Math.floor((now.getTime() - startMs) / 60000);
  return Math.max(0, Math.min(DAILY_FOCUS_CAP_MINUTES, diffMins));
}

/**
 * Ranks profiles deterministically:
 * 1. Higher period minutes
 * 2. Higher streakDays
 * 3. Alphabetical displayName
 */
export function rankLeaderboardProfiles(input: {
  profiles: LeaderboardProfile[];
  period: LeaderboardPeriod;
  currentUid: string | null;
  timezone?: string;
  now?: Date;
  subjectFilter?: string;
}): RankedLeaderboardEntry[] {
  const nowDate = input.now || new Date();
  const keys = getCurrentPeriodKeys(input.timezone || DEFAULT_TIMEZONE, nowDate);

  const enriched = (input.profiles || []).map((p) => {
    const minutes = getEffectivePeriodMinutes(p, input.period, keys, input.subjectFilter);
    const goal = Math.max(15, p.dailyGoalMinutes || 120);
    const periodGoal =
      input.period === 'today' ? goal : input.period === 'week' ? goal * 7 : goal * 30;
    const goalProgressPct = Math.min(100, Math.round((minutes / periodGoal) * 100));

    return {
      profile: p,
      minutes,
      goalProgressPct,
    };
  });

  enriched.sort((a, b) => {
    if (b.minutes !== a.minutes) return b.minutes - a.minutes;
    if ((b.profile.streakDays || 0) !== (a.profile.streakDays || 0)) {
      return (b.profile.streakDays || 0) - (a.profile.streakDays || 0);
    }
    return (a.profile.displayName || '').localeCompare(b.profile.displayName || '');
  });

  return enriched.map((item, idx) => {
    const live = isProfileStudyingLive(item.profile, nowDate);
    const validActivity = isValidStudyActivity(item.profile.studyActivity)
      ? item.profile.studyActivity
      : undefined;
    const rawEmote = item.profile.lastEmote;
    const lastEmote =
      rawEmote &&
      typeof rawEmote.id === 'string' &&
      typeof rawEmote.createdAt === 'number' &&
      nowDate.getTime() - rawEmote.createdAt <= 15_000
        ? {
            id: rawEmote.id,
            memberId: item.profile.uid,
            type: rawEmote.type,
            createdAt: rawEmote.createdAt,
          }
        : null;

    return {
      rank: idx + 1,
      uid: item.profile.uid,
      displayName: item.profile.displayName || 'Focus Student',
      avatarColor: item.profile.avatarColor || LEADERBOARD_AVATAR_COLORS[0],
      minutes: item.minutes,
      hoursFormatted: formatFocusMinutesShort(item.minutes),
      streakDays: item.profile.streakDays || 0,
      dailyGoalMinutes: item.profile.dailyGoalMinutes || 120,
      goalProgressPct: item.goalProgressPct,
      isCurrentUser: Boolean(input.currentUid && item.profile.uid === input.currentUid),
      isPublic: Boolean(item.profile.isPublic),
      isStudyingLive: live,
      activeSubject: live ? (item.profile.activeSubject || 'Deep Focus') : undefined,
      liveElapsedMinutes: live ? getLiveElapsedMinutes(item.profile, nowDate) : 0,
      studyActivity: validActivity,
      lastEmote,
      avatarConfig: item.profile.avatarConfig ?? null,
    };
  });
}

export function generateSquadInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

const PROFILES_COL = 'leaderboard_profiles';
const SQUADS_COL = 'study_squads';

export async function getLeaderboardProfile(uid: string): Promise<LeaderboardProfile | null> {
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return null;
  try {
    const snap = await getDoc(doc(db, PROFILES_COL, uid));
    return snap.exists() ? (snap.data() as LeaderboardProfile) : null;
  } catch {
    return null;
  }
}

/**
 * Syncs the current user's focus stats to `leaderboard_profiles/{uid}`.
 * If `onlyIfExists` is true (e.g. background Pomodoro sync), skips creating a profile
 * for users who haven't joined a squad or opted into the leaderboard yet.
 */
export async function syncUserLeaderboardStats(input: {
  uid: string;
  displayName?: string;
  avatarColor?: string;
  isPublic?: boolean;
  dailyGoalMinutes?: number;
  sessions: FocusSession[];
  timezone?: string;
  onlyIfExists?: boolean;
}): Promise<LeaderboardProfile | null> {
  const { uid, sessions, timezone = DEFAULT_TIMEZONE, onlyIfExists = false } = input;
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return null;

  const ref = doc(db, PROFILES_COL, uid);
  const existingSnap = await getDoc(ref).catch(() => null);
  const existing = existingSnap?.exists() ? (existingSnap.data() as LeaderboardProfile) : null;

  if (onlyIfExists && !existing) {
    return null;
  }

  const agg = aggregateFocusStatsForLeaderboard({ sessions, timezone });
  const nowIso = new Date().toISOString();

  const nextProfile: LeaderboardProfile = {
    uid,
    displayName: (input.displayName || existing?.displayName || 'Focus Student').trim().slice(0, 48),
    avatarColor: input.avatarColor || existing?.avatarColor || LEADERBOARD_AVATAR_COLORS[0],
    isPublic: input.isPublic !== undefined ? input.isPublic : existing?.isPublic ?? false,
    squadIds: existing?.squadIds || [],
    todayKey: agg.todayKey,
    todayMinutes: agg.todayMinutes,
    weekKey: agg.weekKey,
    weekMinutes: agg.weekMinutes,
    monthKey: agg.monthKey,
    monthMinutes: agg.monthMinutes,
    todaySubjectMinutes: agg.todaySubjectMinutes,
    weekSubjectMinutes: agg.weekSubjectMinutes,
    monthSubjectMinutes: agg.monthSubjectMinutes,
    streakDays: agg.streakDays,
    dailyGoalMinutes: Math.max(15, Math.min(960, Math.round(input.dailyGoalMinutes || existing?.dailyGoalMinutes || 120))),
    totalSessionsCount: agg.totalSessionsCount,
    updatedAt: nowIso,
  };

  await setDoc(ref, nextProfile, { merge: true });
  return nextProfile;
}

export async function updateLeaderboardProfileSettings(input: {
  uid: string;
  displayName: string;
  avatarColor: string;
  isPublic: boolean;
  dailyGoalMinutes?: number;
  sessions: FocusSession[];
  timezone?: string;
}): Promise<LeaderboardProfile | null> {
  return syncUserLeaderboardStats({
    ...input,
    onlyIfExists: false,
  });
}

export async function createStudySquad(input: {
  uid: string;
  name: string;
  description?: string;
  displayName?: string;
  sessions: FocusSession[];
  timezone?: string;
}): Promise<StudySquad> {
  const cleanName = input.name.trim().slice(0, 64);
  if (!cleanName) throw new Error('Squad name is required.');

  // Ensure user has a leaderboard profile first
  await syncUserLeaderboardStats({
    uid: input.uid,
    displayName: input.displayName,
    sessions: input.sessions,
    timezone: input.timezone,
    onlyIfExists: false,
  });

  const inviteCode = generateSquadInviteCode();
  const squadId = `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();

  const squad: StudySquad = {
    id: squadId,
    name: cleanName,
    description: (input.description || '').trim().slice(0, 160),
    inviteCode,
    ownerUid: input.uid,
    memberUids: [input.uid],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await setDoc(doc(db, SQUADS_COL, squadId), squad);
  await updateDoc(doc(db, PROFILES_COL, input.uid), {
    squadIds: arrayUnion(squadId),
    updatedAt: nowIso,
  }).catch(() => {});

  return squad;
}

export async function joinStudySquadByCode(input: {
  uid: string;
  inviteCode: string;
  displayName?: string;
  sessions: FocusSession[];
  timezone?: string;
}): Promise<StudySquad> {
  const cleanCode = input.inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Please enter a valid 6-character invite code.');
  }

  const q = query(collection(db, SQUADS_COL), where('inviteCode', '==', cleanCode), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error(`No Study Squad found with invite code "${cleanCode}".`);
  }

  const squadDoc = snap.docs[0];
  const squad = squadDoc.data() as StudySquad;

  if (squad.memberUids.includes(input.uid)) {
    return squad;
  }

  if (squad.memberUids.length >= MAX_SQUAD_MEMBERS) {
    throw new Error(`This squad is full (max ${MAX_SQUAD_MEMBERS} members).`);
  }

  await syncUserLeaderboardStats({
    uid: input.uid,
    displayName: input.displayName,
    sessions: input.sessions,
    timezone: input.timezone,
    onlyIfExists: false,
  });

  const nowIso = new Date().toISOString();
  await updateDoc(doc(db, SQUADS_COL, squad.id), {
    memberUids: arrayUnion(input.uid),
    updatedAt: nowIso,
  });
  await updateDoc(doc(db, PROFILES_COL, input.uid), {
    squadIds: arrayUnion(squad.id),
    updatedAt: nowIso,
  }).catch(() => {});

  return {
    ...squad,
    memberUids: [...squad.memberUids, input.uid],
    updatedAt: nowIso,
  };
}

export async function leaveStudySquad(uid: string, squadId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await updateDoc(doc(db, SQUADS_COL, squadId), {
    memberUids: arrayRemove(uid),
    updatedAt: nowIso,
  });
  await updateDoc(doc(db, PROFILES_COL, uid), {
    squadIds: arrayRemove(squadId),
    updatedAt: nowIso,
  }).catch(() => {});
}

/**
 * Updates a Study Squad's Weekly Challenge goal (owner-only in Firestore rules).
 */
export async function updateSquadChallenge(input: {
  squadId: string;
  weeklyGoalHours: number;
  challengeTitle?: string;
}): Promise<{ weeklyGoalHours: number; challengeTitle: string }> {
  const cleanHours = Math.max(0, Math.min(2000, Math.round(Number(input.weeklyGoalHours) || 0)));
  const cleanTitle = (input.challengeTitle || '').trim().slice(0, 80);
  const nowIso = new Date().toISOString();

  await updateDoc(doc(db, SQUADS_COL, input.squadId), {
    weeklyGoalHours: cleanHours,
    challengeTitle: cleanTitle,
    updatedAt: nowIso,
  });

  return { weeklyGoalHours: cleanHours, challengeTitle: cleanTitle };
}

export async function listUserSquads(uid: string): Promise<StudySquad[]> {
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return [];
  const q = query(collection(db, SQUADS_COL), where('memberUids', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as StudySquad);
}

export async function fetchSquadMemberProfiles(memberUids: string[]): Promise<LeaderboardProfile[]> {
  if (!memberUids || memberUids.length === 0) return [];
  const profiles: LeaderboardProfile[] = [];
  await Promise.all(
    memberUids.slice(0, MAX_SQUAD_MEMBERS).map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, PROFILES_COL, uid));
        if (snap.exists()) {
          profiles.push(snap.data() as LeaderboardProfile);
        }
      } catch {
        // Ignore unreadable member
      }
    })
  );
  return profiles;
}

/**
 * Updates the user's live "Studying Now" presence heartbeat on their existing
 * leaderboard_profiles/{uid} document. Silently skips if the user hasn't opted in
 * or joined a squad yet (preserves opt-in privacy).
 */
export async function updateLiveStudyPresence(input: {
  uid: string;
  isStudyingNow: boolean;
  activeSubject?: string;
  sessionStartedAt?: string;
}): Promise<void> {
  const { uid, isStudyingNow } = input;
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return;

  try {
    const ref = doc(db, PROFILES_COL, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const nowIso = new Date().toISOString();
    await updateDoc(ref, {
      isStudyingNow,
      activeSubject: isStudyingNow
        ? (input.activeSubject || 'Deep Focus').trim().slice(0, 64)
        : '',
      sessionStartedAt: isStudyingNow ? (input.sessionStartedAt || nowIso) : '',
      lastHeartbeatAt: isStudyingNow ? nowIso : '',
      updatedAt: nowIso,
    });
  } catch {
    // Non-blocking best-effort presence update
  }
}

/**
 * Updates the current user's 3D Study Room activity (studying, typing, reading,
 * writing, break, idle) on their leaderboard_profiles/{uid} document.
 * Only persists when the activity actually changes to avoid unnecessary writes.
 */
export async function updateStudyRoomActivity(input: {
  uid: string;
  activity: StudyActivity;
}): Promise<void> {
  const { uid, activity } = input;
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return;
  if (!isValidStudyActivity(activity)) return;

  try {
    const ref = doc(db, PROFILES_COL, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const existing = snap.data() as LeaderboardProfile;
    if (existing.studyActivity === activity) return;

    await updateDoc(ref, {
      studyActivity: activity,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking best-effort activity update
  }
}

/**
 * Triggers a one-time emote event (celebrate, wave, clap, success) on the user's
 * leaderboard_profiles/{uid} document so squadmates see it in real time.
 */
export async function triggerStudyRoomEmote(input: {
  uid: string;
  type: AvatarEmote;
}): Promise<void> {
  const { uid, type } = input;
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return;

  try {
    const ref = doc(db, PROFILES_COL, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const nowMs = Date.now();
    await updateDoc(ref, {
      lastEmote: {
        id: `em_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        createdAt: nowMs,
      },
      updatedAt: new Date(nowMs).toISOString(),
    });
  } catch {
    // Non-blocking best-effort emote broadcast
  }
}

/**
 * Syncs the authenticated user's validated 3D avatar configuration to their
 * leaderboard_profiles/{uid} document so room members see it in real time.
 */
export async function updateUserAvatarConfig(
  uid: string,
  avatarConfig: import('../features/avatar/avatar-catalog.ts').UserAvatarConfig
): Promise<void> {
  if (!uid || uid.startsWith('usr_guest') || uid.startsWith('gst_')) return;

  try {
    const ref = doc(db, PROFILES_COL, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    await updateDoc(ref, {
      avatarConfig,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking best-effort avatar sync
  }
}

/**
 * Real-time listener for all members of a Study Squad (max 25 members, within Firestore's 30-item 'in' cap).
 */
export function subscribeSquadMemberProfiles(
  memberUids: string[],
  onUpdate: (profiles: LeaderboardProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUids = Array.from(new Set((memberUids || []).filter(Boolean))).slice(0, MAX_SQUAD_MEMBERS);
  if (safeUids.length === 0) {
    onUpdate([]);
    return () => {};
  }
  const q = query(collection(db, PROFILES_COL), where(documentId(), 'in', safeUids));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as LeaderboardProfile));
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeGlobalLeaderboard(
  onUpdate: (profiles: LeaderboardProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, PROFILES_COL), where('isPublic', '==', true), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as LeaderboardProfile));
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function getTodayFallbackKey(timezone: string = DEFAULT_TIMEZONE): string {
  return getTodayDateString(timezone);
}
