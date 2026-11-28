import { app, getFirebaseIdToken } from './firebase.ts';
import { getMessaging, getToken, deleteToken, onMessage, isSupported as isMessagingSupported } from 'firebase/messaging';

const INSTALLATION_ID_STORAGE_KEY = 'ff_fcm_installation_id_v1';

export function getOrCreateDeviceInstallationId(): string {
  if (typeof localStorage === 'undefined') return 'web_default';
  try {
    const existing = localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `web_${crypto.randomUUID()}`
        : `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'web_default';
  }
}

export interface DeviceStatusResult {
  enabled: boolean;
  deviceCount: number;
  devices: Array<{ installationId: string; platform?: string; userAgent?: string; lastSeenAt: string }>;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export function resolveVapidKey(): string {
  let key: string | undefined;
  try {
    key = import.meta.env?.VITE_FIREBASE_VAPID_KEY;
  } catch {
    // Non-Vite runtime
  }
  if (!key) {
    try {
      key = process.env?.VITE_FIREBASE_VAPID_KEY;
    } catch {
      // Ignore
    }
  }
  return key?.trim() || '';
}

/**
 * Requests browser notification permission and registers device with Firebase Cloud Messaging.
 */
export async function enablePushNotifications(vapidKeyOverride?: string): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications are not supported in this browser' };
  }

  const supported = await isMessagingSupported().catch(() => false);
  if (!supported) {
    return { success: false, error: 'Firebase Cloud Messaging is not supported in this environment' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, error: 'Notification permission was denied' };
  }

  try {
    const swReg = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const vapidKey = vapidKeyOverride || resolveVapidKey();

    const token = await getToken(messaging, {
      vapidKey: vapidKey || undefined,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return { success: false, error: 'Failed to retrieve FCM device registration token' };
    }

    // Register with FocusFlow backend
    const idToken = await getFirebaseIdToken();
    if (!idToken) {
      return { success: false, error: 'Sign in required to register device' };
    }

    const res = await fetch('/api/devices/fcm/register', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        installationId: getOrCreateDeviceInstallationId(),
        platform: 'web',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Backend registration failed' }));
      return { success: false, error: errData.error };
    }

    return { success: true, token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown push activation error';
    console.error('[FCM] Activation failed:', err);
    return { success: false, error: msg };
  }
}

/**
 * Unregisters the current device from push notifications.
 */
export async function disablePushNotifications(): Promise<boolean> {
  try {
    let currentToken: string | undefined;
    const supported = await isMessagingSupported().catch(() => false);
    if (supported) {
      const messaging = getMessaging(app);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const swReg = await navigator.serviceWorker?.ready.catch(() => undefined);
        const vapidKey = resolveVapidKey();
        if (swReg) {
          currentToken = await getToken(messaging, {
            vapidKey: vapidKey || undefined,
            serviceWorkerRegistration: swReg,
          }).catch(() => undefined);
        }
      }
      await deleteToken(messaging).catch(() => undefined);
    }

    const idToken = await getFirebaseIdToken();
    if (idToken) {
      await fetch('/api/devices/fcm/unregister', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installationId: getOrCreateDeviceInstallationId(),
          ...(currentToken ? { token: currentToken } : {}),
        }),
      }).catch(() => undefined);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks server registration status for the authenticated user.
 */
export async function fetchPushDeviceStatus(): Promise<DeviceStatusResult> {
  try {
    const idToken = await getFirebaseIdToken();
    if (!idToken) return { enabled: false, deviceCount: 0, devices: [] };

    const res = await fetch('/api/devices/fcm/status', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return { enabled: false, deviceCount: 0, devices: [] };
    return await res.json();
  } catch {
    return { enabled: false, deviceCount: 0, devices: [] };
  }
}

/**
 * Triggers a test push notification.
 */
export async function sendTestPushNotification(): Promise<{ success: boolean; delivered: number; error?: string }> {
  try {
    const idToken = await getFirebaseIdToken();
    if (!idToken) throw new Error('Sign in required');

    const res = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to send test notification' }));
      throw new Error(err.error || 'Test notification failed');
    }

    const data = await res.json();
    return { success: true, delivered: data.delivered || 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send test';
    return { success: false, delivered: 0, error: msg };
  }
}

/**
 * Subscribes to foreground push notifications.
 */
export async function setupForegroundNotificationListener(
  onNotification: (payload: any) => void
): Promise<(() => void) | null> {
  if (!isPushSupported()) return null;
  const supported = await isMessagingSupported().catch(() => false);
  if (!supported) return null;

  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      onNotification(payload);
    });
  } catch {
    return null;
  }
}

