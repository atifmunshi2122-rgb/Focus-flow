import crypto from 'crypto';
import { getAdminFirestore, hasServiceAccountCredentials } from '../firebaseAdmin.js';
import { encryptToken, decryptToken } from '../crypto.js';
import { GHOST_OAUTH_CLIENT_ID } from '../../src/lib/googleAuthGis.js';
import { dbService } from '../db.js';

export interface GoogleCalendarConnectionStatus {
  connected: boolean;
  calendarId: string;
  calendarName?: string;
  autoSyncTasks: boolean;
  autoSyncTimeBlocks: boolean;
  autoSyncStudySchedule: boolean;
  lastSyncAt: string | null;
  revoked?: boolean;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  htmlLink?: string;
  managePolicy: 'focusflow_managed' | 'external_readonly';
  sourceType?: 'task' | 'timeblock' | 'study_plan' | 'external';
  sourceId?: string;
}

export interface CalendarEventLink {
  sourceId: string;
  sourceType: 'task' | 'timeblock' | 'study_plan';
  googleEventId: string;
  calendarId: string;
  lastSyncedAt: string;
  checksum: string;
  managePolicy: 'focusflow_managed';
}

export class GoogleCalendarService {
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
   * Resolves OAuth 2.0 client configuration.
   */
  public getOAuthCredentials(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId =
      process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ||
      process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID?.trim() ||
      GHOST_OAUTH_CLIENT_ID;

    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || '';

    // Standard redirect URI
    const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const redirectUri =
      process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
      `${appUrl}/api/integrations/google-calendar/oauth/callback`;

    return { clientId, clientSecret, redirectUri };
  }

  /**
   * Starts the OAuth authorization code flow.
   * Generates a single-use expiring state nonce securely bound to the user's UID.
   */
  public async startOAuthFlow(
    userId: string,
    redirectUriOverride?: string
  ): Promise<{ authUrl: string; stateId: string }> {
    if (!userId || userId.startsWith('gst_')) {
      throw new Error('Authenticated user account required to initiate Calendar OAuth');
    }

    const { clientId, redirectUri: defaultRedirectUri } = this.getOAuthCredentials();
    const redirectUri = redirectUriOverride || defaultRedirectUri;

    const stateId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes TTL

    // Store single-use state in Firestore
    await this.firestore.collection('oauth_states').doc(stateId).set({
      stateId,
      userId,
      provider: 'google_calendar',
      redirectUri,
      createdAt: now,
      expiresAt,
    });

    const scope = 'https://www.googleapis.com/auth/calendar.events';
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${encodeURIComponent(stateId)}`;

    return { authUrl, stateId };
  }

  /**
   * Handles the OAuth callback from Google.
   * Validates single-use state, exchanges authorization code, encrypts and stores tokens.
   */
  public async handleOAuthCallback(
    code: string,
    stateId: string
  ): Promise<{ success: boolean; userId: string }> {
    if (!code || !stateId) {
      throw new Error('Authorization code and state are required');
    }

    const stateRef = this.firestore.collection('oauth_states').doc(stateId);
    const stateDoc = await stateRef.get();

    if (!stateDoc.exists) {
      throw new Error('Invalid or already used OAuth state');
    }

    const stateData = stateDoc.data() as {
      userId: string;
      redirectUri: string;
      expiresAt: number;
    };

    // Immediately delete state to guarantee single-use invariant
    await stateRef.delete();

    if (Date.now() > stateData.expiresAt) {
      throw new Error('Expired OAuth state nonce');
    }

    const { userId, redirectUri } = stateData;
    const { clientId, clientSecret } = this.getOAuthCredentials();

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Google token exchange failed (${tokenResponse.status}): ${errText}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    if (!tokenData.access_token) {
      throw new Error('Missing access_token in Google token response');
    }

    // Encrypt tokens using AES-256-GCM
    const encAccessToken = encryptToken(tokenData.access_token);
    let encRefreshToken = tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : undefined;

    const integrationRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('integrations')
      .doc('googleCalendar');

    // Preserve existing refresh token if Google didn't return a new one
    if (!encRefreshToken) {
      const existingDoc = await integrationRef.get();
      if (existingDoc.exists) {
        const existingData = existingDoc.data();
        if (existingData?.encryptedRefreshToken) {
          encRefreshToken = {
            encrypted: existingData.encryptedRefreshToken,
            iv: existingData.refreshTokenIv,
            tag: existingData.refreshTokenTag,
          };
        }
      }
    }

    const expiresAtMs = Date.now() + (tokenData.expires_in || 3600) * 1000;

    await integrationRef.set(
      {
        connected: true,
        calendarId: 'primary',
        encryptedAccessToken: encAccessToken.encrypted,
        accessTokenIv: encAccessToken.iv,
        accessTokenTag: encAccessToken.tag,
        ...(encRefreshToken
          ? {
              encryptedRefreshToken: encRefreshToken.encrypted,
              refreshTokenIv: encRefreshToken.iv,
              refreshTokenTag: encRefreshToken.tag,
            }
          : {}),
        tokenExpiresAt: expiresAtMs,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : ['https://www.googleapis.com/auth/calendar.events'],
        autoSyncTasks: true,
        autoSyncTimeBlocks: true,
        autoSyncStudySchedule: true,
        revoked: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { success: true, userId };
  }

  /**
   * Retrieves connection status without leaking sensitive tokens.
   */
  public async getConnectionStatus(userId: string): Promise<GoogleCalendarConnectionStatus> {
    if (
      !userId ||
      userId.startsWith('gst_') ||
      (!hasServiceAccountCredentials() && !this.customFirestore)
    ) {
      return {
        connected: false,
        calendarId: 'primary',
        autoSyncTasks: false,
        autoSyncTimeBlocks: false,
        autoSyncStudySchedule: false,
        lastSyncAt: null,
      };
    }

    const doc = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('integrations')
      .doc('googleCalendar')
      .get();

    if (!doc.exists) {
      return {
        connected: false,
        calendarId: 'primary',
        autoSyncTasks: false,
        autoSyncTimeBlocks: false,
        autoSyncStudySchedule: false,
        lastSyncAt: null,
      };
    }

    const data = doc.data() || {};
    return {
      connected: Boolean(data.connected) && !data.revoked,
      calendarId: data.calendarId || 'primary',
      calendarName: data.calendarName || 'Primary Calendar',
      autoSyncTasks: data.autoSyncTasks ?? true,
      autoSyncTimeBlocks: data.autoSyncTimeBlocks ?? true,
      autoSyncStudySchedule: data.autoSyncStudySchedule ?? true,
      lastSyncAt: data.lastSyncAt || null,
      revoked: Boolean(data.revoked),
    };
  }

  /**
   * Retrieves and automatically refreshes access token if expired.
   */
  public async getValidAccessToken(userId: string): Promise<string | null> {
    const integrationRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('integrations')
      .doc('googleCalendar');

    const doc = await integrationRef.get();
    if (!doc.exists) return null;

    const data = doc.data() || {};
    if (!data.connected || data.revoked) return null;

    const now = Date.now();
    const tokenExpiresAt = Number(data.tokenExpiresAt) || 0;

    // If active and expires > 60 seconds from now, decrypt and return
    if (tokenExpiresAt > now + 60000 && data.encryptedAccessToken) {
      try {
        return decryptToken({
          encrypted: data.encryptedAccessToken,
          iv: data.accessTokenIv,
          tag: data.accessTokenTag,
        });
      } catch (err) {
        console.warn('[GoogleCalendar] Token decryption failed, attempting refresh:', err);
      }
    }

    // Refresh token required
    if (!data.encryptedRefreshToken) {
      console.warn('[GoogleCalendar] Access token expired and no refresh token available');
      return null;
    }

    let refreshToken: string;
    try {
      refreshToken = decryptToken({
        encrypted: data.encryptedRefreshToken,
        iv: data.refreshTokenIv,
        tag: data.refreshTokenTag,
      });
    } catch (err) {
      console.error('[GoogleCalendar] Failed to decrypt refresh token:', err);
      return null;
    }

    const { clientId, clientSecret } = this.getOAuthCredentials();
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      console.warn(`[GoogleCalendar] Refresh token failed (${refreshRes.status}): ${errText}`);
      if (refreshRes.status === 400 || refreshRes.status === 401) {
        // Mark as revoked
        await integrationRef.update({
          connected: false,
          revoked: true,
          updatedAt: new Date().toISOString(),
        });
      }
      return null;
    }

    const freshData = (await refreshRes.json()) as { access_token: string; expires_in: number };
    const encAccessToken = encryptToken(freshData.access_token);
    const newExpiresAt = Date.now() + (freshData.expires_in || 3600) * 1000;

    await integrationRef.update({
      encryptedAccessToken: encAccessToken.encrypted,
      accessTokenIv: encAccessToken.iv,
      accessTokenTag: encAccessToken.tag,
      tokenExpiresAt: newExpiresAt,
      revoked: false,
      updatedAt: new Date().toISOString(),
    });

    return freshData.access_token;
  }

  /**
   * Disconnects Google Calendar and purges stored integration metadata.
   */
  public async disconnect(userId: string): Promise<void> {
    const integrationRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('integrations')
      .doc('googleCalendar');

    const doc = await integrationRef.get();
    if (doc.exists) {
      const data = doc.data() || {};
      if (data.encryptedAccessToken) {
        try {
          const token = decryptToken({
            encrypted: data.encryptedAccessToken,
            iv: data.accessTokenIv,
            tag: data.accessTokenTag,
          });
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }).catch(() => undefined);
        } catch {
          // Ignore revocation network failures
        }
      }
    }

    // Delete integration record
    await integrationRef.delete();

    // Clean up all event links
    const linksSnap = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('calendar_event_links')
      .get();

    const batch = this.firestore.batch();
    linksSnap.docs.forEach((d: any) => batch.delete(d.ref));
    await batch.commit();
  }

  /**
   * Lists the user's Google Calendars.
   */
  public async listCalendars(userId: string): Promise<Array<{ id: string; summary: string; primary: boolean; timeZone?: string }>> {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error('Google Calendar is not connected or authorization expired');
    }

    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn(`[GoogleCalendar] CalendarList endpoint returned ${res.status} (least-privileged calendar.events scope). Falling back to primary calendar.`);
      return [{ id: 'primary', summary: 'Primary Calendar', primary: true }];
    }

    const data = (await res.json()) as {
      items?: Array<{ id: string; summary: string; primary?: boolean; timeZone?: string }>;
    };

    return (data.items || []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: Boolean(c.primary),
      timeZone: c.timeZone,
    }));
  }

  /**
   * Lists Google Calendar events within query range.
   * Distinguishes FocusFlow-managed events from read-only external events.
   */
  public async listEvents(
    userId: string,
    params: { timeMin?: string; timeMax?: string; calendarId?: string }
  ): Promise<GoogleCalendarEvent[]> {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      return [];
    }

    const calendarId = encodeURIComponent(params.calendarId || 'primary');
    const query = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (params.timeMin) query.set('timeMin', params.timeMin);
    if (params.timeMax) query.set('timeMax', params.timeMax);

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to list events (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { items?: any[] };

    // Fetch user event links to cross-reference FocusFlow-managed items
    const linksSnap = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('calendar_event_links')
      .get();

    const linkMap = new Map<string, CalendarEventLink>();
    linksSnap.docs.forEach((d: any) => {
      const link = d.data() as CalendarEventLink;
      linkMap.set(link.googleEventId, link);
    });

    return (data.items || []).map((item) => {
      const link = linkMap.get(item.id);
      return {
        id: item.id,
        summary: item.summary || '(Untitled Event)',
        description: item.description,
        location: item.location,
        start: item.start || {},
        end: item.end || {},
        status: item.status,
        htmlLink: item.htmlLink,
        managePolicy: link ? 'focusflow_managed' : 'external_readonly',
        sourceType: link?.sourceType || 'external',
        sourceId: link?.sourceId,
      };
    });
  }

  /**
   * Creates an event on Google Calendar.
   */
  public async createEvent(
    userId: string,
    eventData: {
      summary: string;
      description?: string;
      start: { dateTime?: string; date?: string; timeZone?: string };
      end: { dateTime?: string; date?: string; timeZone?: string };
      calendarId?: string;
    }
  ): Promise<GoogleCalendarEvent> {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error('Google Calendar is not connected or authorization expired');
    }

    const calendarId = encodeURIComponent(eventData.calendarId || 'primary');
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: eventData.summary,
        description: eventData.description,
        start: eventData.start,
        end: eventData.end,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create calendar event (${res.status}): ${await res.text()}`);
    }

    const created = (await res.json()) as any;
    return {
      id: created.id,
      summary: created.summary,
      description: created.description,
      start: created.start,
      end: created.end,
      status: created.status,
      htmlLink: created.htmlLink,
      managePolicy: 'focusflow_managed',
    };
  }

  /**
   * Updates an existing event on Google Calendar.
   */
  public async updateEvent(
    userId: string,
    eventId: string,
    eventData: {
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string; timeZone?: string };
      end?: { dateTime?: string; date?: string; timeZone?: string };
      calendarId?: string;
    }
  ): Promise<GoogleCalendarEvent> {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error('Google Calendar is not connected or authorization expired');
    }

    const calendarId = encodeURIComponent(eventData.calendarId || 'primary');
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });

    if (!res.ok) {
      throw new Error(`Failed to update calendar event (${res.status}): ${await res.text()}`);
    }

    const updated = (await res.json()) as any;
    return {
      id: updated.id,
      summary: updated.summary,
      description: updated.description,
      start: updated.start,
      end: updated.end,
      status: updated.status,
      htmlLink: updated.htmlLink,
      managePolicy: 'focusflow_managed',
    };
  }

  /**
   * Deletes an event on Google Calendar.
   * INVARIANT: Never deletes external events that were not created and mapped by FocusFlow!
   */
  public async deleteEvent(
    userId: string,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<void> {
    // 1. Check link mapping FIRST before making network requests
    const linkQuery = await this.firestore
      .collection('users')
      .doc(userId)
      .collection('calendar_event_links')
      .where('googleEventId', '==', eventId)
      .limit(1)
      .get();

    if (linkQuery.empty) {
      const err = new Error(
        'EXTERNAL_EVENT_PROTECTION: Cannot delete external Google Calendar events that were not created by FocusFlow.'
      );
      (err as any).code = 'EXTERNAL_EVENT_PROTECTION';
      throw err;
    }

    // 2. Obtain valid access token
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error('Google Calendar is not connected or authorization expired');
    }

    const encodedCal = encodeURIComponent(calendarId);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCal}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Failed to delete calendar event (${res.status}): ${await res.text()}`);
    }

    // Delete mapping
    const linkDoc = linkQuery.docs[0];
    await linkDoc.ref.delete();
  }

  /**
   * Synchronizes FocusFlow tasks and scheduled time blocks to Google Calendar.
   * Guarantees idempotency via checksum hashing and calendar_event_links mapping.
   */
  public async syncTasks(
    userId: string,
    options?: { calendarId?: string }
  ): Promise<{ synced: number; updated: number; removed: number }> {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) {
      throw new Error('Google Calendar is not connected or authorization expired');
    }

    const calendarId = options?.calendarId || 'primary';
    let tasks = dbService.getRaw().tasks.filter((t: any) => t.userId === userId && !t.deletedAt);
    let timeBlocks = dbService.getTimeBlocks ? dbService.getTimeBlocks(userId).filter((b: any) => !b.deletedAt) : [];

    // On Vercel / Cloud Firestore, load authoritative tasks and time blocks from Firestore
    if (hasServiceAccountCredentials() || this.customFirestore) {
      try {
        const [tasksSnap, blocksSnap] = await Promise.all([
          this.firestore.collection('users').doc(userId).collection('tasks').get(),
          this.firestore.collection('users').doc(userId).collection('time_blocks').get(),
        ]);
        tasks = tasksSnap.docs.map((d: any) => d.data()).filter((t: any) => !t.deletedAt);
        timeBlocks = blocksSnap.docs.map((d: any) => d.data()).filter((b: any) => !b.deletedAt);
      } catch (err) {
        console.warn(`[GoogleCalendar] Falling back to local tasks for user ${userId}:`, err);
      }
    }

    const linksRef = this.firestore.collection('users').doc(userId).collection('calendar_event_links');
    const existingLinksSnap = await linksRef.get();
    const linkMap = new Map<string, CalendarEventLink>();
    existingLinksSnap.docs.forEach((d: any) => {
      const l = d.data() as CalendarEventLink;
      linkMap.set(l.sourceId, l);
    });

    let synced = 0;
    let updated = 0;
    let removed = 0;

    // 1. Sync Active Tasks with Due Dates
    for (const task of tasks) {
      if (!task.dueDate) continue;

      const title = `[Task] ${task.title}`;
      const description = `Priority: ${task.priority.toUpperCase()}\nStatus: ${task.status}\nFocusFlow Task ID: ${task.id}`;
      const checksum = crypto
        .createHash('sha256')
        .update(`${title}|${task.dueDate}|${task.status}|${task.priority}`)
        .digest('hex');

      const existingLink = linkMap.get(task.id);

      if (!existingLink) {
        // Create new event
        try {
          const created = await this.createEvent(userId, {
            summary: title,
            description,
            start: { date: task.dueDate },
            end: { date: task.dueDate },
            calendarId,
          });

          await linksRef.doc(task.id).set({
            sourceId: task.id,
            sourceType: 'task',
            googleEventId: created.id,
            calendarId,
            lastSyncedAt: new Date().toISOString(),
            checksum,
            managePolicy: 'focusflow_managed',
          });
          synced++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to create event for task ${task.id}:`, err);
        }
      } else if (existingLink.checksum !== checksum) {
        // Update existing event
        try {
          await this.updateEvent(userId, existingLink.googleEventId, {
            summary: title,
            description,
            start: { date: task.dueDate },
            end: { date: task.dueDate },
            calendarId,
          });

          await linksRef.doc(task.id).update({
            checksum,
            lastSyncedAt: new Date().toISOString(),
          });
          updated++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to update event for task ${task.id}:`, err);
        }
      }
    }

    // 2. Sync Active Daily Time Blocks
    const formatMinutesToIso = (dateStr: string, totalMinutes: number): string => {
      const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(totalMinutes)));
      const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
      const mm = String(clamped % 60).padStart(2, '0');
      return `${dateStr}T${hh}:${mm}:00+05:30`;
    };

    for (const block of timeBlocks) {
      if (
        !block ||
        !block.id ||
        !block.date ||
        typeof block.startMinute !== 'number' ||
        typeof block.endMinute !== 'number' ||
        block.endMinute <= block.startMinute
      ) {
        continue;
      }

      const title = `[Focus Block] ${block.title || 'Scheduled Block'}`;
      const description = `Category: ${block.category || 'General'}\nStatus: ${block.completed ? 'Completed' : 'Planned'}\nFocusFlow TimeBlock ID: ${block.id}`;
      const startIso = formatMinutesToIso(block.date, block.startMinute);
      const endIso = formatMinutesToIso(block.date, block.endMinute);
      const checksum = crypto
        .createHash('sha256')
        .update(`${title}|${startIso}|${endIso}|${block.completed ? '1' : '0'}|${block.category || ''}`)
        .digest('hex');

      const linkKey = `tb_${block.id}`;
      const existingLink = linkMap.get(linkKey) || linkMap.get(block.id);

      if (!existingLink) {
        try {
          const created = await this.createEvent(userId, {
            summary: title,
            description,
            start: { dateTime: startIso, timeZone: 'Asia/Kolkata' },
            end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
            calendarId,
          });

          await linksRef.doc(linkKey).set({
            sourceId: linkKey,
            sourceType: 'timeblock',
            googleEventId: created.id,
            calendarId,
            lastSyncedAt: new Date().toISOString(),
            checksum,
            managePolicy: 'focusflow_managed',
          });
          synced++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to create event for time block ${block.id}:`, err);
        }
      } else if (existingLink.checksum !== checksum) {
        try {
          await this.updateEvent(userId, existingLink.googleEventId, {
            summary: title,
            description,
            start: { dateTime: startIso, timeZone: 'Asia/Kolkata' },
            end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
            calendarId,
          });

          await linksRef.doc(existingLink.sourceId).update({
            checksum,
            lastSyncedAt: new Date().toISOString(),
          });
          updated++;
        } catch (err) {
          console.warn(`[GoogleCalendarSync] Failed to update event for time block ${block.id}:`, err);
        }
      }
    }

    // 3. Remove mapped events for deleted tasks or time blocks
    for (const [sourceId, link] of linkMap.entries()) {
      if (link.sourceType === 'task') {
        const stillActive = tasks.some((t: any) => t.id === sourceId);
        if (!stillActive) {
          try {
            await this.deleteEvent(userId, link.googleEventId, link.calendarId);
            removed++;
          } catch {
            // Already deleted or gone
          }
        }
      } else if (link.sourceType === 'timeblock') {
        const rawBlockId = sourceId.startsWith('tb_') ? sourceId.slice(3) : sourceId;
        const stillActive = timeBlocks.some((b: any) => b.id === rawBlockId);
        if (!stillActive) {
          try {
            await this.deleteEvent(userId, link.googleEventId, link.calendarId);
            removed++;
          } catch {
            // Already deleted or gone
          }
        }
      }
    }

    // Update integration lastSyncAt timestamp
    await this.firestore
      .collection('users')
      .doc(userId)
      .collection('integrations')
      .doc('googleCalendar')
      .update({
        lastSyncAt: new Date().toISOString(),
      })
      .catch(() => undefined);

    return { synced, updated, removed };
  }
}

export const googleCalendarService = new GoogleCalendarService();
