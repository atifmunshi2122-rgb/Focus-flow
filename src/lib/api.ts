import {
  User,
  UserSettings,
  Task,
  FocusSession,
  ExpenseCategory,
  RecurringExpense,
  Bill,
  PaymentHistory,
  IncomeTransaction,
  ExpenseTransaction,
  DashboardData,
  FinanceSummaryData,
  FocusStatsData,
  SavingsGoal,
  TrashRecord,
  TimeBlock,
  Habit,
  BudgetEnvelope,
  SubscriptionPlan,
  AuditLogEntry,
  DurableSyncOperation,
  CursorPage,
  OfflineOutboxOperation,
  AcademicTier,
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyMistake,
  StudyGoal,
  StudyPlan,
  StudyPlanTask,
  StudyResource,
  StudyExam,
  StudyNote,
  StudyActivityLog,
  StudyFlashcard,
  StudyQuiz,
  PomodoroSettings,
  PomodoroGoal,
  PomodoroPreset,
  PomodoroInterruption,
  PomodoroAmbientPreset,
  CurrencyCode,
  JointVault,
  VaultMember,
  VaultInvitation,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
  VaultSummary,
  ExpenseSplitMode,
} from '../types/index.ts';
import { auth, getFirebaseIdToken, waitForInitialAuth } from './firebase.ts';
import { firestoreService } from './firestoreService.ts';
import { offlineOutbox } from './offlineOutbox.ts';
import { clientDataCache } from './dataCache.ts';
import { handleGuestLocalFallback } from './guestLocalStore.ts';
import type { SheetsSnapshotPayload } from './sheetsSpec.ts';
import type {
  SheetHubCellUpdateRequest,
  SheetHubPushCellsResponse,
  SheetInspectResponse,
  SheetPullResponse,
  SheetPullTabRequest,
} from '../types/sheetHub.ts';

const BASE_URL = import.meta.env?.VITE_API_URL || '/api';
const GUEST_SESSION_KEY = 'ff_guest_session_id';
let guestServerRequiresAuth = false;

function readGuestStore<T>(bucket: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(`ff_guest_${bucket}_${getOrCreateGuestSessionId()}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeGuestStore<T>(bucket: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`ff_guest_${bucket}_${getOrCreateGuestSessionId()}`, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

function getOrCreateGuestSessionId(): string {
  try {
    const existing = localStorage.getItem(GUEST_SESSION_KEY);
    if (existing && /^gst_[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const created = `gst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(GUEST_SESSION_KEY, created);
    return created;
  } catch {
    return `gst_${Date.now().toString(36)}_fallback`;
  }
}

async function resolveAuthHeaders(): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return { 'x-demo-session': getOrCreateGuestSessionId() };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await resolveAuthHeaders();
  const isUnauthenticatedGuest = !auth.currentUser && !('Authorization' in authHeaders);

  // If this session already discovered the production API requires auth (401),
  // serve isolated local guest storage directly without spamming console 401s.
  if (isUnauthenticatedGuest && guestServerRequiresAuth) {
    const guestResult = handleGuestLocalFallback(getOrCreateGuestSessionId(), endpoint, options);
    if (guestResult !== undefined) {
      return guestResult as T;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && isUnauthenticatedGuest) {
    guestServerRequiresAuth = true;
    const guestResult = handleGuestLocalFallback(getOrCreateGuestSessionId(), endpoint, options);
    if (guestResult !== undefined) {
      return guestResult as T;
    }
  }

  if (!response.ok) {
    let errorMsg = `API Error: ${response.status} ${response.statusText}`;
    let errorCode: string | undefined;
    try {
      const errorData = (await response.json()) as { error?: string; code?: string };
      if (errorData.error) errorMsg = errorData.error;
      if (typeof errorData.code === 'string') errorCode = errorData.code;
    } catch {
      // ignore non-JSON error body
    }
    const apiErr = new Error(errorMsg) as Error & { status?: number; code?: string };
    apiErr.status = response.status;
    if (errorCode) apiErr.code = errorCode;
    throw apiErr;
  }

  return response.json();
}

export function isTransientFirestoreError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    code.includes('unavailable') ||
    code.includes('network') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network')
  );
}

/**
 * Reads: When signed in with Firebase, Firestore is the sole source of truth.
 * Signed-in users NEVER fall back to Express JSON reads so source of truth never diverges.
 * Supports caching & in-flight request deduplication via clientDataCache.
 */
async function withPrimaryRead<T>(
  cloudFn: (userId: string) => Promise<T>,
  guestApiFn: () => Promise<T>,
  cacheKey?: string,
  ttlMs?: number
): Promise<T> {
  const execute = async () => {
    const fbUser = await waitForInitialAuth();
    if (fbUser && auth.currentUser?.uid === fbUser.uid) {
      try {
        return await cloudFn(fbUser.uid);
      } catch (err) {
        // Only route to guest mode if the user genuinely signed out while this read was in flight.
        if (!auth.currentUser) {
          return guestApiFn();
        }
        throw err;
      }
    }
    return guestApiFn();
  };

  if (!cacheKey) {
    return execute();
  }

  const cached = clientDataCache.get<T>(cacheKey, ttlMs);
  if (cached !== null) {
    return cached;
  }

  return clientDataCache.dedupe(cacheKey, async () => {
    try {
      const result = await execute();
      clientDataCache.set(cacheKey, result);
      return result;
    } catch (err) {
      const stale = clientDataCache.getWithStale<T>(cacheKey, ttlMs);
      if (stale.data !== null) {
        return stale.data;
      }
      throw err;
    }
  });
}

/**
 * Writes: When signed in with Firebase, writes execute against Firestore.
 * If Firestore fails transiently offline/unavailable, enqueue into the per-user durable Offline Outbox
 * and return an optimistic response — NEVER write signed-in records into Express JSON storage.
 */
async function withPrimaryWrite<T>(
  cloudFn: (userId: string) => Promise<T>,
  guestApiFn: () => Promise<T>,
  offlineHandler?: {
    operationType: OfflineOutboxOperation['operationType'];
    dedupeKey: string;
    payload: Record<string, unknown>;
    optimisticResult: (userId: string) => T;
  },
  invalidateDomain?: string
): Promise<T> {
  const triggerInvalidation = () => {
    if (invalidateDomain) {
      clientDataCache.invalidate(invalidateDomain);
    } else if (offlineHandler) {
      const op = offlineHandler.operationType;
      if (op.includes('task')) clientDataCache.invalidate('tasks');
      if (op.includes('focus') || op.includes('pomodoro') || op.includes('interruption')) clientDataCache.invalidate('focus_sessions');
      if (op.includes('income')) { clientDataCache.invalidate('incomes'); clientDataCache.invalidate('transactions'); }
      if (op.includes('expense')) { clientDataCache.invalidate('expenses'); clientDataCache.invalidate('transactions'); }
      if (op.includes('bill')) clientDataCache.invalidate('bills');
      if (op.includes('habit')) clientDataCache.invalidate('habits');
      if (op.includes('study')) clientDataCache.invalidate('study');
      if (op.includes('envelope')) clientDataCache.invalidate('envelopes');
      if (op.includes('savings_goal')) clientDataCache.invalidate('savings_goals');
      if (op.includes('subscription')) clientDataCache.invalidate('subscriptions');
      clientDataCache.invalidate('dashboard');
    }
  };

  const fbUser = await waitForInitialAuth();
  if (fbUser && auth.currentUser?.uid === fbUser.uid) {
    try {
      const res = await cloudFn(fbUser.uid);
      triggerInvalidation();
      return res;
    } catch (err) {
      if (offlineHandler && isTransientFirestoreError(err)) {
        offlineOutbox.enqueue(
          fbUser.uid,
          offlineHandler.operationType,
          offlineHandler.payload,
          offlineHandler.dedupeKey
        );
        triggerInvalidation();
        return offlineHandler.optimisticResult(fbUser.uid);
      }
      throw err;
    }
  }
  const guestRes = await guestApiFn();
  triggerInvalidation();
  return guestRes;
}

async function applyOfflineOutboxOp(userId: string, op: OfflineOutboxOperation): Promise<void> {
  const p = op.payload;
  switch (op.operationType) {
    case 'update_settings':
      await firestoreService.updateSettingsAndReturn(userId, p as Partial<UserSettings>);
      return;
    case 'create_task':
      await firestoreService.createTask(userId, p as Partial<Task>);
      return;
    case 'update_task':
      await firestoreService.updateTask(userId, String(p.id), p.updates as Partial<Task>);
      return;
    case 'delete_task':
      await firestoreService.deleteTask(userId, String(p.id));
      return;
    case 'create_focus_session':
      await firestoreService.createFocusSession(userId, p as Partial<FocusSession>);
      return;
    case 'update_focus_session':
      await firestoreService.updateFocusSession(
        userId,
        String(p.id),
        p.updates as Partial<FocusSession>
      );
      return;
    case 'record_interruption':
      await firestoreService.recordInterruption(
        userId,
        String(p.sessionId),
        p.interruption as Partial<PomodoroInterruption>
      );
      return;
    case 'save_pomodoro_goal':
      await firestoreService.savePomodoroGoal(userId, p as Partial<PomodoroGoal>);
      return;
    case 'delete_pomodoro_goal':
      await firestoreService.deletePomodoroGoal(userId, String(p.id));
      return;
    case 'save_pomodoro_preset':
      await firestoreService.savePomodoroPreset(userId, p as Partial<PomodoroPreset>);
      return;
    case 'delete_pomodoro_preset':
      await firestoreService.deletePomodoroPreset(userId, String(p.id));
      return;
    case 'create_income':
      await firestoreService.createIncome(userId, p as Partial<IncomeTransaction>);
      return;
    case 'update_income':
      await firestoreService.updateIncome(userId, String(p.id), p.updates as Partial<IncomeTransaction>);
      return;
    case 'delete_income':
      await firestoreService.deleteIncome(userId, String(p.id));
      return;
    case 'create_expense':
      await firestoreService.createExpense(userId, p as Partial<ExpenseTransaction>);
      return;
    case 'update_expense':
      await firestoreService.updateExpense(userId, String(p.id), p.updates as Partial<ExpenseTransaction>);
      return;
    case 'delete_expense':
      await firestoreService.deleteExpense(userId, String(p.id));
      return;
    case 'create_recurring':
      await firestoreService.createRecurringExpense(userId, p as Partial<RecurringExpense>);
      return;
    case 'update_recurring':
      await firestoreService.updateRecurringExpense(
        userId,
        String(p.id),
        p.updates as Partial<RecurringExpense>
      );
      return;
    case 'delete_recurring':
      await firestoreService.deleteRecurringExpense(userId, String(p.id));
      return;
    case 'create_bill':
      await firestoreService.createBill(userId, p as Partial<Bill>);
      return;
    case 'pay_bill':
      await firestoreService.payBill(
        userId,
        String(p.id),
        typeof p.paidDate === 'string' ? p.paidDate : undefined,
        (p.paymentMethod as PaymentHistory['paymentMethod']) || 'upi_bank',
        typeof p.notes === 'string' ? p.notes : undefined,
        typeof p.idempotencyKey === 'string' ? p.idempotencyKey : undefined
      );
      return;
    case 'undo_bill_payment':
      await firestoreService.undoBillPayment(userId, String(p.id));
      return;
    case 'delete_bill':
      await firestoreService.deleteBill(userId, String(p.id));
      return;
    case 'save_time_block':
      await firestoreService.saveTimeBlock(userId, p as Partial<TimeBlock>);
      return;
    case 'delete_time_block':
      await firestoreService.deleteTimeBlock(userId, String(p.id));
      return;
    case 'save_envelope':
      await firestoreService.saveEnvelope(userId, p as Partial<BudgetEnvelope>);
      return;
    case 'delete_envelope':
      await firestoreService.deleteEnvelope(userId, String(p.id));
      return;
    case 'save_subscription':
      await firestoreService.saveSubscription(userId, p as Partial<SubscriptionPlan>);
      return;
    case 'delete_subscription':
      await firestoreService.deleteSubscription(userId, String(p.id));
      return;
    case 'create_savings_goal':
      await firestoreService.createSavingsGoal(userId, p as Partial<SavingsGoal>);
      return;
    case 'update_savings_goal':
      await firestoreService.updateSavingsGoal(userId, String(p.id), p.updates as Partial<SavingsGoal>);
      return;
    case 'contribute_savings_goal':
      await firestoreService.contributeSavingsGoal(userId, String(p.id), Number(p.deltaPaise));
      return;
    case 'delete_savings_goal':
      await firestoreService.deleteSavingsGoal(userId, String(p.id));
      return;
    case 'save_habit':
      await firestoreService.saveHabit(userId, p as Partial<Habit>);
      return;
    case 'toggle_habit':
      await firestoreService.toggleHabitCompletion(userId, String(p.id), String(p.dateStr));
      return;
    case 'delete_habit':
      await firestoreService.deleteHabit(userId, String(p.id));
      return;
    case 'save_study_tier':
      await firestoreService.saveStudyTier(userId, p as Partial<AcademicTier>);
      return;
    case 'delete_study_tier':
      await firestoreService.deleteStudyTier(userId, String(p.id));
      return;
    case 'save_study_subject':
      await firestoreService.saveStudySubject(userId, p as Partial<StudySubject>);
      return;
    case 'delete_study_subject':
      await firestoreService.deleteStudySubject(userId, String(p.id));
      return;
    case 'save_study_topic':
      await firestoreService.saveStudyTopic(userId, p as Partial<StudyTopic>);
      return;
    case 'delete_study_topic':
      await firestoreService.deleteStudyTopic(userId, String(p.id));
      return;
    case 'save_study_revision':
      await firestoreService.saveStudyRevision(userId, p as Partial<StudyRevision>);
      return;
    case 'record_study_recall':
      await firestoreService.recordStudyRecall(userId, String(p.id), p.difficulty as 'easy' | 'medium' | 'hard');
      return;
    case 'delete_study_revision':
      await firestoreService.deleteStudyRevision(userId, String(p.id));
      return;
    case 'save_study_mistake':
      await firestoreService.saveStudyMistake(userId, p as Partial<StudyMistake>);
      return;
    case 'delete_study_mistake':
      await firestoreService.deleteStudyMistake(userId, String(p.id));
      return;
    case 'save_study_goal':
      await firestoreService.saveStudyGoal(userId, p as Partial<StudyGoal>);
      return;
    case 'delete_study_goal':
      await firestoreService.deleteStudyGoal(userId, String(p.id));
      return;
    case 'save_study_flashcard':
      await firestoreService.saveStudyFlashcard(userId, p as Partial<StudyFlashcard>);
      return;
    case 'delete_study_flashcard':
      await firestoreService.deleteStudyFlashcard(userId, String(p.id));
      return;
    case 'save_study_quiz':
      await firestoreService.saveStudyQuiz(userId, p as Partial<StudyQuiz>);
      return;
    case 'delete_study_quiz':
      await firestoreService.deleteStudyQuiz(userId, String(p.id));
      return;
    case 'save_study_plan':
      await firestoreService.saveStudyPlan(userId, p as Partial<StudyPlan>);
      return;
    case 'delete_study_plan':
      await firestoreService.deleteStudyPlan(userId, String(p.id));
      return;
    case 'save_study_plan_task':
      await firestoreService.saveStudyPlanTask(userId, p as Partial<StudyPlanTask>);
      return;
    case 'delete_study_plan_task':
      await firestoreService.deleteStudyPlanTask(userId, String(p.id));
      return;
    case 'save_study_note':
      await firestoreService.saveStudyNote(userId, p as Partial<StudyNote>);
      return;
    case 'delete_study_note':
      await firestoreService.deleteStudyNote(userId, String(p.id));
      return;
    case 'save_study_exam':
      await firestoreService.saveStudyExam(userId, p as Partial<StudyExam>);
      return;
    case 'delete_study_exam':
      await firestoreService.deleteStudyExam(userId, String(p.id));
      return;
    case 'save_study_resource':
      await firestoreService.saveStudyResource(userId, p as Partial<StudyResource>);
      return;
    case 'delete_study_resource':
      await firestoreService.deleteStudyResource(userId, String(p.id));
      return;
  }
}

export const api = {
  // Offline Outbox Reconciliation
  getOfflineOutboxCount: (userId?: string): number => {
    const uid = userId || auth.currentUser?.uid;
    return uid ? offlineOutbox.count(uid) : 0;
  },

  getOfflineOutboxItems: (userId?: string): OfflineOutboxOperation[] => {
    const uid = userId || auth.currentUser?.uid;
    return uid ? offlineOutbox.list(uid) : [];
  },

  reconcileOfflineOutbox: async (userId?: string): Promise<{ reconciled: number; failed: number }> => {
    const uid = userId || auth.currentUser?.uid;
    if (!uid) return { reconciled: 0, failed: 0 };
    const ops = offlineOutbox.list(uid);
    if (ops.length === 0) return { reconciled: 0, failed: 0 };

    let reconciled = 0;
    let failed = 0;

    for (const op of ops) {
      if (!offlineOutbox.isEligibleForRetry(op)) {
        continue;
      }

      try {
        await applyOfflineOutboxOp(uid, op);
        offlineOutbox.remove(uid, op.id);
        reconciled++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reconciliation failed';
        offlineOutbox.recordError(uid, op.id, msg);
        failed++;
        if (isTransientFirestoreError(err)) {
          break;
        }
      }
    }
    return { reconciled, failed };
  },

  // Auth & Settings
  getMe: async (): Promise<{ user: User; settings: UserSettings }> => {
    const fbUser = await waitForInitialAuth();
    if (fbUser && auth.currentUser?.uid === fbUser.uid) {
      try {
        return await firestoreService.getMe(fbUser);
      } catch (err) {
        if (!auth.currentUser) {
          return request<{ user: User; settings: UserSettings }>('/auth/me');
        }
        throw err;
      }
    }
    return request<{ user: User; settings: UserSettings }>('/auth/me');
  },

  updateSettings: (settings: Partial<UserSettings>) =>
    withPrimaryWrite(
      async (uid) => ({
        success: true,
        settings: await firestoreService.updateSettingsAndReturn(uid, settings),
      }),
      () =>
        request<{ success: boolean; settings: UserSettings }>('/settings', {
          method: 'PUT',
          body: JSON.stringify(settings),
        }),
      {
        operationType: 'update_settings',
        dedupeKey: 'settings_default',
        payload: settings as Record<string, unknown>,
        optimisticResult: (uid) => ({
          success: true,
          settings: { userId: uid, ...settings } as UserSettings,
        }),
      }
    ),

  reseed: () =>
    withPrimaryWrite(
      async (uid) => {
        offlineOutbox.clear(uid);
        await firestoreService.reseedWorkspace(uid);
        return { success: true, message: 'Cloud workspace reset cleanly' };
      },
      () => request<{ success: boolean; message: string }>('/reseed', { method: 'POST' })
    ),

  clearWorkspace: () =>
    withPrimaryWrite(
      async (uid) => {
        offlineOutbox.clear(uid);
        await firestoreService.reseedWorkspace(uid);
        return { success: true, message: 'Workspace cleared cleanly' };
      },
      () => request<{ success: boolean; message: string }>('/workspace/clear', { method: 'POST' })
    ),

  // Unified Dashboard
  getDashboard: () =>
    withPrimaryRead(
      (uid) => firestoreService.getDashboard(uid),
      () => request<DashboardData>('/dashboard'),
      'dashboard',
      90 * 1000
    ),

  // Focus & Pomodoro
  getFocusSessions: () =>
    withPrimaryRead(
      (uid) => firestoreService.getFocusSessions(uid),
      () => request<FocusSession[]>('/focus/sessions'),
      'focus_sessions',
      120 * 1000
    ),

  getFocusSessionsPage: (pageSize = 50, cursor?: string | null) =>
    withPrimaryRead(
      (uid) => firestoreService.getFocusSessionsPage(uid, pageSize, cursor),
      async () => {
        const all = await request<FocusSession[]>('/focus/sessions');
        const filtered = cursor ? all.filter((s) => s.startedAt < cursor) : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.startedAt || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<FocusSession>;
      }
    ),

  createFocusSession: (session: Partial<FocusSession>) => {
    const clientId = session.id || `foc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...session, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.createFocusSession(uid, withId),
      () =>
        request<FocusSession>('/focus/sessions', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_focus_session',
        dedupeKey: `foc_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: clientId,
          userId: uid,
          taskId: session.taskId || null,
          taskTitle: session.taskTitle,
          subjectCode: session.subjectCode || null,
          subjectId: session.subjectId || null,
          topicId: session.topicId || null,
          activityType: session.activityType || null,
          mode: session.mode || 'work',
          presetId: session.presetId || null,
          durationMinutes: session.durationMinutes || 25,
          durationSeconds: session.durationSeconds || 1500,
          actualDurationSeconds: session.actualDurationSeconds ?? (session.completed ? session.durationSeconds || 1500 : 0),
          completed: session.completed !== false,
          status: session.status || (session.completed ? 'completed' : 'in_progress'),
          interrupted: session.interrupted ?? false,
          pauseCount: session.pauseCount ?? 0,
          totalPauseSeconds: session.totalPauseSeconds ?? 0,
          startedAt: session.startedAt || new Date().toISOString(),
          endedAt: session.endedAt !== undefined ? session.endedAt : (session.completed ? new Date().toISOString() : null),
          endReason: session.endReason || (session.completed ? 'completed' : null),
        }),
      }
    );
  },

  updateFocusSession: (sessionId: string, updates: Partial<FocusSession>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateFocusSession(uid, sessionId, updates),
      () =>
        request<FocusSession>(`/focus/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }).catch(() => ({ id: sessionId, ...updates } as FocusSession)),
      {
        operationType: 'update_focus_session',
        dedupeKey: `upd_foc_${sessionId}_${Date.now()}`,
        payload: { id: sessionId, updates } as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: sessionId,
          userId: uid,
          ...updates,
        } as FocusSession),
      }
    ),

  recordInterruption: (sessionId: string, interruption: Partial<PomodoroInterruption>) => {
    const eventId = interruption.id || `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const payloadWithId = { ...interruption, id: eventId, sessionId };
    return withPrimaryWrite(
      (uid) => firestoreService.recordInterruption(uid, sessionId, payloadWithId),
      () => {
        const record: PomodoroInterruption = {
          id: eventId,
          userId: getOrCreateGuestSessionId(),
          sessionId,
          eventType: interruption.eventType === 'resume' ? 'resume' : 'pause',
          occurredAt: interruption.occurredAt || new Date().toISOString(),
          reason: interruption.reason || null,
        };
        const map = readGuestStore<Record<string, PomodoroInterruption[]>>('pom_interruptions', {});
        const existing = Array.isArray(map[sessionId]) ? map[sessionId] : [];
        map[sessionId] = [...existing.filter((x) => x.id !== eventId), record];
        writeGuestStore('pom_interruptions', map);
        return Promise.resolve(record);
      },
      {
        operationType: 'record_interruption',
        dedupeKey: `int_${eventId}`,
        payload: { sessionId, interruption: payloadWithId } as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: eventId,
          userId: uid,
          sessionId,
          eventType: interruption.eventType || 'pause',
          occurredAt: interruption.occurredAt || new Date().toISOString(),
          reason: interruption.reason || null,
        }),
      }
    );
  },

  listInterruptions: (sessionId: string) =>
    withPrimaryRead(
      (uid) => firestoreService.listInterruptions(uid, sessionId),
      () => {
        const map = readGuestStore<Record<string, PomodoroInterruption[]>>('pom_interruptions', {});
        const list = Array.isArray(map[sessionId]) ? map[sessionId] : [];
        return Promise.resolve([...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)));
      }
    ),

  getFocusStats: () =>
    withPrimaryRead(
      (uid) => firestoreService.getFocusStats(uid),
      () => request<FocusStatsData>('/focus/stats'),
      'focus_stats',
      120 * 1000
    ),

  // Tasks
  getTasks: () =>
    withPrimaryRead(
      (uid) => firestoreService.getTasks(uid),
      () => request<Task[]>('/tasks'),
      'tasks',
      120 * 1000
    ),

  createTask: (task: Partial<Task>) => {
    const clientId = task.id || `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...task, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.createTask(uid, withId),
      () =>
        request<Task>('/tasks', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_task',
        dedupeKey: `tsk_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => {
          const now = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            title: (task.title || 'New Task').trim(),
            description: task.description || '',
            priority: task.priority || 'medium',
            status: task.status || 'todo',
            category: task.category || 'General',
            subtasks: task.subtasks || [],
            recurrence: task.recurrence || 'none',
            order: task.order || 0,
            estimatedPomodoros: task.estimatedPomodoros || 1,
            completedPomodoros: 0,
            dueDate: task.dueDate || null,
            completedAt: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    );
  },

  updateTask: (id: string, task: Partial<Task>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateTask(uid, id, task),
      () =>
        request<Task>(`/tasks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(task),
        }),
      {
        operationType: 'update_task',
        dedupeKey: `update_tsk_${id}`,
        payload: { id, updates: task },
        optimisticResult: (uid) => ({ id, userId: uid, ...task } as Task),
      }
    ),

  deleteTask: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteTask(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_task',
        dedupeKey: `delete_tsk_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Categories
  getCategories: () =>
    withPrimaryRead(
      (uid) => firestoreService.getCategories(uid),
      () => request<ExpenseCategory[]>('/finance/categories'),
      'categories',
      600 * 1000
    ),

  createCategory: (cat: Partial<ExpenseCategory>) =>
    withPrimaryWrite(
      (uid) => firestoreService.createCategory(uid, cat),
      () =>
        request<ExpenseCategory>('/finance/categories', {
          method: 'POST',
          body: JSON.stringify(cat),
        })
    ),

  // Finance Summary
  getFinanceSummary: (filter: string = 'this_month', startDate?: string, endDate?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getFinanceSummary(uid, filter, startDate, endDate),
      () => {
        let query = `?filter=${encodeURIComponent(filter)}`;
        if (startDate) query += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) query += `&endDate=${encodeURIComponent(endDate)}`;
        return request<FinanceSummaryData>(`/finance/summary${query}`);
      },
      `finance_summary_${filter}_${startDate || ''}_${endDate || ''}`,
      120 * 1000
    ),

  // Income
  getIncomes: () =>
    withPrimaryRead(
      (uid) => firestoreService.getIncomes(uid),
      () => request<IncomeTransaction[]>('/finance/income'),
      'incomes',
      120 * 1000
    ),

  getIncomesPage: (pageSize = 25, cursor?: string | null) =>
    withPrimaryRead(
      (uid) => firestoreService.getIncomesPage(uid, pageSize, cursor),
      async () => {
        const all = await request<IncomeTransaction[]>('/finance/income');
        const filtered = cursor ? all.filter((i) => i.date < cursor) : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.date || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<IncomeTransaction>;
      }
    ),

  createIncome: (data: Partial<IncomeTransaction>) => {
    const clientId = data.id || `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<IncomeTransaction>(
      (uid) => firestoreService.createIncome(uid, withId),
      () =>
        request<IncomeTransaction>('/finance/income', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_income',
        dedupeKey: `inc_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: clientId,
          userId: uid,
          source: data.source || '',
          amountPaise: Number(data.amountPaise) || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          category: data.category || 'Salary',
          notes: data.notes || '',
          createdAt: new Date().toISOString(),
        }),
      }
    );
  },

  updateIncome: (id: string, data: Partial<IncomeTransaction>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateIncome(uid, id, data),
      () =>
        request<IncomeTransaction>(`/finance/income/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_income',
        dedupeKey: `update_inc_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as IncomeTransaction),
      }
    ),

  deleteIncome: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteIncome(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/income/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_income',
        dedupeKey: `delete_inc_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Expenses (Variable and All)
  getExpenses: (type?: 'fixed' | 'variable') =>
    withPrimaryRead(
      (uid) => firestoreService.getExpenses(uid, type),
      () => {
        const q = type ? `?type=${encodeURIComponent(type)}` : '';
        return request<ExpenseTransaction[]>(`/finance/expenses${q}`);
      },
      type ? `expenses_${type}` : 'expenses',
      120 * 1000
    ),

  getExpensesPage: (pageSize = 25, cursor?: string | null, type?: 'fixed' | 'variable') =>
    withPrimaryRead(
      (uid) => firestoreService.getExpensesPage(uid, pageSize, cursor, type),
      async () => {
        const q = type ? `?type=${encodeURIComponent(type)}` : '';
        const all = await request<ExpenseTransaction[]>(`/finance/expenses${q}`);
        const filtered = cursor ? all.filter((e) => e.date < cursor) : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.date || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<ExpenseTransaction>;
      }
    ),

  createExpense: (data: Partial<ExpenseTransaction>) => {
    const clientId = data.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<ExpenseTransaction>(
      (uid) => firestoreService.createExpense(uid, withId),
      () =>
        request<ExpenseTransaction>('/finance/expenses', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_expense',
        dedupeKey: `exp_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: clientId,
          userId: uid,
          billId: data.billId || null,
          type: data.type === 'fixed' ? 'fixed' : 'variable',
          categoryId: data.categoryId || 'cat_1',
          categoryName: data.categoryName,
          amountPaise: Number(data.amountPaise) || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          description: data.description || '',
          paymentMethod: data.paymentMethod || 'upi_bank',
          notes: data.notes || '',
          createdAt: new Date().toISOString(),
        }),
      }
    );
  },

  updateExpense: (id: string, data: Partial<ExpenseTransaction>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateExpense(uid, id, data),
      () =>
        request<ExpenseTransaction>(`/finance/expenses/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_expense',
        dedupeKey: `update_exp_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as ExpenseTransaction),
      }
    ),

  deleteExpense: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteExpense(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/expenses/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_expense',
        dedupeKey: `delete_exp_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Recurring Expenses (Fixed)
  getRecurringExpenses: () =>
    withPrimaryRead(
      (uid) => firestoreService.getRecurringExpenses(uid),
      () => request<RecurringExpense[]>('/finance/recurring')
    ),

  createRecurringExpense: (data: Partial<RecurringExpense>) => {
    const clientId = data.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<RecurringExpense>(
      (uid) => firestoreService.createRecurringExpense(uid, withId),
      () =>
        request<RecurringExpense>('/finance/recurring', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_recurring',
        dedupeKey: `rec_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => {
          const now = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            name: data.name || '',
            amountPaise: Number(data.amountPaise) || 0,
            categoryId: data.categoryId || 'cat_1',
            categoryName: data.categoryName,
            recurrence: data.recurrence || 'monthly',
            dueDay: data.dueDay || 1,
            isActive: true,
            notes: data.notes || '',
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    );
  },

  updateRecurringExpense: (id: string, data: Partial<RecurringExpense>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateRecurringExpense(uid, id, data),
      () =>
        request<RecurringExpense>(`/finance/recurring/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_recurring',
        dedupeKey: `update_rec_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as RecurringExpense),
      }
    ),

  deleteRecurringExpense: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteRecurringExpense(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/recurring/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_recurring',
        dedupeKey: `delete_rec_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Bills & Payment Tracker
  getBills: (status?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getBills(uid, status),
      () => {
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<Bill[]>(`/finance/bills${q}`);
      },
      status ? `bills_${status}` : 'bills',
      120 * 1000
    ),

  createBill: (data: Partial<Bill>) => {
    const clientId = data.id || `bill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<Bill>(
      (uid) => firestoreService.createBill(uid, withId),
      () =>
        request<Bill>('/finance/bills', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_bill',
        dedupeKey: `bill_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid): Bill => {
          const now = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            recurringExpenseId: null,
            name: data.name || '',
            amountPaise: Number(data.amountPaise) || 0,
            categoryId: data.categoryId || 'cat_1',
            categoryName: data.categoryName,
            dueDate: data.dueDate || now.slice(0, 10),
            status: 'UNPAID',
            paymentDate: null,
            notes: data.notes || '',
            periodKey: (data.dueDate || now.slice(0, 10)).slice(0, 7),
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    );
  },

  payBill: (
    id: string,
    paidDate?: string,
    paymentMethod?: string,
    notes?: string,
    idempotencyKey?: string
  ) => {
    const effectiveKey = idempotencyKey || `pay_${id}_${Date.now().toString(36)}`;
    return withPrimaryWrite(
      (uid) =>
        firestoreService.payBill(
          uid,
          id,
          paidDate,
          (paymentMethod as PaymentHistory['paymentMethod']) || 'upi_bank',
          notes,
          effectiveKey
        ),
      () =>
        request<{ success: boolean; bill: Bill }>(`/finance/bills/${encodeURIComponent(id)}/pay`, {
          method: 'POST',
          body: JSON.stringify({ paidDate, paymentMethod, notes, idempotencyKey: effectiveKey }),
        }),
      {
        operationType: 'pay_bill',
        dedupeKey: `pay_bill_${id}`,
        payload: { id, paidDate, paymentMethod, notes, idempotencyKey: effectiveKey },
        optimisticResult: () => ({
          success: true,
          bill: { id, status: 'PAID', paymentDate: paidDate || new Date().toISOString().slice(0, 10) } as Bill,
        }),
      }
    );
  },

  undoBillPayment: (id: string) =>
    withPrimaryWrite(
      (uid) => firestoreService.undoBillPayment(uid, id),
      () =>
        request<{ success: boolean; bill: Bill }>(
          `/finance/bills/${encodeURIComponent(id)}/undo`,
          {
            method: 'POST',
          }
        ),
      {
        operationType: 'undo_bill_payment',
        dedupeKey: `undo_bill_${id}`,
        payload: { id },
        optimisticResult: () => ({
          success: true,
          bill: { id, status: 'UNPAID', paymentDate: null } as Bill,
        }),
      }
    ),

  deleteBill: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteBill(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/bills/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_bill',
        dedupeKey: `delete_bill_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  getPaymentHistory: () =>
    withPrimaryRead(
      (uid) => firestoreService.getPaymentHistory(uid),
      () => request<PaymentHistory[]>('/finance/payments-history')
    ),

  // Savings Goals
  getSavingsGoals: () =>
    withPrimaryRead(
      (uid) => firestoreService.getSavingsGoals(uid),
      () => request<SavingsGoal[]>('/finance/savings-goals'),
      'savings_goals',
      120 * 1000
    ),

  createSavingsGoal: (data: Partial<SavingsGoal>) =>
    withPrimaryWrite(
      (uid) => firestoreService.createSavingsGoal(uid, data),
      () =>
        request<SavingsGoal>('/finance/savings-goals', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'create_savings_goal',
        dedupeKey: `create_goal_${data.title || Date.now()}`,
        payload: data as Record<string, unknown>,
        optimisticResult: (uid) => {
          const now = new Date().toISOString();
          return {
            id: `svg_${Date.now()}`,
            userId: uid,
            title: data.title || 'Savings Goal',
            targetPaise: Number(data.targetPaise) || 0,
            savedPaise: Number(data.savedPaise) || 0,
            targetDate: data.targetDate || null,
            color: data.color || '#10b981',
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    ),

  updateSavingsGoal: (id: string, data: Partial<SavingsGoal>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateSavingsGoal(uid, id, data),
      () =>
        request<SavingsGoal>(`/finance/savings-goals/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_savings_goal',
        dedupeKey: `update_goal_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as SavingsGoal),
      }
    ),

  contributeSavingsGoal: (id: string, deltaPaise: number) =>
    withPrimaryWrite(
      (uid) => firestoreService.contributeSavingsGoal(uid, id, deltaPaise),
      () =>
        request<SavingsGoal>(`/finance/savings-goals/${encodeURIComponent(id)}/contribute`, {
          method: 'POST',
          body: JSON.stringify({ deltaPaise }),
        }),
      {
        operationType: 'contribute_savings_goal',
        dedupeKey: `contrib_goal_${id}_${Date.now()}`,
        payload: { id, deltaPaise },
        optimisticResult: () => ({ id } as SavingsGoal),
      }
    ),

  deleteSavingsGoal: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteSavingsGoal(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/savings-goals/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_savings_goal',
        dedupeKey: `delete_goal_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Trash & Restore
  getTrash: () =>
    withPrimaryRead(
      (uid) => firestoreService.getTrashItems(uid),
      () => request<TrashRecord[]>('/trash')
    ),

  restoreTrashItem: (entityType: TrashRecord['entityType'], id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.restoreTrashItem(uid, entityType, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(
          `/trash/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/restore`,
          { method: 'POST' }
        )
    ),

  permanentlyDeleteTrashItem: (entityType: TrashRecord['entityType'], id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.permanentlyDeleteTrashItem(uid, entityType, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(
          `/trash/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`,
          { method: 'DELETE' }
        )
    ),

  // Time Blocks
  getTimeBlocks: (date?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getTimeBlocks(uid, date),
      () => request<TimeBlock[]>(`/time-blocks${date ? `?date=${encodeURIComponent(date)}` : ''}`),
      date ? `time_blocks_${date}` : 'time_blocks_all',
      120 * 1000
    ),

  createTimeBlock: (block: Partial<TimeBlock>) => {
    const clientId = block.id || `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...block, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveTimeBlock(uid, withId),
      () =>
        request<TimeBlock>('/time-blocks', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_time_block',
        dedupeKey: `tb_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({ ...withId, id: clientId, userId: uid } as TimeBlock),
      }
    );
  },

  updateTimeBlock: (id: string, block: Partial<TimeBlock>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveTimeBlock(uid, { ...block, id }),
      () =>
        request<TimeBlock>(`/time-blocks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(block),
        }),
      {
        operationType: 'save_time_block',
        dedupeKey: `tb_${id}`,
        payload: { ...block, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...block } as TimeBlock),
      }
    ),

  deleteTimeBlock: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteTimeBlock(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/time-blocks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_time_block',
        dedupeKey: `delete_tb_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Habits
  getHabits: () =>
    withPrimaryRead(
      (uid) => firestoreService.getHabits(uid),
      () => request<Habit[]>('/habits'),
      'habits',
      120 * 1000
    ),

  createHabit: (habit: Partial<Habit>) => {
    const clientId = habit.id || `habit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...habit, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveHabit(uid, withId),
      () =>
        request<Habit>('/habits', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_habit',
        dedupeKey: `habit_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => {
          const nowIso = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            title: (habit.title || 'Daily Habit').trim(),
            description: habit.description || '',
            category: habit.category || 'General',
            color: habit.color || '#10b981',
            frequency: habit.frequency || 'daily',
            targetDaysPerWeek: Number(habit.targetDaysPerWeek) || 7,
            customDays: habit.customDays || [0, 1, 2, 3, 4, 5, 6],
            completedDates: habit.completedDates || [],
            bestStreakDays: habit.bestStreakDays || 0,
            reminderTime: habit.reminderTime || '',
            archived: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          } as Habit;
        },
      }
    );
  },

  updateHabit: (id: string, updates: Partial<Habit>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveHabit(uid, { ...updates, id }),
      () =>
        request<Habit>(`/habits/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        }),
      {
        operationType: 'save_habit',
        dedupeKey: `habit_${id}`,
        payload: { ...updates, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...updates } as Habit),
      }
    ),

  toggleHabit: (id: string, dateStr: string) =>
    withPrimaryWrite(
      (uid) => firestoreService.toggleHabitCompletion(uid, id, dateStr),
      () =>
        request<Habit>(`/habits/${encodeURIComponent(id)}/toggle`, {
          method: 'POST',
          body: JSON.stringify({ dateStr }),
        }),
      {
        operationType: 'toggle_habit',
        dedupeKey: `toggle_habit_${id}_${dateStr}`,
        payload: { id, dateStr },
        optimisticResult: (uid) => ({ id, userId: uid } as Habit),
      }
    ),

  deleteHabit: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteHabit(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/habits/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_habit',
        dedupeKey: `delete_habit_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Envelope Budgeting
  getEnvelopes: (monthKey?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getEnvelopes(uid, monthKey),
      () =>
        request<BudgetEnvelope[]>(
          `/envelopes${monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : ''}`
        ),
      monthKey ? `envelopes_${monthKey}` : 'envelopes',
      120 * 1000
    ),

  createEnvelope: (env: Partial<BudgetEnvelope>) => {
    const clientId = env.id || `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...env, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveEnvelope(uid, withId),
      () =>
        request<BudgetEnvelope>('/envelopes', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_envelope',
        dedupeKey: `env_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({ ...withId, id: clientId, userId: uid } as BudgetEnvelope),
      }
    );
  },

  updateEnvelope: (id: string, env: Partial<BudgetEnvelope>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveEnvelope(uid, { ...env, id }),
      () =>
        request<BudgetEnvelope>(`/envelopes/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(env),
        }),
      {
        operationType: 'save_envelope',
        dedupeKey: `env_${id}`,
        payload: { ...env, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...env } as BudgetEnvelope),
      }
    ),

  deleteEnvelope: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteEnvelope(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/envelopes/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_envelope',
        dedupeKey: `delete_env_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  transferEnvelopeFunds: (fromId: string, toId: string, amountPaise: number) =>
    withPrimaryWrite(
      (uid) => firestoreService.transferEnvelopeFunds(uid, fromId, toId, amountPaise),
      () =>
        request<{ success: boolean }>('/envelopes/transfer', {
          method: 'POST',
          body: JSON.stringify({ fromId, toId, amountPaise }),
        })
    ),

  // Subscriptions
  getSubscriptions: () =>
    withPrimaryRead(
      (uid) => firestoreService.getSubscriptions(uid),
      () => request<SubscriptionPlan[]>('/subscriptions'),
      'subscriptions',
      120 * 1000
    ),

  createSubscription: (sub: Partial<SubscriptionPlan>) => {
    const clientId = sub.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...sub, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveSubscription(uid, withId),
      () =>
        request<SubscriptionPlan>('/subscriptions', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_subscription',
        dedupeKey: `sub_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({ ...withId, id: clientId, userId: uid } as SubscriptionPlan),
      }
    );
  },

  updateSubscription: (id: string, sub: Partial<SubscriptionPlan>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveSubscription(uid, { ...sub, id }),
      () =>
        request<SubscriptionPlan>(`/subscriptions/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(sub),
        }),
      {
        operationType: 'save_subscription',
        dedupeKey: `sub_${id}`,
        payload: { ...sub, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...sub } as SubscriptionPlan),
      }
    ),

  deleteSubscription: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteSubscription(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/subscriptions/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_subscription',
        dedupeKey: `delete_sub_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Audit Logs
  getAuditLogs: (limit = 100) =>
    withPrimaryRead(
      (uid) => firestoreService.getAuditLogs(uid, limit),
      () => request<AuditLogEntry[]>(`/audit-logs?limit=${limit}`)
    ),

  getAuditLogsPage: (pageSize = 25, cursorTimestamp?: string | null) =>
    withPrimaryRead(
      (uid) => firestoreService.getAuditLogsPage(uid, pageSize, cursorTimestamp),
      async () => {
        const all = await request<AuditLogEntry[]>('/audit-logs?limit=200');
        const filtered = cursorTimestamp
          ? all.filter((l) => l.timestamp < cursorTimestamp)
          : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.timestamp || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<AuditLogEntry>;
      }
    ),

  // Durable Sync Queue
  getSyncQueue: () =>
    withPrimaryRead(
      (uid) => firestoreService.getDurableSyncQueue(uid),
      () => request<DurableSyncOperation[]>('/sync/queue')
    ),

  enqueueSync: (
    op: Omit<DurableSyncOperation, 'id' | 'userId' | 'status' | 'attempts' | 'createdAt'>
  ) =>
    withPrimaryWrite(
      (uid) => firestoreService.enqueueDurableSync(uid, op),
      () =>
        request<DurableSyncOperation>('/sync/queue/enqueue', {
          method: 'POST',
          body: JSON.stringify(op),
        })
    ),

  updateSyncOpStatus: (id: string, updates: Partial<DurableSyncOperation>) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.updateDurableSyncOp(uid, id, updates);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/sync/queue/${encodeURIComponent(id)}/status`, {
          method: 'POST',
          body: JSON.stringify(updates),
        })
    ),

  // Backend-Controlled Google Sheets Worker Routes
  sheetsVerify: (spreadsheetId: string, googleAccessToken: string) =>
    request<{ spreadsheetId: string; title: string; sheetsCount: number }>('/sheets/verify', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId }),
    }),

  sheetsCreateWorkbook: (googleAccessToken: string) =>
    request<{ spreadsheetId: string }>('/sheets/create-workbook', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({}),
    }),

  sheetsSync: (spreadsheetId: string, googleAccessToken: string, data: SheetsSnapshotPayload) =>
    request<{ success: boolean; updatedRangesCount: number; verifiedTitle?: string }>('/sheets/sync', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId, data }),
    }),

  sheetsApplyFormatting: (
    spreadsheetId: string,
    googleAccessToken: string,
    includeAutoResize = true
  ) =>
    request<{ success: boolean }>('/sheets/apply-formatting', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId, includeAutoResize }),
    }),

  sheetsHistoricalResync: (
    spreadsheetId: string,
    googleAccessToken: string,
    data: SheetsSnapshotPayload,
    confirmed: boolean
  ) =>
    request<{ success: boolean; clearedRangesCount: number; updatedRangesCount: number }>(
      '/sheets/historical-resync',
      {
        method: 'POST',
        headers: { 'x-google-access-token': googleAccessToken },
        body: JSON.stringify({ spreadsheetId, data, confirmed }),
      }
    ),

  sheetsFlushQueue: (
    spreadsheetId: string,
    googleAccessToken: string,
    operations: DurableSyncOperation[]
  ) =>
    request<{
      processed: number;
      skippedDuplicates: number;
      failed: number;
      results: Array<{
        id: string;
        status: 'completed' | 'pending' | 'failed';
        attempts: number;
        nextRetryAt?: number | null;
        errorMessage?: string | null;
        skippedDuplicate?: boolean;
      }>;
    }>('/sheets/flush-queue', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId, operations }),
    }),

  // Universal Sheet Sync Hub Endpoints
  sheetHubInspect: (
    payload: { spreadsheetId?: string; spreadsheetUrl?: string; previewRows?: number; publicAccess?: boolean },
    googleAccessToken?: string | null
  ) =>
    request<SheetInspectResponse>('/sheet-hub/inspect', {
      method: 'POST',
      headers: googleAccessToken ? { 'x-google-access-token': googleAccessToken } : {},
      body: JSON.stringify(payload),
    }),

  sheetHubPull: (
    payload: { spreadsheetId: string; tabs: SheetPullTabRequest[]; publicAccess?: boolean },
    googleAccessToken?: string | null
  ) =>
    request<SheetPullResponse>('/sheet-hub/pull', {
      method: 'POST',
      headers: googleAccessToken ? { 'x-google-access-token': googleAccessToken } : {},
      body: JSON.stringify(payload),
    }),

  sheetHubPushCells: (
    payload: { spreadsheetId: string; updates: SheetHubCellUpdateRequest[] },
    googleAccessToken: string
  ) =>
    request<{ success: boolean } & SheetHubPushCellsResponse>('/sheet-hub/push-cells', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify(payload),
    }),

  sheetHubSampleSemester3: () =>
    request<{ inspect: SheetInspectResponse; pull: SheetPullResponse }>('/sheet-hub/sample-semester3', {
      method: 'GET',
    }),

  // Backups & Data Recovery
  exportBackup: () =>
    withPrimaryRead(
      async (uid) => {
        const [
          settings,
          tasks,
          focusSessions,
          categories,
          recurringExpenses,
          bills,
          paymentHistory,
          income,
          expenses,
          savingsGoals,
          timeBlocks,
          envelopes,
          subscriptions,
          auditLogs,
        ] = await Promise.all([
          firestoreService.getSettings(uid),
          firestoreService.getTasks(uid),
          firestoreService.getFocusSessions(uid),
          firestoreService.getCategories(uid),
          firestoreService.getRecurringExpenses(uid),
          firestoreService.getBills(uid),
          firestoreService.getPaymentHistory(uid),
          firestoreService.getIncomes(uid),
          firestoreService.getExpenses(uid),
          firestoreService.getSavingsGoals(uid),
          firestoreService.getTimeBlocks(uid),
          firestoreService.getEnvelopes(uid),
          firestoreService.getSubscriptions(uid),
          firestoreService.getAuditLogs(uid),
        ]);

        return {
          version: '2.0.0',
          exportedAt: new Date().toISOString(),
          userId: uid,
          userSettings: settings,
          tasks,
          focusSessions,
          categories,
          recurringExpenses,
          bills,
          paymentHistory,
          incomeTransactions: income,
          expenseTransactions: expenses,
          savingsGoals,
          timeBlocks,
          envelopes,
          subscriptions,
          auditLogs,
        };
      },
      () => request<Record<string, unknown>>('/backup/export')
    ),

  restoreBackup: (data: unknown) =>
    withPrimaryWrite(
      async (uid) => {
        const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
        const counts: Record<string, number> = {};

        if (Array.isArray(payload.tasks)) {
          await Promise.all(
            payload.tasks
              .filter((t): t is Task => Boolean(t && typeof t === 'object' && 'id' in t))
              .map((t) => firestoreService.saveTask(uid, { ...t, userId: uid }))
          );
          counts.tasks = payload.tasks.length;
        }
        if (Array.isArray(payload.incomeTransactions)) {
          await Promise.all(
            payload.incomeTransactions
              .filter((i): i is IncomeTransaction => Boolean(i && typeof i === 'object' && 'id' in i))
              .map((i) => firestoreService.saveIncome(uid, { ...i, userId: uid }))
          );
          counts.incomeTransactions = payload.incomeTransactions.length;
        }
        if (Array.isArray(payload.expenseTransactions)) {
          await Promise.all(
            payload.expenseTransactions
              .filter((e): e is ExpenseTransaction => Boolean(e && typeof e === 'object' && 'id' in e))
              .map((e) => firestoreService.saveExpense(uid, { ...e, userId: uid }))
          );
          counts.expenseTransactions = payload.expenseTransactions.length;
        }
        if (Array.isArray(payload.bills)) {
          await Promise.all(
            payload.bills
              .filter((b): b is Bill => Boolean(b && typeof b === 'object' && 'id' in b))
              .map((b) => firestoreService.saveBill(uid, { ...b, userId: uid }))
          );
          counts.bills = payload.bills.length;
        }
        if (Array.isArray(payload.timeBlocks)) {
          await Promise.all(
            payload.timeBlocks
              .filter((tb): tb is TimeBlock => Boolean(tb && typeof tb === 'object' && 'id' in tb))
              .map((tb) => firestoreService.saveTimeBlock(uid, { ...tb, userId: uid }))
          );
          counts.timeBlocks = payload.timeBlocks.length;
        }
        if (Array.isArray(payload.envelopes)) {
          await Promise.all(
            payload.envelopes
              .filter((env): env is BudgetEnvelope => Boolean(env && typeof env === 'object' && 'id' in env))
              .map((env) => firestoreService.saveEnvelope(uid, { ...env, userId: uid }))
          );
          counts.envelopes = payload.envelopes.length;
        }
        if (Array.isArray(payload.subscriptions)) {
          await Promise.all(
            payload.subscriptions
              .filter((s): s is SubscriptionPlan => Boolean(s && typeof s === 'object' && 'id' in s))
              .map((s) => firestoreService.saveSubscription(uid, { ...s, userId: uid }))
          );
          counts.subscriptions = payload.subscriptions.length;
        }
        if (Array.isArray(payload.savingsGoals)) {
          await firestoreService.saveSavingsGoalsList(
            uid,
            payload.savingsGoals.map((g: SavingsGoal) => ({ ...g, userId: uid }))
          );
          counts.savingsGoals = payload.savingsGoals.length;
        }

        await firestoreService.recordAuditLog(uid, {
          action: 'backup_restore',
          entityType: 'backup',
          entityId: `rst_${Date.now()}`,
          entityTitle: 'Cloud Backup Restore',
          details: `Restored to Firestore: ${JSON.stringify(counts)}`,
        });

        return { success: true, counts };
      },
      () =>
        request<{ success: boolean; counts: Record<string, number> }>('/backup/restore', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),

  // --- STUDY MANAGEMENT (NEXTSTUDY INTEGRATION) ---
  clearStudyData: () =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.clearStudyData(uid);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>('/study/all', {
          method: 'DELETE',
        });
        return Boolean(res?.success);
      }
    ),

  getStudyTiers: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyTiers(uid),
      () => request<AcademicTier[]>('/study/tiers')
    ),

  saveStudyTier: (tier: Partial<AcademicTier>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyTier(uid, tier),
      () =>
        request<AcademicTier>('/study/tiers', {
          method: 'POST',
          body: JSON.stringify(tier),
        }),
      {
        operationType: 'save_study_tier',
        payload: tier as Record<string, unknown>,
        dedupeKey: `save_tier_${tier.id || tier.name}`,
        optimisticResult: (uid) => ({
          id: tier.id || `tier_${Date.now()}`,
          userId: uid,
          name: tier.name || 'Academic Tier',
          shortTitle: tier.shortTitle || tier.name || 'Tier',
          description: tier.description || '',
          subjectCodes: tier.subjectCodes || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        }),
      }
    ),

  deleteStudyTier: (tierId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyTier(uid, tierId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/tiers/${encodeURIComponent(tierId)}`, {
          method: 'DELETE',
        });
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_tier',
        payload: { id: tierId },
        dedupeKey: `del_tier_${tierId}`,
        optimisticResult: () => true,
      }
    ),

  getStudySubjects: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudySubjects(uid),
      () => request<StudySubject[]>('/study/subjects'),
      'study_subjects',
      180 * 1000
    ),

  saveStudySubject: (subject: Partial<StudySubject>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudySubject(uid, subject),
      () =>
        request<StudySubject>('/study/subjects', {
          method: 'POST',
          body: JSON.stringify(subject),
        }),
      {
        operationType: 'save_study_subject',
        payload: subject as Record<string, unknown>,
        dedupeKey: `save_subj_${subject.id || subject.code}`,
        optimisticResult: (uid) => ({
          id: subject.id || `subj_${Date.now()}`,
          userId: uid,
          code: subject.code || 'SUB_CUSTOM',
          name: subject.name || 'Subject',
          tierId: subject.tierId || 'tier1_sem3',
          totalSubtopics: subject.totalSubtopics || 0,
          completedSubtopics: subject.completedSubtopics || 0,
          color: subject.color || '#3b82f6',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...subject,
        }),
      }
    ),

  deleteStudySubject: (codeOrId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudySubject(uid, codeOrId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/subjects/${encodeURIComponent(codeOrId)}`, {
          method: 'DELETE',
        });
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_subject',
        payload: { id: codeOrId },
        dedupeKey: `del_subj_${codeOrId}`,
        optimisticResult: () => true,
      }
    ),

  getStudyTopics: (subjectCode?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyTopics(uid, subjectCode),
      () => request<StudyTopic[]>(`/study/topics${subjectCode ? `?subjectCode=${encodeURIComponent(subjectCode)}` : ''}`),
      subjectCode ? `study_topics_${subjectCode}` : 'study_topics_all',
      180 * 1000
    ),

  saveStudyTopic: (topic: Partial<StudyTopic>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyTopic(uid, topic),
      () =>
        request<StudyTopic>('/study/topics', {
          method: 'POST',
          body: JSON.stringify(topic),
        }),
      {
        operationType: 'save_study_topic',
        payload: topic as Record<string, unknown>,
        dedupeKey: `save_topic_${topic.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: topic.id || `topic_${Date.now()}`,
          userId: uid,
          subjectCode: topic.subjectCode || 'Sub_General',
          unit: topic.unit || 'Unit 1',
          topic: topic.topic || 'General Topic',
          subtopic: topic.subtopic || 'Concept',
          priority: topic.priority || 'Medium',
          theory: Boolean(topic.theory),
          practice: Boolean(topic.practice),
          pyq: Boolean(topic.pyq),
          revisionCount: Number(topic.revisionCount) || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...topic,
        }),
      }
    ),

  deleteStudyTopic: (topicId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyTopic(uid, topicId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/topics/${encodeURIComponent(topicId)}`, {
          method: 'DELETE',
        });
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_topic',
        payload: { id: topicId },
        dedupeKey: `del_topic_${topicId}`,
        optimisticResult: () => true,
      }
    ),

  getStudyRevisions: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyRevisions(uid),
      () => request<StudyRevision[]>('/study/revisions'),
      'study_revisions',
      180 * 1000
    ),

  saveStudyRevision: (revision: Partial<StudyRevision>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyRevision(uid, revision),
      () =>
        request<StudyRevision>('/study/revisions', {
          method: 'POST',
          body: JSON.stringify(revision),
        }),
      {
        operationType: 'save_study_revision',
        payload: revision as Record<string, unknown>,
        dedupeKey: `save_rev_${revision.id || revision.topicId}`,
        optimisticResult: (uid) => ({
          id: revision.id || `rev_${Date.now()}`,
          userId: uid,
          topicId: revision.topicId || '',
          subjectCode: revision.subjectCode || 'Sub_General',
          topicTitle: revision.topicTitle || 'Revision Topic',
          lastStudiedAt: new Date().toISOString().slice(0, 10),
          nextRevisionAt: new Date().toISOString().slice(0, 10),
          intervalDays: Number(revision.intervalDays) || 1,
          repetition: Number(revision.repetition) || 1,
          difficulty: revision.difficulty || 'medium',
          status: revision.status || 'scheduled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...revision,
        }),
      }
    ),

  recordStudyRecall: (revisionId: string, difficulty: 'easy' | 'medium' | 'hard') =>
    withPrimaryWrite(
      (uid) => firestoreService.recordStudyRecall(uid, revisionId, difficulty),
      () =>
        request<StudyRevision>(`/study/revisions/${encodeURIComponent(revisionId)}/recall`, {
          method: 'POST',
          body: JSON.stringify({ difficulty }),
        }),
      {
        operationType: 'record_study_recall',
        payload: { id: revisionId, difficulty },
        dedupeKey: `recall_rev_${revisionId}_${Date.now()}`,
        optimisticResult: () => null as unknown as StudyRevision,
      }
    ),

  deleteStudyRevision: (revisionId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyRevision(uid, revisionId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/revisions/${encodeURIComponent(revisionId)}`, {
          method: 'DELETE',
        });
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_revision',
        payload: { id: revisionId },
        dedupeKey: `del_rev_${revisionId}`,
        optimisticResult: () => true,
      }
    ),

  getStudyMistakes: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyMistakes(uid),
      () => request<StudyMistake[]>('/study/mistakes'),
      'study_mistakes',
      180 * 1000
    ),

  saveStudyMistake: (mistake: Partial<StudyMistake>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyMistake(uid, mistake),
      () =>
        request<StudyMistake>('/study/mistakes', {
          method: 'POST',
          body: JSON.stringify(mistake),
        }),
      {
        operationType: 'save_study_mistake',
        payload: mistake as Record<string, unknown>,
        dedupeKey: `save_mistake_${mistake.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: mistake.id || `mistake_${Date.now()}`,
          userId: uid,
          date: mistake.date || new Date().toISOString().slice(0, 10),
          subjectCode: mistake.subjectCode || 'Sub_General',
          topic: mistake.topic || 'Topic',
          source: mistake.source || 'Practice',
          severity: mistake.severity || 'Medium',
          trap: mistake.trap || '',
          rootCause: mistake.rootCause || '',
          goldenRule: mistake.goldenRule || '',
          resolved: Boolean(mistake.resolved),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...mistake,
        }),
      }
    ),

  deleteStudyMistake: (mistakeId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyMistake(uid, mistakeId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/mistakes/${encodeURIComponent(mistakeId)}`, {
          method: 'DELETE',
        });
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_mistake',
        payload: { id: mistakeId },
        dedupeKey: `del_mistake_${mistakeId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY GOALS (PHASE 16) ---
  getStudyGoals: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyGoals(uid),
      () => request<StudyGoal[]>('/study/goals').catch(() => []),
      'study_goals',
      180 * 1000
    ),

  saveStudyGoal: (goal: Partial<StudyGoal>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyGoal(uid, goal),
      () =>
        request<StudyGoal>('/study/goals', {
          method: 'POST',
          body: JSON.stringify(goal),
        }).catch(() => goal as StudyGoal),
      {
        operationType: 'save_study_goal',
        payload: goal as Record<string, unknown>,
        dedupeKey: `save_goal_${goal.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: goal.id || `goal_${Date.now()}`,
          userId: uid,
          title: goal.title || 'Study Goal',
          description: goal.description || '',
          goalType: goal.goalType || 'weekly',
          subjectId: goal.subjectId || null,
          subjectCode: goal.subjectCode || null,
          targetValue: goal.targetValue || 0,
          currentValue: goal.currentValue || 0,
          unit: goal.unit || 'hours',
          startDate: goal.startDate || new Date().toISOString(),
          endDate: goal.endDate || new Date().toISOString(),
          status: goal.status || 'active',
          priority: goal.priority || 'medium',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...goal,
        } as StudyGoal),
      }
    ),

  deleteStudyGoal: (goalId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyGoal(uid, goalId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/goals/${encodeURIComponent(goalId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_goal',
        payload: { id: goalId },
        dedupeKey: `del_goal_${goalId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY PLANS (PHASE 16) ---
  getStudyPlans: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyPlans(uid),
      () => request<StudyPlan[]>('/study/plans').catch(() => []),
      'study_plans',
      180 * 1000
    ),

  saveStudyPlan: (plan: Partial<StudyPlan>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyPlan(uid, plan),
      () =>
        request<StudyPlan>('/study/plans', {
          method: 'POST',
          body: JSON.stringify(plan),
        }).catch(() => plan as StudyPlan),
      {
        operationType: 'save_study_plan',
        payload: plan as Record<string, unknown>,
        dedupeKey: `save_plan_${plan.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: plan.id || `plan_${Date.now()}`,
          userId: uid,
          title: plan.title || 'Study Plan',
          description: plan.description || '',
          planType: plan.planType || 'weekly',
          subjectIds: plan.subjectIds || [],
          startDate: plan.startDate || new Date().toISOString(),
          endDate: plan.endDate || new Date().toISOString(),
          dailyTargetMinutes: plan.dailyTargetMinutes || 120,
          weeklyTargetMinutes: plan.weeklyTargetMinutes || 600,
          status: plan.status || 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...plan,
        } as StudyPlan),
      }
    ),

  deleteStudyPlan: (planId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyPlan(uid, planId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/plans/${encodeURIComponent(planId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_plan',
        payload: { id: planId },
        dedupeKey: `del_plan_${planId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY PLAN TASKS (PHASE 16) ---
  getStudyPlanTasks: (planId?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyPlanTasks(uid, planId),
      () => request<StudyPlanTask[]>(`/study/plan-tasks${planId ? `?planId=${encodeURIComponent(planId)}` : ''}`).catch(() => []),
      planId ? `study_plantasks_${planId}` : 'study_plantasks_all',
      180 * 1000
    ),

  saveStudyPlanTask: (task: Partial<StudyPlanTask>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyPlanTask(uid, task),
      () =>
        request<StudyPlanTask>('/study/plan-tasks', {
          method: 'POST',
          body: JSON.stringify(task),
        }).catch(() => task as StudyPlanTask),
      {
        operationType: 'save_study_plan_task',
        payload: task as Record<string, unknown>,
        dedupeKey: `save_plantask_${task.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: task.id || `plantask_${Date.now()}`,
          userId: uid,
          planId: task.planId || '',
          subjectId: task.subjectId || null,
          topicId: task.topicId || null,
          title: task.title || 'Task',
          description: task.description || '',
          scheduledDate: task.scheduledDate || new Date().toISOString().slice(0, 10),
          startTime: task.startTime || null,
          endTime: task.endTime || null,
          estimatedMinutes: task.estimatedMinutes || 30,
          actualMinutes: task.actualMinutes || 0,
          priority: task.priority || 'medium',
          status: task.status || 'pending',
          completedAt: task.completedAt || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...task,
        } as StudyPlanTask),
      }
    ),

  deleteStudyPlanTask: (taskId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyPlanTask(uid, taskId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/plan-tasks/${encodeURIComponent(taskId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_plan_task',
        payload: { id: taskId },
        dedupeKey: `del_plantask_${taskId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY RESOURCES (PHASE 16) ---
  getStudyResources: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyResources(uid),
      () => request<StudyResource[]>('/study/resources').catch(() => [])
    ),

  saveStudyResource: (resource: Partial<StudyResource>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyResource(uid, resource),
      () =>
        request<StudyResource>('/study/resources', {
          method: 'POST',
          body: JSON.stringify(resource),
        }).catch(() => resource as StudyResource),
      {
        operationType: 'save_study_resource',
        payload: resource as Record<string, unknown>,
        dedupeKey: `save_resource_${resource.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: resource.id || `res_${Date.now()}`,
          userId: uid,
          title: resource.title || 'Resource',
          description: resource.description || '',
          resourceType: resource.resourceType || 'link',
          subjectId: resource.subjectId || null,
          topicId: resource.topicId || null,
          url: resource.url || null,
          storagePath: resource.storagePath || null,
          tags: resource.tags || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...resource,
        } as StudyResource),
      }
    ),

  deleteStudyResource: (resourceId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyResource(uid, resourceId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/resources/${encodeURIComponent(resourceId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_resource',
        payload: { id: resourceId },
        dedupeKey: `del_resource_${resourceId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY EXAMS (PHASE 16) ---
  getStudyExams: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyExams(uid),
      () => request<StudyExam[]>('/study/exams').catch(() => [])
    ),

  saveStudyExam: (exam: Partial<StudyExam>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyExam(uid, exam),
      () =>
        request<StudyExam>('/study/exams', {
          method: 'POST',
          body: JSON.stringify(exam),
        }).catch(() => exam as StudyExam),
      {
        operationType: 'save_study_exam',
        payload: exam as Record<string, unknown>,
        dedupeKey: `save_exam_${exam.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: exam.id || `exam_${Date.now()}`,
          userId: uid,
          title: exam.title || 'Exam',
          examType: exam.examType || 'midterm',
          subjectIds: exam.subjectIds || [],
          examDate: exam.examDate || new Date().toISOString().slice(0, 10),
          startTime: exam.startTime || null,
          durationMinutes: exam.durationMinutes || 60,
          totalMarks: exam.totalMarks || 100,
          obtainedMarks: exam.obtainedMarks || null,
          syllabusTopicIds: exam.syllabusTopicIds || [],
          preparationStatus: exam.preparationStatus || 'preparing',
          resultStatus: exam.resultStatus || 'pending',
          notes: exam.notes || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...exam,
        } as StudyExam),
      }
    ),

  deleteStudyExam: (examId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyExam(uid, examId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/exams/${encodeURIComponent(examId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_exam',
        payload: { id: examId },
        dedupeKey: `del_exam_${examId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY NOTES (PHASE 16) ---
  getStudyNotes: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyNotes(uid),
      () => request<StudyNote[]>('/study/notes').catch(() => [])
    ),

  saveStudyNote: (note: Partial<StudyNote>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyNote(uid, note),
      () =>
        request<StudyNote>('/study/notes', {
          method: 'POST',
          body: JSON.stringify(note),
        }).catch(() => note as StudyNote),
      {
        operationType: 'save_study_note',
        payload: note as Record<string, unknown>,
        dedupeKey: `save_note_${note.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: note.id || `note_${Date.now()}`,
          userId: uid,
          title: note.title || 'Note',
          content: note.content || '',
          subjectId: note.subjectId || null,
          topicId: note.topicId || null,
          tags: note.tags || [],
          isPinned: Boolean(note.isPinned),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...note,
        } as StudyNote),
      }
    ),

  deleteStudyNote: (noteId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyNote(uid, noteId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/notes/${encodeURIComponent(noteId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_note',
        payload: { id: noteId },
        dedupeKey: `del_note_${noteId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY ACTIVITY LOGS (PHASE 16) ---
  getStudyActivityLogs: (limitCount?: number) =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyActivityLogs(uid, limitCount),
      () => request<StudyActivityLog[]>(`/study/activity-logs${limitCount ? `?limit=${limitCount}` : ''}`).catch(() => [])
    ),

  recordStudyActivityLog: (entry: Omit<StudyActivityLog, 'id' | 'userId' | 'createdAt'>) =>
    withPrimaryWrite(
      (uid) => firestoreService.recordStudyActivityLog(uid, entry),
      () =>
        request<StudyActivityLog>('/study/activity-logs', {
          method: 'POST',
          body: JSON.stringify(entry),
        }).catch(() => ({
          id: `act_${Date.now()}`,
          userId: 'guest',
          createdAt: new Date().toISOString(),
          ...entry,
        }))
    ),

  // --- STUDY FLASHCARDS (PHASE 16) ---
  getStudyFlashcards: (topicId?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyFlashcards(uid, topicId),
      () => request<StudyFlashcard[]>(`/study/flashcards${topicId ? `?topicId=${encodeURIComponent(topicId)}` : ''}`).catch(() => []),
      topicId ? `study_flashcards_${topicId}` : 'study_flashcards_all',
      180 * 1000
    ),

  saveStudyFlashcard: (card: Partial<StudyFlashcard>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyFlashcard(uid, card),
      () =>
        request<StudyFlashcard>('/study/flashcards', {
          method: 'POST',
          body: JSON.stringify(card),
        }).catch(() => card as StudyFlashcard),
      {
        operationType: 'save_study_flashcard',
        payload: card as Record<string, unknown>,
        dedupeKey: `save_flashcard_${card.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: card.id || `card_${Date.now()}`,
          userId: uid,
          subjectId: card.subjectId || null,
          topicId: card.topicId || null,
          question: card.question || '',
          answer: card.answer || '',
          difficulty: card.difficulty || 'medium',
          reviewCount: card.reviewCount || 0,
          lastReviewedAt: card.lastReviewedAt || null,
          nextReviewAt: card.nextReviewAt || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...card,
        } as StudyFlashcard),
      }
    ),

  reviewStudyFlashcard: (id: string, difficulty: 'easy' | 'medium' | 'hard') =>
    withPrimaryWrite(
      (uid) => firestoreService.reviewStudyFlashcard(uid, id, difficulty),
      () =>
        request<StudyFlashcard>(`/study/flashcards/${encodeURIComponent(id)}/review`, {
          method: 'POST',
          body: JSON.stringify({ difficulty }),
        }).catch(() => null)
    ),

  deleteStudyFlashcard: (cardId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyFlashcard(uid, cardId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/flashcards/${encodeURIComponent(cardId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_flashcard',
        payload: { id: cardId },
        dedupeKey: `del_flashcard_${cardId}`,
        optimisticResult: () => true,
      }
    ),

  // --- STUDY QUIZZES (PHASE 16) ---
  getStudyQuizzes: () =>
    withPrimaryRead(
      (uid) => firestoreService.getStudyQuizzes(uid),
      () => request<StudyQuiz[]>('/study/quizzes').catch(() => []),
      'study_quizzes',
      180 * 1000
    ),

  saveStudyQuiz: (quiz: Partial<StudyQuiz>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveStudyQuiz(uid, quiz),
      () =>
        request<StudyQuiz>('/study/quizzes', {
          method: 'POST',
          body: JSON.stringify(quiz),
        }).catch(() => quiz as StudyQuiz),
      {
        operationType: 'save_study_quiz',
        payload: quiz as Record<string, unknown>,
        dedupeKey: `save_quiz_${quiz.id || Date.now()}`,
        optimisticResult: (uid) => ({
          id: quiz.id || `quiz_${Date.now()}`,
          userId: uid,
          title: quiz.title || 'Quiz',
          subjectId: quiz.subjectId || null,
          topicId: quiz.topicId || null,
          questions: quiz.questions || [],
          attempts: quiz.attempts || [],
          highestScore: quiz.highestScore || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...quiz,
        } as StudyQuiz),
      }
    ),

  recordStudyQuizAttempt: (
    quizId: string,
    attempt: { score: number; totalQuestions: number; timeTakenSeconds: number }
  ) =>
    withPrimaryWrite(
      (uid) => firestoreService.recordStudyQuizAttempt(uid, quizId, attempt),
      () =>
        request<StudyQuiz>(`/study/quizzes/${encodeURIComponent(quizId)}/attempt`, {
          method: 'POST',
          body: JSON.stringify(attempt),
        }).catch(() => null)
    ),

  deleteStudyQuiz: (quizId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteStudyQuiz(uid, quizId);
        return true;
      },
      async () => {
        const res = await request<{ success: boolean }>(`/study/quizzes/${encodeURIComponent(quizId)}`, {
          method: 'DELETE',
        }).catch(() => ({ success: true }));
        return Boolean(res?.success);
      },
      {
        operationType: 'delete_study_quiz',
        payload: { id: quizId },
        dedupeKey: `del_quiz_${quizId}`,
        optimisticResult: () => true,
      }
    ),

  // --- POMODORO PRESETS & GOALS ---
  getPomodoroPresets: () =>
    withPrimaryRead(
      (uid) => firestoreService.getPomodoroPresets(uid),
      () => {
        const stored = readGuestStore<PomodoroPreset[] | null>('pom_presets', null);
        if (Array.isArray(stored)) {
          return Promise.resolve(stored.filter((p) => !p.deletedAt));
        }
        const nowIso = new Date().toISOString();
        const guestId = getOrCreateGuestSessionId();
        const defaults: PomodoroPreset[] = [
          {
            id: 'preset_classic',
            userId: guestId,
            name: 'Classic Pomodoro',
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            longBreakInterval: 4,
            autoStartBreaks: false,
            autoStartFocus: false,
            soundEnabled: true,
            soundVolume: 70,
            isDefault: true,
            isSystemPreset: true,
            createdAt: nowIso,
            updatedAt: nowIso,
            deletedAt: null,
          },
          {
            id: 'preset_deep_work',
            userId: guestId,
            name: 'Deep Work (50/10)',
            workDuration: 50,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            longBreakInterval: 3,
            autoStartBreaks: false,
            autoStartFocus: false,
            soundEnabled: true,
            soundVolume: 70,
            isDefault: false,
            isSystemPreset: true,
            createdAt: nowIso,
            updatedAt: nowIso,
            deletedAt: null,
          },
        ];
        writeGuestStore('pom_presets', defaults);
        return Promise.resolve(defaults);
      }
    ),

  savePomodoroPreset: (preset: Partial<PomodoroPreset>) => {
    const id = preset.id || `preset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...preset, id };
    return withPrimaryWrite(
      (uid) => firestoreService.savePomodoroPreset(uid, withId),
      () => {
        const nowIso = new Date().toISOString();
        const list = readGuestStore<PomodoroPreset[]>('pom_presets', []);
        const existing = list.find((p) => p.id === id);
        const saved: PomodoroPreset = {
          id,
          userId: getOrCreateGuestSessionId(),
          name: (preset.name ?? existing?.name ?? 'Custom Preset').trim().slice(0, 128),
          description: preset.description ?? existing?.description,
          workDuration: Math.max(1, Math.min(180, Number(preset.workDuration ?? existing?.workDuration ?? 25))),
          shortBreakDuration: Math.max(1, Math.min(60, Number(preset.shortBreakDuration ?? existing?.shortBreakDuration ?? 5))),
          longBreakDuration: Math.max(1, Math.min(90, Number(preset.longBreakDuration ?? existing?.longBreakDuration ?? 15))),
          longBreakInterval: Math.max(1, Math.min(12, Number(preset.longBreakInterval ?? existing?.longBreakInterval ?? 4))),
          autoStartBreaks: preset.autoStartBreaks ?? existing?.autoStartBreaks ?? false,
          autoStartFocus: preset.autoStartFocus ?? existing?.autoStartFocus ?? false,
          soundEnabled: preset.soundEnabled ?? existing?.soundEnabled ?? true,
          soundVolume: Math.max(0, Math.min(100, Number(preset.soundVolume ?? existing?.soundVolume ?? 70))),
          isDefault: preset.isDefault ?? existing?.isDefault ?? false,
          isSystemPreset: existing?.isSystemPreset ?? false,
          createdAt: existing?.createdAt ?? nowIso,
          updatedAt: nowIso,
          deletedAt: null,
        };
        writeGuestStore('pom_presets', [...list.filter((p) => p.id !== id), saved]);
        return Promise.resolve(saved);
      },
      {
        operationType: 'save_pomodoro_preset',
        dedupeKey: `preset_${id}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id,
          userId: uid,
          name: preset.name || 'Custom Preset',
          workDuration: preset.workDuration || 25,
          shortBreakDuration: preset.shortBreakDuration || 5,
          longBreakDuration: preset.longBreakDuration || 15,
          longBreakInterval: preset.longBreakInterval || 4,
          autoStartBreaks: Boolean(preset.autoStartBreaks),
          autoStartFocus: Boolean(preset.autoStartFocus),
          soundEnabled: preset.soundEnabled !== false,
          soundVolume: preset.soundVolume ?? 70,
          isDefault: Boolean(preset.isDefault),
          isSystemPreset: Boolean(preset.isSystemPreset),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        }),
      }
    );
  },

  deletePomodoroPreset: (presetId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deletePomodoroPreset(uid, presetId);
        return true;
      },
      () => {
        const list = readGuestStore<PomodoroPreset[]>('pom_presets', []);
        writeGuestStore('pom_presets', list.filter((p) => p.id !== presetId));
        return Promise.resolve(true);
      },
      {
        operationType: 'delete_pomodoro_preset',
        dedupeKey: `del_preset_${presetId}`,
        payload: { id: presetId },
        optimisticResult: () => true,
      }
    ),

  getPomodoroGoals: () =>
    withPrimaryRead(
      (uid) => firestoreService.getPomodoroGoals(uid),
      () => Promise.resolve(readGuestStore<PomodoroGoal[]>('pom_goals', []).filter((g) => !g.deletedAt)),
      'pomodoro_goals',
      180 * 1000
    ),

  savePomodoroGoal: (goal: Partial<PomodoroGoal>) => {
    const id = goal.id || `pgoal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...goal, id };
    return withPrimaryWrite(
      (uid) => firestoreService.savePomodoroGoal(uid, withId),
      () => {
        const nowIso = new Date().toISOString();
        const list = readGuestStore<PomodoroGoal[]>('pom_goals', []);
        const status = goal.status || 'active';
        const saved: PomodoroGoal = {
          id,
          userId: getOrCreateGuestSessionId(),
          title: (goal.title || 'Focus Goal').trim().slice(0, 256),
          description: goal.description,
          goalType: goal.goalType || 'daily',
          metricType: goal.metricType || 'focus_minutes',
          targetValue: Math.max(1, Number(goal.targetValue || 120)),
          currentValue: Number(goal.currentValue || 0),
          subjectId: goal.subjectId || null,
          subjectCode: goal.subjectCode || null,
          topicId: goal.topicId || null,
          startDate: goal.startDate || nowIso.split('T')[0],
          endDate: goal.endDate || null,
          status,
          isActive: status === 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: null,
          deletedAt: null,
        };
        writeGuestStore('pom_goals', [...list.filter((g) => g.id !== id), saved]);
        return Promise.resolve(saved);
      },
      {
        operationType: 'save_pomodoro_goal',
        dedupeKey: `pgoal_${id}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id,
          userId: uid,
          title: goal.title || 'Focus Goal',
          description: goal.description,
          goalType: goal.goalType || 'daily',
          metricType: goal.metricType || 'focus_minutes',
          targetValue: goal.targetValue || 120,
          currentValue: goal.currentValue || 0,
          subjectId: goal.subjectId || null,
          subjectCode: goal.subjectCode || null,
          topicId: goal.topicId || null,
          startDate: goal.startDate || new Date().toISOString().split('T')[0],
          endDate: goal.endDate || null,
          status: goal.status || 'active',
          isActive: (goal.status || 'active') === 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null,
          deletedAt: null,
        }),
      }
    );
  },

  deletePomodoroGoal: (goalId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deletePomodoroGoal(uid, goalId);
        return true;
      },
      () => {
        const list = readGuestStore<PomodoroGoal[]>('pom_goals', []);
        writeGuestStore('pom_goals', list.filter((g) => g.id !== goalId));
        return Promise.resolve(true);
      },
      {
        operationType: 'delete_pomodoro_goal',
        dedupeKey: `del_pgoal_${goalId}`,
        payload: { id: goalId },
        optimisticResult: () => true,
      }
    ),

  getPomodoroSettings: () =>
    withPrimaryRead(
      (uid) => firestoreService.getPomodoroSettings(uid),
      () => Promise.resolve(readGuestStore<PomodoroSettings | null>('pom_settings', null))
    ),

  savePomodoroSettings: (settings: Partial<PomodoroSettings>) =>
    withPrimaryWrite(
      (uid) => firestoreService.savePomodoroSettings(uid, settings),
      () => {
        const existing = readGuestStore<PomodoroSettings | null>('pom_settings', null);
        const merged: PomodoroSettings = {
          id: 'default',
          userId: getOrCreateGuestSessionId(),
          focusDuration: settings.focusDuration ?? existing?.focusDuration ?? 25,
          shortBreakDuration: settings.shortBreakDuration ?? existing?.shortBreakDuration ?? 5,
          longBreakDuration: settings.longBreakDuration ?? existing?.longBreakDuration ?? 15,
          longBreakInterval: settings.longBreakInterval ?? existing?.longBreakInterval ?? 4,
          autoStartBreaks: settings.autoStartBreaks ?? existing?.autoStartBreaks ?? false,
          autoStartFocus: settings.autoStartFocus ?? existing?.autoStartFocus ?? false,
          alertTone: settings.alertTone ?? existing?.alertTone ?? 'chime',
          soundVolume: settings.soundVolume ?? existing?.soundVolume ?? 70,
          ambientPreset: settings.ambientPreset ?? existing?.ambientPreset ?? 'off',
          ambientVolume: settings.ambientVolume ?? existing?.ambientVolume ?? 0.35,
          desktopNotifications: settings.desktopNotifications ?? existing?.desktopNotifications ?? false,
          tickingSoundEnabled: settings.tickingSoundEnabled ?? existing?.tickingSoundEnabled ?? false,
          selectedPresetId:
            settings.selectedPresetId !== undefined ? settings.selectedPresetId : (existing?.selectedPresetId ?? null),
          updatedAt: new Date().toISOString(),
        };
        writeGuestStore('pom_settings', merged);
        return Promise.resolve(merged);
      }
    ),

  getPomodoroAmbientPresets: () =>
    withPrimaryRead(
      (uid) => firestoreService.getPomodoroAmbientPresets(uid),
      () => Promise.resolve([])
    ),

  savePomodoroAmbientPreset: (preset: Partial<PomodoroAmbientPreset>) =>
    withPrimaryWrite(
      (uid) => firestoreService.savePomodoroAmbientPreset(uid, preset),
      () => Promise.resolve(preset as PomodoroAmbientPreset)
    ),

  deletePomodoroAmbientPreset: (presetId: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deletePomodoroAmbientPreset(uid, presetId);
        return true;
      },
      () => Promise.resolve(true)
    ),

  // ==========================================
  // JOINT VAULTS (COUPLE SHARED SAVINGS)
  // ==========================================

  getJointVaults: (): Promise<VaultSummary[]> =>
    withPrimaryRead(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.getJointVaults(auth.currentUser);
        }
        const list = await request<VaultSummary[]>('/joint-vaults');
        return Array.isArray(list) ? list : [];
      },
      async () => {
        const list = await request<VaultSummary[]>('/joint-vaults');
        return Array.isArray(list) ? list : [];
      }
    ),

  getJointVault: (vaultId: string): Promise<VaultSummary | null> =>
    withPrimaryRead(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.getJointVault(vaultId, auth.currentUser);
        }
        return request<VaultSummary>(`/joint-vaults/${vaultId}`);
      },
      () => request<VaultSummary>(`/joint-vaults/${vaultId}`)
    ),

  createJointVault: (data: {
    name: string;
    description?: string;
    targetPaise: number;
    monthlyTargetPaise?: number;
    currency?: CurrencyCode;
    targetRatio?: Record<string, number>;
  }): Promise<JointVault> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.createJointVault(auth.currentUser, data);
        }
        return request<JointVault>('/joint-vaults', { method: 'POST', body: JSON.stringify(data) });
      },
      () => request<JointVault>('/joint-vaults', { method: 'POST', body: JSON.stringify(data) })
    ),

  createVaultInvitation: (vaultId: string, invitedEmail?: string): Promise<VaultInvitation> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.createVaultInvitation(auth.currentUser, vaultId, invitedEmail);
        }
        return request<VaultInvitation>(`/joint-vaults/${vaultId}/invitations`, {
          method: 'POST',
          body: JSON.stringify({ invitedEmail }),
        });
      },
      () =>
        request<VaultInvitation>(`/joint-vaults/${vaultId}/invitations`, {
          method: 'POST',
          body: JSON.stringify({ invitedEmail }),
        })
    ),

  acceptVaultInvitation: (inviteCode: string): Promise<{ vault: JointVault; invitation: VaultInvitation }> =>
    withPrimaryWrite(
      async () => {
        if (!auth.currentUser) {
          throw new Error('Authentication required to accept a cloud vault invitation.');
        }
        return await firestoreService.acceptVaultInvitation(auth.currentUser, inviteCode);
      },
      () =>
        request<{ vault: JointVault; invitation: VaultInvitation }>('/joint-vaults/invitations/accept', {
          method: 'POST',
          body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
        })
    ),

  rejectVaultInvitation: (inviteCode: string): Promise<VaultInvitation> =>
    withPrimaryWrite(
      async () => {
        if (!auth.currentUser) {
          throw new Error('Authentication required to reject a cloud vault invitation.');
        }
        return await firestoreService.rejectVaultInvitation(auth.currentUser, inviteCode);
      },
      () =>
        request<VaultInvitation>('/joint-vaults/invitations/reject', {
          method: 'POST',
          body: JSON.stringify({ inviteCode }),
        })
    ),

  revokeVaultInvitation: (vaultId: string, inviteId: string): Promise<boolean> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          const res = await firestoreService.revokeVaultInvitation(auth.currentUser, vaultId, inviteId);
          return res.success;
        }
        const res = await request<{ success: boolean }>(`/joint-vaults/${vaultId}/invitations/${inviteId}/revoke`, {
          method: 'POST',
        });
        return Boolean(res?.success);
      },
      async () => {
        const res = await request<{ success: boolean }>(`/joint-vaults/${vaultId}/invitations/${inviteId}/revoke`, {
          method: 'POST',
        });
        return Boolean(res?.success);
      }
    ),

  addVaultContribution: (
    vaultId: string,
    data: { amountPaise: number; date?: string; description?: string }
  ): Promise<VaultContribution> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.addVaultContribution(auth.currentUser, vaultId, data);
        }
        const res = await request<{ contribution: VaultContribution }>(`/joint-vaults/${vaultId}/contributions`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.contribution;
      },
      async () => {
        const res = await request<{ contribution: VaultContribution }>(`/joint-vaults/${vaultId}/contributions`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.contribution;
      }
    ),

  reverseVaultContribution: (
    vaultId: string,
    contributionId: string,
    reason: string
  ): Promise<VaultContribution> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.reverseVaultContribution(auth.currentUser, vaultId, contributionId, reason);
        }
        const res = await request<{ contribution: VaultContribution }>(
          `/joint-vaults/${vaultId}/contributions/${contributionId}/reverse`,
          {
            method: 'POST',
            body: JSON.stringify({ reason }),
          }
        );
        return res.contribution;
      },
      async () => {
        const res = await request<{ contribution: VaultContribution }>(
          `/joint-vaults/${vaultId}/contributions/${contributionId}/reverse`,
          {
            method: 'POST',
            body: JSON.stringify({ reason }),
          }
        );
        return res.contribution;
      }
    ),

  addVaultExpense: (
    vaultId: string,
    data: {
      amountPaise: number;
      description: string;
      date?: string;
      splitMode?: ExpenseSplitMode;
      customShares?: Record<string, number>;
    }
  ): Promise<VaultExpense> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.addVaultExpense(auth.currentUser, vaultId, data);
        }
        const res = await request<{ expense: VaultExpense }>(`/joint-vaults/${vaultId}/expenses`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.expense;
      },
      async () => {
        const res = await request<{ expense: VaultExpense }>(`/joint-vaults/${vaultId}/expenses`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.expense;
      }
    ),

  reverseVaultExpense: (vaultId: string, expenseId: string): Promise<VaultExpense> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.reverseVaultExpense(auth.currentUser, vaultId, expenseId);
        }
        const res = await request<{ expense: VaultExpense }>(`/joint-vaults/${vaultId}/expenses/${expenseId}/reverse`, {
          method: 'POST',
        });
        return res.expense;
      },
      async () => {
        const res = await request<{ expense: VaultExpense }>(`/joint-vaults/${vaultId}/expenses/${expenseId}/reverse`, {
          method: 'POST',
        });
        return res.expense;
      }
    ),

  recordVaultSettlement: (
    vaultId: string,
    data: { toUid: string; toName?: string; amountPaise: number; date?: string; notes?: string }
  ): Promise<VaultSettlement> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.recordVaultSettlement(auth.currentUser, vaultId, data);
        }
        const res = await request<{ settlement: VaultSettlement }>(`/joint-vaults/${vaultId}/settlements`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.settlement;
      },
      async () => {
        const res = await request<{ settlement: VaultSettlement }>(`/joint-vaults/${vaultId}/settlements`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.settlement;
      }
    ),

  updateVaultRatio: (vaultId: string, targetRatio: Record<string, number>): Promise<JointVault> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.updateVaultRatio(auth.currentUser, vaultId, targetRatio);
        }
        return request<JointVault>(`/joint-vaults/${vaultId}/ratio`, {
          method: 'PATCH',
          body: JSON.stringify({ targetRatio }),
        });
      },
      () =>
        request<JointVault>(`/joint-vaults/${vaultId}/ratio`, {
          method: 'PATCH',
          body: JSON.stringify({ targetRatio }),
        })
    ),

  leaveVault: (vaultId: string): Promise<boolean> =>
    withPrimaryWrite(
      async () => {
        if (!auth.currentUser) {
          throw new Error('Authentication required to leave a cloud vault.');
        }
        return await firestoreService.leaveVault(auth.currentUser, vaultId);
      },
      async () => {
        const res = await request<{ success: boolean }>(`/joint-vaults/${vaultId}/leave`, {
          method: 'POST',
        });
        return Boolean(res?.success);
      }
    ),

  archiveVault: (vaultId: string): Promise<JointVault> =>
    withPrimaryWrite(
      async () => {
        if (auth.currentUser) {
          return await firestoreService.archiveVault(auth.currentUser, vaultId);
        }
        return request<JointVault>(`/joint-vaults/${vaultId}/archive`, {
          method: 'POST',
        });
      },
      () =>
        request<JointVault>(`/joint-vaults/${vaultId}/archive`, {
          method: 'POST',
        })
    ),

  subscribeToVault: (vaultId: string, onUpdate: (summary: VaultSummary | null) => void): (() => void) => {
    if (auth.currentUser) {
      try {
        return firestoreService.subscribeToVault(vaultId, onUpdate);
      } catch (err) {
        console.warn('[JointVaults] Firestore subscription failed, falling back to polling:', err);
      }
    }
    const interval = setInterval(() => {
      api.getJointVault(vaultId).then(onUpdate).catch(() => onUpdate(null));
    }, 4000);
    return () => clearInterval(interval);
  },
};

void auth;
