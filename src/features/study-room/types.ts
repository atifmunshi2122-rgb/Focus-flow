/**
 * FocusFlow & Finance — 3D Study Room Activity, Emote & Multiplayer Types
 */

export type StudyActivity =
  | 'idle'
  | 'studying'
  | 'typing'
  | 'reading'
  | 'writing'
  | 'break';

export type AvatarEmote = 'celebrate' | 'wave' | 'clap' | 'success';

export interface AvatarEmoteEvent {
  id: string;
  memberId: string;
  type: AvatarEmote;
  createdAt: number;
}

export interface StudyRoomMember {
  id: string;
  name: string;
  modelUrl?: string;
  activity: StudyActivity;
  avatarEmote?: AvatarEmote;
  isOnline: boolean;
  profileImage?: string;
}

export interface AvatarAnimationConfig {
  idle?: string;
  studying?: string;
  typing?: string;
  reading?: string;
  writing?: string;
  break?: string;
  celebrate?: string;
  wave?: string;
  clap?: string;
  success?: string;
}

export const VALID_STUDY_ACTIVITIES: readonly StudyActivity[] = [
  'idle',
  'studying',
  'typing',
  'reading',
  'writing',
  'break',
] as const;

export function isValidStudyActivity(val: unknown): val is StudyActivity {
  return typeof val === 'string' && (VALID_STUDY_ACTIVITIES as readonly string[]).includes(val);
}

export const ACTIVITY_META: Record<
  StudyActivity,
  { label: string; icon: string; badgeText: string }
> = {
  studying: { label: 'Studying', icon: '📚', badgeText: '📚 Studying' },
  typing: { label: 'Typing', icon: '💻', badgeText: '💻 Typing' },
  reading: { label: 'Reading', icon: '📖', badgeText: '📖 Reading' },
  writing: { label: 'Writing', icon: '✍️', badgeText: '✍️ Writing' },
  break: { label: 'Taking Break', icon: '☕', badgeText: '☕ On Break' },
  idle: { label: 'Idle', icon: '🌙', badgeText: '🌙 Idle' },
};

export const EMOTE_META: Record<AvatarEmote, { label: string; icon: string }> = {
  celebrate: { label: 'Celebrate', icon: '🎉' },
  wave: { label: 'Wave', icon: '👋' },
  clap: { label: 'Clap', icon: '👏' },
  success: { label: 'Task Done', icon: '✨' },
};

