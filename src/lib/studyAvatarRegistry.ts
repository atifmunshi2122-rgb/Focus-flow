/**
 * FocusFlow & Finance — Multi-User Anime Study Avatar Identity Registry
 *
 * Maps any authenticated user or squad member to their selected & customized
 * 3D anime avatar from AVATAR_CATALOG (never hardcodes specific user names).
 */

import type { RankedLeaderboardEntry } from '../types/leaderboard.ts';
import { isValidStudyActivity, type StudyActivity } from '../features/study-room/types.ts';
import {
  AVATAR_CATALOG,
  getAvatarCatalogEntry,
  validateAndSanitizeAvatarConfig,
  type UserAvatarConfig,
  type UserAvatarCustomization,
} from '../features/avatar/avatar-catalog.ts';

export type { StudyActivity };

export interface StudyAvatarIdentity {
  id: string;
  label: string;
  modelUrl: string;
  style: 'male' | 'female';
  skinTone: string;
  hairColor: string;
  hairHighlight: string;
  eyeColor: string;
  outfitPrimary: string;
  outfitSecondary: string;
  ribbonColor?: string;
  accessories?: string[];
  customization: UserAvatarCustomization;
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Resolves any user's or squad member's anime avatar identity from their profile
 * `avatarConfig`, or deterministically assigns an attractive default catalog avatar.
 */
export function resolveStudyAvatarIdentity(
  entry: Pick<RankedLeaderboardEntry, 'uid' | 'displayName' | 'avatarColor'> & {
    avatarConfig?: UserAvatarConfig | null;
  }
): StudyAvatarIdentity {
  if (entry.avatarConfig) {
    const safeCfg = validateAndSanitizeAvatarConfig(entry.avatarConfig);
    const cat = getAvatarCatalogEntry(safeCfg.avatarId);
    return {
      id: cat.id,
      label: cat.displayName,
      modelUrl: cat.modelUrl,
      style: cat.style,
      skinTone: cat.defaults.skinTone,
      hairColor: safeCfg.customization.hairColor || cat.defaults.hairColor,
      hairHighlight: cat.defaults.hairHighlight,
      eyeColor: safeCfg.customization.irisColor || safeCfg.customization.eyeColor || cat.defaults.eyeColor,
      outfitPrimary: safeCfg.customization.outfitPrimary || safeCfg.customization.outfitColor || cat.defaults.outfitColor,
      outfitSecondary: safeCfg.customization.outfitSecondary || cat.defaults.outfitSecondary,
      ribbonColor: safeCfg.customization.accessories?.includes('ribbon') ? '#f472b6' : undefined,
      accessories: safeCfg.customization.accessories || [],
      customization: safeCfg.customization,
    };
  }

  // Deterministic default from rigged seated-capable catalog for users who haven't customized yet
  const riggedSeatedPool = AVATAR_CATALOG.filter(
    (a) => a.hasHumanoidSkeleton && a.supportedPoses.includes('seated')
  );
  const pool = riggedSeatedPool.length > 0 ? riggedSeatedPool : AVATAR_CATALOG;
  const poolIdx = hashString(entry.uid || entry.displayName || 'student') % pool.length;
  const cat = pool[poolIdx];
  const outfitColor = entry.avatarColor || cat.defaults.outfitColor;

  return {
    id: cat.id,
    label: cat.displayName,
    modelUrl: cat.modelUrl,
    style: cat.style,
    skinTone: cat.defaults.skinTone,
    hairColor: cat.defaults.hairColor,
    hairHighlight: cat.defaults.hairHighlight,
    eyeColor: cat.defaults.eyeColor,
    outfitPrimary: outfitColor,
    outfitSecondary: cat.defaults.outfitSecondary,
    accessories: [],
    customization: {
      hairColor: cat.defaults.hairColor,
      eyeColor: cat.defaults.eyeColor,
      outfitColor,
      accessories: [],
    },
  };
}

/**
 * Derives a natural study activity state from explicit multiplayer activity,
 * live presence, and active subject.
 */
export function deriveStudyActivity(
  entry: Pick<RankedLeaderboardEntry, 'uid' | 'isStudyingLive' | 'activeSubject' | 'studyActivity'>
): StudyActivity {
  if (isValidStudyActivity(entry.studyActivity)) {
    return entry.studyActivity;
  }
  if (!entry.isStudyingLive) return 'idle';
  const subj = (entry.activeSubject || '').toLowerCase();
  if (subj.includes('code') || subj.includes('python') || subj.includes('cs') || subj.includes('dbms') || subj.includes('lab')) {
    return 'typing';
  }
  if (subj.includes('math') || subj.includes('prob') || subj.includes('stat') || subj.includes('practice') || subj.includes('problem')) {
    return 'writing';
  }
  if (subj.includes('theory') || subj.includes('read') || subj.includes('history') || subj.includes('bio') || subj.includes('lit')) {
    return 'reading';
  }
  const activities: StudyActivity[] = ['studying', 'typing', 'reading', 'writing'];
  return activities[hashString(entry.uid) % activities.length];
}
