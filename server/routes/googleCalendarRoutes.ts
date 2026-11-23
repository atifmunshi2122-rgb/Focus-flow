import { Router, Request, Response, NextFunction } from 'express';
import { googleCalendarService } from '../integrations/googleCalendarService.js';
import type { AuthenticatedRequest } from '../auth.js';
import { hasServiceAccountCredentials } from '../firebaseAdmin.js';

export const googleCalendarRouter = Router();

function handleCalendarError(res: Response, err: unknown, fallbackMessage: string): void {
  const msg = err instanceof Error ? err.message : fallbackMessage;
  const isAuthError =
    msg.includes('authorization expired') ||
    msg.includes('revoked') ||
    msg.includes('not connected') ||
    msg.includes('invalid_grant');
  const isExternalProtection = msg.includes('EXTERNAL_EVENT_PROTECTION');

  if (msg.includes('FIREBASE_ADMIN_UNAVAILABLE') || msg.includes('service account')) {
    res.status(503).json({
      error: msg,
      code: 'SERVICE_UNAVAILABLE',
    });
    return;
  }

  if (isAuthError) {
    res.status(401).json({
      error: msg,
      code: 'AUTH_EXPIRED',
    });
    return;
  }

  if (isExternalProtection) {
    res.status(403).json({
      error: msg,
      code: 'EXTERNAL_EVENT_PROTECTION',
    });
    return;
  }

  res.status(500).json({
    error: msg,
    code: 'CALENDAR_ERROR',
  });
}

function requireRealUser(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.auth || authReq.auth.isGuest || authReq.auth.userId.startsWith('gst_')) {
    res.status(403).json({
      error: 'Authenticated user account required. Guest sessions are not permitted.',
      code: 'GUEST_ACCESS_DENIED',
    });
    return;
  }
  next();
}

googleCalendarRouter.use('/integrations/google-calendar', requireRealUser);

// 1. GET /integrations/google-calendar/oauth/start
googleCalendarRouter.get('/integrations/google-calendar/oauth/start', async (req: Request, res: Response) => {
  try {
    if (!hasServiceAccountCredentials()) {
      res.status(503).json({
        error: 'Google Calendar integration requires configured Firebase Admin credentials.',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }
    const authReq = req as AuthenticatedRequest;
    const redirectUri = req.query.redirectUri as string | undefined;
    const { authUrl, stateId } = await googleCalendarService.startOAuthFlow(authReq.auth.userId, redirectUri);
    res.json({ authUrl, stateId });
  } catch (err) {
    handleCalendarError(res, err, 'Failed to start OAuth flow');
  }
});

// 2. GET /integrations/google-calendar/status
googleCalendarRouter.get('/integrations/google-calendar/status', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const status = await googleCalendarService.getConnectionStatus(authReq.auth.userId);
    res.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get connection status';
    res.status(500).json({ error: msg });
  }
});

// 3. GET /integrations/google-calendar/calendars
googleCalendarRouter.get('/integrations/google-calendar/calendars', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const calendars = await googleCalendarService.listCalendars(authReq.auth.userId);
    res.json({ calendars });
  } catch (err) {
    handleCalendarError(res, err, 'Failed to list calendars');
  }
});

// 4. GET /integrations/google-calendar/events
googleCalendarRouter.get('/integrations/google-calendar/events', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const timeMin = req.query.timeMin as string | undefined;
    const timeMax = req.query.timeMax as string | undefined;
    const calendarId = req.query.calendarId as string | undefined;

    const events = await googleCalendarService.listEvents(authReq.auth.userId, {
      timeMin,
      timeMax,
      calendarId,
    });
    res.json({ events });
  } catch (err) {
    handleCalendarError(res, err, 'Failed to list calendar events');
  }
});

// 5. POST /integrations/google-calendar/events
googleCalendarRouter.post('/integrations/google-calendar/events', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { summary, description, start, end, calendarId } = req.body;

    if (!summary || !start || !end) {
      res.status(400).json({ error: 'summary, start, and end are required' });
      return;
    }

    const created = await googleCalendarService.createEvent(authReq.auth.userId, {
      summary,
      description,
      start,
      end,
      calendarId,
    });
    res.status(201).json(created);
  } catch (err) {
    handleCalendarError(res, err, 'Failed to create calendar event');
  }
});

// 6. PATCH /integrations/google-calendar/events/:eventId
googleCalendarRouter.patch('/integrations/google-calendar/events/:eventId', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const eventId = req.params.eventId;
    const calendarId = req.query.calendarId as string | undefined;

    const updated = await googleCalendarService.updateEvent(
      authReq.auth.userId,
      eventId,
      { ...req.body, calendarId }
    );
    res.json(updated);
  } catch (err) {
    handleCalendarError(res, err, 'Failed to update calendar event');
  }
});

// 7. DELETE /integrations/google-calendar/events/:eventId
googleCalendarRouter.delete('/integrations/google-calendar/events/:eventId', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const eventId = req.params.eventId;
    const calendarId = (req.query.calendarId as string) || 'primary';

    await googleCalendarService.deleteEvent(authReq.auth.userId, eventId, calendarId);
    res.json({ success: true });
  } catch (err) {
    handleCalendarError(res, err, 'Failed to delete calendar event');
  }
});

// 8. POST /integrations/google-calendar/sync/tasks
googleCalendarRouter.post('/integrations/google-calendar/sync/tasks', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const calendarId = req.body?.calendarId as string | undefined;

    const result = await googleCalendarService.syncTasks(authReq.auth.userId, { calendarId });
    res.json({ success: true, ...result });
  } catch (err) {
    handleCalendarError(res, err, 'Failed to sync tasks to calendar');
  }
});

// 9. DELETE /integrations/google-calendar/connection
googleCalendarRouter.delete('/integrations/google-calendar/connection', async (req: Request, res: Response) => {
  try {
    if (!hasServiceAccountCredentials()) {
      res.status(503).json({
        error: 'Google Calendar integration requires configured Firebase Admin credentials.',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }
    const authReq = req as AuthenticatedRequest;
    await googleCalendarService.disconnect(authReq.auth.userId);
    res.json({ success: true, connected: false });
  } catch (err) {
    handleCalendarError(res, err, 'Failed to disconnect calendar');
  }
});
