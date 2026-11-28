/**
 * FocusFlow & Finance — Study RPG Gamification Types (Phase 5)
 */

export type XPSource =
  | 'task_completion'
  | 'focus_session'
  | 'topic_completion'
  | 'daily_goal'
  | 'streak'
  | 'achievement';

export interface XPProgress {
  totalXP: number;
  level: number;
  currentLevelXP: number;
  nextLevelXP: number;
  levelXPRequired?: number;
  progressPercent: number;
}

export interface XPTransaction {
  id: string;
  userId: string;
  source: XPSource;
  sourceId: string;
  amount: number;
  createdAt: number;
  description: string;
}

export interface UserGamificationProfile {
  userId: string;
  totalXP: number;
  level: number;
  dailyXP: number;
  weeklyXP: number;
  monthlyXP: number;
  dailyKey?: string;
  weekKey?: string;
  monthKey?: string;
  longestStreak: number;
  currentStreak: number;
  unlockedAchievementIds?: string[];
  achievementUnlockedAt?: Record<string, number>;
  awardedMilestoneLevels?: number[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement: number;
  rewardXP: number;
  unlocked: boolean;
  progress: number;
  unlockedAt?: number;
}

export interface AwardXPRequest {
  eventId: string;
  source: XPSource;
  sourceId: string;
}

export interface AwardXPResponse {
  awarded: boolean;
  alreadyAwarded: boolean;
  xpAdded: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  profile: UserGamificationProfile;
  progress: XPProgress;
  unlockedAchievements: Achievement[];
  transactions: XPTransaction[];
}

export type GamificationLeaderboardCategory =
  | 'global'
  | 'friends'
  | 'squad'
  | 'weekly'
  | 'monthly'
  | 'all_time';

