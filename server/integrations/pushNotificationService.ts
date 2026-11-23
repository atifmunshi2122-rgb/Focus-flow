import crypto from 'crypto';
import { getAdminFirestore, getAdminMessaging, hasServiceAccountCredentials } from '../firebaseAdmin.js';
import { dbService } from '../db.js';
import { evaluateDeterministicNotifications } from '../../src/lib/notificationsEngine.js';

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
  category?: 'task' | 'bill' | 'focus' | 'budget' | 'sync' | 'study';
  tag?: string;
  data?: Record<string, string>;
}

export class PushNotificationService {
  private customFirestore: any = null;

  constructor(customFirestore?: any) {
    if (customFirestore) {
      this.customFirestore = customFirestore;
    }
  }

  public setFirestoreForTesting(db: any): void {
    this.customFirestore = db;
  }

  private get firestore() {
    return this.customFirestore || getAdminFirestore();
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
      (!hasServiceAccountCredentials() && !process.env.FIRESTORE_EMULATOR_HOST && !this.customFirestore)
    ) {
      return { enabled: false, deviceCount: 0, devices: [] };
    }

    const snap = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('fcm_installations')
      .get();

    const devices = snap.docs.map((d: any) => {
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

    // 1. Check user notification preferences
    let settings = dbService.getUserSettings(userId);
    if (!settings && (hasServiceAccountCredentials() || process.env.FIRESTORE_EMULATOR_HOST || this.customFirestore)) {
      try {
        const settingsDoc = await this.firestore.collection('users').doc(userId).collection('settings').doc('preferences').get();
        if (settingsDoc.exists) {
          settings = settingsDoc.data() as any;
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

    // 2. Query registered installations
    const installationsSnap = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('fcm_installations')
      .where('enabled', '==', true)
      .get();

    if (installationsSnap.empty) {
      return { delivered: 0, failed: 0 };
    }

    const tokens: string[] = [];
    const docMap = new Map<string, any>();

    installationsSnap.docs.forEach((d: any) => {
      const data = d.data() as FcmInstallation;
      if (data.token) {
        tokens.push(data.token);
        docMap.set(data.token, d.ref);
      }
    });

    if (tokens.length === 0) {
      return { delivered: 0, failed: 0 };
    }

    // 3. Dispatch via Firebase Admin Messaging
    const messaging = getAdminMessaging();
    const targetTab = notification.targetTab || 'dashboard';

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        targetTab,
        category: notification.category || 'general',
        tag: notification.tag || `focusflow_${Date.now()}`,
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

    // 4. Stale Device Cleanup (remove invalid or unregistered tokens)
    let staleCount = 0;
    const cleanupBatch = this.firestore.batch();

    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          const badToken = tokens[idx];
          const ref = docMap.get(badToken);
          if (ref) {
            cleanupBatch.delete(ref);
            staleCount++;
          }
        }
      }
    });

    if (staleCount > 0) {
      await cleanupBatch.commit().catch((err: any) => {
        console.warn('[FCM] Stale device token cleanup batch error:', err);
      });
    }

    return {
      delivered: response.successCount,
      failed: response.failureCount,
    };
  }

  /**
   * Sends an immediate test notification.
   */
  public async sendTestNotification(userId: string): Promise<{ delivered: number; failed: number }> {
    return this.sendNotification(userId, {
      title: 'FocusFlow Notification Test',
      body: 'Push notifications are connected and working properly on your device!',
      category: 'focus',
      targetTab: 'settings',
      tag: 'test_notification',
    });
  }

  /**
   * Processes and dispatches scheduled notifications across users.
   * Employs the notification_delivery_ledger for at-most-once idempotency.
   */
  public async processScheduledNotifications(): Promise<{
    processedUsers: number;
    dispatchedCount: number;
  }> {
    const todayStr = new Date().toISOString().slice(0, 10);
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

    if (hasServiceAccountCredentials() || process.env.FIRESTORE_EMULATOR_HOST || this.customFirestore) {
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

    for (const userId of userIds) {
      const deviceStatus = await this.getDeviceStatus(userId);
      if (!deviceStatus.enabled || deviceStatus.deviceCount === 0) continue;

      processedUsers++;
      let settings = dbService.getUserSettings(userId) || null;
      let tasks = rawDb.tasks.filter((t: any) => t.userId === userId && !t.deletedAt);
      let bills = rawDb.bills.filter((b: any) => b.userId === userId && !b.deletedAt);

      if (hasServiceAccountCredentials() || process.env.FIRESTORE_EMULATOR_HOST || this.customFirestore) {
        try {
          const [tSnap, bSnap, sSnap] = await Promise.all([
            this.firestore.collection('users').doc(userId).collection('tasks').get(),
            this.firestore.collection('users').doc(userId).collection('bills').get(),
            this.firestore.collection('users').doc(userId).collection('settings').doc('preferences').get(),
          ]);
          if (!tSnap.empty) {
            tasks = tSnap.docs.map((d: any) => d.data()).filter((t: any) => !t.deletedAt);
          }
          if (!bSnap.empty) {
            bills = bSnap.docs.map((d: any) => d.data()).filter((b: any) => !b.deletedAt);
          }
          if (sSnap.exists) {
            settings = sSnap.data() as any;
          }
        } catch (err) {
          console.warn(`[FCM] Error loading Firestore records for ${userId}:`, err);
        }
      }

      const dashboard = null;
      const financeSummary = null;

      const items = evaluateDeterministicNotifications({
        settings: (settings as any) || null,
        tasks,
        bills,
        dashboard,
        financeSummary,
      });

      for (const item of items) {
        const entryId = `${item.category}_${item.id}_${todayStr}`;
        const ledgerRef = this.firestore
          .collection('users')
          .doc(userId)
          .collection('notification_delivery_ledger')
          .doc(entryId);

        const existing = await ledgerRef.get();
        if (existing.exists) {
          // Already sent today
          continue;
        }

        const res = await this.sendNotification(userId, {
          title: item.title,
          body: item.message,
          category: item.category as any,
          targetTab: item.targetTab,
          tag: entryId,
        });

        if (res.delivered > 0) {
          dispatchedCount += res.delivered;
          await ledgerRef.set({
            entryId,
            category: item.category,
            title: item.title,
            body: item.message,
            targetTab: item.targetTab,
            deliveredAt: new Date().toISOString(),
            status: 'sent',
          });
        }
      }
    }

    return { processedUsers, dispatchedCount };
  }
}

export const pushNotificationService = new PushNotificationService();
