/**
 * Desktop Notifications API wrapper for Pomodoro Timer
 * Graceful fallback when Notification API is unavailable or permission denied.
 */

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch {
    return false;
  }
}

export function sendPomodoroNotification(options: {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  requireInteraction?: boolean;
}): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag || 'focusflow-pomodoro',
      icon: options.icon || '/favicon.ico',
      requireInteraction: options.requireInteraction ?? false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
}

