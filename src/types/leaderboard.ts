/**
 * FocusFlow & Finance — Deterministic Study Leaderboard Types (Phase 1)
 * Zero-AI, privacy-first Study Squads & Global Opt-In Focus Hours Leaderboard.
 */

export type LeaderboardPeriod = 'today' | 'week' | 'month';

export interface LeaderboardProfile {
  uid: string;
  displayName: string;
  avatarColor: string;
  isPublic: boolean; // Global opt-in flag
  squadIds: string[];
  todayKey: string; // YYYY-MM-DD in Asia/Kolkata (or user's tz)
  todayMinutes: number; // Capped at 960 (16h/day)
  weekKey: string; // YYYY-Www
  weekMinutes: number; // Capped at 6720 (16h * 7)
  monthKey: string; // YYYY-MM
  monthMinutes: number; // Capped at 29760 (16h * 31)
  streakDays: number;
  dailyGoalMinutes: number;
  totalSessionsCount: number;
  updatedAt: string;
  // Phase 2: Live "Studying Now" presence (optional, auto-expires after 5m stale heartbeat)
  isStudyingNow?: boolean;
  activeSubject?: string;
  sessionStartedAt?: string;
  lastHeartbeatAt?: string;
  // Phase 3: Subject-specific focus minutes (max 20 subjects per period)
  todaySubjectMinutes?: Record<string, number>;
  weekSubjectMinutes?: Record<string, number>;
  monthSubjectMinutes?: Record<string, number>;
}

export interface StudySquad {
  id: string;
  name: string;
  description?: string;
  inviteCode: string; // 6-char uppercase alphanumeric (e.g. "CSE3A9")
  ownerUid: string;
  memberUids: string[];
  createdAt: string;
  updatedAt: string;
  // Phase 3: Weekly Squad Challenge
  weeklyGoalHours?: number; // 0 or undefined = no active challenge
  challengeTitle?: string;
}

export interface SquadChallengeProgress {
  goalHours: number;
  goalMinutes: number;
  completedMinutes: number;
  completedHoursFormatted: string;
  remainingMinutes: number;
  remainingHoursFormatted: string;
  progressPct: number;
  isCompleted: boolean;
  activeContributorsCount: number;
  topContributorName: string | null;
  topContributorMinutes: number;
}

export interface RankedLeaderboardEntry {
  rank: number;
  uid: string;
  displayName: string;
  avatarColor: string;
  minutes: number; // Effective minutes for selected period (and optional subject filter)
  hoursFormatted: string; // e.g. "4.5h" or "45m"
  streakDays: number;
  dailyGoalMinutes: number;
  goalProgressPct: number;
  isCurrentUser: boolean;
  isPublic: boolean;
  // Phase 2: Computed live presence state
  isStudyingLive: boolean;
  activeSubject?: string;
  liveElapsedMinutes: number;
}
