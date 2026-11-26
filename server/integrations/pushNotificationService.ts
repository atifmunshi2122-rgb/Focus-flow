import crypto from 'crypto';
import { getAdminFirestore, getAdminMessaging, hasServiceAccountCredentials } from '../firebaseAdmin.js';
import { dbService } from '../db.js';
import { DEFAULT_TIMEZONE, formatDateInTimezone, getTodayDateString } from '../dateTime.js';
import { evaluateDeterministicNotifications } from '../../src/lib/notificationsEngine.js';
import type { DashboardData, FinanceSummaryData } from '../../src/types/index.js';

export interface FcmInstallation {
  installationId: string;
  token: string;
  userAgent?: string;
  platform?: string;
  enabled: boolean;
  registeredAt: string;
  lastSeenAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  targetTab?: string;
  category?: 'task' | 'bill' | 'focus' | 'budget' | 'sync' | 'study' | 'habit' | 'test';
  tag?: string;
  data?: Record<string, string>;
  bypassPreferences?: boolean;
}

export class PushNotificationService {
  private customFirestore: any = null;
  private customMessaging: any = null;

  constructor(customFirestore?: any) {
    if (customFirestore) {
      this.customFirestore = customFirestore;
    }
  }

  public setFirestoreForTesting(db: any): void {
    this.customFirestore = db;
  }

  public setMessagingForTesting(messaging: any): void {
    this.customMessaging = messaging;
  }

  private get firestore() {
    return this.customFirestore || getAdminFirestore();
  }

  private get messaging() {
    return this.customMessaging || getAdminMessaging();
  }

  /**
   * Registers a web push device token and installation identifier.
   */
  public async registerDevice(
    userId: string,
    params: {
      token: string;
      installationId?: string;
      platform?: string;
      userAgent?: string;
    }
  ): Promise<FcmInstallation> {
    if (!userId || userId.startsWith('gst_')) {
      throw new Error('Authenticated user required for device registration');
    }
    if (!params.token || typeof params.token !== 'string') {
      throw new Error('Valid FCM registration token is required');
    }

    const installationId =
      params.installationId ||
      crypto.createHash('sha256').update(`${userId}:${params.token}`).digest('hex').slice(0, 32);

    const nowIso = new Date().toISOString();
    const instRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('fcm_installations')
      .doc(installationId);

    const existing = await instRef.get();
    const registeredAt = existing.exists ? existing.data()?.registeredAt || nowIso : nowIso;

    const installation: FcmInstallation = {
      installationId,
      token: params.token.trim(),
      userAgent: params.userAgent || 'Web Browser',
      platform: params.platform || 'web',
      enabled: true,
      registeredAt,
      lastSeenAt: nowIso,
    };

    await instRef.set(installation, { merge: true });
    return installation;
  }

  /**
   * Unregisters a device installation.
   */
  public async unregisterDevice(userId: string, installationIdOrToken: string): Promise<boolean> {
    if (!userId || userId.startsWith('gst_')) return false;
    if (!hasServiceAccountCredentials() && !this.customFirestore) {
      return false;
    }

    const colRef = this.firestore.collection('users').doc(userId).collection('fcm_installations');

    // 1. Try by document ID
    const docRef = colRef.doc(installationIdOrToken);
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.delete();
      return true;
    }

    // 2. Try by token value
    const tokenQuery = await colRef.where('token', '==', installationIdOrToken).limit(1).get();
    if (!tokenQuery.empty) {
      await tokenQuery.docs[0].ref.delete();
      return true;
    }

    return false;
  }

  /**
   * Returns device registration status and connected devices count.
   */
  public async getDeviceStatus(userId: string): Promise<{
    enabled: boolean;
    deviceCount: number;
    devices: Array<{ installationId: string; platform?: string; userAgent?: string; lastSeenAt: string }>;
  }> {
    if (
      !userId ||
      userId.startsWith('gst_') ||
      (!hasServiceAccountCredentials() && !this.customFirestore)
    ) {
      return { enabled: false, deviceCount: 0, devices: [] };
    }

    const colRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('fcm_installations');

    const hasWhere = typeof colRef.where === 'function';
    let rawDocs: any[] = [];
    if (hasWhere) {
      const snap = await colRef.where('enabled', '==', true).get();
      rawDocs = snap?.docs || [];
      if (rawDocs.length === 0 && this.customFirestore && typeof colRef.get === 'function') {
        const fallbackSnap = await colRef.get();
        rawDocs = (fallbackSnap?.docs || []).filter((d: any) => d.data?.()?.enabled === true);
      }
    } else {
      const snap = await colRef.get();
      rawDocs = snap?.docs || [];
    }

    const devices = rawDocs
      .filter((d: any) => {
        const data = d.data?.() as Partial<FcmInstallation> | undefined;
        if (!data) return false;
        return hasWhere ? data.enabled === true : data.enabled !== false;
      })
      .map((d: any) => {
        const data = d.data() as FcmInstallation;
        return {
          installationId: data.installationId || d.id,
          platform: data.platform,
          userAgent: data.userAgent,
          lastSeenAt: data.lastSeenAt,
        };
      });

    return {
      enabled: devices.length > 0,
      deviceCount: devices.length,
      devices,
    };
  }

  /**
   * Sends multicast push notifications to all active user devices.
   * Cleans up stale or revoked device tokens automatically.
   */
  public async sendNotification(
    userId: string,
    notification: NotificationPayload
  ): Promise<{ delivered: number; failed: number; skipped?: boolean }> {
    if (!userId || userId.startsWith('gst_')) {
      return { delivered: 0, failed: 0, skipped: true };
    }

    const bypassPrefs = notification.bypassPreferences === true || notification.category === 'test';

    if (!bypassPrefs) {
      // 1. Check user notification preferences (authoritative doc is settings/default; legacy fallback: settings/preferences)
      let settings = dbService.getUserSettings(userId);
      if (hasServiceAccountCredentials() || this.customFirestore) {
        try {
          const settingsCol = this.firestore.collection('users').doc(userId).collection('settings');
          const defaultDoc = await settingsCol.doc('default').get();
          if (defaultDoc.exists) {
            settings = defaultDoc.data() as any;
          } else if (!settings) {
            const legacyDoc = await settingsCol.doc('preferences').get().catch(() => null);
            if (legacyDoc?.exists) {
              settings = legacyDoc.data() as any;
            }
          }
        } catch {
          // Fallback to local
        }
      }
      const prefs = (settings?.notificationPrefs as any) || {};

      if (prefs.enabled === false) {
        return { delivered: 0, failed: 0, skipped: true };
      }

      // Check category-specific opt-out
      if (notification.category) {
        if (notification.category === 'task' && prefs.taskDeadlines === false) return { delivered: 0, failed: 0, skipped: true };
        if (notification.category === 'bill' && prefs.upcomingBills === false && prefs.overdueBills === false) return { delivered: 0, failed: 0, skipped: true };
        if (notification.category === 'focus' && prefs.focusCompletion === false) return { delivered: 0, failed: 0, skipped: true };
        if (notification.category === 'budget' && prefs.budgetWarnings === false) return { delivered: 0, failed: 0, skipped: true };
        if (notification.category === 'sync' && prefs.syncFailures === false) return { delivered: 0, failed: 0, skipped: true };
        if (notification.category === 'study' && prefs.studyReminders === false) return { delivered: 0, failed: 0, skipped: true };
      }
    }

    // 2. Query registered installations
    const instCol = this.firestore
      .collection('users')
      .doc(userId)
      .collection('fcm_installations');
    const installationsSnap =
      typeof instCol.where === 'function'
        ? await instCol.where('enabled', '==', true).get()
        : await instCol.get();

    if (!installationsSnap || installationsSnap.empty || !(installationsSnap.docs || []).length) {
      return { delivered: 0, failed: 0 };
    }

    const tokens: string[] = [];
    const docMap = new Map<string, any>();

    installationsSnap.docs.forEach((d: any) => {
      const data = d.data() as FcmInstallation;
      if (data && data.enabled !== false && data.token) {
        tokens.push(data.token);
        docMap.set(data.token, d.ref);
      }
    });

    if (tokens.length === 0) {
      return { delivered: 0, failed: 0 };
    }

    // 3. Dispatch via Firebase Admin Messaging (chunked to <= 500 tokens per FCM multicast call)
    const FCM_MULTICAST_LIMIT = 500;
    const messaging = this.messaging;
    const targetTab = notification.targetTab || 'dashboard';
    const tagValue = notification.tag || `focusflow_${Date.now()}`;

    let delivered = 0;
    let failed = 0;
    const staleRefs: any[] = [];

    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      const tokenChunk = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
      const response = await messaging.sendEachForMulticast({
        tokens: tokenChunk,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          targetTab,
          category: notification.category || 'general',
          tag: tagValue,
          ...(notification.data || {}),
        },
        webpush: {
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: notification.tag,
          },
          fcmOptions: {
            link: `/?tab=${targetTab}`,
          },
        },
      });

      delivered += response.successCount || 0;
      failed += response.failureCount || 0;

      // Collect invalid or unregistered tokens from this chunk
      (response.responses || []).forEach((resp: any, idx: number) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const badToken = tokenChunk[idx];
            const ref = docMap.get(badToken);
            if (ref) {
              staleRefs.push(ref);
            }
          }
        }
      });
    }

    // 4. Stale Device Cleanup in chunks <= 450 to stay within Firestore 500-write batch limit
    const FIRESTORE_BATCH_LIMIT = 450;
    for (let i = 0; i < staleRefs.length; i += FIRESTORE_BATCH_LIMIT) {
      const cleanupBatch = this.firestore.batch();
      staleRefs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((ref) => cleanupBatch.delete(ref));
      await cleanupBatch.commit().catch((err: any) => {
        console.warn('[FCM] Stale device token cleanup batch error:', err);
      });
    }

    return {
      delivered,
      failed,
    };
  }

  /**
   * Sends an immediate test notification bypassing category preference toggles.
   */
  public async sendTestNotification(userId: string): Promise<{ delivered: number; failed: number }> {
    return this.sendNotification(userId, {
      title: 'FocusFlow Notification Test',
      body: 'Push notifications are connected and working properly on your device!',
      category: 'test',
      bypassPreferences: true,
      targetTab: 'settings',
      tag: 'test_notification',
    });
  }

  /**
   * Processes and dispatches scheduled notifications across users.
   * Employs atomic notification_delivery_ledger claims for at-most-once idempotency.
   */
  public async processScheduledNotifications(): Promise<{
    processedUsers: number;
    dispatchedCount: number;
  }> {
    let dispatchedCount = 0;
    let processedUsers = 0;

    // Retrieve active users from local dbService and Firestore
    const rawDb = dbService.getRaw();
    const userIdsSet = new Set<string>();

    for (const u of rawDb.users || []) {
      if (u.id && !u.id.startsWith('gst_')) {
        userIdsSet.add(u.id);
      }
    }

    if (hasServiceAccountCredentials() || this.customFirestore) {
      try {
        const usersSnap = await this.firestore.collection('users').get();
        usersSnap.docs.forEach((d: any) => {
          if (d.id && !d.id.startsWith('gst_')) {
            userIdsSet.add(d.id);
          }
        });
      } catch (err) {
        console.warn('[FCM] Error discovering users in Firestore:', err);
      }
    }

    const userIds = Array.from(userIdsSet);
    const isAlreadyExistsError = (err: unknown): boolean => {
      if (!err || typeof err !== 'object') return false;
      const code = (err as { code?: unknown }).code;
      const msg = String((err as { message?: unknown }).message || '');
      return (
        code === 6 ||
        code === 'already-exists' ||
        code === 'ALREADY_EXISTS' ||
        /already[-_ ]exists/i.test(msg)
      );
    };

    for (const userId of userIds) {
      const deviceStatus = await this.getDeviceStatus(userId);
      if (!deviceStatus.enabled || deviceStatus.deviceCount === 0) continue;

      processedUsers++;
      let settings = dbService.getUserSettings(userId) || null;
      let tasks = (rawDb.tasks || []).filter((t: any) => t.userId === userId && !t.deletedAt);
      let bills = (rawDb.bills || []).filter((b: any) => b.userId === userId && !b.deletedAt);
      let expenses = (rawDb.expenseTransactions || []).filter((e: any) => e.userId === userId && !e.deletedAt);
      let focusSessions = (rawDb.focusSessions || []).filter((s: any) => s.userId === userId);
      let categories = (rawDb.categories || []).filter(
        (c: any) => c.userId === userId || c.userId === 'usr_atif_default'
      );
      let savingsGoals = (rawDb.savingsGoals || []).filter((g: any) => g.userId === userId);
      let habits = ((rawDb as any).habits || []).filter((h: any) => h.userId === userId && !h.deletedAt);

      if (hasServiceAccountCredentials() || this.customFirestore) {
        try {
          const userRef = this.firestore.collection('users').doc(userId);
          const settingsCol = userRef.collection('settings');
          const safeGetCol = (colName: string) =>
            typeof userRef.collection === 'function'
              ? Promise.resolve(userRef.collection(colName)?.get?.()).catch(() => null)
              : Promise.resolve(null);
          const safeGetSettingsDoc = (docId: string) =>
            typeof settingsCol?.doc === 'function'
              ? Promise.resolve(settingsCol.doc(docId)?.get?.()).catch(() => null)
              : Promise.resolve(null);

          const [
            tSnap,
            bSnap,
            eSnap,
            fSnap,
            hSnap,
            defaultSnap,
            legacySnap,
            categoriesDoc,
            savingsGoalsDoc,
          ] = await Promise.all([
            safeGetCol('tasks'),
            safeGetCol('bills'),
            safeGetCol('expenses'),
            safeGetCol('focus_sessions'),
            safeGetCol('habits'),
            safeGetSettingsDoc('default'),
            safeGetSettingsDoc('preferences'),
            safeGetSettingsDoc('categories'),
            safeGetSettingsDoc('savings_goals'),
          ]);

          if (tSnap && Array.isArray(tSnap.docs) && (tSnap.docs.length > 0 || tasks.length === 0)) {
            tasks = tSnap.docs.map((d: any) => d.data()).filter((t: any) => !t.deletedAt);
          }
          if (bSnap && Array.isArray(bSnap.docs) && (bSnap.docs.length > 0 || bills.length === 0)) {
            bills = bSnap.docs.map((d: any) => d.data()).filter((b: any) => !b.deletedAt);
          }
          if (eSnap && Array.isArray(eSnap.docs) && (eSnap.docs.length > 0 || expenses.length === 0)) {
            expenses = eSnap.docs.map((d: any) => d.data()).filter((e: any) => !e.deletedAt);
          }
          if (fSnap && Array.isArray(fSnap.docs) && (fSnap.docs.length > 0 || focusSessions.length === 0)) {
            focusSessions = fSnap.docs.map((d: any) => d.data());
          }
          if (hSnap && Array.isArray(hSnap.docs) && (hSnap.docs.length > 0 || habits.length === 0)) {
            habits = hSnap.docs.map((d: any) => d.data()).filter((h: any) => !h.deletedAt);
          }
          if (defaultSnap?.exists) {
            settings = defaultSnap.data() as any;
          } else if (legacySnap?.exists) {
            settings = legacySnap.data() as any;
          }
          if (categoriesDoc?.exists && Array.isArray(categoriesDoc.data?.()?.items)) {
            categories = categoriesDoc.data().items;
          }
          if (savingsGoalsDoc?.exists && Array.isArray(savingsGoalsDoc.data?.()?.items)) {
            savingsGoals = savingsGoalsDoc.data().items;
          }
        } catch (err) {
          console.warn(`[FCM] Error loading Firestore records for ${userId}:`, err);
        }
      }

      const userTimezone = (settings as any)?.timezone || DEFAULT_TIMEZONE;
      const now = new Date();
      const userTodayStr = getTodayDateString(userTimezone);
      const currentMonthKey = userTodayStr.slice(0, 7);

      const monthlyExpenses = expenses.filter(
        (e: any) => typeof e?.date === 'string' && e.date.startsWith(currentMonthKey)
      );
      const monthlyExpensesPaise = monthlyExpenses.reduce(
        (sum: number, e: any) => sum + (Number(e.amountPaise) || 0),
        0
      );
      const todayExpensesPaise = expenses
        .filter((e: any) => e?.date === userTodayStr)
        .reduce((sum: number, e: any) => sum + (Number(e.amountPaise) || 0), 0);

      const todayFocusSeconds = focusSessions
        .filter((s: any) => {
          if (!s || !s.completed || s.mode !== 'work' || !s.startedAt) return false;
          try {
            return formatDateInTimezone(s.startedAt, userTimezone) === userTodayStr;
          } catch {
            return false;
          }
        })
        .reduce((sum: number, s: any) => {
          const secs =
            typeof s.durationSeconds === 'number'
              ? s.durationSeconds
              : Math.round((Number(s.durationMinutes) || 0) * 60);
          return sum + Math.max(0, secs);
        }, 0);

      const categoryMap: Record<
        string,
        { categoryId: string; name: string; color: string; amountPaise: number }
      > = {};
      for (const exp of monthlyExpenses) {
        const cat = categories.find((c: any) => c.id === exp.categoryId);
        const catId = exp.categoryId || 'other';
        if (!categoryMap[catId]) {
          categoryMap[catId] = {
            categoryId: catId,
            name: cat?.name || (exp.type === 'fixed' ? 'Fixed Expense' : 'Uncategorized'),
            color: cat?.color || '#94a3b8',
            amountPaise: 0,
          };
        }
        categoryMap[catId].amountPaise += Number(exp.amountPaise) || 0;
      }

      const dashboard: DashboardData = {
        todayFocusMinutes: Math.round(todayFocusSeconds / 60),
        completedPomodoroSessions: 0,
        focusStreakDays: 0,
        todayExpensesPaise,
        monthlyIncomePaise: 0,
        monthlyExpensesPaise,
        fixedExpensesPaise: monthlyExpenses
          .filter((e: any) => e.type === 'fixed')
          .reduce((sum: number, e: any) => sum + (Number(e.amountPaise) || 0), 0),
        variableExpensesPaise: monthlyExpenses
          .filter((e: any) => e.type === 'variable')
          .reduce((sum: number, e: any) => sum + (Number(e.amountPaise) || 0), 0),
        remainingBalancePaise: -monthlyExpensesPaise,
        paidBillsCount: bills.filter((b: any) => b.status === 'PAID').length,
        unpaidBillsCount: bills.filter((b: any) => b.status === 'UNPAID' || b.status === 'OVERDUE').length,
        totalPaidAmountPaise: 0,
        totalUnpaidAmountPaise: 0,
        upcomingPayments: [],
        recentTransactions: [],
      };

      const financeSummary: FinanceSummaryData = {
        filter: 'month',
        startDate: `${currentMonthKey}-01`,
        endDate: userTodayStr,
        totalIncomePaise: 0,
        totalExpensePaise: monthlyExpensesPaise,
        fixedExpensesPaise: dashboard.fixedExpensesPaise,
        variableExpensesPaise: dashboard.variableExpensesPaise,
        remainingBalancePaise: -monthlyExpensesPaise,
        totalPaidAmountPaise: 0,
        totalUnpaidAmountPaise: 0,
        paidBillsCount: dashboard.paidBillsCount,
        unpaidBillsCount: dashboard.unpaidBillsCount,
        categoryBreakdown: Object.values(categoryMap).sort((a, b) => b.amountPaise - a.amountPaise),
        monthlyTrend: [],
      };

      const items = evaluateDeterministicNotifications({
        settings: (settings as any) || null,
        tasks,
        bills,
        dashboard,
        financeSummary,
        expenses,
        savingsGoals,
        habits,
        now,
      });

      for (const item of items) {
        const entryId = `${item.category}_${item.id}_${userTodayStr}`;
        const ledgerRef = this.firestore
          .collection('users')
          .doc(userId)
          .collection('notification_delivery_ledger')
          .doc(entryId);

        const canAtomicCreate = typeof ledgerRef.create === 'function';
        if (canAtomicCreate) {
          try {
            await ledgerRef.create({
              entryId,
              category: item.category,
              title: item.title,
              body: item.message,
              targetTab: item.targetTab,
              claimedAt: new Date().toISOString(),
              status: 'claiming',
            });
          } catch (claimErr) {
            if (isAlreadyExistsError(claimErr)) {
              // Concurrent cron run already claimed or sent this entry today
              continue;
            }
            throw claimErr;
          }
        } else {
          const existing = await ledgerRef.get();
          if (existing.exists) {
            // Already sent today
            continue;
          }
        }

        let res: { delivered: number; failed: number; skipped?: boolean };
        try {
          res = await this.sendNotification(userId, {
            title: item.title,
            body: item.message,
            category: item.category as any,
            targetTab: item.targetTab,
            tag: entryId,
          });
        } catch (sendErr) {
          if (canAtomicCreate && typeof ledgerRef.delete === 'function') {
            await ledgerRef.delete().catch(() => {});
          }
          throw sendErr;
        }

        if (res.delivered > 0) {
          dispatchedCount += res.delivered;
          const sentPayload = {
            entryId,
            category: item.category,
            title: item.title,
            body: item.message,
            targetTab: item.targetTab,
            deliveredAt: new Date().toISOString(),
            status: 'sent',
          };
          if (canAtomicCreate && typeof ledgerRef.update === 'function') {
            await ledgerRef.update(sentPayload);
          } else {
            await ledgerRef.set(sentPayload);
          }
        } else if (res.skipped && canAtomicCreate) {
          const skippedPayload = {
            entryId,
            category: item.category,
            status: 'skipped',
            updatedAt: new Date().toISOString(),
          };
          if (typeof ledgerRef.update === 'function') {
            await ledgerRef.update(skippedPayload);
          } else {
            await ledgerRef.set(skippedPayload, { merge: true });
          }
        } else if (canAtomicCreate && typeof ledgerRef.delete === 'function') {
          await ledgerRef.delete().catch(() => {});
        }
      }
    }

    return { processedUsers, dispatchedCount };
  }
}

export const pushNotificationService = new PushNotificationService();
