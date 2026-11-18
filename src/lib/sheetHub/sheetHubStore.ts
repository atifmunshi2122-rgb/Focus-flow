/**
 * Universal Sheet Sync Hub — Isolated Firestore Storage Foundation (Phase 1)
 *
 * Scopes all documents strictly under `users/{userId}/`:
 * - sheet_connections
 * - sheet_tabs
 * - sheet_row_chunks
 * - sheet_sync_queue
 * - sheet_conflicts
 *
 * Reuses existing Firebase `db` instance and `clientDataCache`.
 * Never stores OAuth access tokens in Firestore.
 * Never touches Study OS, Finance, Calendar, Tasks, or Joint Vault collections.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.ts';
import { clientDataCache } from '../dataCache.ts';
import type {
  SheetConflict,
  SheetConnection,
  SheetRowChunk,
  SheetSyncedRow,
  SheetSyncOperation,
  SheetTabSchema,
} from '../../types/sheetHub.ts';
import { packRowsIntoChunks } from './rowIdentity.ts';

export const SHEET_HUB_COLLECTIONS = {
  connections: 'sheet_connections',
  tabs: 'sheet_tabs',
  rowChunks: 'sheet_row_chunks',
  syncQueue: 'sheet_sync_queue',
  conflicts: 'sheet_conflicts',
} as const;

function userCollectionPath(userId: string, subcollection: string): string {
  return `users/${userId}/${subcollection}`;
}

/**
 * Strips any accidental token fields defensively before Firestore writes.
 */
function stripSensitiveFields<T extends Record<string, unknown>>(obj: T): T {
  const clone = { ...obj };
  delete clone.accessToken;
  delete clone.refreshToken;
  delete clone.googleAccessToken;
  delete clone.authorization;
  return clone;
}

const inMemoryFallbackStore = new Map<string, string>();

function readLocalFallback<T>(key: string, fallback: T): T {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Fall through to in-memory fallback
    }
  }
  const mem = inMemoryFallbackStore.get(key);
  if (mem) {
    try {
      return JSON.parse(mem) as T;
    } catch {}
  }
  return fallback;
}

function writeLocalFallback<T>(key: string, val: T): void {
  const serialized = JSON.stringify(val);
  inMemoryFallbackStore.set(key, serialized);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, serialized);
    } catch {}
  }
}

export const sheetHubStore = {
  async listConnections(userId: string): Promise<SheetConnection[]> {
    const cacheKey = `sheet_hub_connections`;
    const cached = clientDataCache.get<SheetConnection[]>(cacheKey);
    if (cached) return cached;

    try {
      const snap = await getDocs(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections)));
      const items = snap.docs
        .map((d) => d.data() as SheetConnection)
        .filter((c) => !c.deletedAt)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      clientDataCache.set(cacheKey, items);
      writeLocalFallback(`ff_sheethub_conns_${userId}`, items);
      return items;
    } catch {
      // Local fallback for guest or offline mode
      const local = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
      clientDataCache.set(cacheKey, local);
      return local;
    }
  },

  async getConnection(userId: string, connectionId: string): Promise<SheetConnection | null> {
    try {
      const snap = await getDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connectionId)
      );
      if (snap.exists()) return snap.data() as SheetConnection;
    } catch {}
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    return conns.find((c) => c.id === connectionId) || null;
  },

  async saveConnection(userId: string, connection: SheetConnection): Promise<SheetConnection> {
    const sanitized = stripSensitiveFields({ ...connection, userId });
    
    // Update local mirror
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    const filtered = conns.filter((c) => c.id !== connection.id);
    filtered.unshift(sanitized);
    writeLocalFallback(`ff_sheethub_conns_${userId}`, filtered);

    try {
      await setDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connection.id),
        sanitized
      );
    } catch {
      // Offline or guest mode continues smoothly
    }
    clientDataCache.invalidate('sheet_hub_connections');
    return sanitized;
  },

  async deleteConnection(userId: string, connectionId: string, purgeData = true): Promise<void> {
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    writeLocalFallback(
      `ff_sheethub_conns_${userId}`,
      conns.filter((c) => c.id !== connectionId)
    );

    if (purgeData) {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Remove any tab and row caches for this connection
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.includes(connectionId)) keysToRemove.push(k);
        }
        for (const k of keysToRemove) window.localStorage.removeItem(k);
      }
      for (const k of inMemoryFallbackStore.keys()) {
        if (k.includes(connectionId)) inMemoryFallbackStore.delete(k);
      }
    }

    try {
      await deleteDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connectionId)
      );
    } catch {}
    clientDataCache.invalidate('sheet_hub_');
  },

  async listTabsForConnection(userId: string, connectionId: string): Promise<SheetTabSchema[]> {
    const cacheKey = `sheet_hub_tabs_${connectionId}`;
    const cached = clientDataCache.get<SheetTabSchema[]>(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs)),
        where('connectionId', '==', connectionId)
      );
      const snap = await getDocs(q);
      const tabs = snap.docs.map((d) => d.data() as SheetTabSchema);
      clientDataCache.set(cacheKey, tabs);
      writeLocalFallback(`ff_sheethub_tabs_${userId}_${connectionId}`, tabs);
      return tabs;
    } catch {
      const local = readLocalFallback<SheetTabSchema[]>(`ff_sheethub_tabs_${userId}_${connectionId}`, []);
      clientDataCache.set(cacheKey, local);
      return local;
    }
  },

  async saveTabSchema(userId: string, tab: SheetTabSchema): Promise<SheetTabSchema> {
    const sanitized = stripSensitiveFields({ ...tab, userId });
    const local = readLocalFallback<SheetTabSchema[]>(`ff_sheethub_tabs_${userId}_${tab.connectionId}`, []);
    const filtered = local.filter((t) => t.id !== tab.id);
    filtered.push(sanitized);
    writeLocalFallback(`ff_sheethub_tabs_${userId}_${tab.connectionId}`, filtered);

    try {
      await setDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tab.id), sanitized);
    } catch {}
    clientDataCache.invalidate(`sheet_hub_tabs_${tab.connectionId}`);
    return sanitized;
  },

  async loadTabRows(userId: string, tabId: string): Promise<SheetSyncedRow[]> {
    const cacheKey = `sheet_hub_rows_${tabId}`;
    const cached = clientDataCache.get<SheetSyncedRow[]>(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.rowChunks)),
        where('tabId', '==', tabId)
      );
      const snap = await getDocs(q);
      const chunks = snap.docs
        .map((d) => d.data() as SheetRowChunk)
        .sort((a, b) => a.chunkIndex - b.chunkIndex);

      const rows: SheetSyncedRow[] = [];
      for (const chunk of chunks) {
        for (const row of Object.values(chunk.rows || {})) {
          rows.push(row);
        }
      }
      rows.sort((a, b) => a.lastKnownSheetRow - b.lastKnownSheetRow);
      clientDataCache.set(cacheKey, rows);
      writeLocalFallback(`ff_sheethub_rows_${userId}_${tabId}`, rows);
      return rows;
    } catch {
      const local = readLocalFallback<SheetSyncedRow[]>(`ff_sheethub_rows_${userId}_${tabId}`, []);
      clientDataCache.set(cacheKey, local);
      return local;
    }
  },

  /**
   * Saves chunked rows with byte-size and row-count safety guarantees.
   * Uses Firestore writeBatch for atomic multi-chunk persistence with local fallback.
   */
  async saveTabRowsChunked(input: {
    userId: string;
    connectionId: string;
    tabId: string;
    rows: SheetSyncedRow[];
  }): Promise<{ chunkCount: number; maxChunkBytes: number; oversizedRowUids: string[] }> {
    const packed = packRowsIntoChunks({
      connectionId: input.connectionId,
      tabId: input.tabId,
      userId: input.userId,
      rows: input.rows,
    });

    if (packed.oversizedRowUids.length > 0) {
      throw new Error(
        `One or more rows exceed the safe chunk byte limit (${packed.oversizedRowUids.length} oversized row(s)).`
      );
    }

    // Mirror full rows locally
    writeLocalFallback(`ff_sheethub_rows_${input.userId}_${input.tabId}`, input.rows);

    try {
      const batch = writeBatch(db);
      for (const chunk of packed.chunks) {
        const ref = doc(db, userCollectionPath(input.userId, SHEET_HUB_COLLECTIONS.rowChunks), chunk.id);
        batch.set(ref, stripSensitiveFields(chunk as unknown as Record<string, unknown>));
      }
      await batch.commit();
    } catch {
      // Local fallback saves data safely
    }
    clientDataCache.invalidate(`sheet_hub_rows_${input.tabId}`);

    return {
      chunkCount: packed.chunks.length,
      maxChunkBytes: packed.maxChunkBytes,
      oversizedRowUids: packed.oversizedRowUids,
    };
  },

  async listSyncQueue(userId: string, connectionId: string): Promise<SheetSyncOperation[]> {
    const q = query(
      collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.syncQueue)),
      where('connectionId', '==', connectionId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SheetSyncOperation);
  },

  async listOpenConflicts(userId: string, connectionId: string): Promise<SheetConflict[]> {
    const q = query(
      collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.conflicts)),
      where('connectionId', '==', connectionId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as SheetConflict)
      .filter((c) => c.status === 'open');
  },
};

