import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { pushNotificationService } from '../integrations/pushNotificationService.js';

export const cronNotificationRouter = Router();

function safeSecretEqual(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  // Hash both values with SHA-256 to normalize length before timingSafeEqual
  const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

/**
 * Validates CRON_SECRET authorization header in constant time.
 */
function verifyCronSecret(req: Request, res: Response): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();

  // If in local test environment without CRON_SECRET configured, allow
  if (!expectedSecret && process.env.NODE_ENV === 'test') {
    return true;
  }

  if (!expectedSecret) {
    res.status(500).json({ error: 'CRON_SECRET is not configured on the server' });
    return false;
  }

  const authHeader = req.headers.authorization;
  const cronHeader = req.headers['x-cron-secret'];

  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
  const bearerMatch = bearerToken ? safeSecretEqual(bearerToken, expectedSecret) : false;

  const headerSecret = typeof cronHeader === 'string' ? cronHeader.trim() : '';
  const headerMatch = headerSecret ? safeSecretEqual(headerSecret, expectedSecret) : false;

  if (!bearerMatch && !headerMatch) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing CRON_SECRET' });
    return false;
  }

  return true;
}

const handleCron = async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;

  try {
    const result = await pushNotificationService.processScheduledNotifications();
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cron notification dispatch failed';
    console.error('[CronNotification] Execution failed:', err);
    res.status(500).json({ error: msg });
  }
};

cronNotificationRouter.get('/cron/notifications', handleCron);
cronNotificationRouter.post('/cron/notifications', handleCron);

