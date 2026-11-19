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

export const SHEET_HUB_COLLECTIONS = {
  sheets: 'sheets',
  connections: 'sheet_connections',
  tabs: 'sheet_tabs',
  rowChunks: 'sheet_row_chunks',
  syncQueue: 'sheet_sync_queue',
  conflicts: 'sheet_conflicts',
} as const;

function assertValidUserId(userId: string): void {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Valid userId is required for Sheet Hub operations.');
  }
}

function userCollectionPath(userId: string, subcollection: string): string {
  assertValidUserId(userId);
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
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_conns_${userId}`;
    const cached = clientDataCache.get<SheetConnection[]>(cacheKey, undefined, userId);
    if (cached) return cached;

    try {
      const snap = await getDocs(collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections)));
      const items = snap.docs
        .map((d) => d.data() as SheetConnection)
        .filter((c) => !c.deletedAt)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      clientDataCache.set(cacheKey, items, userId);
      writeLocalFallback(`ff_sheethub_conns_${userId}`, items);
      return items;
    } catch {
      // Local fallback for guest or offline mode
      const local = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
      clientDataCache.set(cacheKey, local, userId);
      return local;
    }
  },

  async getConnection(userId: string, connectionId: string): Promise<SheetConnection | null> {
    assertValidUserId(userId);
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
    assertValidUserId(userId);
    if (connection.userId && connection.userId !== userId) {
      throw new Error(`Cross-user ownership mutation forbidden. Cannot save connection for userId "${connection.userId}" under user "${userId}".`);
    }
    const sanitized = stripSensitiveFields({ ...connection, userId });
    
    // Update local mirror
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    const filtered = conns.filter((c) => c.id !== connection.id);
    filtered.unshift(sanitized);
    writeLocalFallback(`ff_sheethub_conns_${userId}`, filtered);

    try {
      // 1. Primary isolated storage in sheet_connections
      await setDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connection.id),
        sanitized
      );
      // 2. Dual-mirror in canonical per-user private sheets collection
      await setDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connection.id),
        sanitized
      );
    } catch {
      // Offline or guest mode continues smoothly
    }
    clientDataCache.invalidate(`sheet_hub_conns_${userId}`);
    clientDataCache.invalidate(`sheet_hub_private_sheets_${userId}`);
    return sanitized;
  },

  async deleteConnection(userId: string, connectionId: string, purgeData = true): Promise<void> {
    assertValidUserId(userId);
    const conns = readLocalFallback<SheetConnection[]>(`ff_sheethub_conns_${userId}`, []);
    writeLocalFallback(
      `ff_sheethub_conns_${userId}`,
      conns.filter((c) => c.id !== connectionId)
    );

    if (purgeData) {
      let tabs: SheetTabSchema[] = [];
      try {
        tabs = await this.listTabsForConnection(userId, connectionId);
      } catch {}
      const tabIds = new Set(tabs.map((t) => t.id));

      if (typeof window !== 'undefined' && window.localStorage) {
        // Remove any tab and row caches for this connection
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) {
            if (k.includes(connectionId)) keysToRemove.push(k);
            for (const tId of tabIds) {
              if (k.includes(tId)) keysToRemove.push(k);
            }
          }
        }
        for (const k of keysToRemove) window.localStorage.removeItem(k);
      }
      for (const k of inMemoryFallbackStore.keys()) {
        if (k.includes(connectionId)) {
          inMemoryFallbackStore.delete(k);
        } else {
          for (const tId of tabIds) {
            if (k.includes(tId)) inMemoryFallbackStore.delete(k);
          }
        }
      }
      for (const tId of tabIds) {
        clientDataCache.invalidate(`sheet_hub_rows_${userId}_${tId}`);
      }
    }

    try {
      await deleteDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.connections), connectionId)
      );
      await deleteDoc(
        doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.sheets), connectionId)
      );
    } catch {}
    clientDataCache.invalidate(`sheet_hub_conns_${userId}`);
    clientDataCache.invalidate(`sheet_hub_private_sheets_${userId}`);
    clientDataCache.invalidate(`sheet_hub_tabs_${userId}_${connectionId}`);
    clientDataCache.invalidate('sheet_hub_rows_');
  },

  async listTabsForConnection(userId: string, connectionId: string): Promise<SheetTabSchema[]> {
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_tabs_${userId}_${connectionId}`;
    const cached = clientDataCache.get<SheetTabSchema[]>(cacheKey, undefined, userId);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs)),
        where('connectionId', '==', connectionId)
      );
      const snap = await getDocs(q);
      const tabs = snap.docs.map((d) => d.data() as SheetTabSchema);
      clientDataCache.set(cacheKey, tabs, userId);
      writeLocalFallback(`ff_sheethub_tabs_${userId}_${connectionId}`, tabs);
      return tabs;
    } catch {
      const local = readLocalFallback<SheetTabSchema[]>(`ff_sheethub_tabs_${userId}_${connectionId}`, []);
      clientDataCache.set(cacheKey, local, userId);
      return local;
    }
  },

  async saveTabSchema(userId: string, tab: SheetTabSchema): Promise<SheetTabSchema> {
    assertValidUserId(userId);
    if (tab.userId && tab.userId !== userId) {
      throw new Error(`Cross-user ownership mutation forbidden. Cannot save tab schema for userId "${tab.userId}" under user "${userId}".`);
    }
    const sanitized = stripSensitiveFields({ ...tab, userId });
    const local = readLocalFallback<SheetTabSchema[]>(`ff_sheethub_tabs_${userId}_${tab.connectionId}`, []);
    const filtered = local.filter((t) => t.id !== tab.id);
    filtered.push(sanitized);
    writeLocalFallback(`ff_sheethub_tabs_${userId}_${tab.connectionId}`, filtered);

    try {
      await setDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tab.id), sanitized);
      await setDoc(doc(db, `users/${userId}/sheets/${tab.connectionId}/tabs/${tab.id}`), sanitized);
    } catch {}
    clientDataCache.invalidate(`sheet_hub_tabs_${userId}_${tab.connectionId}`);
    return sanitized;
  },

  async loadTabRows(userId: string, tabId: string): Promise<SheetSyncedRow[]> {
    assertValidUserId(userId);
    const cacheKey = `sheet_hub_rows_${userId}_${tabId}`;
    const cached = clientDataCache.get<SheetSyncedRow[]>(cacheKey, undefined, userId);
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
      clientDataCache.set(cacheKey, rows, userId);
      writeLocalFallback(`ff_sheethub_rows_${userId}_${tabId}`, rows);
      return rows;
    } catch {
      const local = readLocalFallback<SheetSyncedRow[]>(`ff_sheethub_rows_${userId}_${tabId}`, []);
      clientDataCache.set(cacheKey, local, userId);
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
    assertValidUserId(input.userId);
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
        const nestedRef = doc(db, `users/${input.userId}/sheets/${input.connectionId}/tabs/${input.tabId}/row_chunks/${chunk.id}`);
        batch.set(nestedRef, stripSensitiveFields(chunk as unknown as Record<string, unknown>));
      }
      for (const row of input.rows.slice(0, 100)) {
        const rowRef = doc(db, `users/${input.userId}/sheets/${input.connectionId}/tabs/${input.tabId}/rows/${row.rowUid}`);
        batch.set(rowRef, stripSensitiveFields({
          id: row.rowUid,
          sheetDocId: input.connectionId,
          tabId: input.tabId,
          userId: input.userId,
          ownerUid: input.userId,
          rowUid: row.rowUid,
          lastKnownSheetRow: row.lastKnownSheetRow,
          rowIndex: row.lastKnownSheetRow,
          values: row.values,
          cells: row.values,
          baseValues: row.baseValues || row.values,
          rowHash: row.rowHash,
          version: row.version,
          lastSyncOrigin: row.lastSyncOrigin || 'app',
          dirtyFields: row.dirtyFields || [],
          localUpdatedAt: row.localUpdatedAt,
          sheetSyncedAt: row.sheetSyncedAt || new Date().toISOString(),
          status: row.status,
          createdAt: row.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as Record<string, unknown>));
      }
      await batch.commit();
    } catch {
      // Local fallback saves data safely
    }
    clientDataCache.invalidate(`sheet_hub_rows_${input.userId}_${input.tabId}`);

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
    const q = query(
      collection(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.conflicts)),
      where('connectionId', '==', connectionId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as SheetConflict)
      .filter((c) => c.status === 'open');
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

    await this.saveConnection(userId, sheet);
    await this.saveTabSchema(userId, tab);
    await this.saveTabRowsChunked({ userId, connectionId: sheetId, tabId, rows });

    return { sheet, tab, rows };
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

    await this.saveTabSchema(userId, tab);
    await this.saveTabRowsChunked({ userId, connectionId: sheetId, tabId, rows: initialRows });

    const updatedTabOrder = [...existingSheet.tabOrder, tabId];
    await this.saveConnection(userId, { ...existingSheet, tabOrder: updatedTabOrder, updatedAt: now });

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
   * Deletes a tab from a native spreadsheet.
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

    try {
      await deleteDoc(doc(db, userCollectionPath(userId, SHEET_HUB_COLLECTIONS.tabs), tabId));
      await deleteDoc(doc(db, `users/${userId}/sheets/${sheetId}/tabs/${tabId}`));
    } catch {}

    const nextTabs = tabs.filter((t) => t.id !== tabId);
    writeLocalFallback(`ff_sheethub_tabs_${userId}_${sheetId}`, nextTabs);
    clientDataCache.invalidate(`sheet_hub_tabs_${userId}_${sheetId}`);
    clientDataCache.invalidate(`sheet_hub_rows_${userId}_${tabId}`);

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
   * Adds a column to a tab in a native spreadsheet.
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
    const colLetter = String.fromCharCode(65 + (colIndex % 26));
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

    const existingRows = await this.loadTabRows(userId, tabId);
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

