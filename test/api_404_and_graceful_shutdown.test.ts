import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express, { type Request, type Response } from 'express';
import { apiRouter } from '../server/routes.ts';
import { errorHandler } from '../server/security.ts';
import { setupGracefulShutdown } from '../server/shutdown.ts';
import { DatabaseService } from '../server/db.ts';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// ============================================================================
// B1 — API 404 HANDLING TESTS
// ============================================================================

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Health check mounted before apiRouter (mirrors server.ts)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', version: '1.7.0' });
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Central error handling
  app.use('/api', errorHandler);

  // Frontend SPA fallback (mirrors production server.ts)
  app.get('*', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send('<!DOCTYPE html><html><head><title>FocusFlow SPA</title></head><body><div id="root"></div></body></html>');
  });

  return app;
}

test('B1 API 404 — Unknown GET /api/... returns 404 JSON', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/nonexistent-route-alpha`);
    assert.equal(res.status, 404);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
    const body = await res.json();
    assert.deepEqual(body, { error: 'API route not found' });
  } finally {
    server.close();
  }
});

test('B1 API 404 — Unknown POST /api/... returns 404 JSON', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/actions/unknown-task-op`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 123 }),
    });
    assert.equal(res.status, 404);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
    const body = await res.json();
    assert.deepEqual(body, { error: 'API route not found' });
  } finally {
    server.close();
  }
});

test('B1 API 404 — Unknown API route never falls through to HTML', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
      const res = await fetch(`${baseUrl}/api/deep/nested/unknown/route`, { method });
      assert.equal(res.status, 404);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(!contentType.includes('text/html'), `Expected JSON, got ${contentType} for ${method}`);
      assert.ok(contentType.includes('application/json'));
      const text = await res.text();
      assert.ok(!text.includes('<!DOCTYPE html>'));
      assert.ok(!text.includes('<div id="root">'));
    }
  } finally {
    server.close();
  }
});

test('B1 API 404 — Existing API endpoints continue working correctly', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.status, 'healthy');

    // 2. Auth me endpoint with valid guest session
    const authRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'x-demo-session': 'gst_valid_b1_user_01' },
    });
    assert.equal(authRes.status, 200);
    const authBody = await authRes.json();
    assert.ok(authBody.user);
    assert.ok(authBody.settings);
    assert.equal(authBody.user.id, 'gst_valid_b1_user_01');
  } finally {
    server.close();
  }
});

test('B1 API 404 — Frontend SPA routes still return expected HTML fallback', async () => {
  const app = createTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const frontendPaths = ['/', '/dashboard', '/settings/profile', '/study/matrix', '/analytics'];
    for (const p of frontendPaths) {
      const res = await fetch(`${baseUrl}${p}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/html'));
      const html = await res.text();
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<div id="root"></div>'));
    }
  } finally {
    server.close();
  }
});

// ============================================================================
// E2 — GRACEFUL SHUTDOWN TESTS
// ============================================================================

test('E2 Graceful Shutdown — SIGTERM initiates graceful shutdown cleanly', async () => {
  const listeners: Record<string, () => void> = {};
  const mockProcess = {
    on: (evt: string, cb: () => void) => {
      listeners[evt] = cb;
      return mockProcess as any;
    },
    removeListener: () => mockProcess as any,
  };

  let serverClosed = false;
  const mockServer: any = {
    close: (cb: (err?: Error) => void) => {
      serverClosed = true;
      cb();
    },
  };

  let dbFlushed = false;
  const mockDb = {
    flush: async () => {
      dbFlushed = true;
    },
  };

  let exitCode: number | null = null;
  const exitFn = (code: number) => {
    exitCode = code;
  };

  const controller = setupGracefulShutdown(mockServer, {
    db: mockDb,
    exitFn,
    processObj: mockProcess as any,
  });

  assert.equal(controller.isShuttingDown(), false);
  assert.ok(listeners['SIGTERM']);

  // Trigger SIGTERM
  listeners['SIGTERM']();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(controller.isShuttingDown(), true);
  assert.equal(serverClosed, true);
  assert.equal(dbFlushed, true);
  assert.equal(exitCode, 0);
});

test('E2 Graceful Shutdown — SIGINT initiates graceful shutdown cleanly', async () => {
  const listeners: Record<string, () => void> = {};
  const mockProcess = {
    on: (evt: string, cb: () => void) => {
      listeners[evt] = cb;
      return mockProcess as any;
    },
    removeListener: () => mockProcess as any,
  };

  let serverClosed = false;
  const mockServer: any = {
    close: (cb: (err?: Error) => void) => {
      serverClosed = true;
      cb();
    },
  };

  let dbFlushed = false;
  const mockDb = {
    flush: async () => {
      dbFlushed = true;
    },
  };

  let exitCode: number | null = null;
  const exitFn = (code: number) => {
    exitCode = code;
  };

  setupGracefulShutdown(mockServer, {
    db: mockDb,
    exitFn,
    processObj: mockProcess as any,
  });

  // Trigger SIGINT
  listeners['SIGINT']();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(serverClosed, true);
  assert.equal(dbFlushed, true);
  assert.equal(exitCode, 0);
});

test('E2 Graceful Shutdown — Repeated signals do not execute shutdown multiple times', async () => {
  let closeCount = 0;
  const mockServer: any = {
    close: (cb: (err?: Error) => void) => {
      closeCount++;
      cb();
    },
  };

  let flushCount = 0;
  const mockDb = {
    flush: async () => {
      flushCount++;
    },
  };

  let exitCallCount = 0;
  const exitFn = () => {
    exitCallCount++;
  };

  const listeners: Record<string, () => void> = {};
  const mockProcess = {
    on: (evt: string, cb: () => void) => {
      listeners[evt] = cb;
      return mockProcess as any;
    },
    removeListener: () => mockProcess as any,
  };

  const controller = setupGracefulShutdown(mockServer, {
    db: mockDb,
    exitFn,
    processObj: mockProcess as any,
  });

  // Fire SIGTERM twice and SIGINT once rapidly
  listeners['SIGTERM']();
  listeners['SIGTERM']();
  listeners['SIGINT']();
  await controller.initiateShutdown('SIGTERM');

  await new Promise((r) => setTimeout(r, 20));

  assert.equal(closeCount, 1, 'Server close must execute only once');
  assert.equal(flushCount, 1, 'Database flush must execute only once');
  assert.equal(exitCallCount, 1, 'Exit function must execute only once');
});

test('E2 Graceful Shutdown — Active in-flight HTTP requests finish before server closes', async () => {
  const app = express();
  let inFlightFinished = false;

  app.get('/slow-task', async (_req: Request, res: Response) => {
    await new Promise((r) => setTimeout(r, 40));
    inFlightFinished = true;
    res.json({ success: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}/slow-task`;

  let exitCode: number | null = null;
  const controller = setupGracefulShutdown(server, {
    exitFn: (code) => {
      exitCode = code;
    },
  });

  // Start slow request
  const fetchPromise = fetch(url);

  // Wait 10ms so request is in-flight, then initiate shutdown
  await new Promise((r) => setTimeout(r, 10));
  const shutdownPromise = controller.initiateShutdown('SIGTERM');

  // Verify response
  const res = await fetchPromise;
  assert.equal(res.status, 200);
  assert.equal(inFlightFinished, true);

  await shutdownPromise;
  assert.equal(exitCode, 0);

  // Verify new requests are rejected after shutdown
  await assert.rejects(async () => {
    await fetch(url);
  });
});

test('E2 Graceful Shutdown — Pending database writes are flushed before normal exit', async () => {
  const testDir = path.resolve(os.tmpdir(), `test-e2-flush-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const testDb = new DatabaseService(testDir);
    testDb.ensureUserWorkspace('usr_test_e2');

    let flushFinishedBeforeExit = false;
    let exitCode: number | null = null;

    // Trigger async save without immediate await
    void testDb.save();

    const mockServer: any = {
      close: (cb: (err?: Error) => void) => cb(),
    };

    const controller = setupGracefulShutdown(mockServer, {
      db: testDb,
      exitFn: (code) => {
        exitCode = code;
        flushFinishedBeforeExit = true;
      },
    });

    await controller.initiateShutdown('SIGTERM');

    assert.equal(flushFinishedBeforeExit, true);
    assert.equal(exitCode, 0);

    // Verify database file was successfully written and is valid JSON
    const dbFile = testDb.getDatabasePath();
    assert.ok(fs.existsSync(dbFile));
    const content = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
    assert.ok(content.users.some((u: any) => u.id === 'usr_test_e2'));
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
});

test('E2 Graceful Shutdown — Flush failure is logged and exits with code 1', async () => {
  const mockServer: any = {
    close: (cb: (err?: Error) => void) => cb(),
  };

  const failingDb = {
    flush: async () => {
      throw new Error('Disk I/O failure during shutdown');
    },
  };

  let exitCode: number | null = null;
  const controller = setupGracefulShutdown(mockServer, {
    db: failingDb,
    exitFn: (code) => {
      exitCode = code;
    },
  });

  await controller.initiateShutdown('SIGTERM');
  assert.equal(exitCode, 1, 'Must exit with non-zero failure code when database flush fails');
});

test('E2 Graceful Shutdown — Shutdown timeout forces process exit with code 1', async () => {
  // Mock server that hangs forever on close()
  const hangingServer: any = {
    close: () => {
      // Intentionally never call callback
    },
  };

  let exitCode: number | null = null;
  setupGracefulShutdown(hangingServer, {
    timeoutMs: 50, // 50ms short timeout for test
    exitFn: (code) => {
      exitCode = code;
    },
  });

  // Start shutdown with 50ms timeout
  const mockProcess = {
    on: () => mockProcess,
    removeListener: () => mockProcess,
  };
  const controller = setupGracefulShutdown(hangingServer, {
    timeoutMs: 50,
    exitFn: (code) => {
      exitCode = code;
    },
    processObj: mockProcess as any,
  });

  void controller.initiateShutdown('SIGTERM');

  // Wait for timeout to fire
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(exitCode, 1, 'Must force exit with code 1 when timeout expires');
});

