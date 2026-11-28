/**
 * FocusFlow & Finance — Authoritative XP & Level Progression Calculator (Phase 5)
 *
 * Shared by both server-side XP awarding and frontend progress displays.
 */

import type { XPProgress } from './types.ts';

export const BASE_XP_PER_LEVEL = 500;
export const XP_STEP_PER_LEVEL = 250;
/** Legacy alias retained for backward compatibility (Level 1 -> 2 requirement) */
export const XP_PER_LEVEL = BASE_XP_PER_LEVEL;

/**
 * XP required to advance from `level` to `level + 1`.
 * Scales progressively so each higher level requires +250 more XP:
 * Lv 1→2: 500, Lv 2→3: 750, Lv 3→4: 1000, Lv 4→5: 1250, Lv 5→6: 1500, ...
 */
export function getXPForLevelGap(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return BASE_XP_PER_LEVEL + (safeLevel - 1) * XP_STEP_PER_LEVEL;
}

/**
 * Cumulative total XP threshold required to reach `level` (Lv 1 = 0, Lv 2 = 500, Lv 3 = 1250, Lv 4 = 2250, Lv 5 = 3500...).
 */
export function getTotalXPForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  const n = safeLevel - 1;
  return n * BASE_XP_PER_LEVEL + ((n * (n - 1)) / 2) * XP_STEP_PER_LEVEL;
}

export function calculateLevel(totalXP: number): number {
  const safeXP = Math.max(0, Math.floor(Number.isFinite(totalXP) ? totalXP : 0));
  let level = 1;
  let remaining = safeXP;
  while (remaining >= getXPForLevelGap(level)) {
    remaining -= getXPForLevelGap(level);
    level += 1;
  }
  return level;
}

export function calculateXPProgress(totalXP: number): XPProgress {
  const safeXP = Math.max(0, Math.floor(Number.isFinite(totalXP) ? totalXP : 0));
  const level = calculateLevel(safeXP);
  const levelStartXP = getTotalXPForLevel(level);
  const levelXPRequired = getXPForLevelGap(level);
  const nextLevelXP = levelStartXP + levelXPRequired;
  const currentLevelXP = safeXP - levelStartXP;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentLevelXP / levelXPRequired) * 1000) / 10)
  );

  return {
    totalXP: safeXP,
    level,
    currentLevelXP,
    nextLevelXP,
    levelXPRequired,
    progressPercent,
  };
}

/**
 * Duration-scaled XP for verified Focus / Study sessions (min 5 min).
 * Rate: 0.8 XP/min (25m = 20 XP, 30m = 24 XP, 45m = 36 XP, 50m = 40 XP, 60m = 48 XP).
 */
export function calculateFocusSessionXP(durationMinutes: number): number {
  const safeMins = Math.max(0, Math.round(Number.isFinite(durationMinutes) ? durationMinutes : 0));
  if (safeMins < 5) return 0;
  return Math.max(4, Math.round(safeMins * 0.8));
}

