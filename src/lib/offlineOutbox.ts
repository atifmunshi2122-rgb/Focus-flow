import { OfflineOutboxOperation } from '../types/index.ts';

const OUTBOX_STORAGE_PREFIX = 'ff_firestore_outbox_v1_';

type OutboxListener = (count: number) => void;

const listenersByUser = new Map<string, Set<OutboxListener>>();

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
    set.forEach((cb) => {
      try {
        cb(ops.length);
      } catch {
        // isolate subscriber errors
      }
    });
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
            lastError: errorMessage,
          }
        : op
    );
    writeOps(userId, ops);
  },

  clear(userId: string): void {
    writeOps(userId, []);
  },
};
