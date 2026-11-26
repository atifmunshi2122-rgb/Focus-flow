import { getAdminFirestore, hasServiceAccountCredentials } from './firebaseAdmin.js';
import { dbService } from './db.js';
import type {
  SkillNode,
  WhiteboardDrawing,
  ExamSimulationState,
  DecisionEntry,
  DoomscrollTaxEntry,
  LifeMilestone,
  TimeCapsuleLetter,
  EmergencyAssetProfile,
} from '../src/types/features15.js';

export class StorageOwnershipError extends Error {
  public readonly status = 403;
  public readonly code = 'FORBIDDEN_OWNERSHIP_VIOLATION';
  constructor(message = 'Access denied: Record is owned by another user') {
    super(message);
    this.name = 'StorageOwnershipError';
  }
}

export class StorageValidationError extends Error {
  public readonly status = 400;
  public readonly code = 'INVALID_PAYLOAD';
  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export class StorageNotFoundError extends Error {
  public readonly status = 404;
  public readonly code = 'NOT_FOUND';
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'StorageNotFoundError';
  }
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        out[k] = stripUndefined(v);
      } else {
        out[k] = v;
      }
    }
  }
  return out as T;
}

function wrapDbCall<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err: any) {
    if (err instanceof StorageOwnershipError || err instanceof StorageNotFoundError) throw err;
    if (err?.message?.includes('Forbidden')) {
      throw new StorageOwnershipError(err.message);
    }
    throw err;
  }
}

export class V18StorageService {
  private customFirestore: any = null;

  constructor(customFirestore?: any) {
    if (customFirestore) {
      this.customFirestore = customFirestore;
    }
  }

  public setFirestoreForTesting(db: any): void {
    this.customFirestore = db;
  }

  public isFirestoreAuthoritative(): boolean {
    if (this.customFirestore) return true;
    return hasServiceAccountCredentials();
  }

  private get firestore(): any {
    if (this.customFirestore) return this.customFirestore;
    return getAdminFirestore();
  }

  // -------------------------------------------------------------
  // 1. Skill Nodes
  // -------------------------------------------------------------
  public async getSkillNodes(userId: string): Promise<SkillNode[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('skill_nodes')
          .get();
        return snap.docs.map((d: any) => d.data() as SkillNode);
      } catch (err) {
        console.warn(`[V18Storage] Firestore getSkillNodes failed for ${userId}:`, err);
      }
    }
    return dbService.getSkillNodes(userId);
  }

  public async getSkillNode(userId: string, id: string): Promise<SkillNode | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('skill_nodes')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as SkillNode;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getSkillNode failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getSkillNode(id, userId));
  }

  public async saveSkillNode(userId: string, node: SkillNode): Promise<SkillNode> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeNode: SkillNode = {
      ...node,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('skill_nodes')
        .doc(safeNode.id);

      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }

      await docRef.set(stripUndefined(safeNode), { merge: true });
    }

    wrapDbCall(() => dbService.saveSkillNode(safeNode));
    return safeNode;
  }

  public async updateSkillNode(userId: string, id: string, updates: Partial<SkillNode>): Promise<SkillNode> {
    const existing = await this.getSkillNode(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Skill node with id ${id} not found`);
    }
    const merged: SkillNode = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
    };
    return this.saveSkillNode(userId, merged);
  }

  public async deleteSkillNode(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    // Verify ownership in dbService first (will throw 403 if owned by another user)
    const localDeleted = wrapDbCall(() => dbService.deleteSkillNode(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('skill_nodes')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  // -------------------------------------------------------------
  // 2. Whiteboard Drawings
  // -------------------------------------------------------------
  public async getWhiteboardDrawings(userId: string): Promise<WhiteboardDrawing[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('whiteboard_drawings')
          .orderBy('createdAt', 'desc')
          .get();
        return snap.docs.map((d: any) => d.data() as WhiteboardDrawing);
      } catch (err) {
        try {
          const snap = await this.firestore
            .collection('users')
            .doc(userId)
            .collection('whiteboard_drawings')
            .get();
          return snap.docs.map((d: any) => d.data() as WhiteboardDrawing);
        } catch {
          console.warn(`[V18Storage] Firestore getWhiteboardDrawings failed for ${userId}`);
        }
      }
    }
    return dbService.getWhiteboardDrawings(userId);
  }

  public async getWhiteboardDrawing(userId: string, id: string): Promise<WhiteboardDrawing | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('whiteboard_drawings')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as WhiteboardDrawing;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getWhiteboardDrawing failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getWhiteboardDrawing(id, userId));
  }

  public async saveWhiteboardDrawing(userId: string, drawing: WhiteboardDrawing): Promise<WhiteboardDrawing> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeDrawing: WhiteboardDrawing = {
      ...drawing,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('whiteboard_drawings')
        .doc(safeDrawing.id);

      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }

      await docRef.set(stripUndefined(safeDrawing), { merge: true });
    }

    wrapDbCall(() => dbService.saveWhiteboardDrawing(safeDrawing));
    return safeDrawing;
  }

  public async updateWhiteboardDrawing(userId: string, id: string, updates: Partial<WhiteboardDrawing>): Promise<WhiteboardDrawing> {
    const existing = await this.getWhiteboardDrawing(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Whiteboard drawing with id ${id} not found`);
    }
    const merged: WhiteboardDrawing = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
      updatedAt: new Date().toISOString(),
    };
    return this.saveWhiteboardDrawing(userId, merged);
  }

  public async deleteWhiteboardDrawing(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteWhiteboardDrawing(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('whiteboard_drawings')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  // -------------------------------------------------------------
  // 3. Exam Hall Simulator Sessions
  // -------------------------------------------------------------
  public async getExamSimulations(userId: string): Promise<ExamSimulationState[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('exam_simulations')
          .get();
        return snap.docs.map((d: any) => d.data() as ExamSimulationState);
      } catch (err) {
        console.warn(`[V18Storage] Firestore getExamSimulations failed for ${userId}:`, err);
      }
    }
    return dbService.getExamSimulations(userId);
  }

  public async getExamSimulation(userId: string, id: string): Promise<ExamSimulationState | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('exam_simulations')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as ExamSimulationState;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getExamSimulation failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getExamSimulation(id, userId));
  }

  public async saveExamSimulation(
    userId: string,
    sim: ExamSimulationState & { userId?: string }
  ): Promise<ExamSimulationState> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeSim: ExamSimulationState & { userId: string } = {
      ...sim,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('exam_simulations')
        .doc(safeSim.id);

      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }

      await docRef.set(stripUndefined(safeSim), { merge: true });
    }

    wrapDbCall(() => dbService.saveExamSimulation(safeSim));
    return safeSim;
  }

  public async updateExamSimulation(
    userId: string,
    id: string,
    updates: Partial<ExamSimulationState>
  ): Promise<ExamSimulationState> {
    const existing = await this.getExamSimulation(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Exam simulation with id ${id} not found`);
    }
    const merged = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
    };
    return this.saveExamSimulation(userId, merged);
  }

  public async deleteExamSimulation(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteExamSimulation(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('exam_simulations')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  // -------------------------------------------------------------
  // 4. Decision Journal
  // -------------------------------------------------------------
  public async getDecisionEntries(userId: string): Promise<DecisionEntry[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('decision_entries')
          .orderBy('createdAt', 'desc')
          .get();
        return snap.docs.map((d: any) => d.data() as DecisionEntry);
      } catch {
        try {
          const snap = await this.firestore
            .collection('users')
            .doc(userId)
            .collection('decision_entries')
            .get();
          return snap.docs.map((d: any) => d.data() as DecisionEntry);
        } catch (err) {
          console.warn(`[V18Storage] Firestore getDecisionEntries failed for ${userId}:`, err);
        }
      }
    }
    return dbService.getDecisionEntries(userId);
  }

  public async getDecisionEntry(userId: string, id: string): Promise<DecisionEntry | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('decision_entries')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as DecisionEntry;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getDecisionEntry failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getDecisionEntry(id, userId));
  }

  public async saveDecisionEntry(userId: string, entry: DecisionEntry): Promise<DecisionEntry> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeEntry: DecisionEntry = {
      ...entry,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('decision_entries')
        .doc(safeEntry.id);

      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }

      await docRef.set(stripUndefined(safeEntry), { merge: true });
    }

    wrapDbCall(() => dbService.saveDecisionEntry(safeEntry));
    return safeEntry;
  }

  public async updateDecisionEntry(userId: string, id: string, updates: Partial<DecisionEntry>): Promise<DecisionEntry> {
    const existing = await this.getDecisionEntry(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Decision entry with id ${id} not found`);
    }
    const merged: DecisionEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
    };
    return this.saveDecisionEntry(userId, merged);
  }

  public async deleteDecisionEntry(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteDecisionEntry(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('decision_entries')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  // -------------------------------------------------------------
  // 5. Doomscroll Tax Jar
  // -------------------------------------------------------------
  public async getDoomscrollLogs(userId: string): Promise<DoomscrollTaxEntry[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('doomscroll_logs')
          .orderBy('createdAt', 'desc')
          .get();
        return snap.docs.map((d: any) => d.data() as DoomscrollTaxEntry);
      } catch {
        try {
          const snap = await this.firestore
            .collection('users')
            .doc(userId)
            .collection('doomscroll_logs')
            .get();
          return snap.docs.map((d: any) => d.data() as DoomscrollTaxEntry);
        } catch (err) {
          console.warn(`[V18Storage] Firestore getDoomscrollLogs failed for ${userId}:`, err);
        }
      }
    }
    return dbService.getDoomscrollLogs(userId);
  }

  public async getDoomscrollLog(userId: string, id: string): Promise<DoomscrollTaxEntry | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('doomscroll_logs')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as DoomscrollTaxEntry;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getDoomscrollLog failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getDoomscrollLog(id, userId));
  }

  public async saveDoomscrollLog(userId: string, log: DoomscrollTaxEntry): Promise<DoomscrollTaxEntry> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeLog: DoomscrollTaxEntry = {
      ...log,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('doomscroll_logs')
        .doc(safeLog.id);

      await docRef.set(stripUndefined(safeLog), { merge: true });
    }

    wrapDbCall(() => dbService.saveDoomscrollLog(safeLog));
    return safeLog;
  }

  public async updateDoomscrollLog(userId: string, id: string, updates: Partial<DoomscrollTaxEntry>): Promise<DoomscrollTaxEntry> {
    const existing = await this.getDoomscrollLog(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Doomscroll log with id ${id} not found`);
    }
    const merged: DoomscrollTaxEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
    };
    return this.saveDoomscrollLog(userId, merged);
  }

  public async deleteDoomscrollLog(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteDoomscrollLog(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('doomscroll_logs')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  public async clearDoomscrollLogs(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('doomscroll_logs')
          .get();
        const docs = Array.isArray(snap?.docs) ? snap.docs : [];
        // Firestore batch writes are strictly capped at 500 operations per commit
        const BATCH_LIMIT = 450;
        for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
          const chunk = docs.slice(i, i + BATCH_LIMIT);
          const batch = this.firestore.batch();
          chunk.forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore clearDoomscrollLogs failed for ${userId}:`, err);
      }
    }
    return dbService.clearDoomscrollLogs(userId);
  }

  // -------------------------------------------------------------
  // 6. Life Milestones (Life-in-Weeks Grid)
  // -------------------------------------------------------------
  public async getLifeMilestones(userId: string): Promise<LifeMilestone[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('life_milestones')
          .get();
        return snap.docs.map((d: any) => d.data() as LifeMilestone);
      } catch (err) {
        console.warn(`[V18Storage] Firestore getLifeMilestones failed for ${userId}:`, err);
      }
    }
    return dbService.getLifeMilestones(userId);
  }

  public async getLifeMilestone(userId: string, id: string): Promise<LifeMilestone | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('life_milestones')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as LifeMilestone;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getLifeMilestone failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getLifeMilestone(id, userId));
  }

  public async saveLifeMilestone(userId: string, milestone: LifeMilestone): Promise<LifeMilestone> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeMilestone = {
      ...milestone,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('life_milestones')
        .doc(safeMilestone.id);

      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }

      await docRef.set(stripUndefined(safeMilestone), { merge: true });
    }

    wrapDbCall(() => dbService.saveLifeMilestone(safeMilestone as any));
    return safeMilestone;
  }

  public async updateLifeMilestone(userId: string, id: string, updates: Partial<LifeMilestone>): Promise<LifeMilestone> {
    const existing = await this.getLifeMilestone(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Life milestone with id ${id} not found`);
    }
    const merged: LifeMilestone = {
      ...existing,
      ...updates,
      id: existing.id,
    };
    return this.saveLifeMilestone(userId, merged);
  }

  public async deleteLifeMilestone(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteLifeMilestone(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('life_milestones')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  // -------------------------------------------------------------
  // 7. Time Capsule Letters
  // -------------------------------------------------------------
  public async getTimeCapsules(userId: string): Promise<TimeCapsuleLetter[]> {
    if (!userId) return [];
    if (this.isFirestoreAuthoritative()) {
      try {
        const snap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('time_capsules')
          .orderBy('createdAt', 'desc')
          .get();
        return snap.docs.map((d: any) => d.data() as TimeCapsuleLetter);
      } catch {
        try {
          const snap = await this.firestore
            .collection('users')
            .doc(userId)
            .collection('time_capsules')
            .get();
          return snap.docs.map((d: any) => d.data() as TimeCapsuleLetter);
        } catch (err) {
          console.warn(`[V18Storage] Firestore getTimeCapsules failed for ${userId}:`, err);
        }
      }
    }
    return dbService.getTimeCapsules(userId);
  }

  public async getTimeCapsule(userId: string, id: string): Promise<TimeCapsuleLetter | null> {
    if (!userId || !id) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('time_capsules')
          .doc(id)
          .get();
        if (docSnap.exists) {
          return docSnap.data() as TimeCapsuleLetter;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getTimeCapsule failed for ${userId}/${id}:`, err);
      }
    }
    return wrapDbCall(() => dbService.getTimeCapsule(id, userId));
  }

  public async saveTimeCapsule(userId: string, capsule: TimeCapsuleLetter): Promise<TimeCapsuleLetter> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeCapsule: TimeCapsuleLetter = {
      ...capsule,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('time_capsules')
        .doc(safeCapsule.id);

      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        if (data.userId && data.userId !== userId) {
          throw new StorageOwnershipError();
        }
      }

      await docRef.set(stripUndefined(safeCapsule), { merge: true });
    }

    wrapDbCall(() => dbService.saveTimeCapsule(safeCapsule));
    return safeCapsule;
  }

  public async updateTimeCapsule(userId: string, id: string, updates: Partial<TimeCapsuleLetter>): Promise<TimeCapsuleLetter> {
    const existing = await this.getTimeCapsule(userId, id);
    if (!existing) {
      throw new StorageNotFoundError(`Time capsule with id ${id} not found`);
    }
    const merged: TimeCapsuleLetter = {
      ...existing,
      ...updates,
      id: existing.id,
      userId,
    };
    return this.saveTimeCapsule(userId, merged);
  }

  public async deleteTimeCapsule(userId: string, id: string): Promise<boolean> {
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteTimeCapsule(id, userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('time_capsules')
        .doc(id);
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }

  // -------------------------------------------------------------
  // 8. Emergency & Asset Profile
  // -------------------------------------------------------------
  public async getEmergencyProfile(userId: string): Promise<EmergencyAssetProfile | null> {
    if (!userId) return null;
    if (this.isFirestoreAuthoritative()) {
      try {
        const docSnap = await this.firestore
          .collection('users')
          .doc(userId)
          .collection('emergency_profile')
          .doc('default')
          .get();
        if (docSnap.exists) {
          return docSnap.data() as EmergencyAssetProfile;
        }
      } catch (err) {
        console.warn(`[V18Storage] Firestore getEmergencyProfile failed for ${userId}:`, err);
      }
    }
    return dbService.getEmergencyProfile(userId);
  }

  public async saveEmergencyProfile(
    userId: string,
    profile: EmergencyAssetProfile
  ): Promise<EmergencyAssetProfile> {
    if (!userId) throw new StorageOwnershipError('Authentication required');
    const safeProfile: EmergencyAssetProfile = {
      ...profile,
      id: `ep_${userId}`,
      userId,
    };

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('emergency_profile')
        .doc('default');

      // Full replacement ensures cleared optional fields (e.g. bloodGroup, primaryHospital, instructionsNote)
      // are actually removed instead of remaining sticky via merge: true.
      await docRef.set(stripUndefined(safeProfile));
    }

    wrapDbCall(() => dbService.saveEmergencyProfile(safeProfile));
    return safeProfile;
  }

  public async deleteEmergencyProfile(userId: string): Promise<boolean> {
    if (!userId) return false;
    let deleted = false;
    const localDeleted = wrapDbCall(() => dbService.deleteEmergencyProfile(userId));

    if (this.isFirestoreAuthoritative()) {
      const docRef = this.firestore
        .collection('users')
        .doc(userId)
        .collection('emergency_profile')
        .doc('default');
      const existing = await docRef.get();
      if (existing.exists) {
        await docRef.delete();
        deleted = true;
      }
    }
    return deleted || localDeleted;
  }
}

export const v18StorageService = new V18StorageService();
