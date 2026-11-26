/**
 * FocusFlow & Finance — Social & Friends System Types (Phase 6)
 */

export type FriendshipStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'blocked';

export interface SocialProfile {
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  level?: number;
  totalXP?: number;
  currentStreak?: number;
  isOnline?: boolean;
  allowRoomInvites?: boolean;
}

export interface Friendship {
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendshipStatus;
  createdAt: number;
  updatedAt: number;
}

export interface FriendRequestInput {
  recipientId: string;
}

export interface UserPrivacySettings {
  userId?: string;
  allowFriendRequests: boolean;
  showOnlineStatus: boolean;
  showStudyProgress: boolean;
  allowRoomInvites: boolean;
}

export const defaultUserPrivacySettings: UserPrivacySettings = {
  allowFriendRequests: true,
  showOnlineStatus: true,
  showStudyProgress: true,
  allowRoomInvites: true,
};

export interface UserReport {
  id: string;
  reporterId: string;
  targetUserId: string;
  reason: string;
  createdAt: number;
}

