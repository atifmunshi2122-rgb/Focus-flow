import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express, { type Request, type Response } from 'express';
import {
  rateLimiter,
  configureTrustProxy,
  resolveClientIp,
  _resetRateLimitMap,
} from '../server/security.ts';

test('Rate Limiter Security — Test 1: Direct requests without X-Forwarded-For are rate-limited correctly', async () => {
  _resetRateLimitMap();
  const app = express();
  configureTrustProxy(app, 'false');
  app.use(rateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  app.get('/test', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/test`;

  try {
    const res1 = await fetch(url);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('X-RateLimit-Remaining'), '1');

    const res2 = await fetch(url);
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('X-RateLimit-Remaining'), '0');

    const res3 = await fetch(url);
    assert.equal(res3.status, 429);
    const body = await res3.json();
    assert.ok(body.error);
    assert.ok(typeof body.retryAfterSeconds === 'number');
  } finally {
    server.close();
  }
});

test('Rate Limiter Security — Test 2: Rotating or spoofing X-Forwarded-For from direct client does not create fresh identities', async () => {
  _resetRateLimitMap();
  const app = express();
  // Direct connection mode: trust proxy is explicitly false (default)
  configureTrustProxy(app, 'false');
  app.use(rateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  app.get('/test', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/test`;

  try {
    // Client sends first fake IP
    const res1 = await fetch(url, {
      headers: { 'X-Forwarded-For': '198.51.100.1' },
    });
    assert.equal(res1.status, 200);

    // Client attempts to bypass rate limit by rotating to second fake IP
    const res2 = await fetch(url, {
      headers: { 'X-Forwarded-For': '198.51.100.2' },
    });
    assert.equal(res2.status, 200);

    // Client attempts to bypass rate limit by rotating to third fake IP
    // In vulnerable code, this would succeed with 200. In safe code, socket address is tracked -> 429.
    const res3 = await fetch(url, {
      headers: { 'X-Forwarded-For': '198.51.100.3' },
    });
    assert.equal(res3.status, 429, 'Direct connection must not trust spoofed X-Forwarded-For headers');
  } finally {
    server.close();
  }
});

test('Rate Limiter Security — Test 3: Correctly configured trusted-proxy chain uses validated client IP', async () => {
  _resetRateLimitMap();
  const app = express();
  // Configure 1 trusted proxy hop (e.g. Cloud Run, Nginx, or AWS ALB)
  configureTrustProxy(app, '1');
  app.use(rateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  app.get('/test', (req: Request, res: Response) => {
    res.json({ clientIp: resolveClientIp(req) });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/test`;

  try {
    // Client Alpha through trusted proxy
    const res1 = await fetch(url, {
      headers: { 'X-Forwarded-For': '203.0.113.10' },
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.clientIp, '203.0.113.10');

    const res2 = await fetch(url, {
      headers: { 'X-Forwarded-For': '203.0.113.10' },
    });
    assert.equal(res2.status, 200);

    // Client Alpha exceeds rate limit
    const res3 = await fetch(url, {
      headers: { 'X-Forwarded-For': '203.0.113.10' },
    });
    assert.equal(res3.status, 429);

    // Client Beta through the same trusted proxy connection still has full quota
    const resBeta = await fetch(url, {
      headers: { 'X-Forwarded-For': '203.0.113.20' },
    });
    assert.equal(resBeta.status, 200);
    const dataBeta = await resBeta.json();
    assert.equal(dataBeta.clientIp, '203.0.113.20');
  } finally {
    server.close();
  }
});

test('Rate Limiter Security — Test 4: Untrusted peers cannot spoof their client IP', async () => {
  _resetRateLimitMap();
  const app = express();
  // 1 trusted hop configured
  configureTrustProxy(app, '1');
  app.use(rateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  app.get('/test', (req: Request, res: Response) => {
    res.json({ clientIp: resolveClientIp(req) });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/test`;

  try {
    // Attacker sends forged chain: spoofed '198.51.100.1', while proxy appended '203.0.113.50'
    const res1 = await fetch(url, {
      headers: { 'X-Forwarded-For': '198.51.100.1, 203.0.113.50' },
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    // Express must evaluate from right to left, picking 203.0.113.50 and NOT the spoofed 198.51.100.1
    assert.equal(data1.clientIp, '203.0.113.50');

    // Attacker tries to alter leftmost spoofed IP:
    const res2 = await fetch(url, {
      headers: { 'X-Forwarded-For': '198.51.100.2, 203.0.113.50' },
    });
    assert.equal(res2.status, 200);

    // 3rd attempt from same real client is blocked, proving spoofing the leftmost IP fails
    const res3 = await fetch(url, {
      headers: { 'X-Forwarded-For': '198.51.100.3, 203.0.113.50' },
    });
    assert.equal(res3.status, 429);
  } finally {
    server.close();
  }
});

test('Rate Limiter Security — Test 5: Missing, invalid and unsupported TRUST_PROXY configurations fail safely', async () => {
  const dummyApp = () => {
    let setting: unknown;
    return {
      set: (_name: string, val: unknown) => {
        setting = val;
      },
      get: () => setting,
    };
  };

  // 1. Missing / undefined -> false
  const app1 = dummyApp();
  assert.equal(configureTrustProxy(app1, undefined), false);
  assert.equal(app1.get(), false);

  // 2. Empty string -> false
  const app2 = dummyApp();
  assert.equal(configureTrustProxy(app2, ''), false);
  assert.equal(app2.get(), false);

  // 3. Explicit "false" -> false
  const app3 = dummyApp();
  assert.equal(configureTrustProxy(app3, 'false'), false);
  assert.equal(app3.get(), false);

  // 4. "0" -> false
  const app4 = dummyApp();
  assert.equal(configureTrustProxy(app4, '0'), false);
  assert.equal(app4.get(), false);

  // 5. Negative integer -> false
  const app5 = dummyApp();
  assert.equal(configureTrustProxy(app5, '-1'), false);
  assert.equal(app5.get(), false);

  // 6. Invalid syntax / garbage -> false
  const app6 = express();
  assert.equal(configureTrustProxy(app6, 'invalid_syntax_not_an_ip'), false);
  assert.equal(app6.get('trust proxy'), false);

  // 7. Verify live server with invalid configuration defaults to safe direct socket rate limiting
  _resetRateLimitMap();
  const liveApp = express();
  configureTrustProxy(liveApp, 'completely_bogus_proxy_config');
  liveApp.use(rateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  liveApp.get('/test', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const server = http.createServer(liveApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/test`;

  try {
    await fetch(url, { headers: { 'X-Forwarded-For': '1.1.1.1' } });
    await fetch(url, { headers: { 'X-Forwarded-For': '2.2.2.2' } });
    const resBlocked = await fetch(url, { headers: { 'X-Forwarded-For': '3.3.3.3' } });
    assert.equal(resBlocked.status, 429, 'Must fail safely and rate-limit based on direct connection');
  } finally {
    server.close();
  }
});

test('Rate Limiter Security — Test 6: Existing authenticated-user rate limiting still works', async () => {
  _resetRateLimitMap();
  const app = express();
  configureTrustProxy(app, 'false');

  // Middleware simulating authenticated users
  let simulatedUserId = 'usr_alice';
  app.use((req: Request, _res: Response, next) => {
    (req as any).auth = { userId: simulatedUserId };
    next();
  });

  app.use(rateLimiter({ maxRequests: 2, windowMs: 60_000 }));
  app.get('/test', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/test`;

  try {
    // Alice makes 2 requests
    simulatedUserId = 'usr_alice';
    const resA1 = await fetch(url);
    assert.equal(resA1.status, 200);

    const resA2 = await fetch(url);
    assert.equal(resA2.status, 200);

    // Alice 3rd request is rate-limited
    const resA3 = await fetch(url);
    assert.equal(resA3.status, 429);

    // Bob from the exact same socket/connection has his own separate authenticated quota
    simulatedUserId = 'usr_bob';
    const resB1 = await fetch(url);
    assert.equal(resB1.status, 200);
    assert.equal(resB1.headers.get('X-RateLimit-Remaining'), '1');
  } finally {
    server.close();
  }
});

