/**
 * FocusFlow & Finance — Authoritative XP & Level Progression Calculator (Phase 5)
 *
 * Shared by both server-side XP awarding and frontend progress displays.
 */

import type { XPProgress } from './types.ts';

export const XP_PER_LEVEL = 500;

export function calculateLevel(totalXP: number): number {
  const safeXP = Math.max(0, Math.floor(Number.isFinite(totalXP) ? totalXP : 0));
  return Math.floor(safeXP / XP_PER_LEVEL) + 1;
}

export function calculateXPProgress(totalXP: number): XPProgress {
  const safeXP = Math.max(0, Math.floor(Number.isFinite(totalXP) ? totalXP : 0));
  const level = calculateLevel(safeXP);
  const levelStartXP = (level - 1) * XP_PER_LEVEL;
  const nextLevelXP = level * XP_PER_LEVEL;
  const currentLevelXP = safeXP - levelStartXP;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((currentLevelXP / XP_PER_LEVEL) * 1000) / 10)
  );

  return {
    totalXP: safeXP,
    level,
    currentLevelXP,
    nextLevelXP,
    progressPercent,
  };
}

