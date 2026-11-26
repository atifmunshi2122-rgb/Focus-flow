/**
 * FocusFlow & Finance — Social Activity Feed Types (Phase 6)
 */

export type SocialEventType =
  | 'task_completed'
  | 'focus_completed'
  | 'level_up'
  | 'achievement_unlocked'
  | 'squad_created'
  | 'group_session_completed'
  | 'challenge_completed';

export interface SocialActivityEvent {
  id: string;
  actorId: string;
  actorName?: string;
  squadId?: string;
  type: SocialEventType;
  createdAt: number;
  visibility: 'private' | 'friends' | 'squad' | 'public';
  metadata: Record<string, string | number>;
}

