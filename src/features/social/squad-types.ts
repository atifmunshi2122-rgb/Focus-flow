/**
 * FocusFlow & Finance — Study Squad, Shared Timer, Room Invite & Chat Types (Phase 6)
 */

export type SquadRole = 'owner' | 'moderator' | 'member';

export type SquadPrivacy = 'public' | 'private' | 'unlisted';

export interface SocialStudySquad {
  id: string;
  name: string;
  description: string;
  icon?: string;
  ownerId: string;
  privacy: SquadPrivacy;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SquadMember {
  squadId: string;
  userId: string;
  displayName?: string;
  role: SquadRole;
  joinedAt: number;
}

export interface SquadInvitation {
  id: string;
  squadId: string;
  squadName?: string;
  senderId: string;
  senderName?: string;
  recipientId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface RoomInvitation {
  id: string;
  roomId: string;
  squadId?: string;
  roomName: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
  expiresAt: number;
  createdAt: number;
}

export type GroupSessionStatus =
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

export interface GroupStudySession {
  id: string;
  squadId?: string;
  roomId: string;
  hostId: string;
  status: GroupSessionStatus;
  durationSeconds: number;
  startedAt?: number;
  pausedAt?: number;
  accumulatedPausedSeconds: number;
  participantIds: string[];
  completedParticipantIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type StudyChatMessageType =
  | 'text'
  | 'pomodoro_invite'
  | 'study_card'
  | 'nudge'
  | 'call_link';

export interface StudyChatMessage {
  id: string;
  roomId?: string;
  squadId?: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  messageType?: StudyChatMessageType;
  deliverOnBreak?: boolean;
  metadata?: {
    durationMinutes?: number;
    subjectCode?: string;
    meetingUri?: string;
    cardTitle?: string;
  };
  createdAt: number;
  updatedAt?: number;
  replyToId?: string;
  replyPreview?: {
    senderName: string;
    text: string;
  };
  reactionCounts?: Record<string, number>;
  reactionUsers?: Record<string, string[]>;
  deletedAt?: number;
}

export interface SquadChallengeSummary {
  id: string;
  title: string;
  description: string;
  metric: 'focus_hours' | 'tasks' | 'topics';
  goal: number;
  progress: number;
  rewardXP: number;
  completed: boolean;
}

export interface SocialNotification {
  id: string;
  userId: string;
  type:
    | 'friend_request'
    | 'friend_accepted'
    | 'squad_invite'
    | 'room_invite'
    | 'group_session_started'
    | 'challenge_completed'
    | 'achievement_unlocked';
  title: string;
  body: string;
  read: boolean;
  targetTab?: string;
  createdAt: number;
}

