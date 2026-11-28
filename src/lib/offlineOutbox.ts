import { OfflineOutboxOperation } from '../types/index.ts';

const OUTBOX_STORAGE_PREFIX = 'ff_firestore_outbox_v1_';
export const MAX_OUTBOX_RETRY_ATTEMPTS = 12;

type OutboxListener = (count: number) => void;

const listenersByUser = new Map<string, Set<OutboxListener>>();
let storageListenerAttached = false;

function notifyUserListeners(userId: string, count: number): void {
  const set = listenersByUser.get(userId);
  if (!set) return;
  set.forEach((cb) => {
    try {
      cb(count);
    } catch {
      // isolate subscriber errors
    }
  });
}

function handleWindowStorage(event: StorageEvent): void {
  if (typeof localStorage === 'undefined') return;
  if (event.key === null) {
    // localStorage.clear()
    listenersByUser.forEach((_set, uid) => {
      notifyUserListeners(uid, readOps(uid).length);
    });
    return;
  }
  if (!event.key.startsWith(OUTBOX_STORAGE_PREFIX)) return;
  const userId = event.key.slice(OUTBOX_STORAGE_PREFIX.length);
  if (!userId || !listenersByUser.has(userId)) return;
  notifyUserListeners(userId, readOps(userId).length);
}

function ensureStorageListener(): void {
  if (storageListenerAttached) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('storage', handleWindowStorage);
  storageListenerAttached = true;
}

function teardownStorageListenerIfIdle(): void {
  if (!storageListenerAttached || listenersByUser.size > 0) return;
  if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('storage', handleWindowStorage);
  }
  storageListenerAttached = false;
}

function storageKey(userId: string): string {
  return `${OUTBOX_STORAGE_PREFIX}${userId}`;
}

function readOps(userId: string): OfflineOutboxOperation[] {
  if (!userId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOps(userId: string, ops: OfflineOutboxOperation[]): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    if (ops.length === 0) {
      localStorage.removeItem(storageKey(userId));
    } else {
      localStorage.setItem(storageKey(userId), JSON.stringify(ops));
    }
  } catch {
    // ignore storage quota errors
  }
  const set = listenersByUser.get(userId);
  if (set) {
    notifyUserListeners(userId, ops.length);
  }
}

export const offlineOutbox = {
  list(userId: string): OfflineOutboxOperation[] {
    return readOps(userId);
  },

  count(userId: string): number {
    return readOps(userId).length;
  },

  subscribe(userId: string, listener: OutboxListener): () => void {
    if (!userId) {
      listener(0);
      return () => {};
    }
    ensureStorageListener();
    let set = listenersByUser.get(userId);
    if (!set) {
      set = new Set();
      listenersByUser.set(userId, set);
    }
    set.add(listener);
    listener(readOps(userId).length);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        listenersByUser.delete(userId);
        teardownStorageListenerIfIdle();
      }
    };
  },

  enqueue(
    userId: string,
    operationType: OfflineOutboxOperation['operationType'],
    payload: Record<string, unknown>,
    dedupeKey: string
  ): OfflineOutboxOperation {
    const existing = readOps(userId);
    const idx = existing.findIndex((op) => op.dedupeKey === dedupeKey);
    const nextOp: OfflineOutboxOperation = {
      id:
        idx >= 0
          ? existing[idx].id
          : `outbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      dedupeKey,
      operationType,
      payload,
      createdAt: idx >= 0 ? existing[idx].createdAt : new Date().toISOString(),
      attempts: idx >= 0 ? existing[idx].attempts : 0,
    };

    if (idx >= 0) {
      existing[idx] = nextOp;
      writeOps(userId, existing);
    } else {
      writeOps(userId, [...existing, nextOp]);
    }
    return nextOp;
  },

  remove(userId: string, id: string): void {
    const ops = readOps(userId).filter((op) => op.id !== id);
    writeOps(userId, ops);
  },

  recordError(userId: string, id: string, errorMessage: string): void {
    const ops = readOps(userId).map((op) =>
      op.id === id
        ? {
            ...op,
            attempts: (op.attempts || 0) + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: errorMessage,
          }
        : op
    );
    writeOps(userId, ops);
  },

  isEligibleForRetry(op: OfflineOutboxOperation): boolean {
    if (!op.attempts || op.attempts <= 0) return true;
    if (op.attempts >= MAX_OUTBOX_RETRY_ATTEMPTS) return false;
    if (!op.lastAttemptAt) return true;
    // Bounded exponential backoff with jitter: min(30s, 1000ms * 2^(attempts-1)) + jitter
    const exponent = Math.min(op.attempts - 1, 5);
    const baseDelay = Math.min(30000, 1000 * Math.pow(2, exponent));
    const jitter = op.id.charCodeAt(op.id.length - 1) % 500;
    const requiredDelay = baseDelay + jitter;
    return Date.now() - new Date(op.lastAttemptAt).getTime() >= requiredDelay;
  },

  clear(userId: string): void {
    writeOps(userId, []);
  },
};
