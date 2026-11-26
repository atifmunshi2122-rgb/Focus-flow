/**
 * FocusFlow & Finance — Central Gamification Reward Configuration (Phase 5)
 */

import type { XPSource } from './types.ts';

export const XP_REWARDS: Record<XPSource, number> = {
  task_completion: 10,
  focus_session: 20,
  topic_completion: 30,
  daily_goal: 25,
  streak: 30,
  achievement: 50,
};

export const STREAK_REWARDS: Record<number, number> = {
  3: 30,
  7: 75,
  30: 300,
};

export const LEVEL_MILESTONES: Array<{
  level: number;
  title: string;
  reward: string;
}> = [
  { level: 1, title: 'Beginner', reward: 'Starter Study Desk' },
  { level: 2, title: 'Novice', reward: 'Focus Sparks' },
  { level: 3, title: 'Learner', reward: 'Notebook Accessory' },
  { level: 5, title: 'Focused Student', reward: 'Special Avatar Accessory' },
  { level: 10, title: 'Knowledge Seeker', reward: 'Exclusive Room Theme' },
  { level: 15, title: 'Study Master', reward: 'Animated Aura Ring' },
  { level: 20, title: 'Elite Scholar', reward: 'Premium Nameplate' },
  { level: 30, title: 'Legendary Scholar', reward: 'Special Avatar Outfit' },
  { level: 50, title: 'Grandmaster', reward: 'Grandmaster Badge' },
];

export function getLevelTitle(level: number): string {
  let title = 'Beginner';
  for (const m of LEVEL_MILESTONES) {
    if (level >= m.level) title = m.title;
  }
  return title;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement: number;
  rewardXP: number;
  metric:
    | 'completed_tasks'
    | 'completed_sessions'
    | 'completed_topics'
    | 'streak_days'
    | 'night_owl_sessions'
    | 'early_bird_sessions'
    | 'total_xp';
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    id: 'first_step',
    title: 'First Step',
    description: 'Complete your first study or productivity task',
    icon: '🌱',
    requirement: 1,
    rewardXP: 25,
    metric: 'completed_tasks',
  },
  {
    id: 'getting_started',
    title: 'Getting Started',
    description: 'Complete 10 tasks',
    icon: '✅',
    requirement: 10,
    rewardXP: 50,
    metric: 'completed_tasks',
  },
  {
    id: 'focus_beginner',
    title: 'Focus Beginner',
    description: 'Complete 5 verified focus sessions',
    icon: '⏱️',
    requirement: 5,
    rewardXP: 50,
    metric: 'completed_sessions',
  },
  {
    id: 'focus_master',
    title: 'Focus Master',
    description: 'Complete 50 verified focus sessions',
    icon: '🎯',
    requirement: 50,
    rewardXP: 150,
    metric: 'completed_sessions',
  },
  {
    id: 'consistent_learner',
    title: 'Consistent Learner',
    description: 'Maintain a 7-day study streak',
    icon: '🔥',
    requirement: 7,
    rewardXP: 75,
    metric: 'streak_days',
  },
  {
    id: 'study_warrior',
    title: 'Study Warrior',
    description: 'Maintain a 30-day study streak',
    icon: '⚔️',
    requirement: 30,
    rewardXP: 300,
    metric: 'streak_days',
  },
  {
    id: 'knowledge_seeker',
    title: 'Knowledge Seeker',
    description: 'Complete 25 syllabus topics',
    icon: '📚',
    requirement: 25,
    rewardXP: 120,
    metric: 'completed_topics',
  },
  {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Complete a verified focus session between 10 PM and 4 AM',
    icon: '🦉',
    requirement: 1,
    rewardXP: 40,
    metric: 'night_owl_sessions',
  },
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Complete a verified focus session between 5 AM and 8 AM',
    icon: '🌅',
    requirement: 1,
    rewardXP: 40,
    metric: 'early_bird_sessions',
  },
  {
    id: 'century_club',
    title: 'Century Club',
    description: 'Earn 10,000 lifetime XP',
    icon: '👑',
    requirement: 10000,
    rewardXP: 500,
    metric: 'total_xp',
  },
];

