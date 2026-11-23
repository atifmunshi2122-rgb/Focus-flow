/**
 * FocusFlow & Finance — Study OS Import History & Source Tracking Store (Step 5)
 *
 * Scopes documents under `users/{userId}/settings/`:
 * - `study_import_sources`: Tracks connected spreadsheets as Study OS syllabus sources.
 * - `study_import_history`: Chronological audit trail of all sheet-to-study import runs.
 *
 * Guarantees:
 * 1. Zero access tokens, OAuth credentials, or private keys stored.
 * 2. Multi-tenant user isolation under `isOwner(userId)`.
 * 3. Graceful localStorage fallback for guests, offline mode, and unit tests.
 * 4. Removing a source or history record NEVER mutates or deletes Study OS content.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.ts';
import type {
  StudyImportHistoryRecord,
  StudyImportSource,
} from '../../types/study.ts';

const MAX_HISTORY_ITEMS = 100;
const inMemoryFallbackStore = new Map<string, string>();

function isSignedInAs(userId: string): boolean {
  return Boolean(auth?.currentUser && auth.currentUser.uid === userId);
}

function getLocalSourcesKey(userId: string): string {
  return `ff_study_import_sources_${userId}`;
}

function getLocalHistoryKey(userId: string): string {
  return `ff_study_import_history_${userId}`;
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : fallback;
    }
    const mem = inMemoryFallbackStore.get(key);
    return mem ? (JSON.parse(mem) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson<T>(key: string, data: T): void {
  try {
    const serialized = JSON.stringify(data);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, serialized);
    }
    inMemoryFallbackStore.set(key, serialized);
  } catch {
    // Ignore storage quota errors in test or private browsing
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export const studyImportHistoryStore = {
  /**
   * Retrieves all registered Study OS import sources for a user.
   */
  async getImportSources(userId: string): Promise<StudyImportSource[]> {
    if (!userId) return [];

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_sources`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.sources)) {
            safeWriteJson(getLocalSourcesKey(userId), data.sources);
            return data.sources as StudyImportSource[];
          }
        }
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to read sources from Firestore, using local fallback:', err);
      }
    }

    return safeReadJson<StudyImportSource[]>(getLocalSourcesKey(userId), []);
  },

  /**
   * Saves or updates an import source record.
   */
  async saveImportSource(userId: string, source: StudyImportSource): Promise<void> {
    if (!userId || !source.id) return;

    const existingSources = await this.getImportSources(userId);
    const index = existingSources.findIndex(
      (s) => s.id === source.id || s.spreadsheetId === source.spreadsheetId
    );

    let updatedList: StudyImportSource[];
    if (index >= 0) {
      updatedList = existingSources.map((s, idx) => (idx === index ? { ...s, ...source, updatedAt: new Date().toISOString() } : s));
    } else {
      updatedList = [source, ...existingSources];
    }

    safeWriteJson(getLocalSourcesKey(userId), updatedList);

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_sources`);
        await setDoc(ref, { sources: updatedList, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to persist source to Firestore:', err);
      }
    }
  },

  /**
   * Marks a source as untracked. Does NOT delete Study OS content.
   */
  async setSourceUntracked(userId: string, sourceId: string): Promise<void> {
    if (!userId || !sourceId) return;

    const sources = await this.getImportSources(userId);
    const updated = sources.map((s) => {
      if (s.id === sourceId || s.spreadsheetId === sourceId) {
        return { ...s, status: 'untracked' as const, updatedAt: new Date().toISOString() };
      }
      return s;
    });

    safeWriteJson(getLocalSourcesKey(userId), updated);

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_sources`);
        await setDoc(ref, { sources: updated, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to update source status in Firestore:', err);
      }
    }
  },

  /**
   * Removes import source metadata.
   * GUARANTEE: Only deletes the tracking record, NEVER touches Study OS subjects or topics.
   */
  async deleteImportSource(userId: string, sourceId: string): Promise<void> {
    if (!userId || !sourceId) return;

    const sources = await this.getImportSources(userId);
    const filtered = sources.filter((s) => s.id !== sourceId && s.spreadsheetId !== sourceId);

    safeWriteJson(getLocalSourcesKey(userId), filtered);

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_sources`);
        await setDoc(ref, { sources: filtered, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to delete source from Firestore:', err);
      }
    }
  },

  /**
   * Retrieves the chronological import history for a user, optionally filtered by spreadsheet.
   */
  async getImportHistory(userId: string, sourceSpreadsheetId?: string): Promise<StudyImportHistoryRecord[]> {
    if (!userId) return [];

    let list: StudyImportHistoryRecord[] = [];

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_history`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.history)) {
            list = data.history as StudyImportHistoryRecord[];
            safeWriteJson(getLocalHistoryKey(userId), list);
          }
        }
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to read history from Firestore, using local fallback:', err);
      }
    }

    if (list.length === 0) {
      list = safeReadJson<StudyImportHistoryRecord[]>(getLocalHistoryKey(userId), []);
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());

    if (sourceSpreadsheetId) {
      return list.filter((r) => r.sourceSpreadsheetId === sourceSpreadsheetId);
    }
    return list;
  },

  /**
   * Records a new import operation in history and updates source metadata.
   */
  async recordImportHistory(userId: string, record: StudyImportHistoryRecord): Promise<void> {
    if (!userId || !record.id) return;

    const existingHistory = await this.getImportHistory(userId);
    const cleanRecord = stripUndefined({
      ...record,
      importedAt: record.importedAt || new Date().toISOString(),
    }) as StudyImportHistoryRecord;

    const updatedHistory = [cleanRecord, ...existingHistory.filter((h) => h.id !== record.id)].slice(
      0,
      MAX_HISTORY_ITEMS
    );

    safeWriteJson(getLocalHistoryKey(userId), updatedHistory);

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_history`);
        await setDoc(ref, { history: updatedHistory, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to write import history to Firestore:', err);
      }
    }

    // Automatically update or register the source record
    try {
      const sources = await this.getImportSources(userId);
      const existingSource = sources.find((s) => s.spreadsheetId === record.sourceSpreadsheetId);
      const nowIso = new Date().toISOString();

      const newSubjectCodes = record.details?.map((d) => d.subjectCode) || [];
      const mergedCodes = Array.from(
        new Set([...(existingSource?.importedSubjectCodes || []), ...newSubjectCodes])
      );

      const sourceDoc: StudyImportSource = {
        id: existingSource?.id || `src_${record.sourceSpreadsheetId}`,
        userId,
        spreadsheetId: record.sourceSpreadsheetId,
        spreadsheetTitle: record.sourceSpreadsheetTitle,
        spreadsheetUrl: existingSource?.spreadsheetUrl || null,
        targetTierId: record.targetTierId,
        targetTierName: record.targetTierName || existingSource?.targetTierName,
        importedSubjectCodes: mergedCodes,
        lastImportedAt: nowIso,
        firstImportedAt: existingSource?.firstImportedAt || nowIso,
        status: 'active',
        totalImportsCount: (existingSource?.totalImportsCount || 0) + 1,
        createdAt: existingSource?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await this.saveImportSource(userId, sourceDoc);
    } catch (err) {
      console.warn('[studyImportHistoryStore] Failed to auto-update import source:', err);
    }
  },

  /**
   * Clears the user's import history list.
   */
  async clearImportHistory(userId: string): Promise<void> {
    if (!userId) return;

    safeWriteJson(getLocalHistoryKey(userId), []);

    if (isSignedInAs(userId)) {
      try {
        const ref = doc(db, `users/${userId}/settings/study_import_history`);
        await setDoc(ref, { history: [], updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        console.warn('[studyImportHistoryStore] Failed to clear import history from Firestore:', err);
      }
    }
  },
};
