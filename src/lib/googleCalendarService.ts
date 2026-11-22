import { getFirebaseIdToken } from './firebase.ts';
import type {
  GoogleCalendarConnectionStatus,
  GoogleCalendarEntry,
  GoogleCalendarListEntry,
  SyncResult,
} from '../types/calendar.ts';

class GoogleCalendarClientService {
  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error('You must be signed in to access Google Calendar');
    }
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Retrieves connection and sync status.
   */
  public async getStatus(): Promise<GoogleCalendarConnectionStatus> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch('/api/integrations/google-calendar/status', { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch status (${res.status})`);
      }
      return await res.json();
    } catch (err) {
      return {
        connected: false,
        calendarId: 'primary',
        autoSyncTasks: false,
        autoSyncTimeBlocks: false,
        autoSyncStudySchedule: false,
        lastSyncAt: null,
      };
    }
  }

  /**
   * Starts OAuth flow in a popup window and waits for completion.
   */
  public async connectCalendar(): Promise<boolean> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/integrations/google-calendar/oauth/start', { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to initiate Google Calendar OAuth' }));
      throw new Error(err.error || 'Failed to start OAuth');
    }

    const { authUrl } = await res.json();

    return new Promise((resolve, reject) => {
      const width = 540;
      const height = 660;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'google_calendar_oauth',
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
      );

      if (!popup) {
        reject(new Error('Popup blocked by browser. Please allow popups to connect Google Calendar.'));
        return;
      }

      let resolved = false;

      const messageListener = (event: MessageEvent) => {
        if (event.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
          cleanup();
          resolved = true;
          resolve(true);
        } else if (event.data?.type === 'GOOGLE_CALENDAR_AUTH_ERROR') {
          cleanup();
          resolved = true;
          reject(new Error(event.data.error || 'Google Calendar authorization failed'));
        }
      };

      const timer = setInterval(() => {
        if (popup.closed && !resolved) {
          cleanup();
          // Verify status in case message was dropped
          this.getStatus().then((status) => {
            if (status.connected) {
              resolve(true);
            } else {
              reject(new Error('Calendar authorization window was closed before completing consent.'));
            }
          });
        }
      }, 800);

      const cleanup = () => {
        clearInterval(timer);
        window.removeEventListener('message', messageListener);
      };

      window.addEventListener('message', messageListener);
    });
  }

  /**
   * Disconnects Google Calendar and purges stored integration metadata.
   */
  public async disconnect(): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/integrations/google-calendar/connection', {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to disconnect Google Calendar' }));
      throw new Error(err.error || 'Failed to disconnect Google Calendar');
    }
  }

  /**
   * Lists available Google Calendars.
   */
  public async getCalendars(): Promise<GoogleCalendarListEntry[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/integrations/google-calendar/calendars', { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.calendars || [];
  }

  /**
   * Fetches events within specified range.
   */
  public async getEvents(params?: { timeMin?: string; timeMax?: string; calendarId?: string }): Promise<GoogleCalendarEntry[]> {
    try {
      const headers = await this.getAuthHeaders();
      const query = new URLSearchParams();
      if (params?.timeMin) query.set('timeMin', params.timeMin);
      if (params?.timeMax) query.set('timeMax', params.timeMax);
      if (params?.calendarId) query.set('calendarId', params.calendarId);

      const res = await fetch(`/api/integrations/google-calendar/events?${query.toString()}`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    } catch {
      return [];
    }
  }

  /**
   * Triggers manual task synchronization.
   */
  public async syncTasks(calendarId?: string): Promise<SyncResult> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/integrations/google-calendar/sync/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({ calendarId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to sync tasks' }));
      throw new Error(err.error || 'Sync failed');
    }

    return await res.json();
  }
}

export const googleCalendarClient = new GoogleCalendarClientService();

