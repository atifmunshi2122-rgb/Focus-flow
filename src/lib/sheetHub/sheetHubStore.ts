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
import { auth, db, waitForInitialAuth } from '../firebase.ts';
import { clientDataCache } from '../dataCache.ts';
import type {
  SheetCellScalar,
  SheetColumnMapping,
  SheetConflict,
  SheetConnection,
  SheetFieldType,
  SheetRowChunk,
  SheetSyncedRow,
  SheetSyncOperation,
  SheetTabSchema,
  SheetTemplateHint,
} from '../../types/sheetHub.ts';
import { packRowsIntoChunks } from './rowIdentity.ts';
import { columnIndexToLetter } from './columnUtils.ts';

export const SHEET_HUB_COLLECTIONS = {
  sheets: 'sheets',
  connections: 'sheet_connections',
  tabs: 'sheet_tabs',
  rowChunks: 'sheet_row_chunks',
  syncQueue: 'sheet_sync_queue',
  conflicts: 'sheet_conflicts',
} as const;

export class SheetHubPersistenceError extends Error {
  public readonly code: string;
  public readonly connectionId?: string;
  public readonly tabId?: string;

  constructor(message: string, code = 'FIRESTORE_WRITE_FAILED', connectionId?: string, tabId?: string) {
    super(message);
    this.name = 'SheetHubPersistenceError';
    this.code = code;
    this.connectionId = connectionId;
    this.tabId = tabId;
  }
}

export interface PendingSheetOperation {
  id: string;
  type: 'connection' | 'tab' | 'rows' | 'index_sync';
  userId: string;
  connectionId: string;
  tabId?: string;
  payload: any;
  error?: string;
  createdAt: string;
  attempts: number;
}

function getPendingQueueKey(userId: string): string {
  return `ff_sheethub_pending_queue_${userId}`;
}

function enqueuePendingOp(
  userId: string,
  op: Omit<PendingSheetOperation, 'id' | 'createdAt' | 'attempts'>
): void {
  const queue = readLocalFallback<PendingSheetOperation[]>(getPendingQueueKey(userId), []);
  const existingIdx = queue.findIndex(
    (o) => o.connectionId === op.connectionId && o.tabId === op.tabId && o.type === op.type
  );
  if (existingIdx !== -1) {
    queue[existingIdx] = {
      ...queue[existingIdx],
      payload: op.payload,
      error: op.error,
      attempts: queue[existingIdx].attempts + 1,
    };
  } else {
    queue.push({
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      attempts: 1,
    });
  }
  writeLocalFallback(getPendingQueueKey(userId), queue);
}

function dequeuePendingOp(
  userId: string,
  connectionId: string,
  tabId?: string,
  type?: 'connection' | 'tab' | 'rows' | 'index_sync'
): void {
  const queue = readLocalFallback<PendingSheetOperation[]>(getPendingQueueKey(userId), []);
  const filtered = queue.filter((o) => {
    if (o.connectionId !== connectionId) return true;
    if (tabId && o.tabId !== tabId) return true;
    if (type && o.type !== type) return true;
    return false;
  });
  writeLocalFallback(getPendingQueueKey(userId), filtered);
}

function assertValidUserId(userId: string): void {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Valid userId is required for Sheet Hub operations.');
  }
}

function userCollectionPath(userId: string, subcollection: string): string {
  assertValidUserId(userId);
  return `users/${userId}/${subcollection}`;
}

function isSignedInAs(userId: string): boolean {
  return Boolean(auth.currentUser && auth.currentUser.uid === userId);
}

/**
 * Recursively strips `undefined` properties and accidental OAuth token fields
 * before Firestore writes so setDoc/writeBatch never fails on undefined values.
 */
function stripSensitiveFields<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveFields(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (
        k === 'accessToken' ||
        k === 'refreshToken' ||
        k === 'googleAccessToken' ||
        k === 'authorization'
      ) {
        continue;
      }
      out[k] = stripSensitiveFields(v);
    }
    return out as T;
  }
  return input;
}

function normalizeConnectionForFirestore(userId: string, connection: SheetConnection): SheetConnection {
  const isNative = Boolean(connection.isNative);
  const rawUrl = (connection.spreadsheetUrl || '').trim();
  const safeUrl = isNative
    ? rawUrl
    : rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.spreadsheetId || connection.id)}/edit`;

  const nowIso = new Date().toISOString();
  const base: SheetConnection = {
    ...connection,
    userId,
    ownerUid: userId,
    spreadsheetUrl: safeUrl,
    syncOnOpen: typeof connection.syncOnOpen === 'boolean' ? connection.syncOnOpen : true,
    pendingChangesCount: Number.isFinite(connection.pendingChangesCount)
      ? Math.max(0, Math.round(connection.pendingChangesCount))
      : 0,
    conflictCount: Number.isFinite(connection.conflictCount)
      ? Math.max(0, Math.round(connection.conflictCount))
      : 0,
    tabOrder: Array.isArray(connection.tabOrder) ? connection.tabOrder : [],
    schemaVersion: typeof connection.schemaVersion === 'number' ? connection.schemaVersion : 1,
    sortOrder: typeof connection.sortOrder === 'number' ? connection.sortOrder : 0,
    isNative: isNative,
    isDualCopy: typeof connection.isDualCopy === 'boolean' ? connection.isDualCopy : false,
    driveFileId: connection.driveFileId ? String(connection.driveFileId).trim() : null,
    sourceSpreadsheetId: connection.sourceSpreadsheetId ? String(connection.sourceSpreadsheetId).trim() : null,
    nativeSheetId: connection.nativeSheetId ? String(connection.nativeSheetId).trim() : null,
    lastDriveSyncAt: connection.lastDriveSyncAt || null,
    driveSyncStatus: connection.driveSyncStatus || (connection.driveFileId ? 'synced' : 'not_connected'),
    lastDriveModifiedTime: connection.lastDriveModifiedTime || null,
    createdAt: connection.createdAt || nowIso,
    updatedAt: connection.updatedAt || nowIso,
    deletedAt: connection.deletedAt ?? null,
  };
  return stripSensitiveFields(base);
}

function normalizeTabForFirestore(userId: string, tab: SheetTabSchema): SheetTabSchema {
  const nowIso = new Date().toISOString();
  const base: SheetTabSchema = {
    ...tab,
    userId,
    ownerUid: userId,
    sheetDocId: tab.sheetDocId || tab.connectionId,
    position: typeof tab.position === 'number' ? tab.position : 0,
    sheetId: Number.isFinite(tab.sheetId) ? Math.max(0, Math.round(tab.sheetId)) : 0,
    headerRowIndex: Number.isFinite(tab.headerRowIndex) ? Math.max(0, Math.round(tab.headerRowIndex)) : 1,
    dataStartRow: Number.isFinite(tab.dataStartRow) ? Math.max(0, Math.round(tab.dataStartRow)) : 1,
    rowCount: Number.isFinite(tab.rowCount) ? Math.max(0, Math.round(tab.rowCount)) : 0,
    chunkCount: Number.isFinite(tab.chunkCount) ? Math.max(0, Math.round(tab.chunkCount)) : 0,
    identityColumns: Array.isArray(tab.identityColumns) ? tab.identityColumns.slice(0, 10) : [],
    columns: Array.isArray(tab.columns) ? tab.columns.slice(0, 100) : [],
    updatedAt: tab.updatedAt || nowIso,
  };
  return stripSensitiveFields(base);
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
  async listConnections(
    userId: string,
    options?: { forceCloud?: boolean }
  ): Promise<SheetConnection[]> {
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_conns_${userId}`;
    if (!options?.forceCloud) {
      const cached = clientDataCache.get<SheetConnection[]>(cacheKey, undefined, userId);
      if (cached) return cached;
    }

    // Ensure Firebase Auth has finished restoring on a newly opened device before querying Firestore
    if (userId !== 'usr_guest' && userId !== 'usr_1') {
      await waitForInitialAuth().catch(() => null);
    }

    if (isSignedInAs(userId)) {
      try {
        const mergedById = new Map<string, SheetConnection>();

        // 1. Primary query index: users/{userId}/sheet_connections
        try {
          const connSnap = await getDocs(
            collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections))
          );
          for (const d of connSnap.docs) {
            const item = d.data() as SheetConnection;
            if (!item.deletedAt) mergedById.set(item.id, item);
          }
        } catch (connErr) {
          if (isSignedInAs(userId)) {
            console.warn('[SheetHub] Primary index sheet_connections fetch failed:', connErr);
          }
        }

        // 2. Authoritative canonical storage: users/{userId}/sheets (merge any docs present only there)
        const missingInIndex: SheetConnection[] = [];
        try {
          const sheetsSnap = await getDocs(
            collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets))
          );
          for (const d of sheetsSnap.docs) {
            const item = d.data() as SheetConnection;
            if (item.deletedAt) continue;
            const existing = mergedById.get(item.id);
            if (!existing) {
              mergedById.set(item.id, item);
              missingInIndex.push(item);
            } else if ((item.updatedAt || '') > (existing.updatedAt || '')) {
              mergedById.set(item.id, item);
              missingInIndex.push(item);
            }
          }
        } catch (sheetsErr) {
          if (isSignedInAs(userId)) {
            console.warn('[SheetHub] Canonical sheets fetch warning:', sheetsErr);
          }
        }

        // 3. Safe reconciliation and missing-index repair: backfill canonical records into sheet_connections
        if (missingInIndex.length > 0) {
          for (const item of missingInIndex) {
            setDoc(
              doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), item.id),
              normalizeConnectionForFirestore(userId, item)
            ).catch((e) => console.warn('[SheetHub] Safe index repair deferred:', e));
          }
        }

        // If Firestore read did not find records or in offline mode, merge local fallback records
        if (mergedById.size === 0) {
          const local = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
          for (const c of local) {
            if (!c.deletedAt && !mergedById.has(c.id)) {
              mergedById.set(c.id, c);
            }
          }
        }

        // Automatic Local-to-Cloud reconciliation for signed-in users:
        // If a sheet was previously saved only to localStorage on this device (e.g. offline, guest, or earlier rule rejection),
        // upload it + its tabs + row chunks to Firestore so it immediately appears on all other devices logged into this Gmail.
        const localCandidates: Array<{ sourceUserId: string; conn: SheetConnection }> = [];
        for (const sourceUid of [userId, 'usr_guest', 'usr_1']) {
          const localList = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${sourceUid}`, []);
          for (const c of localList) {
            if (!c || !c.id || c.deletedAt) continue;
            if (!mergedById.has(c.id)) {
              localCandidates.push({ sourceUserId: sourceUid, conn: c });
            }
          }
        }

        for (const { sourceUserId, conn } of localCandidates) {
          try {
            const migratedConn = normalizeConnectionForFirestore(userId, {
              ...conn,
              userId,
              ownerUid: conn.ownerUid !== undefined ? userId : undefined,
            });
            await this.saveConnection(userId, migratedConn);

            const localTabs = readLocalFallback<SheetTabSchema[]>(
              `ff_sheethub_tabs_${sourceUserId}_${conn.id}`,
              []
            );
            for (const localTab of localTabs) {
              const migratedTab = normalizeTabForFirestore(userId, {
                ...localTab,
                userId,
                ownerUid: localTab.ownerUid !== undefined ? userId : undefined,
              });
              await this.saveTabSchema(userId, migratedTab);

              const localRows = readLocalFallback<SheetSyncedRow[]>(
                `ff_sheethub_rows_${sourceUserId}_${localTab.id}`,
                []
              );
              if (localRows.length > 0) {
                await this.saveTabRowsChunked({
                  userId,
                  connectionId: conn.id,
                  tabId: localTab.id,
                  rows: localRows,
                });
              }
            }

            mergedById.set(migratedConn.id, migratedConn);
          } catch (migrateErr) {
            console.warn('[SheetHub] Deferred local-to-cloud sheet migration:', migrateErr);
          }
        }

        const items = Array.from(mergedById.values())
          .filter((c) => !c.deletedAt)
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        clientDataCache.set(cacheKey, items, userId);
        writeLocalFallback(`ff_sheethub_conns_${userId}`, items);
        return items;
      } catch (err) {
        if (isSignedInAs(userId)) {
          console.error('[SheetHub] Firestore listConnections failed:', err);
        }
      }
    }

    // Local fallback for guest or offline mode (do NOT cache empty failure state in clientDataCache)
    const local = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    if (!isSignedInAs(userId)) {
      clientDataCache.set(cacheKey, local, userId);
    }
    return local;
  },

  async getConnection(userId: string, connectionId: string): Promise<SheetConnection | null> {
    assertValidUserId(userId);
    if (userId !== 'usr_guest' && userId !== 'usr_1') {
      await waitForInitialAuth().catch(() => null);
    }
    if (isSignedInAs(userId)) {
      try {
        // 1. Check canonical document first (authoritative source of truth)
        const canonicalSnap = await getDoc(
          doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connectionId)
        );
        if (canonicalSnap.exists()) {
          const canonical = canonicalSnap.data() as SheetConnection;
          return canonical;
        }

        // 2. Fallback check secondary query index: users/{userId}/sheet_connections
        const snap = await getDoc(
          doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connectionId)
        );
        if (snap.exists()) {
          const item = snap.data() as SheetConnection;
          setDoc(
            doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connectionId),
            normalizeConnectionForFirestore(userId, item)
          ).catch(() => {});
          return item;
        }
      } catch (err) {
        console.warn('[SheetHub] Firestore getConnection fetch failed:', err);
      }
    }
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    return conns.find((c) => c.id === connectionId) || null;
  },

  async saveConnection(
    userId: string,
    connection: SheetConnection,
    options?: { force?: boolean }
  ): Promise<SheetConnection> {
    assertValidUserId(userId);
    if (connection.userId && connection.userId !== userId) {
      throw new Error(`Cross-user ownership mutation forbidden. Cannot save connection for userId "${connection.userId}" under user "${userId}".`);
    }
    const sanitized = normalizeConnectionForFirestore(userId, connection);

    // Conflict detection: If existing document has strictly newer updatedAt, prevent silent last-write-wins
    if (!options?.force) {
      let existingDoc: SheetConnection | null = null;
      if (isSignedInAs(userId)) {
        try {
          const cloudSnap = await getDoc(
            doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connection.id)
          );
          if (cloudSnap.exists()) {
            existingDoc = cloudSnap.data() as SheetConnection;
          }
        } catch (err) {
          if (err instanceof SheetHubPersistenceError) throw err;
        }
      }
      if (!existingDoc) {
        const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
        existingDoc = conns.find((c) => c.id === connection.id) || null;
      }
      if (existingDoc && existingDoc.updatedAt && sanitized.updatedAt && existingDoc.updatedAt > sanitized.updatedAt) {
        throw new SheetHubPersistenceError(
          `Concurrent modification conflict: Cloud version (${existingDoc.updatedAt}) is newer than local edit (${sanitized.updatedAt}).`,
          'CONCURRENT_MODIFICATION_CONFLICT',
          connection.id
        );
      }
    }

    // Update local mirror immediately
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    const filtered = conns.filter((c) => c.id !== connection.id);
    filtered.unshift(sanitized);
    writeLocalFallback(`ff_sheethub_conns_${userId}`, filtered);

    let canonicalSaved = false;
    let indexSaved = false;
    let canonicalError: Error | null = null;
    let indexError: Error | null = null;

    // 1. Authoritative canonical persistence: users/{userId}/sheets/{connection.id}
    if (isSignedInAs(userId)) {
      try {
        await setDoc(
          doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connection.id),
          sanitized
        );
        canonicalSaved = true;
      } catch (err) {
        canonicalError = err instanceof Error ? err : new Error(String(err));
        console.error('[SheetHub] Authoritative canonical Firestore saveConnection failed:', err);
      }

      // 2. Query index mirror: users/{userId}/sheet_connections/{connection.id}
      try {
        await setDoc(
          doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connection.id),
          sanitized
        );
        indexSaved = true;
      } catch (err) {
        indexError = err instanceof Error ? err : new Error(String(err));
        console.warn('[SheetHub] Secondary index sheet_connections write warning:', err);
      }
    }

    clientDataCache.invalidate(`sheet_hub_conns_${userId}`);
    clientDataCache.invalidate(`sheet_hub_private_sheets_${userId}`);

    // If both canonical and index persistence failed for a signed-in user, fail closed!
    if (!canonicalSaved && !indexSaved && isSignedInAs(userId)) {
      enqueuePendingOp(userId, {
        type: 'connection',
        userId,
        connectionId: connection.id,
        payload: sanitized,
        error: canonicalError?.message || indexError?.message || 'Firestore saveConnection failed',
      });
      throw new SheetHubPersistenceError(
        `Failed to save spreadsheet connection to Cloud Firestore: ${canonicalError?.message || indexError?.message || 'Unknown canonical error'}`,
        'FIRESTORE_WRITE_FAILED',
        connection.id
      );
    }

    // If canonical succeeded but secondary index failed, enqueue recoverable index sync
    if (canonicalSaved && !indexSaved && isSignedInAs(userId)) {
      enqueuePendingOp(userId, {
        type: 'index_sync',
        userId,
        connectionId: connection.id,
        payload: sanitized,
        error: indexError?.message || 'Secondary index write failed',
      });
    }

    // If index succeeded but canonical failed, enqueue recoverable canonical sync
    if (!canonicalSaved && indexSaved && isSignedInAs(userId)) {
      enqueuePendingOp(userId, {
        type: 'connection',
        userId,
        connectionId: connection.id,
        payload: sanitized,
        error: canonicalError?.message || 'Canonical write failed',
      });
    }

    if (canonicalSaved || indexSaved) {
      dequeuePendingOp(userId, connection.id, undefined, 'connection');
      dequeuePendingOp(userId, connection.id, undefined, 'index_sync');
    }

    return sanitized;
  },

  async deleteConnection(userId: string, connectionId: string, purgeData = true): Promise<void> {
    assertValidUserId(userId);
    const existing = await this.getConnection(userId, connectionId);
    if (existing && existing.userId !== userId) {
      throw new Error(`Cross-user ownership mutation forbidden. Cannot delete connection for userId "${existing.userId}" under user "${userId}".`);
    }

    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    writeLocalFallback(
      `ff_sheethub_conns_${userId}`,
      conns.filter((c) => c.id !== connectionId)
    );

    let tabs: SheetTabSchema[] = [];
    try {
      tabs = await this.listTabsForConnection(userId, connectionId);
    } catch {}
    const tabIds = new Set(tabs.map((t) => t.id));
    if (existing && Array.isArray(existing.tabOrder)) {
      for (const tId of existing.tabOrder) tabIds.add(tId);
    }

    if (purgeData) {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.includes(connectionId) || Array.from(tabIds).some((tId) => k.includes(tId)))) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) window.localStorage.removeItem(k);
      }
      for (const k of inMemoryFallbackStore.keys()) {
        if (k.includes(connectionId) || Array.from(tabIds).some((tId) => k.includes(tId))) {
          inMemoryFallbackStore.delete(k);
        }
      }
      for (const tId of tabIds) {
        clientDataCache.invalidate(`sheet_hub_rows_${userId}_${tId}`);
      }
    }

    clientDataCache.invalidate(`sheet_hub_conns_${userId}`);
    clientDataCache.invalidate(`sheet_hub_private_sheets_${userId}`);
    clientDataCache.invalidate(`sheet_hub_tabs_${userId}_${connectionId}`);
    clientDataCache.invalidate('sheet_hub_rows_');

    dequeuePendingOp(userId, connectionId);

    if (isSignedInAs(userId)) {
      let discoveryError: Error | null = null;

      // Discover any additional tabs in Firestore across flat and nested paths
      try {
        const qTabs = await getDocs(
          query(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs)), where('connectionId', '==', connectionId))
        );
        for (const d of qTabs.docs) tabIds.add(d.id);
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      try {
        const nestedTabsSnap = await getDocs(
          collection(db, `users/${userId}/sheets/${connectionId}/tabs`)
        );
        for (const d of nestedTabsSnap.docs) tabIds.add(d.id);
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      const childRefsToDelete: any[] = [];

      // 1. Tabs and row chunks for all associated tabs
      for (const tId of tabIds) {
        childRefsToDelete.push(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tId));
        childRefsToDelete.push(doc(db, `users/${userId}/sheets/${connectionId}/tabs/${tId}`));

        try {
          const chunksSnap = await getDocs(
            query(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.rowChunks)), where('tabId', '==', tId))
          );
          for (const d of chunksSnap.docs) childRefsToDelete.push(d.ref);
        } catch (err: any) {
          discoveryError = discoveryError || err;
        }

        try {
          const nestedChunksSnap = await getDocs(
            collection(db, `users/${userId}/sheets/${connectionId}/tabs/${tId}/row_chunks`)
          );
          for (const d of nestedChunksSnap.docs) childRefsToDelete.push(d.ref);
        } catch (err: any) {
          discoveryError = discoveryError || err;
        }

        try {
          const nestedRowsSnap = await getDocs(
            collection(db, `users/${userId}/sheets/${connectionId}/tabs/${tId}/rows`)
          );
          for (const d of nestedRowsSnap.docs) childRefsToDelete.push(d.ref);
        } catch (err: any) {
          discoveryError = discoveryError || err;
        }
      }

      // 2. Direct chunks referencing connectionId
      try {
        const connChunksSnap = await getDocs(
          query(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.rowChunks)), where('connectionId', '==', connectionId))
        );
        for (const d of connChunksSnap.docs) childRefsToDelete.push(d.ref);
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      // 3. Associated sync queue items
      try {
        const queueSnap = await getDocs(
          query(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.syncQueue)), where('connectionId', '==', connectionId))
        );
        for (const d of queueSnap.docs) childRefsToDelete.push(d.ref);
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      // 4. Associated conflict items
      try {
        const conflictSnap = await getDocs(
          query(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.conflicts)), where('connectionId', '==', connectionId))
        );
        for (const d of conflictSnap.docs) childRefsToDelete.push(d.ref);
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      if (discoveryError) {
        throw new SheetHubPersistenceError(
          `Cascade deletion aborted: could not query all child records: ${(discoveryError as Error).message}`,
          'DELETION_INCOMPLETE',
          connectionId
        );
      }

      // Delete child records FIRST in batches of <= 400
      for (let i = 0; i < childRefsToDelete.length; i += 400) {
        const slice = childRefsToDelete.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const ref of slice) batch.delete(ref);
        await batch.commit();
      }

      // Delete parent documents LAST to ensure idempotency and resumability
      const parentBatch = writeBatch(db);
      parentBatch.delete(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connectionId));
      parentBatch.delete(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connectionId));
      await parentBatch.commit();

      // Post-deletion verification check: verify parent documents are gone
      const verifyConnSnap = await getDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connectionId)
      );
      const verifySheetSnap = await getDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connectionId)
      );
      if (verifyConnSnap.exists() || verifySheetSnap.exists()) {
        throw new SheetHubPersistenceError(
          'Cascade deletion incomplete: parent spreadsheet records still exist.',
          'DELETION_INCOMPLETE',
          connectionId
        );
      }
    }
  },

  async listTabsForConnection(userId: string, connectionId: string): Promise<SheetTabSchema[]> {
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_tabs_${userId}_${connectionId}`;
    const cached = clientDataCache.get<SheetTabSchema[]>(cacheKey, undefined, userId);
    if (cached) return cached;

    if (userId !== 'usr_guest' && userId !== 'usr_1') {
      await waitForInitialAuth().catch(() => null);
    }

    if (isSignedInAs(userId)) {
      try {
        const q = query(
          collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs)),
          where('connectionId', '==', connectionId)
        );
        const snap = await getDocs(q);
        const byId = new Map<string, SheetTabSchema>();
        for (const d of snap.docs) {
          const t = d.data() as SheetTabSchema;
          byId.set(t.id, t);
        }

        // Also check nested canonical mirror tabs if primary was empty
        if (byId.size === 0) {
          try {
            const nestedSnap = await getDocs(
              collection(db, `users/${userId}/sheets/${connectionId}/tabs`)
            );
            for (const d of nestedSnap.docs) {
              const t = d.data() as SheetTabSchema;
              byId.set(t.id, t);
            }
          } catch {}
        }

        const tabs = Array.from(byId.values());
        clientDataCache.set(cacheKey, tabs, userId);
        writeLocalFallback(`ff_sheethub_tabs_${userId}_${connectionId}`, tabs);
        return tabs;
      } catch (err) {
        if (isSignedInAs(userId)) {
          console.error('[SheetHub] Firestore listTabsForConnection failed:', err);
        }
      }
    }

    const local = readLocalFallback<SheetTabSchema[]>(`ff_sheethub_tabs_${userId}_${connectionId}`, []);
    if (!isSignedInAs(userId)) {
      clientDataCache.set(cacheKey, local, userId);
    }
    return local;
  },

  async saveTabSchema(userId: string, tab: SheetTabSchema): Promise<SheetTabSchema> {
    assertValidUserId(userId);
    if (tab.userId && tab.userId !== userId) {
      throw new Error(`Cross-user ownership mutation forbidden. Cannot save tab schema for userId "${tab.userId}" under user "${userId}".`);
    }
    const sanitized = normalizeTabForFirestore(userId, tab);
    const local = readLocalFallback<SheetTabSchema[]>(`ff_sheethub_tabs_${userId}_${tab.connectionId}`, []);
    const filtered = local.filter((t) => t.id !== tab.id);
    filtered.push(sanitized);
    writeLocalFallback(`ff_sheethub_tabs_${userId}_${tab.connectionId}`, filtered);

    let authoritativeSaved = false;
    let mirrorSaved = false;
    let cloudError: Error | null = null;

    if (isSignedInAs(userId)) {
      // Primary write in sheet_tabs
      try {
        await setDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tab.id), sanitized);
        authoritativeSaved = true;
      } catch (err) {
        cloudError = err instanceof Error ? err : new Error(String(err));
        console.error('[SheetHub] Primary Firestore saveTabSchema failed:', err);
      }

      // Mirror write in canonical nested tabs
      try {
        await setDoc(doc(db, `users/${userId}/sheets/${tab.connectionId}/tabs/${tab.id}`), sanitized);
        mirrorSaved = true;
      } catch (err) {
        console.warn('[SheetHub] Mirror Firestore nested tab write warning:', err);
      }
    }

    clientDataCache.invalidate(`sheet_hub_tabs_${userId}_${tab.connectionId}`);

    if (!authoritativeSaved && !mirrorSaved && isSignedInAs(userId)) {
      enqueuePendingOp(userId, {
        type: 'tab',
        userId,
        connectionId: tab.connectionId,
        tabId: tab.id,
        payload: sanitized,
        error: cloudError?.message || 'Firestore saveTabSchema failed',
      });
      throw new SheetHubPersistenceError(
        `Failed to save tab schema to Cloud Firestore: ${cloudError?.message || 'Unknown error'}`,
        'FIRESTORE_TAB_WRITE_FAILED',
        tab.connectionId,
        tab.id
      );
    }

    if (authoritativeSaved || mirrorSaved) {
      dequeuePendingOp(userId, tab.connectionId, tab.id, 'tab');
    }

    return sanitized;
  },

  async loadTabRows(userId: string, tabId: string, sheetId?: string): Promise<SheetSyncedRow[]> {
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_rows_${userId}_${tabId}`;
    const cached = clientDataCache.get<SheetSyncedRow[]>(cacheKey, undefined, userId);
    if (cached) return cached;

    if (userId !== 'usr_guest' && userId !== 'usr_1') {
      await waitForInitialAuth().catch(() => null);
    }

    if (isSignedInAs(userId)) {
      try {
        const q = query(
          collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.rowChunks)),
          where('tabId', '==', tabId)
        );
        const snap = await getDocs(q);
        const chunks = snap.docs
          .map((d) => d.data() as SheetRowChunk)
          .sort((a, b) => a.chunkIndex - b.chunkIndex);

        const rowMap = new Map<string, SheetSyncedRow>();
        for (const chunk of chunks) {
          for (const row of Object.values(chunk.rows || {})) {
            if (row && row.rowUid) {
              rowMap.set(row.rowUid, row);
            }
          }
        }

        // Check canonical nested path if primary chunks were empty
        if (rowMap.size === 0 && sheetId) {
          try {
            const nestedSnap = await getDocs(
              collection(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}/row_chunks`)
            );
            const nestedChunks = nestedSnap.docs
              .map((d) => d.data() as SheetRowChunk)
              .sort((a, b) => a.chunkIndex - b.chunkIndex);
            for (const chunk of nestedChunks) {
              for (const row of Object.values(chunk.rows || {})) {
                if (row && row.rowUid) {
                  rowMap.set(row.rowUid, row);
                }
              }
            }
          } catch {}
        }

        if (rowMap.size > 0) {
          const rows = Array.from(rowMap.values()).sort(
            (a, b) => (a.lastKnownSheetRow ?? a.rowIndex ?? 0) - (b.lastKnownSheetRow ?? b.rowIndex ?? 0)
          );
          clientDataCache.set(cacheKey, rows, userId);
          writeLocalFallback(`ff_sheethub_rows_${userId}_${tabId}`, rows);
          return rows;
        }

        // Fallback to local store if firestore had no records
        const local = readLocalFallback<SheetSyncedRow[]>(`ff_sheethub_rows_${userId}_${tabId}`, []);
        clientDataCache.set(cacheKey, local, userId);
        return local;
      } catch (err) {
        if (isSignedInAs(userId)) {
          console.error('[SheetHub] Firestore loadTabRows failed:', err);
        }
      }
    }

    const local = readLocalFallback<SheetSyncedRow[]>(`ff_sheethub_rows_${userId}_${tabId}`, []);
    if (!isSignedInAs(userId)) {
      clientDataCache.set(cacheKey, local, userId);
    }
    return local;
  },

  /**
   * Saves chunked rows with byte-size and row-count safety guarantees.
   * Uses isolated Firestore writeBatch commits for primary chunks.
   */
  async saveTabRowsChunked(input: {
    userId: string;
    connectionId: string;
    tabId: string;
    rows: SheetSyncedRow[];
  }): Promise<{ chunkCount: number; maxChunkBytes: number; oversizedRowUids: string[] }> {
    assertValidUserId(input.userId);
    const cleanedRows = input.rows.map((r) => stripSensitiveFields(r));
    const packed = packRowsIntoChunks({
      connectionId: input.connectionId,
      tabId: input.tabId,
      userId: input.userId,
      rows: cleanedRows,
    });

    if (packed.oversizedRowUids.length > 0) {
      throw new Error(
        `One or more rows exceed the safe chunk byte limit (${packed.oversizedRowUids.length} oversized row(s)).`
      );
    }

    // Mirror full rows locally
    writeLocalFallback(`ff_sheethub_rows_${input.userId}_${input.tabId}`, cleanedRows);

    let authoritativeSaved = false;
    let mirrorSaved = false;
    let cloudError: Error | null = null;

    if (isSignedInAs(input.userId)) {
      const newChunkIds = new Set(packed.chunks.map((c) => c.id));

      // 1. Primary cloud write & prune: users/{userId}/sheet_row_chunks/{chunk.id}
      try {
        const existingSnap = await getDocs(
          query(
            collection(db, userCollectionPath(input.userId, SHEET_HUB_COLLECTIONS.rowChunks)),
            where('tabId', '==', input.tabId)
          )
        );
        const staleDocRefs = existingSnap.docs.filter((d) => !newChunkIds.has(d.id)).map((d) => d.ref);

        const primaryOps: Array<{ type: 'set'; ref: any; data: any } | { type: 'delete'; ref: any }> = [];
        for (const chunk of packed.chunks) {
          const ref = doc(db, userCollectionPath(input.userId, SHEET_HUB_COLLECTIONS.rowChunks), chunk.id);
          primaryOps.push({ type: 'set', ref, data: stripSensitiveFields(chunk as unknown as Record<string, unknown>) });
        }
        for (const staleRef of staleDocRefs) {
          primaryOps.push({ type: 'delete', ref: staleRef });
        }

        if (primaryOps.length > 0) {
          for (let i = 0; i < primaryOps.length; i += 250) {
            const slice = primaryOps.slice(i, i + 250);
            const primaryBatch = writeBatch(db);
            for (const op of slice) {
              if (op.type === 'set') {
                primaryBatch.set(op.ref, op.data);
              } else {
                primaryBatch.delete(op.ref);
              }
            }
            await primaryBatch.commit();
          }
        }
        authoritativeSaved = true;
      } catch (err) {
        cloudError = err instanceof Error ? err : new Error(String(err));
        console.error('[SheetHub] Primary Firestore saveTabRowsChunked failed:', err);
      }

      // 2. Independent best-effort secondary mirror & prune: nested row_chunks under sheets/{connectionId}/tabs/{tabId}
      try {
        const mirrorNestedCol = collection(
          db,
          `users/${input.userId}/sheets/${input.connectionId}/tabs/${input.tabId}/row_chunks`
        );
        let staleMirrorRefs: any[] = [];
        try {
          const mirrorSnap = await getDocs(mirrorNestedCol);
          staleMirrorRefs = mirrorSnap.docs.filter((d) => !newChunkIds.has(d.id)).map((d) => d.ref);
        } catch {
          // Best effort mirror discovery
        }

        const mirrorOps: Array<{ type: 'set'; ref: any; data: any } | { type: 'delete'; ref: any }> = [];
        for (const chunk of packed.chunks) {
          const nestedRef = doc(
            db,
            `users/${input.userId}/sheets/${input.connectionId}/tabs/${input.tabId}/row_chunks/${chunk.id}`
          );
          mirrorOps.push({ type: 'set', ref: nestedRef, data: stripSensitiveFields(chunk as unknown as Record<string, unknown>) });
        }
        for (const staleMirrorRef of staleMirrorRefs) {
          mirrorOps.push({ type: 'delete', ref: staleMirrorRef });
        }

        if (mirrorOps.length > 0) {
          for (let i = 0; i < mirrorOps.length; i += 250) {
            const slice = mirrorOps.slice(i, i + 250);
            const mirrorBatch = writeBatch(db);
            for (const op of slice) {
              if (op.type === 'set') {
                mirrorBatch.set(op.ref, op.data);
              } else {
                mirrorBatch.delete(op.ref);
              }
            }
            await mirrorBatch.commit();
          }
        }
        mirrorSaved = true;
      } catch (err) {
        console.warn('[SheetHub] Mirror Firestore nested row_chunks warning:', err);
      }
    } else {
      authoritativeSaved = true;
    }

    clientDataCache.invalidate(`sheet_hub_rows_${input.userId}_${input.tabId}`);

    if (!authoritativeSaved && !mirrorSaved && isSignedInAs(input.userId)) {
      enqueuePendingOp(input.userId, {
        type: 'rows',
        userId: input.userId,
        connectionId: input.connectionId,
        tabId: input.tabId,
        payload: cleanedRows,
        error: cloudError?.message || 'Firestore row chunks write failed',
      });
      throw new SheetHubPersistenceError(
        `Failed to save row chunks to Cloud Firestore: ${cloudError?.message || 'Unknown error'}`,
        'FIRESTORE_ROWS_WRITE_FAILED',
        input.connectionId,
        input.tabId
      );
    }

    if (authoritativeSaved || mirrorSaved) {
      dequeuePendingOp(input.userId, input.connectionId, input.tabId, 'rows');
    }

    return {
      chunkCount: packed.chunks.length,
      maxChunkBytes: packed.maxChunkBytes,
      oversizedRowUids: packed.oversizedRowUids,
    };
  },

  async listSyncQueue(userId: string, connectionId: string): Promise<SheetSyncOperation[]> {
    assertValidUserId(userId);
    const q = query(
      collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.syncQueue)),
      where('connectionId', '==', connectionId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SheetSyncOperation);
  },

  async listOpenConflicts(userId: string, connectionId: string): Promise<SheetConflict[]> {
    assertValidUserId(userId);
    if (isSignedInAs(userId)) {
      try {
        const q = query(
          collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.conflicts)),
          where('connectionId', '==', connectionId)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map((d) => d.data() as SheetConflict)
          .filter((c) => c.status === 'open');
      } catch {
        // Fallback to local
      }
    }
    const localKey = `ff_sheethub_conflicts_${userId}_${connectionId}`;
    const localList = readLocalFallback<SheetConflict[]>(localKey, []);
    return localList.filter((c) => c.status === 'open');
  },

  async saveConflict(userId: string, conflict: SheetConflict): Promise<void> {
    assertValidUserId(userId);
    const sanitized = stripSensitiveFields(conflict);
    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.conflicts), conflict.id);
        await setDoc(ref, sanitized);
      } catch (err: any) {
        console.warn('[SheetHubStore] Failed to save conflict to Cloud Firestore:', err);
      }
    }
    const localKey = `ff_sheethub_conflicts_${userId}_${conflict.connectionId}`;
    const localList = readLocalFallback<SheetConflict[]>(localKey, []);
    const idx = localList.findIndex((c) => c.id === conflict.id);
    if (idx >= 0) {
      localList[idx] = sanitized;
    } else {
      localList.push(sanitized);
    }
    writeLocalFallback(localKey, localList);
  },

  async resolveConflict(
    userId: string,
    conflictId: string,
    connectionId: string,
    resolution: 'keep_app' | 'keep_sheet' | 'custom'
  ): Promise<void> {
    assertValidUserId(userId);
    const nowIso = new Date().toISOString();
    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.conflicts), conflictId);
        await setDoc(ref, { status: 'resolved', resolution, resolvedAt: nowIso }, { merge: true });
      } catch (err) {
        console.warn('[SheetHubStore] Failed to resolve conflict in Firestore:', err);
      }
    }
    const localKey = `ff_sheethub_conflicts_${userId}_${connectionId}`;
    const localList = readLocalFallback<SheetConflict[]>(localKey, []);
    const target = localList.find((c) => c.id === conflictId);
    if (target) {
      target.status = 'resolved';
      target.resolution = resolution;
      target.resolvedAt = nowIso;
      writeLocalFallback(localKey, localList);
    }
  },

  /**
   * Lists private sheets directly from canonical path `users/{userId}/sheets/{sheetId}`.
   */
  async listPrivateSheets(userId: string): Promise<SheetConnection[]> {
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_private_sheets_${userId}`;
    const cached = clientDataCache.get<SheetConnection[]>(cacheKey, undefined, userId);
    if (cached) return cached;

    try {
      const snap = await getDocs(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets)));
      const items = snap.docs
        .map((d) => d.data() as SheetConnection)
        .filter((c) => !c.deletedAt)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      clientDataCache.set(cacheKey, items, userId);
      return items;
    } catch {
      return this.listConnections(userId);
    }
  },

  // ==========================================================================
  // NATIVE FIRESTORE SPREADSHEET SYSTEM (ZERO GOOGLE DRIVE DEPENDENCY)
  // ==========================================================================

  /**
   * Creates a brand new native private spreadsheet in Firestore without Google OAuth.
   */
  async createNativeSpreadsheet(
    userId: string,
    input: {
      title: string;
      description?: string | null;
      templateHint?: SheetTemplateHint;
      columns?: SheetColumnMapping[];
      initialRows?: Array<Record<string, SheetCellScalar>>;
    }
  ): Promise<{ sheet: SheetConnection; tab: SheetTabSchema; rows: SheetSyncedRow[] }> {
    assertValidUserId(userId);
    const now = new Date().toISOString();
    const sheetId = `sheet_nat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tabId = `tab_nat_${Date.now()}_1`;
    const template = input.templateHint || 'table';

    let columns: SheetColumnMapping[];
    let rowValuesList: Array<Record<string, SheetCellScalar>>;

    if (input.columns && input.columns.length > 0) {
      columns = input.columns;
      rowValuesList = input.initialRows && input.initialRows.length > 0 ? input.initialRows : [{}];
    } else if (template === 'checklist') {
      columns = [
        { colIndex: 0, colLetter: 'A', fieldKey: 'col_group', headerName: 'Module', displayName: 'Module', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 1, colLetter: 'B', fieldKey: 'col_title', headerName: 'Topic / Task', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 2, colLetter: 'C', fieldKey: 'col_done', headerName: 'Done', displayName: 'Done', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 3, colLetter: 'D', fieldKey: 'col_notes', headerName: 'Notes', displayName: 'Notes', inferredType: 'long_text', confirmedType: 'long_text', semanticRole: 'notes', confidence: 'high', editable: true, requiresConfirmation: false },
      ];
      rowValuesList = [
        { col_group: 'Module 1', col_title: 'Introduction & Setup', col_done: false, col_notes: 'Initial workspace setup' },
        { col_group: 'Module 1', col_title: 'Core Concepts', col_done: false, col_notes: 'Review foundational principles' },
        { col_group: 'Module 2', col_title: 'First Milestone Execution', col_done: false, col_notes: 'Track progress milestones' },
      ];
    } else if (template === 'tracker') {
      columns = [
        { colIndex: 0, colLetter: 'A', fieldKey: 'col_item', headerName: 'Task Item', displayName: 'Task Item', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 1, colLetter: 'B', fieldKey: 'col_priority', headerName: 'Priority', displayName: 'Priority', inferredType: 'priority', confirmedType: 'priority', semanticRole: 'priority', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 2, colLetter: 'C', fieldKey: 'col_status', headerName: 'Status', displayName: 'Status', inferredType: 'status', confirmedType: 'status', semanticRole: 'status', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 3, colLetter: 'D', fieldKey: 'col_due', headerName: 'Target Date', displayName: 'Target Date', inferredType: 'date', confirmedType: 'date', semanticRole: 'due_date', confidence: 'high', editable: true, requiresConfirmation: false },
      ];
      rowValuesList = [
        { col_item: 'Project Kickoff', col_priority: 'High', col_status: 'In Progress', col_due: now.split('T')[0] },
        { col_item: 'Design System Review', col_priority: 'Medium', col_status: 'To Do', col_due: now.split('T')[0] },
      ];
    } else {
      columns = [
        { colIndex: 0, colLetter: 'A', fieldKey: 'col_a', headerName: 'Title', displayName: 'Title', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 1, colLetter: 'B', fieldKey: 'col_b', headerName: 'Category', displayName: 'Category', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 2, colLetter: 'C', fieldKey: 'col_c', headerName: 'Amount / Value', displayName: 'Amount', inferredType: 'number', confirmedType: 'number', semanticRole: 'metric', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 3, colLetter: 'D', fieldKey: 'col_d', headerName: 'Notes', displayName: 'Notes', inferredType: 'text', confirmedType: 'text', semanticRole: 'notes', confidence: 'high', editable: true, requiresConfirmation: false },
      ];
      rowValuesList = [
        { col_a: 'Entry 1', col_b: 'General', col_c: 100, col_d: 'Initial note' },
        { col_a: 'Entry 2', col_b: 'Operations', col_c: 250, col_d: '' },
        { col_a: 'Entry 3', col_b: 'Marketing', col_c: 150, col_d: '' },
      ];
    }

    const rows: SheetSyncedRow[] = rowValuesList.map((rv, idx) => {
      const fullVals: Record<string, SheetCellScalar> = {};
      for (const col of columns) {
        fullVals[col.fieldKey] = rv[col.fieldKey] !== undefined ? rv[col.fieldKey] : null;
      }
      return {
        rowUid: `row_nat_${Date.now()}_${idx + 1}`,
        id: `row_nat_${Date.now()}_${idx + 1}`,
        tabId,
        sheetDocId: sheetId,
        userId,
        ownerUid: userId,
        rowIndex: idx + 1,
        lastKnownSheetRow: idx + 1,
        values: fullVals,
        cells: fullVals,
        baseValues: fullVals,
        rowHash: `hash_nat_${idx + 1}`,
        version: 1,
        lastSyncOrigin: 'app',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: now,
        status: 'synced',
        createdAt: now,
        updatedAt: now,
      };
    });

    const sheet: SheetConnection = {
      id: sheetId,
      userId,
      ownerUid: userId,
      title: input.title.trim() || 'Untitled Native Sheet',
      description: input.description?.trim() || null,
      spreadsheetId: sheetId,
      spreadsheetUrl: '',
      templateHint: template,
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: [tabId],
      schemaVersion: 1,
      isNative: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const tab: SheetTabSchema = {
      id: tabId,
      connectionId: sheetId,
      sheetDocId: sheetId,
      userId,
      ownerUid: userId,
      sheetId: 0,
      sheetTitle: 'Sheet 1',
      position: 0,
      role: 'data',
      headerRowIndex: 1,
      dataStartRow: 2,
      dataEndColumn: columns[columns.length - 1]?.colLetter || 'D',
      identityStrategy: 'metadata_column',
      identityColumns: [columns[0]?.fieldKey || 'col_a'],
      metadataIdColumn: null,
      columns,
      defaultView: template === 'checklist' ? 'checklist' : 'table',
      groupByColumnId: template === 'checklist' ? 'col_group' : null,
      lastPullHash: 'native_init',
      rowCount: rows.length,
      chunkCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    let sheetSaved = false;
    let tabSaved = false;

    try {
      await this.saveConnection(userId, sheet);
      sheetSaved = true;
      await this.saveTabSchema(userId, tab);
      tabSaved = true;
      await this.saveTabRowsChunked({ userId, connectionId: sheetId, tabId, rows });
    } catch (err: any) {
      if (isSignedInAs(userId)) {
        try {
          if (tabSaved) {
            await deleteDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tabId));
            await deleteDoc(doc(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}`));
          }
          if (sheetSaved) {
            await deleteDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), sheetId));
            await deleteDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), sheetId));
          }
        } catch {
          // Ignore compensating cleanup errors
        }
      }
      throw new SheetHubPersistenceError(
        `Failed to create spreadsheet in Cloud Firestore: ${err?.message || 'Persistence error'}`,
        err?.code || 'FIRESTORE_WRITE_FAILED',
        sheetId,
        tabId
      );
    }

    return { sheet, tab, rows };
  },

  /**
   * Creates a Dual-Copy spreadsheet pair:
   * 1. FocusFlow Native private spreadsheet in Firestore with all imported tabs.
   * 2. Automatically appends the "Progress Tracker" tab to the native copy.
   * 3. Stores explicit linkage metadata to the Google Drive duplicate:
   *    isDualCopy: true, driveFileId, sourceSpreadsheetId, etc.
   */
  async createDualCopySpreadsheet(
    userId: string,
    input: {
      title: string;
      sourceSpreadsheetId: string;
      driveFileId: string;
      driveUrl?: string;
      tabs: Array<{
        sheetTitle: string;
        sheetId?: number;
        role?: 'data' | 'overview' | 'ignored';
        columns: SheetColumnMapping[];
        rows: SheetSyncedRow[];
      }>;
      progressTrackerTopics?: Array<{
        unit: string;
        topic: string;
        subtopic?: string;
        isCompleted?: boolean;
      }>;
    }
  ): Promise<{
    connection: SheetConnection;
    tabs: SheetTabSchema[];
  }> {
    assertValidUserId(userId);
    const now = new Date().toISOString();

    // 0. Idempotent check: if a non-deleted native sheet already exists for this driveFileId under userId, return it
    if (input.driveFileId) {
      const existingConns = await this.listConnections(userId).catch(() => []);
      const existing = existingConns.find(
        (c) => c.isDualCopy && c.driveFileId === input.driveFileId && !c.deletedAt
      );
      if (existing) {
        const existingTabs = await this.listTabsForConnection(userId, existing.id).catch(() => []);
        return { connection: existing, tabs: existingTabs };
      }
    }

    const connId = `conn_dual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdTabs: SheetTabSchema[] = [];
    const tabOrder: string[] = [];

    try {
      // 1. Process imported tabs
      for (let i = 0; i < input.tabs.length; i++) {
        const tabInput = input.tabs[i];
        const numericSheetId = typeof tabInput.sheetId === 'number' ? tabInput.sheetId : i;
        const tabDocId = `${connId}__tab_${numericSheetId}`;
        tabOrder.push(tabDocId);

        const tabSchema: SheetTabSchema = {
          id: tabDocId,
          connectionId: connId,
          sheetDocId: connId,
          userId,
          ownerUid: userId,
          sheetId: numericSheetId,
          sheetTitle: tabInput.sheetTitle,
          position: i,
          role: tabInput.role || 'data',
          headerRowIndex: 1,
          dataStartRow: 2,
          dataEndColumn: tabInput.columns[tabInput.columns.length - 1]?.colLetter || 'D',
          identityStrategy: 'composite_key',
          identityColumns: tabInput.columns.slice(0, 3).map((c) => c.fieldKey),
          metadataIdColumn: null,
          columns: tabInput.columns,
          defaultView: 'checklist',
          groupByColumnId: tabInput.columns[0]?.fieldKey || null,
          lastPullHash: 'dual_init',
          rowCount: tabInput.rows.length,
          chunkCount: 1,
          createdAt: now,
          updatedAt: now,
        };

        await this.saveTabSchema(userId, tabSchema);
        if (tabInput.rows.length > 0) {
          await this.saveTabRowsChunked({
            userId,
            connectionId: connId,
            tabId: tabDocId,
            rows: tabInput.rows,
          });
        }
        createdTabs.push(tabSchema);
      }

      // 2. Automatically create "Progress Tracker" tab in Firestore native copy
      const trackerNumericId = 9999;
      const trackerTabDocId = `${connId}__tab_${trackerNumericId}`;
      tabOrder.push(trackerTabDocId);

      const trackerColumns: SheetColumnMapping[] = [
        { colIndex: 0, colLetter: 'A', fieldKey: 'unit', headerName: 'Module / Unit', displayName: 'Module', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 1, colLetter: 'B', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 2, colLetter: 'C', fieldKey: 'subtopic', headerName: 'Subtopic', displayName: 'Subtopic', inferredType: 'text', confirmedType: 'text', semanticRole: 'subgroup', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 3, colLetter: 'D', fieldKey: 'done', headerName: 'Completed', displayName: 'Completed', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
        { colIndex: 4, colLetter: 'E', fieldKey: 'lastSynced', headerName: 'Last Synced', displayName: 'Last Synced', inferredType: 'date', confirmedType: 'date', semanticRole: 'custom', confidence: 'high', editable: false, requiresConfirmation: false },
      ];

      const trackerTopics = input.progressTrackerTopics || [];
      const trackerRows: SheetSyncedRow[] = trackerTopics.map((t, idx) => {
        const vals: Record<string, SheetCellScalar> = {
          unit: t.unit || '',
          topic: t.topic || '',
          subtopic: t.subtopic || '',
          done: Boolean(t.isCompleted),
          lastSynced: now,
        };
        return {
          rowUid: `row_tracker_${Date.now()}_${idx + 1}`,
          id: `row_tracker_${Date.now()}_${idx + 1}`,
          tabId: trackerTabDocId,
          sheetDocId: connId,
          userId,
          ownerUid: userId,
          rowIndex: idx + 2,
          lastKnownSheetRow: idx + 2,
          values: vals,
          cells: vals,
          baseValues: vals,
          rowHash: `hash_tracker_${idx + 1}`,
          version: 1,
          lastSyncOrigin: 'app',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: now,
          status: 'synced',
          createdAt: now,
          updatedAt: now,
        };
      });

      const trackerTab: SheetTabSchema = {
        id: trackerTabDocId,
        connectionId: connId,
        sheetDocId: connId,
        userId,
        ownerUid: userId,
        sheetId: trackerNumericId,
        sheetTitle: 'Progress Tracker',
        position: createdTabs.length,
        role: 'overview',
        headerRowIndex: 1,
        dataStartRow: 2,
        dataEndColumn: 'E',
        identityStrategy: 'composite_key',
        identityColumns: ['unit', 'topic', 'subtopic'],
        metadataIdColumn: null,
        columns: trackerColumns,
        defaultView: 'checklist',
        groupByColumnId: 'unit',
        lastPullHash: 'dual_init',
        rowCount: trackerRows.length,
        chunkCount: 1,
        createdAt: now,
        updatedAt: now,
      };

      await this.saveTabSchema(userId, trackerTab);
      if (trackerRows.length > 0) {
        await this.saveTabRowsChunked({
          userId,
          connectionId: connId,
          tabId: trackerTabDocId,
          rows: trackerRows,
        });
      }
      createdTabs.push(trackerTab);

      // 3. Create primary connection document linked to Drive copy
      const connection: SheetConnection = {
        id: connId,
        userId,
        ownerUid: userId,
        spreadsheetId: input.driveFileId,
        spreadsheetUrl: input.driveUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.driveFileId)}/edit`,
        title: input.title.trim() || 'Dual-Copy Spreadsheet',
        description: 'FocusFlow Dual-Copy (Google Drive + Firestore)',
        templateHint: 'checklist',
        syncMode: 'two_way',
        writeMode: 'native_oauth',
        writeAuthStatus: 'authorized',
        writeAuthorizedAt: now,
        pollIntervalSec: 60,
        syncOnOpen: true,
        status: 'active',
        lastSyncedAt: now,
        lastSuccessfulPullAt: now,
        lastSuccessfulPushAt: now,
        lastError: null,
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder,
        schemaVersion: 1,
        sortOrder: 0,
        isNative: false,
        isDualCopy: true,
        driveFileId: input.driveFileId,
        sourceSpreadsheetId: input.sourceSpreadsheetId,
        nativeSheetId: connId,
        lastDriveSyncAt: now,
        driveSyncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await this.saveConnection(userId, connection);

      return { connection, tabs: createdTabs };
    } catch (err) {
      // Safe rollback cleanup: delete any partially written tabs or row chunks to prevent orphans
      await this.deleteConnection(userId, connId, true).catch(() => {});
      throw err;
    }
  },

  /**
   * Renames a native spreadsheet.
   */
  async renameNativeSpreadsheet(userId: string, sheetId: string, newTitle: string): Promise<SheetConnection> {
    assertValidUserId(userId);
    const existing = await this.getConnection(userId, sheetId);
    if (!existing) throw new Error(`Spreadsheet with id "${sheetId}" not found.`);
    if (existing.userId !== userId) throw new Error('Unauthorized.');

    const updated: SheetConnection = {
      ...existing,
      title: newTitle.trim(),
      updatedAt: new Date().toISOString(),
    };
    return this.saveConnection(userId, updated);
  },

  /**
   * Creates a new tab under a native spreadsheet.
   */
  async createNativeTab(
    userId: string,
    sheetId: string,
    title: string,
    columns?: SheetColumnMapping[]
  ): Promise<SheetTabSchema> {
    assertValidUserId(userId);
    const existingSheet = await this.getConnection(userId, sheetId);
    if (!existingSheet) throw new Error(`Spreadsheet "${sheetId}" not found.`);
    if (existingSheet.userId !== userId) throw new Error('Unauthorized.');

    const existingTabs = await this.listTabsForConnection(userId, sheetId);
    const now = new Date().toISOString();
    const tabId = `tab_nat_${Date.now()}_${existingTabs.length + 1}`;

    const defaultCols: SheetColumnMapping[] = columns && columns.length > 0 ? columns : [
      { colIndex: 0, colLetter: 'A', fieldKey: 'col_a', headerName: 'Item', displayName: 'Item', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 1, colLetter: 'B', fieldKey: 'col_b', headerName: 'Value', displayName: 'Value', inferredType: 'text', confirmedType: 'text', semanticRole: 'custom', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 2, colLetter: 'C', fieldKey: 'col_c', headerName: 'Done', displayName: 'Done', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
    ];

    const tab: SheetTabSchema = {
      id: tabId,
      connectionId: sheetId,
      sheetDocId: sheetId,
      userId,
      ownerUid: userId,
      sheetId: existingTabs.length,
      sheetTitle: title.trim() || `Sheet ${existingTabs.length + 1}`,
      position: existingTabs.length,
      role: 'data',
      headerRowIndex: 1,
      dataStartRow: 2,
      dataEndColumn: defaultCols[defaultCols.length - 1]?.colLetter || 'C',
      identityStrategy: 'metadata_column',
      identityColumns: [defaultCols[0].fieldKey],
      metadataIdColumn: null,
      columns: defaultCols,
      defaultView: 'table',
      groupByColumnId: null,
      lastPullHash: 'native_init',
      rowCount: 2,
      chunkCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    const initialRows: SheetSyncedRow[] = [1, 2].map((rIdx) => {
      const vals: Record<string, SheetCellScalar> = {};
      for (const col of defaultCols) {
        vals[col.fieldKey] = col.inferredType === 'checkbox' ? false : null;
      }
      return {
        rowUid: `row_nat_${Date.now()}_${rIdx}`,
        id: `row_nat_${Date.now()}_${rIdx}`,
        tabId,
        sheetDocId: sheetId,
        userId,
        ownerUid: userId,
        rowIndex: rIdx,
        lastKnownSheetRow: rIdx,
        values: vals,
        cells: vals,
        baseValues: vals,
        rowHash: `hash_nat_${rIdx}`,
        version: 1,
        lastSyncOrigin: 'app',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: now,
        status: 'synced',
        createdAt: now,
        updatedAt: now,
      };
    });

    let tabSaved = false;
    try {
      await this.saveTabSchema(userId, tab);
      tabSaved = true;
      await this.saveTabRowsChunked({ userId, connectionId: sheetId, tabId, rows: initialRows });
      const updatedTabOrder = [...existingSheet.tabOrder, tabId];
      await this.saveConnection(userId, { ...existingSheet, tabOrder: updatedTabOrder, updatedAt: now });
    } catch (err: any) {
      if (isSignedInAs(userId)) {
        try {
          if (tabSaved) {
            await deleteDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tabId));
            await deleteDoc(doc(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}`));
          }
        } catch {}
      }
      throw new SheetHubPersistenceError(
        `Failed to create tab in Cloud Firestore: ${err?.message || 'Persistence error'}`,
        err?.code || 'FIRESTORE_WRITE_FAILED',
        sheetId,
        tabId
      );
    }

    return tab;
  },

  /**
   * Renames a tab in a native spreadsheet.
   */
  async renameNativeTab(userId: string, sheetId: string, tabId: string, newTitle: string): Promise<SheetTabSchema> {
    assertValidUserId(userId);
    const tabs = await this.listTabsForConnection(userId, sheetId);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`Tab "${tabId}" not found.`);
    if (tab.userId !== userId) throw new Error('Unauthorized.');

    const updated: SheetTabSchema = {
      ...tab,
      sheetTitle: newTitle.trim(),
      updatedAt: new Date().toISOString(),
    };
    return this.saveTabSchema(userId, updated);
  },

  /**
   * Deletes a tab from a native spreadsheet, fully cleaning up its row chunks.
   */
  async deleteNativeTab(userId: string, sheetId: string, tabId: string): Promise<void> {
    assertValidUserId(userId);
    const existingSheet = await this.getConnection(userId, sheetId);
    if (!existingSheet) throw new Error(`Spreadsheet "${sheetId}" not found.`);
    if (existingSheet.userId !== userId) throw new Error('Unauthorized.');

    const tabs = await this.listTabsForConnection(userId, sheetId);
    if (tabs.length <= 1) {
      throw new Error('Cannot delete the only tab in a spreadsheet.');
    }

    const nextTabs = tabs.filter((t) => t.id !== tabId);
    writeLocalFallback(`ff_sheethub_tabs_${userId}_${sheetId}`, nextTabs);
    clientDataCache.invalidate(`sheet_hub_tabs_${userId}_${sheetId}`);
    clientDataCache.invalidate(`sheet_hub_rows_${userId}_${tabId}`);

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`ff_sheethub_rows_${userId}_${tabId}`);
    }
    inMemoryFallbackStore.delete(`ff_sheethub_rows_${userId}_${tabId}`);

    if (isSignedInAs(userId)) {
      let discoveryError: Error | null = null;
      const refsToDelete: any[] = [];
      refsToDelete.push(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tabId));
      refsToDelete.push(doc(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}`));

      try {
        const chunksSnap = await getDocs(
          query(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.rowChunks)), where('tabId', '==', tabId))
        );
        for (const d of chunksSnap.docs) {
          refsToDelete.push(d.ref);
        }
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      try {
        const nestedChunksSnap = await getDocs(
          collection(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}/row_chunks`)
        );
        for (const d of nestedChunksSnap.docs) {
          refsToDelete.push(d.ref);
        }
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      try {
        const nestedRowsSnap = await getDocs(
          collection(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}/rows`)
        );
        for (const d of nestedRowsSnap.docs) {
          refsToDelete.push(d.ref);
        }
      } catch (err: any) {
        discoveryError = discoveryError || err;
      }

      if (discoveryError) {
        throw new SheetHubPersistenceError(
          `Cascade tab deletion aborted: could not query child row records: ${(discoveryError as Error).message}`,
          'DELETION_INCOMPLETE',
          tabId
        );
      }

      for (let i = 0; i < refsToDelete.length; i += 400) {
        const slice = refsToDelete.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const ref of slice) {
          batch.delete(ref);
        }
        await batch.commit();
      }
    }

    const nextOrder = existingSheet.tabOrder.filter((id) => id !== tabId);
    await this.saveConnection(userId, {
      ...existingSheet,
      tabOrder: nextOrder,
      updatedAt: new Date().toISOString(),
    });
  },

  /**
   * Reorders tabs in a native spreadsheet.
   */
  async reorderNativeTabs(userId: string, sheetId: string, newTabOrder: string[]): Promise<SheetConnection> {
    assertValidUserId(userId);
    const existing = await this.getConnection(userId, sheetId);
    if (!existing) throw new Error(`Spreadsheet "${sheetId}" not found.`);
    if (existing.userId !== userId) throw new Error('Unauthorized.');

    const updated: SheetConnection = {
      ...existing,
      tabOrder: newTabOrder,
      updatedAt: new Date().toISOString(),
    };
    return this.saveConnection(userId, updated);
  },

  /**
   * Adds a column to a tab in a native spreadsheet with Excel-style column labels.
   */
  async addNativeColumn(
    userId: string,
    sheetId: string,
    tabId: string,
    columnName: string,
    type: SheetFieldType = 'text'
  ): Promise<SheetTabSchema> {
    assertValidUserId(userId);
    const tabs = await this.listTabsForConnection(userId, sheetId);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`Tab "${tabId}" not found.`);
    if (tab.userId !== userId) throw new Error('Unauthorized.');

    const colIndex = tab.columns.length;
    const colLetter = columnIndexToLetter(colIndex);
    const fieldKey = `col_${Date.now()}_${colIndex}`;

    const newCol: SheetColumnMapping = {
      colIndex,
      colLetter,
      fieldKey,
      headerName: columnName.trim() || `Column ${colIndex + 1}`,
      displayName: columnName.trim() || `Column ${colIndex + 1}`,
      inferredType: type,
      confirmedType: type,
      semanticRole: type === 'checkbox' ? 'done' : 'custom',
      confidence: 'high',
      editable: true,
      requiresConfirmation: false,
    };

    const updatedTab: SheetTabSchema = {
      ...tab,
      columns: [...tab.columns, newCol],
      dataEndColumn: colLetter,
      updatedAt: new Date().toISOString(),
    };

    const existingRows = await this.loadTabRows(userId, tabId, sheetId);
    const updatedRows = existingRows.map((r) => ({
      ...r,
      values: {
        ...r.values,
        [fieldKey]: type === 'checkbox' ? false : null,
      },
      cells: {
        ...r.values,
        [fieldKey]: type === 'checkbox' ? false : null,
      },
      updatedAt: new Date().toISOString(),
    }));

    await this.saveTabSchema(userId, updatedTab);
    await this.saveTabRowsChunked({ userId, connectionId: sheetId, tabId, rows: updatedRows });

    return updatedTab;
  },

  /**
   * Appends a new row to a tab in a native spreadsheet.
   */
  async addNativeRow(
    userId: string,
    sheetId: string,
    tabId: string,
    initialValues?: Record<string, SheetCellScalar>
  ): Promise<SheetSyncedRow> {
    assertValidUserId(userId);
    const tabs = await this.listTabsForConnection(userId, sheetId);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`Tab "${tabId}" not found.`);
    if (tab.userId !== userId) throw new Error('Unauthorized.');

    const existingRows = await this.loadTabRows(userId, tabId);
    const nextRowIdx = existingRows.length + 1;
    const now = new Date().toISOString();
    const rowUid = `row_nat_${Date.now()}_${nextRowIdx}`;

    const values: Record<string, SheetCellScalar> = {};
    for (const col of tab.columns) {
      if (initialValues && initialValues[col.fieldKey] !== undefined) {
        values[col.fieldKey] = initialValues[col.fieldKey];
      } else {
        values[col.fieldKey] = col.inferredType === 'checkbox' ? false : null;
      }
    }

    const newRow: SheetSyncedRow = {
      rowUid,
      id: rowUid,
      tabId,
      sheetDocId: sheetId,
      userId,
      ownerUid: userId,
      rowIndex: nextRowIdx,
      lastKnownSheetRow: nextRowIdx,
      values,
      cells: values,
      baseValues: { ...values },
      rowHash: `hash_nat_${Date.now()}`,
      version: 1,
      lastSyncOrigin: 'app',
      dirtyFields: [],
      localUpdatedAt: now,
      sheetSyncedAt: now,
      status: 'synced',
      createdAt: now,
      updatedAt: now,
    };

    const updatedRows = [...existingRows, newRow];
    await this.saveTabRowsChunked({ userId, connectionId: sheetId, tabId, rows: updatedRows });

    const updatedTab: SheetTabSchema = {
      ...tab,
      rowCount: updatedRows.length,
      updatedAt: now,
    };
    await this.saveTabSchema(userId, updatedTab);

    return newRow;
  },

  /**
   * Saves an inline cell edit with instant local reflection and Firestore persistence.
   */
  async saveNativeCellEdit(
    userId: string,
    input: {
      sheetId: string;
      tabId: string;
      rowUid: string;
      fieldKey: string;
      value: SheetCellScalar;
    }
  ): Promise<SheetSyncedRow> {
    assertValidUserId(userId);
    const existingRows = await this.loadTabRows(userId, input.tabId);
    const targetIdx = existingRows.findIndex((r) => r.rowUid === input.rowUid);
    if (targetIdx === -1) {
      throw new Error(`Row "${input.rowUid}" not found in tab "${input.tabId}".`);
    }

    const now = new Date().toISOString();
    const targetRow = existingRows[targetIdx];
    const updatedRow: SheetSyncedRow = {
      ...targetRow,
      userId,
      ownerUid: userId,
      tabId: input.tabId,
      sheetDocId: input.sheetId,
      values: {
        ...targetRow.values,
        [input.fieldKey]: input.value,
      },
      cells: {
        ...targetRow.values,
        [input.fieldKey]: input.value,
      },
      dirtyFields: Array.from(new Set([...(targetRow.dirtyFields || []), input.fieldKey])),
      localUpdatedAt: now,
      updatedAt: now,
    };

    const nextRows = [...existingRows];
    nextRows[targetIdx] = updatedRow;

    await this.saveTabRowsChunked({
      userId,
      connectionId: input.sheetId,
      tabId: input.tabId,
      rows: nextRows,
    });

    return updatedRow;
  },

  /**
   * Deletes a row from a native spreadsheet tab.
   */
  async deleteNativeRow(userId: string, sheetId: string, tabId: string, rowUid: string): Promise<void> {
    assertValidUserId(userId);
    const existingRows = await this.loadTabRows(userId, tabId);
    const filtered = existingRows
      .filter((r) => r.rowUid !== rowUid)
      .map((r, idx) => ({
        ...r,
        rowIndex: idx + 1,
        lastKnownSheetRow: idx + 1,
      }));

    await this.saveTabRowsChunked({
      userId,
      connectionId: sheetId,
      tabId,
      rows: filtered,
    });

    const tabs = await this.listTabsForConnection(userId, sheetId);
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      await this.saveTabSchema(userId, {
        ...tab,
        rowCount: filtered.length,
        updatedAt: new Date().toISOString(),
      });
    }
  },

  /**
   * Atomically saves all rows for a tab.
   */
  async saveAllNativeRows(userId: string, sheetId: string, tabId: string, rows: SheetSyncedRow[]): Promise<void> {
    assertValidUserId(userId);
    await this.saveTabRowsChunked({
      userId,
      connectionId: sheetId,
      tabId,
      rows,
    });
  },

  /**
   * Enqueues an operation into the offline pending queue.
   */
  enqueuePendingOperation(
    userId: string,
    op: Omit<PendingSheetOperation, 'id' | 'createdAt' | 'attempts'>
  ): void {
    assertValidUserId(userId);
    enqueuePendingOp(userId, op);
  },

  /**
   * Returns all pending operations for a user (offline queue).
   */
  getPendingOperations(userId: string): PendingSheetOperation[] {
    assertValidUserId(userId);
    return readLocalFallback<PendingSheetOperation[]>(getPendingQueueKey(userId), []);
  },

  /**
   * Retries all pending operations queued during offline or failed cloud persistence.
   * Prevents silent last-write-wins data loss by verifying remote revision before overwriting.
   */
  async retryPendingOperations(userId: string): Promise<{ retried: number; succeeded: number; failed: number; conflicts: number }> {
    assertValidUserId(userId);
    const queue = readLocalFallback<PendingSheetOperation[]>(getPendingQueueKey(userId), []);
    if (queue.length === 0) return { retried: 0, succeeded: 0, failed: 0, conflicts: 0 };

    let succeeded = 0;
    let failed = 0;
    let conflicts = 0;
    const remaining: PendingSheetOperation[] = [];

    for (const op of queue) {
      try {
        if (op.type === 'connection') {
          // Check for concurrent newer cloud document before overwriting
          const cloudDoc = await this.getConnection(userId, op.connectionId);
          const pendingConn = op.payload as SheetConnection;
          if (cloudDoc && cloudDoc.updatedAt && pendingConn.updatedAt && cloudDoc.updatedAt > pendingConn.updatedAt) {
            conflicts++;
            remaining.push({
              ...op,
              attempts: op.attempts + 1,
              error: 'Conflict: cloud spreadsheet was updated more recently on another device',
            });
            continue;
          }
          await this.saveConnection(userId, pendingConn);
        } else if (op.type === 'index_sync') {
          // Recoverable index repair: update local fallback and attempt Firestore write if signed in
          const normalized = normalizeConnectionForFirestore(userId, op.payload as SheetConnection);
          const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
          const filtered = conns.filter((c) => c.id !== op.connectionId);
          filtered.unshift(normalized);
          writeLocalFallback(`ff_sheethub_conns_${userId}`, filtered);

          if (isSignedInAs(userId)) {
            await setDoc(
              doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), op.connectionId),
              normalized
            );
          }
        } else if (op.type === 'tab') {
          await this.saveTabSchema(userId, op.payload as SheetTabSchema);
        } else if (op.type === 'rows') {
          await this.saveTabRowsChunked({
            userId,
            connectionId: op.connectionId,
            tabId: op.tabId!,
            rows: op.payload as SheetSyncedRow[],
          });
        }
        succeeded++;
      } catch (err: any) {
        failed++;
        remaining.push({ ...op, attempts: op.attempts + 1, error: err?.message || 'Retry failed' });
      }
    }

    writeLocalFallback(getPendingQueueKey(userId), remaining);
    return { retried: queue.length, succeeded, failed, conflicts };
  },

  /**
   * Cleanly wipes all user-specific sheet caches when switching accounts or signing out.
   */
  clearUserCache(userId: string): void {
    assertValidUserId(userId);
    clientDataCache.invalidate(`_${userId}`);

    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith('ff_sheethub_') && k.includes(`_${userId}`))) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) window.localStorage.removeItem(k);
    }
    for (const k of inMemoryFallbackStore.keys()) {
      if (k.startsWith('ff_sheethub_') && k.includes(`_${userId}`)) {
        inMemoryFallbackStore.delete(k);
      }
    }
  },
};

