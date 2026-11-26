/**
 * FocusFlow & Finance — Authoritative Social, Squad, Shared Timer & Chat Service (Phase 6)
 *
 * All friend relationships, squad roles, room invitations, shared timer transitions,
 * chat rate-limiting, reactions, and challenge progress are validated server-side.
 */

import type { DatabaseSchema } from './db.ts';
import { calculateLevel } from '../src/features/gamification/xp-calculator.ts';
import {
  defaultUserPrivacySettings,
  type Friendship,
  type SocialProfile,
  type UserPrivacySettings,
  type UserReport,
} from '../src/features/social/types.ts';
import type {
  GroupStudySession,
  RoomInvitation,
  SocialNotification,
  SocialStudySquad,
  SquadChallengeSummary,
  SquadInvitation,
  SquadMember,
  SquadPrivacy,
  SquadRole,
  StudyChatMessage,
} from '../src/features/social/squad-types.ts';
import type { SocialActivityEvent } from '../src/features/social/activity-types.ts';

const MAX_SQUAD_MEMBERS = 25;
const MAX_ROOM_CAPACITY = 8;
const ROOM_INVITE_TTL_MS = 15 * 60 * 1000;
const CHAT_RATE_LIMIT_WINDOW_MS = 15_000;
const CHAT_RATE_LIMIT_MAX = 8;
const ALLOWED_CHAT_EMOJIS = new Set(['👍', '❤️', '🔥', '🎉', '👏']);

function ensureSocialCollections(db: DatabaseSchema) {
  if (!Array.isArray(db.friendships)) db.friendships = [];
  if (!Array.isArray(db.socialSquads)) db.socialSquads = [];
  if (!Array.isArray(db.squadMembers)) db.squadMembers = [];
  if (!Array.isArray(db.squadInvitations)) db.squadInvitations = [];
  if (!Array.isArray(db.roomInvitations)) db.roomInvitations = [];
  if (!Array.isArray(db.groupSessions)) db.groupSessions = [];
  if (!Array.isArray(db.studyChatMessages)) db.studyChatMessages = [];
  if (!Array.isArray(db.socialActivities)) db.socialActivities = [];
  if (!Array.isArray(db.socialNotifications)) db.socialNotifications = [];
  if (!Array.isArray(db.userPrivacySettings)) db.userPrivacySettings = [];
  if (!Array.isArray(db.userReports)) db.userReports = [];
}

export function getUserPrivacy(db: DatabaseSchema, userId: string): UserPrivacySettings {
  ensureSocialCollections(db);
  const found = db.userPrivacySettings!.find((p) => p.userId === userId);
  return found ? { ...defaultUserPrivacySettings, ...found } : { ...defaultUserPrivacySettings, userId };
}

export function updateUserPrivacy(
  db: DatabaseSchema,
  userId: string,
  patch: Partial<UserPrivacySettings>
): UserPrivacySettings {
  ensureSocialCollections(db);
  const current = getUserPrivacy(db, userId);
  const next: UserPrivacySettings = {
    userId,
    allowFriendRequests:
      typeof patch.allowFriendRequests === 'boolean'
        ? patch.allowFriendRequests
        : current.allowFriendRequests,
    showOnlineStatus:
      typeof patch.showOnlineStatus === 'boolean'
        ? patch.showOnlineStatus
        : current.showOnlineStatus,
    showStudyProgress:
      typeof patch.showStudyProgress === 'boolean'
        ? patch.showStudyProgress
        : current.showStudyProgress,
    allowRoomInvites:
      typeof patch.allowRoomInvites === 'boolean'
        ? patch.allowRoomInvites
        : current.allowRoomInvites,
  };
  const idx = db.userPrivacySettings!.findIndex((p) => p.userId === userId);
  if (idx >= 0) db.userPrivacySettings![idx] = next;
  else db.userPrivacySettings!.push(next);
  return next;
}

export function isBlockedBetween(db: DatabaseSchema, a: string, b: string): boolean {
  ensureSocialCollections(db);
  return db.friendships!.some(
    (f) =>
      f.status === 'blocked' &&
      ((f.requesterId === a && f.recipientId === b) ||
        (f.requesterId === b && f.recipientId === a))
  );
}

function toSafeSocialProfile(db: DatabaseSchema, targetUserId: string): SocialProfile | null {
  const user = db.users.find((u) => u.id === targetUserId);
  if (!user) return null;
  const privacy = getUserPrivacy(db, targetUserId);
  const gam = (db.gamificationProfiles || []).find((g) => g.userId === targetUserId);

  return {
    userId: user.id,
    displayName: user.name || 'Focus Student',
    avatarUrl: user.avatarUrl || undefined,
    level: privacy.showStudyProgress ? calculateLevel(gam?.totalXP || 0) : undefined,
    totalXP: privacy.showStudyProgress ? gam?.totalXP || 0 : undefined,
    currentStreak: privacy.showStudyProgress ? gam?.currentStreak || 0 : undefined,
    isOnline: privacy.showOnlineStatus ? true : undefined,
    allowRoomInvites: privacy.allowRoomInvites,
  };
}

function pushNotification(
  db: DatabaseSchema,
  input: Omit<SocialNotification, 'id' | 'read' | 'createdAt'>
) {
  ensureSocialCollections(db);
  db.socialNotifications!.unshift({
    id: `snot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    read: false,
    createdAt: Date.now(),
    ...input,
  });
  if (db.socialNotifications!.length > 500) {
    db.socialNotifications = db.socialNotifications!.slice(0, 500);
  }
}

function pushActivity(
  db: DatabaseSchema,
  input: Omit<SocialActivityEvent, 'id' | 'createdAt'>
) {
  ensureSocialCollections(db);
  db.socialActivities!.unshift({
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    ...input,
  });
  if (db.socialActivities!.length > 500) {
    db.socialActivities = db.socialActivities!.slice(0, 500);
  }
}

export function searchSocialUsers(
  db: DatabaseSchema,
  currentUserId: string,
  queryStr: string,
  page = 1,
  limit = 10
) {
  ensureSocialCollections(db);
  const q = (queryStr || '').trim().toLowerCase();
  const safeLimit = Math.min(25, Math.max(1, limit));
  const safePage = Math.max(1, page);

  const matches = db.users
    .filter((u) => {
      if (u.id === currentUserId) return false;
      if (isBlockedBetween(db, currentUserId, u.id)) return false;
      if (!q) return true;
      return (u.name || '').toLowerCase().includes(q);
    })
    .map((u) => {
      const profile = toSafeSocialProfile(db, u.id)!;
      const rel = db.friendships!.find(
        (f) =>
          (f.requesterId === currentUserId && f.recipientId === u.id) ||
          (f.requesterId === u.id && f.recipientId === currentUserId)
      );
      return {
        ...profile,
        relationshipStatus: rel?.status || 'none',
        friendshipId: rel?.id || null,
        isIncomingRequest: Boolean(rel && rel.status === 'pending' && rel.recipientId === currentUserId),
      };
    });

  const start = (safePage - 1) * safeLimit;
  return {
    page: safePage,
    limit: safeLimit,
    total: matches.length,
    hasMore: start + safeLimit < matches.length,
    users: matches.slice(start, start + safeLimit),
  };
}

export function getFriendsOverview(db: DatabaseSchema, userId: string) {
  ensureSocialCollections(db);
  const accepted = db.friendships!.filter(
    (f) => f.status === 'accepted' && (f.requesterId === userId || f.recipientId === userId)
  );
  const friends = accepted
    .map((f) => {
      const otherId = f.requesterId === userId ? f.recipientId : f.requesterId;
      return toSafeSocialProfile(db, otherId);
    })
    .filter((p): p is SocialProfile => Boolean(p));

  const incomingRequests = db.friendships!
    .filter((f) => f.status === 'pending' && f.recipientId === userId)
    .map((f) => ({
      friendship: f,
      sender: toSafeSocialProfile(db, f.requesterId),
    }))
    .filter((r) => Boolean(r.sender));

  const outgoingRequests = db.friendships!
    .filter((f) => f.status === 'pending' && f.requesterId === userId)
    .map((f) => ({
      friendship: f,
      recipient: toSafeSocialProfile(db, f.recipientId),
    }))
    .filter((r) => Boolean(r.recipient));

  return { friends, incomingRequests, outgoingRequests };
}

export function sendFriendRequest(
  db: DatabaseSchema,
  requesterId: string,
  recipientId: string
): Friendship {
  ensureSocialCollections(db);
  if (!recipientId || requesterId === recipientId) {
    throw new Error('Cannot send friend request to yourself.');
  }
  const recipient = db.users.find((u) => u.id === recipientId);
  if (!recipient) throw new Error('User not found.');
  if (isBlockedBetween(db, requesterId, recipientId)) {
    throw new Error('Cannot send friend request due to block settings.');
  }
  const privacy = getUserPrivacy(db, recipientId);
  if (!privacy.allowFriendRequests) {
    throw new Error('This user is not accepting friend requests.');
  }

  const existing = db.friendships!.find(
    (f) =>
      (f.status === 'pending' || f.status === 'accepted') &&
      ((f.requesterId === requesterId && f.recipientId === recipientId) ||
        (f.requesterId === recipientId && f.recipientId === requesterId))
  );
  if (existing) {
    throw new Error(
      existing.status === 'accepted' ? 'Already friends.' : 'Friend request already pending.'
    );
  }

  const now = Date.now();
  const friendship: Friendship = {
    id: `fr_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    requesterId,
    recipientId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  db.friendships!.push(friendship);

  const sender = db.users.find((u) => u.id === requesterId);
  pushNotification(db, {
    userId: recipientId,
    type: 'friend_request',
    title: 'New Friend Request',
    body: `${sender?.name || 'A student'} wants to connect with you.`,
    targetTab: 'social',
  });

  return friendship;
}

export function respondFriendRequest(
  db: DatabaseSchema,
  userId: string,
  friendshipId: string,
  action: 'accept' | 'reject' | 'cancel' | 'remove'
): Friendship {
  ensureSocialCollections(db);
  const f = db.friendships!.find((item) => item.id === friendshipId);
  if (!f) throw new Error('Friendship not found.');

  if (action === 'accept' || action === 'reject') {
    if (f.recipientId !== userId || f.status !== 'pending') {
      throw new Error('Unauthorized or invalid friend request state.');
    }
    f.status = action === 'accept' ? 'accepted' : 'rejected';
    f.updatedAt = Date.now();
    if (action === 'accept') {
      const acceptor = db.users.find((u) => u.id === userId);
      pushNotification(db, {
        userId: f.requesterId,
        type: 'friend_accepted',
        title: 'Friend Request Accepted',
        body: `${acceptor?.name || 'Your friend'} accepted your friend request!`,
        targetTab: 'social',
      });
    }
    return f;
  }

  if (action === 'cancel') {
    if (f.requesterId !== userId || f.status !== 'pending') {
      throw new Error('Only the sender can cancel a pending request.');
    }
    f.status = 'cancelled';
    f.updatedAt = Date.now();
    return f;
  }

  // remove
  if (f.requesterId !== userId && f.recipientId !== userId) {
    throw new Error('Unauthorized.');
  }
  f.status = 'cancelled';
  f.updatedAt = Date.now();
  return f;
}

export function blockSocialUser(db: DatabaseSchema, userId: string, targetUserId: string) {
  ensureSocialCollections(db);
  if (!targetUserId || userId === targetUserId) throw new Error('Invalid target user.');
  db.friendships = db.friendships!.filter(
    (f) =>
      !(
        (f.requesterId === userId && f.recipientId === targetUserId) ||
        (f.requesterId === targetUserId && f.recipientId === userId)
      )
  );
  const now = Date.now();
  const blockRecord: Friendship = {
    id: `blk_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    requesterId: userId,
    recipientId: targetUserId,
    status: 'blocked',
    createdAt: now,
    updatedAt: now,
  };
  db.friendships.push(blockRecord);
  return blockRecord;
}

export function reportSocialUser(
  db: DatabaseSchema,
  reporterId: string,
  targetUserId: string,
  reason: string
): UserReport {
  ensureSocialCollections(db);
  const cleanReason = (reason || '').trim().slice(0, 300);
  if (!cleanReason) throw new Error('Report reason is required.');
  const report: UserReport = {
    id: `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    reporterId,
    targetUserId,
    reason: cleanReason,
    createdAt: Date.now(),
  };
  db.userReports!.push(report);
  return report;
}

export function createSocialSquad(
  db: DatabaseSchema,
  ownerId: string,
  input: { name: string; description?: string; privacy?: SquadPrivacy; icon?: string }
): SocialStudySquad {
  ensureSocialCollections(db);
  const name = (input.name || '').trim();
  if (name.length < 3 || name.length > 40) {
    throw new Error('Squad name must be between 3 and 40 characters.');
  }
  const privacy: SquadPrivacy =
    input.privacy === 'public' || input.privacy === 'unlisted' ? input.privacy : 'private';
  const now = Date.now();
  const squad: SocialStudySquad = {
    id: `ssq_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: (input.description || '').trim().slice(0, 250),
    icon: (input.icon || '📚').slice(0, 8),
    ownerId,
    privacy,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  };
  db.socialSquads!.push(squad);
  const ownerUser = db.users.find((u) => u.id === ownerId);
  db.squadMembers!.push({
    squadId: squad.id,
    userId: ownerId,
    displayName: ownerUser?.name || 'Focus Student',
    role: 'owner',
    joinedAt: now,
  });

  pushActivity(db, {
    actorId: ownerId,
    actorName: ownerUser?.name || 'Focus Student',
    squadId: squad.id,
    type: 'squad_created',
    visibility: privacy === 'public' ? 'public' : 'squad',
    metadata: { squadName: squad.name },
  });

  return squad;
}

export function getUserSquadsOverview(db: DatabaseSchema, userId: string) {
  ensureSocialCollections(db);
  const myMemberships = db.squadMembers!.filter((m) => m.userId === userId);
  const mySquadIds = new Set(myMemberships.map((m) => m.squadId));

  const squads = db.socialSquads!
    .filter((s) => mySquadIds.has(s.id))
    .map((s) => ({
      ...s,
      members: db.squadMembers!.filter((m) => m.squadId === s.id),
      myRole: myMemberships.find((m) => m.squadId === s.id)?.role || 'member',
    }));

  const publicSquads = db.socialSquads!
    .filter((s) => s.privacy === 'public' && !mySquadIds.has(s.id))
    .slice(0, 20);

  const squadInvitations = db.squadInvitations!.filter(
    (inv) => inv.recipientId === userId && inv.status === 'pending'
  );

  return { squads, publicSquads, squadInvitations };
}

function getMemberRole(db: DatabaseSchema, squadId: string, userId: string): SquadRole | null {
  const m = (db.squadMembers || []).find((x) => x.squadId === squadId && x.userId === userId);
  return m ? m.role : null;
}

export function inviteToSocialSquad(
  db: DatabaseSchema,
  senderId: string,
  squadId: string,
  recipientId: string
): SquadInvitation {
  ensureSocialCollections(db);
  const squad = db.socialSquads!.find((s) => s.id === squadId);
  if (!squad) throw new Error('Squad not found.');
  const senderRole = getMemberRole(db, squadId, senderId);
  if (senderRole !== 'owner' && senderRole !== 'moderator') {
    throw new Error('Only squad owners or moderators can invite members.');
  }
  if (squad.memberCount >= MAX_SQUAD_MEMBERS) {
    throw new Error('Squad has reached maximum member capacity.');
  }
  if (getMemberRole(db, squadId, recipientId)) {
    throw new Error('User is already a squad member.');
  }
  if (isBlockedBetween(db, senderId, recipientId)) {
    throw new Error('Cannot invite blocked user.');
  }
  const dup = db.squadInvitations!.find(
    (i) => i.squadId === squadId && i.recipientId === recipientId && i.status === 'pending'
  );
  if (dup) throw new Error('Invitation already pending.');

  const sender = db.users.find((u) => u.id === senderId);
  const inv: SquadInvitation = {
    id: `sinv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    squadId,
    squadName: squad.name,
    senderId,
    senderName: sender?.name || 'Focus Student',
    recipientId,
    status: 'pending',
    createdAt: Date.now(),
  };
  db.squadInvitations!.push(inv);

  pushNotification(db, {
    userId: recipientId,
    type: 'squad_invite',
    title: 'Squad Invitation',
    body: `${sender?.name || 'A friend'} invited you to join "${squad.name}".`,
    targetTab: 'social',
  });

  return inv;
}

export function respondSquadInvitation(
  db: DatabaseSchema,
  userId: string,
  invitationId: string,
  action: 'accept' | 'reject'
) {
  ensureSocialCollections(db);
  const inv = db.squadInvitations!.find((i) => i.id === invitationId);
  if (!inv || inv.recipientId !== userId || inv.status !== 'pending') {
    throw new Error('Invalid or unauthorized squad invitation.');
  }
  const squad = db.socialSquads!.find((s) => s.id === inv.squadId);
  if (!squad) throw new Error('Squad no longer exists.');

  if (action === 'reject') {
    inv.status = 'rejected';
    return { invitation: inv, squad };
  }

  if (squad.memberCount >= MAX_SQUAD_MEMBERS) {
    throw new Error('Squad is full.');
  }
  inv.status = 'accepted';
  if (!getMemberRole(db, squad.id, userId)) {
    const u = db.users.find((x) => x.id === userId);
    db.squadMembers!.push({
      squadId: squad.id,
      userId,
      displayName: u?.name || 'Focus Student',
      role: 'member',
      joinedAt: Date.now(),
    });
    squad.memberCount = db.squadMembers!.filter((m) => m.squadId === squad.id).length;
    squad.updatedAt = Date.now();
  }
  return { invitation: inv, squad };
}

export function manageSocialSquadMember(
  db: DatabaseSchema,
  actorId: string,
  squadId: string,
  targetUserId: string,
  action: 'remove' | 'promote' | 'demote' | 'transfer_ownership' | 'leave'
) {
  ensureSocialCollections(db);
  const squad = db.socialSquads!.find((s) => s.id === squadId);
  if (!squad) throw new Error('Squad not found.');

  if (action === 'leave') {
    const myRole = getMemberRole(db, squadId, actorId);
    if (!myRole) throw new Error('Not a squad member.');
    if (myRole === 'owner') {
      throw new Error('Transfer ownership before leaving or delete the squad.');
    }
    db.squadMembers = db.squadMembers!.filter(
      (m) => !(m.squadId === squadId && m.userId === actorId)
    );
    squad.memberCount = db.squadMembers.filter((m) => m.squadId === squadId).length;
    squad.updatedAt = Date.now();
    return squad;
  }

  const actorRole = getMemberRole(db, squadId, actorId);
  const targetMember = db.squadMembers!.find(
    (m) => m.squadId === squadId && m.userId === targetUserId
  );
  if (!targetMember) throw new Error('Target member not found.');

  if (action === 'remove') {
    if (actorRole !== 'owner' && !(actorRole === 'moderator' && targetMember.role === 'member')) {
      throw new Error('Insufficient permissions to remove member.');
    }
    if (targetMember.role === 'owner') throw new Error('Cannot remove squad owner.');
    db.squadMembers = db.squadMembers!.filter(
      (m) => !(m.squadId === squadId && m.userId === targetUserId)
    );
    squad.memberCount = db.squadMembers.filter((m) => m.squadId === squadId).length;
    squad.updatedAt = Date.now();
    return squad;
  }

  if (actorRole !== 'owner') {
    throw new Error('Only the squad owner can change roles or transfer ownership.');
  }

  if (action === 'promote') {
    targetMember.role = 'moderator';
  } else if (action === 'demote') {
    if (targetMember.role !== 'owner') targetMember.role = 'member';
  } else if (action === 'transfer_ownership') {
    const ownerMember = db.squadMembers!.find(
      (m) => m.squadId === squadId && m.userId === actorId
    );
    if (ownerMember) ownerMember.role = 'moderator';
    targetMember.role = 'owner';
    squad.ownerId = targetUserId;
  }
  squad.updatedAt = Date.now();
  return squad;
}

export function deleteSocialSquad(db: DatabaseSchema, actorId: string, squadId: string): boolean {
  ensureSocialCollections(db);
  const squad = db.socialSquads!.find((s) => s.id === squadId);
  if (!squad) return false;
  if (squad.ownerId !== actorId) throw new Error('Only the squad owner can delete this squad.');
  db.socialSquads = db.socialSquads!.filter((s) => s.id !== squadId);
  db.squadMembers = db.squadMembers!.filter((m) => m.squadId !== squadId);
  db.squadInvitations = db.squadInvitations!.filter((i) => i.squadId !== squadId);
  return true;
}

export function sendRoomInvitation(
  db: DatabaseSchema,
  senderId: string,
  input: { roomId: string; squadId?: string; roomName: string; recipientId: string }
): RoomInvitation {
  ensureSocialCollections(db);
  if (input.squadId && !getMemberRole(db, input.squadId, senderId)) {
    throw new Error('Only squad members can invite to this squad room.');
  }
  const privacy = getUserPrivacy(db, input.recipientId);
  if (!privacy.allowRoomInvites || isBlockedBetween(db, senderId, input.recipientId)) {
    throw new Error('Recipient is not accepting study room invitations.');
  }
  if (input.squadId) {
    const activeMembers = db.squadMembers!.filter((m) => m.squadId === input.squadId).length;
    if (activeMembers > MAX_ROOM_CAPACITY) {
      throw new Error('Study room has reached maximum capacity.');
    }
  }
  const now = Date.now();
  const dup = db.roomInvitations!.find(
    (r) =>
      r.roomId === input.roomId &&
      r.recipientId === input.recipientId &&
      r.status === 'pending' &&
      r.expiresAt > now
  );
  if (dup) throw new Error('Room invitation already pending.');

  const sender = db.users.find((u) => u.id === senderId);
  const inv: RoomInvitation = {
    id: `rinv_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    roomId: input.roomId,
    squadId: input.squadId,
    roomName: (input.roomName || 'Study Lounge').slice(0, 64),
    senderId,
    senderName: sender?.name || 'Focus Student',
    recipientId: input.recipientId,
    status: 'pending',
    expiresAt: now + ROOM_INVITE_TTL_MS,
    createdAt: now,
  };
  db.roomInvitations!.push(inv);
  pushNotification(db, {
    userId: input.recipientId,
    type: 'room_invite',
    title: '3D Study Room Invite',
    body: `${inv.senderName} invited you to study in "${inv.roomName}".`,
    targetTab: 'leaderboard',
  });
  return inv;
}

export function respondRoomInvitation(
  db: DatabaseSchema,
  userId: string,
  invitationId: string,
  action: 'accept' | 'reject'
): RoomInvitation {
  ensureSocialCollections(db);
  const inv = db.roomInvitations!.find((r) => r.id === invitationId);
  if (!inv || inv.recipientId !== userId || inv.status !== 'pending') {
    throw new Error('Invalid room invitation.');
  }
  if (Date.now() > inv.expiresAt) {
    inv.status = 'expired';
    throw new Error('Room invitation has expired.');
  }
  inv.status = action === 'accept' ? 'accepted' : 'rejected';
  return inv;
}

export function createGroupStudySession(
  db: DatabaseSchema,
  hostId: string,
  input: { squadId?: string; roomId: string; durationSeconds: number }
): GroupStudySession {
  ensureSocialCollections(db);
  if (input.squadId && !getMemberRole(db, input.squadId, hostId)) {
    throw new Error('Only squad members can start a squad session.');
  }
  const durationSeconds = Math.min(10800, Math.max(300, Math.round(input.durationSeconds || 1500)));
  const now = Date.now();
  const session: GroupStudySession = {
    id: `gsess_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    squadId: input.squadId,
    roomId: input.roomId || 'global_lounge',
    hostId,
    status: 'scheduled',
    durationSeconds,
    accumulatedPausedSeconds: 0,
    participantIds: [hostId],
    completedParticipantIds: [],
    createdAt: now,
    updatedAt: now,
  };
  db.groupSessions!.unshift(session);
  return session;
}

export function transitionGroupStudySession(
  db: DatabaseSchema,
  actorId: string,
  sessionId: string,
  action: 'start' | 'pause' | 'resume' | 'end' | 'join'
): GroupStudySession {
  ensureSocialCollections(db);
  const session = db.groupSessions!.find((s) => s.id === sessionId);
  if (!session) throw new Error('Group study session not found.');

  if (action === 'join') {
    if (session.squadId && !getMemberRole(db, session.squadId, actorId)) {
      throw new Error('Unauthorized to join private squad session.');
    }
    if (!session.participantIds.includes(actorId)) {
      if (session.participantIds.length >= MAX_ROOM_CAPACITY) {
        throw new Error('Session room capacity reached.');
      }
      session.participantIds.push(actorId);
      session.updatedAt = Date.now();
    }
    return session;
  }

  const isMod = session.squadId
    ? ['owner', 'moderator'].includes(getMemberRole(db, session.squadId, actorId) || '')
    : false;
  if (session.hostId !== actorId && !isMod) {
    throw new Error('Only the session host or squad moderator can control the timer.');
  }

  const now = Date.now();
  if (action === 'start') {
    if (session.status !== 'scheduled') throw new Error('Session can only start from scheduled state.');
    session.status = 'running';
    session.startedAt = now;
  } else if (action === 'pause') {
    if (session.status !== 'running') throw new Error('Only running sessions can be paused.');
    session.status = 'paused';
    session.pausedAt = now;
  } else if (action === 'resume') {
    if (session.status !== 'paused' || !session.pausedAt) {
      throw new Error('Only paused sessions can be resumed.');
    }
    session.accumulatedPausedSeconds += Math.max(0, Math.floor((now - session.pausedAt) / 1000));
    session.pausedAt = undefined;
    session.status = 'running';
  } else if (action === 'end') {
    if (session.status !== 'running' && session.status !== 'paused') {
      throw new Error('Session is already finished.');
    }
    session.status = 'completed';
    session.completedParticipantIds = [...session.participantIds];
    pushActivity(db, {
      actorId,
      actorName: db.users.find((u) => u.id === actorId)?.name || 'Focus Student',
      squadId: session.squadId,
      type: 'group_session_completed',
      visibility: session.squadId ? 'squad' : 'friends',
      metadata: {
        participants: session.participantIds.length,
        minutes: Math.round(session.durationSeconds / 60),
      },
    });
  }
  session.updatedAt = now;
  return session;
}

export function getChatMessages(
  db: DatabaseSchema,
  userId: string,
  input: { squadId?: string; roomId?: string; limit?: number; before?: number }
) {
  ensureSocialCollections(db);
  if (input.squadId && !getMemberRole(db, input.squadId, userId)) {
    throw new Error('Unauthorized: Not a member of this squad.');
  }
  const safeLimit = Math.min(50, Math.max(1, input.limit || 25));
  const msgs = db.studyChatMessages!
    .filter((m) => {
      if (m.deletedAt) return false;
      if (input.squadId && m.squadId !== input.squadId) return false;
      if (input.roomId && m.roomId !== input.roomId) return false;
      if (input.before && m.createdAt >= input.before) return false;
      if (isBlockedBetween(db, userId, m.senderId)) return false;
      return true;
    })
    .sort((a, b) => a.createdAt - b.createdAt);

  return msgs.slice(-safeLimit);
}

export function sendChatMessage(
  db: DatabaseSchema,
  senderId: string,
  input: { squadId?: string; roomId?: string; text: string; replyToId?: string }
): StudyChatMessage {
  ensureSocialCollections(db);
  if (input.squadId && !getMemberRole(db, input.squadId, senderId)) {
    throw new Error('Unauthorized: Not a member of this squad.');
  }
  const text = (input.text || '').trim();
  if (!text || text.length > 1000) {
    throw new Error('Message must be between 1 and 1000 characters.');
  }

  const now = Date.now();
  const recentCount = db.studyChatMessages!.filter(
    (m) => m.senderId === senderId && now - m.createdAt < CHAT_RATE_LIMIT_WINDOW_MS
  ).length;
  if (recentCount >= CHAT_RATE_LIMIT_MAX) {
    throw new Error('Rate limit exceeded. Please wait a few seconds before sending more messages.');
  }

  const sender = db.users.find((u) => u.id === senderId);
  const msg: StudyChatMessage = {
    id: `cmsg_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    squadId: input.squadId,
    roomId: input.roomId,
    senderId,
    senderName: sender?.name || 'Focus Student',
    senderAvatar: sender?.avatarUrl || undefined,
    text,
    createdAt: now,
    replyToId: input.replyToId,
    reactionCounts: {},
    reactionUsers: {},
  };
  db.studyChatMessages!.push(msg);
  return msg;
}

export function reactToChatMessage(
  db: DatabaseSchema,
  userId: string,
  messageId: string,
  emoji: string
): StudyChatMessage {
  ensureSocialCollections(db);
  if (!ALLOWED_CHAT_EMOJIS.has(emoji)) throw new Error('Unsupported reaction emoji.');
  const msg = db.studyChatMessages!.find((m) => m.id === messageId);
  if (!msg || msg.deletedAt) throw new Error('Message not found.');
  if (msg.squadId && !getMemberRole(db, msg.squadId, userId)) {
    throw new Error('Unauthorized.');
  }

  if (!msg.reactionUsers) msg.reactionUsers = {};
  if (!msg.reactionCounts) msg.reactionCounts = {};
  const list = msg.reactionUsers[emoji] || [];
  if (list.includes(userId)) {
    msg.reactionUsers[emoji] = list.filter((id) => id !== userId);
  } else {
    msg.reactionUsers[emoji] = [...list, userId];
  }
  msg.reactionCounts[emoji] = msg.reactionUsers[emoji].length;
  return msg;
}

export function deleteChatMessage(db: DatabaseSchema, actorId: string, messageId: string): StudyChatMessage {
  ensureSocialCollections(db);
  const msg = db.studyChatMessages!.find((m) => m.id === messageId);
  if (!msg) throw new Error('Message not found.');
  const isMod = msg.squadId
    ? ['owner', 'moderator'].includes(getMemberRole(db, msg.squadId, actorId) || '')
    : false;
  if (msg.senderId !== actorId && !isMod) {
    throw new Error('Unauthorized to delete this message.');
  }
  msg.deletedAt = Date.now();
  return msg;
}

export function getSquadWeeklyChallenges(
  db: DatabaseSchema,
  userId: string,
  squadId: string
): SquadChallengeSummary[] {
  ensureSocialCollections(db);
  if (!getMemberRole(db, squadId, userId)) {
    throw new Error('Unauthorized: Not a member of this squad.');
  }
  const memberIds = new Set(
    db.squadMembers!.filter((m) => m.squadId === squadId).map((m) => m.userId)
  );
  const weekAgoMs = Date.now() - 7 * 86400_000;

  const focusMinutes = db.focusSessions
    .filter(
      (s) =>
        memberIds.has(s.userId) &&
        s.completed &&
        s.mode === 'work' &&
        Date.parse(s.startedAt) >= weekAgoMs
    )
    .reduce((acc, s) => acc + Math.max(0, s.durationMinutes || 0), 0);
  const focusHours = Math.round((focusMinutes / 60) * 10) / 10;

  const completedTasks = db.tasks.filter((t) => {
    if (!memberIds.has(t.userId) || t.deletedAt || t.status !== 'completed') return false;
    const ts = Date.parse(t.completedAt || t.updatedAt || t.createdAt);
    return Number.isFinite(ts) && ts >= weekAgoMs;
  }).length;

  const completedTopics = (db.studyTopics || []).filter((t) => {
    if (!memberIds.has(t.userId) || !t.theory || !t.practice) return false;
    const ts = Date.parse((t as any).updatedAt || (t as any).createdAt || '');
    return Number.isFinite(ts) && ts >= weekAgoMs;
  }).length;

  return [
    {
      id: 'ch_focus_together',
      title: 'Focus Together',
      description: '20 combined valid focus hours',
      metric: 'focus_hours',
      goal: 20,
      progress: focusHours,
      rewardXP: 150,
      completed: focusHours >= 20,
    },
    {
      id: 'ch_task_masters',
      title: 'Task Masters',
      description: 'Complete 100 squad tasks',
      metric: 'tasks',
      goal: 100,
      progress: completedTasks,
      rewardXP: 200,
      completed: completedTasks >= 100,
    },
    {
      id: 'ch_topic_hunters',
      title: 'Topic Hunters',
      description: 'Master 30 syllabus topics',
      metric: 'topics',
      goal: 30,
      progress: completedTopics,
      rewardXP: 250,
      completed: completedTopics >= 30,
    },
  ];
}

