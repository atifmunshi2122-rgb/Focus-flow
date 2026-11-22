import { Router, Request, Response, NextFunction } from 'express';
import { googleCalendarService } from '../integrations/googleCalendarService.js';
import type { AuthenticatedRequest } from '../auth.js';

export const googleCalendarRouter = Router();

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
    const authReq = req as AuthenticatedRequest;
    const redirectUri = req.query.redirectUri as string | undefined;
    const { authUrl, stateId } = await googleCalendarService.startOAuthFlow(authReq.auth.userId, redirectUri);
    res.json({ authUrl, stateId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start OAuth flow';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'Failed to list calendars';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'Failed to list calendar events';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'Failed to create calendar event';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'Failed to update calendar event';
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'Failed to delete calendar event';
    const status = msg.includes('EXTERNAL_EVENT_PROTECTION') ? 403 : 500;
    res.status(status).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : 'Failed to sync tasks to calendar';
    res.status(500).json({ error: msg });
  }
});

// 9. DELETE /integrations/google-calendar/connection
googleCalendarRouter.delete('/integrations/google-calendar/connection', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    await googleCalendarService.disconnect(authReq.auth.userId);
    res.json({ success: true, connected: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to disconnect calendar';
    res.status(500).json({ error: msg });
  }
});
