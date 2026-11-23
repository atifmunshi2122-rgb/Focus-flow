import { Router, Request, Response, NextFunction } from 'express';
import { pushNotificationService } from '../integrations/pushNotificationService.js';
import type { AuthenticatedRequest } from '../auth.js';
import { hasServiceAccountCredentials } from '../firebaseAdmin.js';

export const pushRouter = Router();

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

pushRouter.use('/devices/fcm', requireRealUser);
pushRouter.use('/notifications', requireRealUser);

function requireServiceAccount(req: Request, res: Response, next: NextFunction): void {
  // GET /devices/fcm/status is safe to check without credentials (returns enabled: false, deviceCount: 0)
  if (req.path === '/status' || req.path === '/status/') {
    return next();
  }
  if (!hasServiceAccountCredentials()) {
    res.status(503).json({
      error: 'Push notification service requires configured Firebase Admin credentials.',
      code: 'SERVICE_UNAVAILABLE',
    });
    return;
  }
  next();
}

pushRouter.use('/devices/fcm', requireServiceAccount);
pushRouter.use('/notifications', requireServiceAccount);

// 1. POST /devices/fcm/register
pushRouter.post('/devices/fcm/register', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { token, installationId, platform } = req.body;

    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }

    const installation = await pushNotificationService.registerDevice(authReq.auth.userId, {
      token,
      installationId,
      platform,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({ success: true, installation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to register device';
    res.status(500).json({ error: msg });
  }
});

// 2. POST /devices/fcm/unregister
pushRouter.post('/devices/fcm/unregister', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { installationId, token } = req.body;
    const target = installationId || token;

    if (!target) {
      res.status(400).json({ error: 'installationId or token is required' });
      return;
    }

    const success = await pushNotificationService.unregisterDevice(authReq.auth.userId, target);
    res.json({ success });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to unregister device';
    res.status(500).json({ error: msg });
  }
});

// 3. GET /devices/fcm/status
pushRouter.get('/devices/fcm/status', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const status = await pushNotificationService.getDeviceStatus(authReq.auth.userId);
    res.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get device status';
    res.status(500).json({ error: msg });
  }
});

// 4. POST /notifications/test
pushRouter.post('/notifications/test', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await pushNotificationService.sendTestNotification(authReq.auth.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send test notification';
    res.status(500).json({ error: msg });
  }
});
