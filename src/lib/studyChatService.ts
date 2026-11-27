/**
 * FocusFlow & Finance — Real-Time Firestore Study Chat & DM Service
 *
 * Provides instant real-time messaging for:
 * - Study Squad Group Chats: study_squads/{squadId}/messages
 * - 1-on-1 Direct Messages:  study_dms/{dmRoomId}/messages
 *
 * Automatically falls back to localStorage + BroadcastChannel sync when
 * Firestore rules are not yet deployed, offline, or in guest mode so
 * sending a message never hangs or silently disappears.
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase.ts';
import type {
  StudyChatMessage,
  StudyChatMessageType,
} from '../features/social/squad-types.ts';

export type ChatChannelKind = 'squad' | 'dm';

export interface ChatChannelRef {
  kind: ChatChannelKind;
  /** Squad ID (for kind === 'squad') or sorted `uidA__uidB` (for kind === 'dm') */
  id: string;
}

export interface TypingUser {
  uid: string;
  displayName: string;
  updatedAt: number;
}

const LOCAL_CHAT_PREFIX = 'ff_study_chat_v2_';
const LAST_READ_PREFIX = 'ff_chat_last_read_v1_';
const CHAT_BROADCAST_CHANNEL = 'ff_study_chat_sync_v2';

let currentChatSyncWarning: string | null = null;
const chatSyncWarningListeners = new Set<(warning: string | null) => void>();

function notifyChatSyncWarning(warning: string | null) {
  if (currentChatSyncWarning === warning) return;
  currentChatSyncWarning = warning;
  chatSyncWarningListeners.forEach((cb) => {
    try {
      cb(warning);
    } catch {
      // ignore listener errors
    }
  });
}

function isFirestorePermissionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return Boolean(
    e &&
      (e.code === 'permission-denied' ||
        (typeof e.message === 'string' && /permission[-_\s]?denied|missing or insufficient permissions/i.test(e.message)))
  );
}

export function subscribeChatSyncWarning(cb: (warning: string | null) => void): () => void {
  chatSyncWarningListeners.add(cb);
  cb(currentChatSyncWarning);
  return () => {
    chatSyncWarningListeners.delete(cb);
  };
}

export function buildDmRoomId(uidA: string, uidB: string): string {
  return [uidA.trim(), uidB.trim()].sort().join('__');
}

function channelStorageKey(channel: ChatChannelRef): string {
  return `${LOCAL_CHAT_PREFIX}${channel.kind}_${channel.id}`;
}

function readLocalMessages(channel: ChatChannelRef): StudyChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(channelStorageKey(channel));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StudyChatMessage[]) : [];
  } catch {
    return [];
  }
}

function writeLocalMessages(channel: ChatChannelRef, messages: StudyChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = messages.slice(-100);
    window.localStorage.setItem(channelStorageKey(channel), JSON.stringify(trimmed));
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CHAT_BROADCAST_CHANNEL);
      bc.postMessage({ key: channelStorageKey(channel), messages: trimmed });
      bc.close();
    }
  } catch {
    // ignore storage quota errors
  }
}

function mergeMessages(
  remote: StudyChatMessage[],
  local: StudyChatMessage[]
): StudyChatMessage[] {
  const map = new Map<string, StudyChatMessage>();
  for (const m of local) {
    if (m?.id) map.set(m.id, m);
  }
  for (const m of remote) {
    if (m?.id) map.set(m.id, m);
  }
  return Array.from(map.values())
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .slice(-100);
}

function getFirestoreMessagesCollection(channel: ChatChannelRef) {
  if (channel.kind === 'squad') {
    return collection(db, 'study_squads', channel.id, 'messages');
  }
  return collection(db, 'study_dms', channel.id, 'messages');
}

function getFirestoreTypingCollection(channel: ChatChannelRef) {
  if (channel.kind === 'squad') {
    return collection(db, 'study_squads', channel.id, 'typing');
  }
  return collection(db, 'study_dms', channel.id, 'typing');
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

export function subscribeStudyChatMessages(
  channel: ChatChannelRef,
  onUpdate: (messages: StudyChatMessage[]) => void,
  options?: { isAuthenticated?: boolean }
): Unsubscribe {
  let latestRemote: StudyChatMessage[] = [];
  let latestLocal: StudyChatMessage[] = readLocalMessages(channel);
  let active = true;

  const emit = () => {
    if (!active) return;
    onUpdate(mergeMessages(latestRemote, latestLocal));
  };

  // Emit cached local messages immediately for zero-flash UX
  emit();

  // Cross-tab local sync listener
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(CHAT_BROADCAST_CHANNEL);
      bc.onmessage = (evt) => {
        if (evt.data?.key === channelStorageKey(channel) && Array.isArray(evt.data?.messages)) {
          latestLocal = evt.data.messages;
          emit();
        }
      };
    } catch {
      bc = null;
    }
  }

  let fsUnsub: Unsubscribe | null = null;
  if (options?.isAuthenticated !== false && channel.id) {
    try {
      const q = query(
        getFirestoreMessagesCollection(channel),
        orderBy('createdAt', 'desc'),
        limit(60)
      );
      fsUnsub = onSnapshot(
        q,
        (snap) => {
          notifyChatSyncWarning(null);
          latestRemote = snap.docs
            .map((d) => d.data() as StudyChatMessage)
            .filter((m) => Boolean(m?.id && m?.senderId));
          const merged = mergeMessages(latestRemote, latestLocal);
          latestLocal = merged;
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(channelStorageKey(channel), JSON.stringify(merged));
            } catch {
              // ignore
            }
          }
          emit();
        },
        (err) => {
          if (isFirestorePermissionError(err)) {
            notifyChatSyncWarning(
              'Cloud chat rules not deployed — messages are local-only until Firestore rules are updated.'
            );
          }
          console.warn('[StudyChat] Firestore subscription fallback to local mode:', err?.message || err);
        }
      );
    } catch (err) {
      console.warn('[StudyChat] Unable to subscribe to Firestore chat:', err);
    }
  }

  return () => {
    active = false;
    if (fsUnsub) fsUnsub();
    if (bc) bc.close();
  };
}

export async function sendStudyChatMessage(input: {
  channel: ChatChannelRef;
  senderId: string;
  senderName: string;
  text: string;
  messageType?: StudyChatMessageType;
  deliverOnBreak?: boolean;
  replyToId?: string;
  replyPreview?: { senderName: string; text: string };
  metadata?: StudyChatMessage['metadata'];
  isAuthenticated?: boolean;
}): Promise<StudyChatMessage> {
  const cleanText = input.text.trim().slice(0, 1000);
  if (!cleanText) {
    throw new Error('Message cannot be empty.');
  }

  const now = Date.now();
  const id = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const msg: StudyChatMessage = stripUndefined({
    id,
    roomId: `${input.channel.kind}_${input.channel.id}`,
    squadId: input.channel.kind === 'squad' ? input.channel.id : undefined,
    senderId: input.senderId,
    senderName: (input.senderName || 'Student').trim().slice(0, 64),
    text: cleanText,
    messageType: input.messageType || 'text',
    deliverOnBreak: Boolean(input.deliverOnBreak),
    metadata: input.metadata ? stripUndefined(input.metadata as Record<string, unknown>) : undefined,
    replyToId: input.replyToId || undefined,
    replyPreview: input.replyPreview
      ? {
          senderName: input.replyPreview.senderName.slice(0, 48),
          text: input.replyPreview.text.slice(0, 140),
        }
      : undefined,
    reactionCounts: {},
    reactionUsers: {},
    createdAt: now,
  } as Record<string, unknown>) as unknown as StudyChatMessage;

  // Persist locally immediately so UI is instant even offline
  const existingLocal = readLocalMessages(input.channel);
  writeLocalMessages(input.channel, [...existingLocal.filter((m) => m.id !== msg.id), msg]);

  // Persist to Firestore if authenticated
  if (input.isAuthenticated !== false && input.senderId && !input.senderId.startsWith('usr_guest')) {
    try {
      const msgRef = doc(getFirestoreMessagesCollection(input.channel), id);
      await setDoc(msgRef, msg);
      notifyChatSyncWarning(null);
    } catch (err) {
      if (isFirestorePermissionError(err)) {
        notifyChatSyncWarning(
          'Cloud chat rules not deployed — message saved locally only (not visible on other devices).'
        );
      }
      console.warn('[StudyChat] Firestore message write fell back to local storage:', err);
    }
  }

  return msg;
}

export async function toggleStudyChatReaction(input: {
  channel: ChatChannelRef;
  message: StudyChatMessage;
  emoji: string;
  userId: string;
  isAuthenticated?: boolean;
}): Promise<StudyChatMessage> {
  const { channel, message, emoji, userId } = input;
  const prevUsersMap: Record<string, string[]> = { ...(message.reactionUsers || {}) };
  const currentList = Array.isArray(prevUsersMap[emoji]) ? [...prevUsersMap[emoji]] : [];
  const hasReacted = currentList.includes(userId);
  const nextList = hasReacted
    ? currentList.filter((u) => u !== userId)
    : [...currentList, userId];

  prevUsersMap[emoji] = nextList;
  const nextCounts: Record<string, number> = { ...(message.reactionCounts || {}) };
  nextCounts[emoji] = nextList.length;

  const updated: StudyChatMessage = {
    ...message,
    reactionUsers: prevUsersMap,
    reactionCounts: nextCounts,
    updatedAt: Date.now(),
  };

  // Update local immediately
  const local = readLocalMessages(channel);
  writeLocalMessages(
    channel,
    local.map((m) => (m.id === updated.id ? updated : m))
  );

  // Sync to Firestore
  if (input.isAuthenticated !== false && userId && !userId.startsWith('usr_guest')) {
    try {
      const msgRef = doc(getFirestoreMessagesCollection(channel), message.id);
      await updateDoc(msgRef, {
        reactionCounts: nextCounts,
        reactionUsers: prevUsersMap,
        updatedAt: updated.updatedAt,
      });
    } catch (err) {
      console.warn('[StudyChat] Reaction sync fell back to local storage:', err);
    }
  }

  return updated;
}

export async function setStudyChatTyping(input: {
  channel: ChatChannelRef;
  uid: string;
  displayName: string;
  isTyping: boolean;
  isAuthenticated?: boolean;
}): Promise<void> {
  if (input.isAuthenticated === false || !input.uid || input.uid.startsWith('usr_guest')) return;
  try {
    const typingRef = doc(getFirestoreTypingCollection(input.channel), input.uid);
    await setDoc(typingRef, {
      uid: input.uid,
      displayName: (input.displayName || 'Student').slice(0, 48),
      updatedAt: input.isTyping ? Date.now() : 0,
    });
  } catch {
    // non-fatal best-effort typing indicator
  }
}

export function subscribeStudyChatTyping(
  channel: ChatChannelRef,
  currentUid: string,
  onUpdate: (typingUsers: TypingUser[]) => void,
  options?: { isAuthenticated?: boolean }
): Unsubscribe {
  if (options?.isAuthenticated === false || !channel.id) {
    onUpdate([]);
    return () => {};
  }
  let latestDocs: TypingUser[] = [];
  let lastKey = '';

  const emitActive = () => {
    const now = Date.now();
    const active = latestDocs.filter(
      (u) =>
        u?.uid &&
        u.uid !== currentUid &&
        typeof u.updatedAt === 'number' &&
        now - u.updatedAt < 5000
    );
    const nextKey = active.map((u) => u.uid).join(',');
    if (nextKey !== lastKey) {
      lastKey = nextKey;
      onUpdate(active);
    }
  };

  const expiryTimer =
    typeof window !== 'undefined' ? window.setInterval(emitActive, 1500) : null;

  try {
    const fsUnsub = onSnapshot(
      getFirestoreTypingCollection(channel),
      (snap) => {
        latestDocs = snap.docs.map((d) => d.data() as TypingUser);
        emitActive();
      },
      () => {
        latestDocs = [];
        lastKey = '';
        onUpdate([]);
      }
    );
    return () => {
      if (expiryTimer !== null) window.clearInterval(expiryTimer);
      fsUnsub();
    };
  } catch {
    if (expiryTimer !== null) window.clearInterval(expiryTimer);
    onUpdate([]);
    return () => {};
  }
}

export function getLastReadTimestamp(uid: string, channel: ChatChannelRef): number {
  if (typeof window === 'undefined' || !uid) return 0;
  try {
    const val = window.localStorage.getItem(`${LAST_READ_PREFIX}${uid}_${channel.kind}_${channel.id}`);
    return val ? Number(val) || 0 : 0;
  } catch {
    return 0;
  }
}

export function markChatRoomRead(uid: string, channel: ChatChannelRef, timestamp = Date.now()): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    window.localStorage.setItem(
      `${LAST_READ_PREFIX}${uid}_${channel.kind}_${channel.id}`,
      String(timestamp)
    );
  } catch {
    // ignore
  }
}
