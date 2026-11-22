import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  getNotificationPermission,
  enablePushNotifications,
  disablePushNotifications,
  fetchPushDeviceStatus,
  sendTestPushNotification,
  setupForegroundNotificationListener,
} from '../lib/pushNotifications.ts';

export function usePushNotifications() {
  const [supported] = useState<boolean>(isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(getNotificationPermission());
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setPermission(getNotificationPermission());
    if (!supported) return;

    try {
      const status = await fetchPushDeviceStatus();
      setIsRegistered(status.enabled);
      setDeviceCount(status.deviceCount);
    } catch {
      // Ignore network errors on passive check
    }
  }, [supported]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Setup foreground message listener
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    setupForegroundNotificationListener((payload) => {
      console.log('[PushNotifications] Foreground push received:', payload);
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const enable = async (vapidKey?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await enablePushNotifications(vapidKey);
      if (res.success) {
        setIsRegistered(true);
        setPermission(getNotificationPermission());
        await refreshStatus();
        return true;
      } else {
        setError(res.error || 'Failed to enable notifications');
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to enable';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const disable = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await disablePushNotifications();
      setIsRegistered(false);
      setDeviceCount(0);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disable';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await sendTestPushNotification();
      if (!res.success) {
        setError(res.error || 'Failed to send test push');
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    supported,
    permission,
    isRegistered,
    deviceCount,
    loading,
    error,
    enable,
    disable,
    sendTest,
    refreshStatus,
  };
}

