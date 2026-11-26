/**
 * FocusFlow & Finance — GLB Animation Clip Mapping System
 *
 * Maps StudyActivity and AvatarEmote states to animation clip names inside
 * rigged GLB models, supporting per-avatar overrides and safe fallbacks.
 */

import type { AvatarEmote, StudyActivity } from './types.ts';

export const animationAliases: Record<StudyActivity, string[]> = {
  idle: ['idle', 'breath', 'breathing', 'sitting_idle'],
  studying: ['studying', 'study', 'reading', 'writing', 'sitting'],
  typing: ['typing', 'keyboard', 'computer', 'working'],
  reading: ['reading', 'read', 'book'],
  writing: ['writing', 'write', 'notes'],
  break: ['relax', 'rest', 'break', 'sitting_idle', 'idle'],
};

export const emoteAliases: Record<AvatarEmote, string[]> = {
  celebrate: ['celebrate', 'victory', 'cheer', 'jump', 'happy', 'studying'],
  wave: ['wave', 'hello', 'greet', 'idle'],
  clap: ['clap', 'applause', 'cheer', 'studying'],
  success: ['success', 'celebrate', 'victory', 'happy', 'studying'],
};

export function findAnimation(
  names: string[],
  activity: StudyActivity,
  preferredAnimation?: string
): string | undefined {
  if (preferredAnimation && names.includes(preferredAnimation)) {
    return preferredAnimation;
  }

  const aliases = animationAliases[activity];
  const normalizedNames = names.map((name) => ({
    original: name,
    normalized: name.toLowerCase(),
  }));

  return (
    normalizedNames.find((item) => aliases.some((alias) => item.normalized.includes(alias)))
      ?.original ??
    names.find((name) => name.toLowerCase().includes('idle')) ??
    names[0]
  );
}

export function findEmoteAnimation(
  names: string[],
  emote: AvatarEmote,
  preferredAnimation?: string
): string | undefined {
  if (preferredAnimation && names.includes(preferredAnimation)) {
    return preferredAnimation;
  }

  const aliases = emoteAliases[emote];
  const normalizedNames = names.map((name) => ({
    original: name,
    normalized: name.toLowerCase(),
  }));

  return normalizedNames.find((item) => aliases.some((alias) => item.normalized.includes(alias)))
    ?.original;
}

