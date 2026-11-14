import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes to avoid memory leaks
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
}

/**
 * In-memory sliding-window rate limiting middleware for Express.
 */
export function rateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || 60_000; // 1 minute window
  const maxRequests = options.maxRequests || 300;
  const message = options.message || 'Too many requests. Please slow down and try again.';

  return (req: Request, res: Response, next: NextFunction): void => {
    const authUser = (req as unknown as { auth?: { userId?: string } }).auth?.userId;
    const rawForwarded = req.headers['x-forwarded-for'];
    let clientIp = '';
    if (typeof rawForwarded === 'string') {
      const firstCandidate = rawForwarded.split(',')[0].trim();
      if (/^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-fA-F0-9:]+$/.test(firstCandidate)) {
        clientIp = firstCandidate;
      }
    }
    if (!clientIp) {
      clientIp = req.socket.remoteAddress || 'unknown_client';
    }

    const key = authUser ? `usr:${authUser}:${req.method}` : `ip:${clientIp}:${req.method}`;
    const now = Date.now();

    let record = rateLimitMap.get(key);
    if (!record || now > record.resetAt) {
      record = {
        count: 1,
        resetAt: now + windowMs,
      };
      rateLimitMap.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.status(429).json({
        error: message,
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Defensive HTTP security headers middleware.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Allow Firebase/Google Sign-In popups to communicate back to opener across origins
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // XSS protection for legacy browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Privacy-friendly referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict sensitive browser APIs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // HSTS in production environments
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * Sanitize and redact sensitive data from log objects.
 */
export function sanitizeLogData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeLogData);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('key') ||
      lowerKey.includes('card') ||
      lowerKey.includes('creditcard') ||
      lowerKey.includes('credential')
    ) {
      clean[key] = '[REDACTED_SECRET]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeLogData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export const sanitizeForLogging = sanitizeLogData;

/**
 * Pure in-memory sliding-window rate limiter helper for testing & direct invocations.
 */
export function slidingWindowRateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || 60_000;
  const maxRequests = options.maxRequests || 300;
  const map = new Map<string, RateLimitRecord>();

  return {
    check(ip: string): { allowed: boolean; remaining: number } {
      const now = Date.now();
      let record = map.get(ip);
      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        map.set(ip, record);
        return { allowed: true, remaining: maxRequests - 1 };
      }
      record.count += 1;
      const allowed = record.count <= maxRequests;
      return { allowed, remaining: Math.max(0, maxRequests - record.count) };
    },
  };
}

/**
 * CORS handling middleware for production and local environments.
 */
export function corsHandler(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const appUrl = process.env.APP_URL;

  const requestHost = req.headers.host;
  let sameHostOrigin = false;
  if (origin && requestHost) {
    try {
      sameHostOrigin = new URL(origin).host === requestHost;
    } catch {
      sameHostOrigin = false;
    }
  }

  let isAllowed = false;
  if (!origin || sameHostOrigin) {
    isAllowed = true;
  } else if (allowedOriginsEnv) {
    const list = allowedOriginsEnv.split(',').map((o) => o.trim());
    isAllowed = list.includes(origin) || list.includes('*');
  } else if (appUrl && (origin === appUrl || origin === new URL(appUrl).origin)) {
    isAllowed = true;
  } else if (process.env.NODE_ENV !== 'production') {
    isAllowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-demo-session, x-google-access-token'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

/**
 * Centralized production error handling middleware.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const sanitized = sanitizeLogData(
    err instanceof Error ? { message: err.message, stack: err.stack } : { error: err }
  );
  console.error('[API Error]', JSON.stringify(sanitized));

  if (res.headersSent) return;

  const isProd = process.env.NODE_ENV === 'production';
  const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';

  res.status(500).json({
    error: isProd ? 'Internal Server Error' : errorMessage,
    timestamp: new Date().toISOString(),
  });
}
