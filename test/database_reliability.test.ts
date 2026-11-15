import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import { DatabaseService, DatabaseCorruptError, dbService } from '../server/db.ts';
import { apiRouter } from '../server/routes.ts';

function createTempTestDir(prefix = 'ff-db-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

function cleanTempDir(dir: string): void {
  try {
    fs.chmodSync(dir, 0o755);
  } catch {
    // Ignore chmod errors during cleanup
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore rm errors during cleanup
  }
}

async function withSimulatedWriteFailure(dir: string, fn: () => Promise<void>): Promise<void> {
  fs.chmodSync(dir, 0o555);
  const isRoot = typeof process.geteuid === 'function' && process.geteuid() === 0;
  const originalWriteFile = fs.promises.writeFile;
  if (isRoot) {
    const resolvedDir = path.resolve(dir);
    (fs.promises as unknown as { writeFile: typeof fs.promises.writeFile }).writeFile = (async (
      filePath: Parameters<typeof fs.promises.writeFile>[0],
      ...rest: unknown[]
    ) => {
      if (typeof filePath === 'string' && path.resolve(filePath).startsWith(resolvedDir)) {
        const err = new Error(`EACCES: permission denied, open '${filePath}'`) as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return (originalWriteFile as (...args: unknown[]) => Promise<void>).call(fs.promises, filePath, ...rest);
    }) as typeof fs.promises.writeFile;
  }
  try {
    await fn();
  } finally {
    if (isRoot) {
      fs.promises.writeFile = originalWriteFile;
    }
    try {
      fs.chmodSync(dir, 0o755);
    } catch {
      // Ignore chmod errors on cleanup
    }
  }
}

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// TEST 1: Valid JSON database loads successfully
// ---------------------------------------------------------------------------
test('Scenario 1 — Valid JSON database loads successfully', () => {
  const tempDir = createTempTestDir('ff-test-1-');
  try {
    const validData = {
      users: [
        {
          id: 'usr_valid_1',
          email: 'valid1@test.local',
          name: 'Valid User 1',
          avatarUrl: '',
          createdAt: new Date().toISOString(),
        },
      ],
      userSettings: [],
      tasks: [],
      focusSessions: [],
      categories: [],
    };
    fs.writeFileSync(path.join(tempDir, 'database.json'), JSON.stringify(validData, null, 2), 'utf-8');

    const db = new DatabaseService(tempDir);
    assert.equal(db.isHealthy(), true, 'Database should be marked healthy');
    assert.equal(db.getCorruptionError(), null, 'Corruption error should be null');
    assert.equal(db.getRaw().users.length, 1, 'Should have loaded 1 user');
    assert.equal(db.getRaw().users[0].name, 'Valid User 1');
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 2: Malformed JSON produces DatabaseCorruptError and halts initialization
// ---------------------------------------------------------------------------
test('Scenario 2 — Malformed JSON produces DatabaseCorruptError and halts initialization', () => {
  const tempDir = createTempTestDir('ff-test-2-');
  try {
    // Syntax error: truncated JSON
    const malformedContent = '{"users": [{"id": "usr_broken", "name": "Broken';
    const dbPath = path.join(tempDir, 'database.json');
    fs.writeFileSync(dbPath, malformedContent, 'utf-8');

    assert.throws(
      () => {
        new DatabaseService(tempDir);
      },
      (err: unknown) => {
        assert.ok(err instanceof DatabaseCorruptError, 'Error must be DatabaseCorruptError');
        assert.equal(err.name, 'DatabaseCorruptError');
        assert.equal(err.dbPath, dbPath);
        return true;
      }
    );
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 3: Corrupt-file bytes and SHA-256 remain unchanged after failed instantiation
// ---------------------------------------------------------------------------
test('Scenario 3 — Corrupt-file bytes and SHA-256 remain unchanged after failed instantiation', () => {
  const tempDir = createTempTestDir('ff-test-3-');
  try {
    const corruptBytes = '{"corrupted_data": true, [syntax_error]}';
    const dbPath = path.join(tempDir, 'database.json');
    fs.writeFileSync(dbPath, corruptBytes, 'utf-8');

    const hashBefore = computeSha256(dbPath);

    assert.throws(() => {
      new DatabaseService(tempDir);
    }, DatabaseCorruptError);

    const hashAfter = computeSha256(dbPath);
    const contentAfter = fs.readFileSync(dbPath, 'utf-8');

    assert.equal(contentAfter, corruptBytes, 'Raw file bytes must be identical to pre-test bytes');
    assert.equal(hashAfter, hashBefore, 'File SHA-256 must match pre-instantiation hash exactly');
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 4: Corruption error halts initialization without running ensureBaseDefaults() or save()
// ---------------------------------------------------------------------------
test('Scenario 4 — Corruption halts initialization without running ensureBaseDefaults() or writing defaults', () => {
  const tempDir = createTempTestDir('ff-test-4-');
  try {
    // Empty / whitespace file counts as corrupt/truncated
    const whitespaceContent = '   \n  \t  \n';
    const dbPath = path.join(tempDir, 'database.json');
    fs.writeFileSync(dbPath, whitespaceContent, 'utf-8');

    assert.throws(() => {
      new DatabaseService(tempDir);
    }, DatabaseCorruptError);

    // Verify disk content was NOT rewritten with default schema or default categories
    const contentAfter = fs.readFileSync(dbPath, 'utf-8');
    assert.equal(contentAfter, whitespaceContent, 'File content must remain the original whitespace without default overwrite');

    // Verify no temporary files exist in the directory
    const dirEntries = fs.readdirSync(tempDir);
    const tmpFiles = dirEntries.filter((f) => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, 'No temporary files should have been left behind');
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 5: Missing-database initialization creates empty schema without errors
// ---------------------------------------------------------------------------
test('Scenario 5 — Missing-database initialization creates empty schema without errors', async () => {
  const tempDir = createTempTestDir('ff-test-5-');
  try {
    const dbPath = path.join(tempDir, 'database.json');
    assert.equal(fs.existsSync(dbPath), false, 'database.json must not exist initially');

    const db = new DatabaseService(tempDir);
    assert.equal(db.isHealthy(), true, 'Database must be healthy on clean start');
    assert.equal(db.getCorruptionError(), null, 'Corruption error must be null');
    assert.ok(Array.isArray(db.getRaw().users), 'users array must be initialized');
    assert.ok(Array.isArray(db.getRaw().tasks), 'tasks array must be initialized');

    // Verify save persists a clean, valid file
    await db.save();
    assert.equal(fs.existsSync(dbPath), true, 'database.json must exist after save');
    const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    assert.ok(Array.isArray(parsed.categories), 'categories must be an array in persisted json');
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 6: Simulated write failure propagates rejection to caller
// ---------------------------------------------------------------------------
test('Scenario 6 — Simulated write failure propagates rejection to caller', async () => {
  const tempDir = createTempTestDir('ff-test-6-');
  try {
    const db = new DatabaseService(tempDir);
    await db.save(); // Initial successful save

    await withSimulatedWriteFailure(tempDir, async () => {
      await assert.rejects(
        async () => {
          await db.save();
        },
        (err: unknown) => {
          assert.ok(err instanceof Error, 'Rejected value must be an Error');
          return true;
        },
        'db.save() must propagate rejection when filesystem write fails'
      );
    });
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 7: Failed write does not damage previously valid database
// ---------------------------------------------------------------------------
test('Scenario 7 — Failed write does not damage previously valid database', async () => {
  const tempDir = createTempTestDir('ff-test-7-');
  try {
    const dbPath = path.join(tempDir, 'database.json');
    const db = new DatabaseService(tempDir);
    db.getRaw().users.push({
      id: 'usr_stable',
      email: 'stable@focusflow.test',
      name: 'Stable User',
      avatarUrl: '',
      createdAt: new Date().toISOString(),
    });
    await db.save();

    const validHash = computeSha256(dbPath);
    const validContent = fs.readFileSync(dbPath, 'utf-8');

    // Simulate write failure (read-only directory / EACCES)
    await withSimulatedWriteFailure(tempDir, async () => {
      await assert.rejects(async () => {
        await db.save();
      });
    });

    const postFailureHash = computeSha256(dbPath);
    const postFailureContent = fs.readFileSync(dbPath, 'utf-8');

    assert.equal(postFailureContent, validContent, 'Content of database.json must be untouched after failed write');
    assert.equal(postFailureHash, validHash, 'SHA-256 of database.json must remain identical after failed write');

    // Also assert no stray temporary files exist
    const leftoverTmps = fs.readdirSync(tempDir).filter((f) => f.endsWith('.tmp'));
    assert.equal(leftoverTmps.length, 0, 'No orphaned .tmp file should remain after failed write');
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 8: Concurrent save() operations are serialized in FIFO order
// ---------------------------------------------------------------------------
test('Scenario 8 — Concurrent save() operations are serialized in FIFO order without race corruption', async () => {
  const tempDir = createTempTestDir('ff-test-8-');
  try {
    const db = new DatabaseService(tempDir);
    const totalWrites = 15;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < totalWrites; i++) {
      db.getRaw().tasks.push({
        id: `task_fifo_${i}`,
        userId: 'usr_test',
        title: `Task #${i}`,
        description: 'FIFO Test',
        priority: 'medium',
        status: 'todo',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        dueDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      promises.push(db.save());
    }

    // All concurrent saves must resolve without error
    await Promise.all(promises);

    const dbPath = path.join(tempDir, 'database.json');
    const diskContent = fs.readFileSync(dbPath, 'utf-8');
    const parsed = JSON.parse(diskContent);

    assert.equal(parsed.tasks.length, totalWrites, `All ${totalWrites} concurrent writes must be safely persisted`);
    for (let i = 0; i < totalWrites; i++) {
      assert.equal(parsed.tasks[i].id, `task_fifo_${i}`, `Task index ${i} must preserve FIFO ordering`);
    }
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 9: Persisted JSON remains complete and parseable after repeated sequential/concurrent writes
// ---------------------------------------------------------------------------
test('Scenario 9 — Persisted JSON remains complete and parseable after repeated sequential/concurrent writes', async () => {
  const tempDir = createTempTestDir('ff-test-9-');
  try {
    const db = new DatabaseService(tempDir);
    const dbPath = path.join(tempDir, 'database.json');

    // Perform 30 sequential and concurrent operations
    for (let cycle = 0; cycle < 5; cycle++) {
      const batchPromises: Promise<void>[] = [];
      for (let j = 0; j < 6; j++) {
        db.getRaw().focusSessions.push({
          id: `session_${cycle}_${j}`,
          userId: 'usr_test',
          taskId: null,
          mode: 'work',
          durationMinutes: 25,
          durationSeconds: 1500,
          completed: true,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        });
        batchPromises.push(db.save());
      }
      await Promise.all(batchPromises);

      // Verify parseability at each cycle
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const parsed = JSON.parse(raw);
      assert.ok(Array.isArray(parsed.focusSessions));
      assert.equal(parsed.focusSessions.length, (cycle + 1) * 6);
    }
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 10: API routes do not respond before save completes
// ---------------------------------------------------------------------------
test('Scenario 10 — API routes do not respond before save completes (awaitable persistence)', async () => {
  // Mount an express test app with apiRouter
  const app = express();
  app.use(express.json());
  // Pre-seed test request user context
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'usr_atif_default', email: 'test_user@focusflow.local' };
    next();
  });
  app.use('/api', apiRouter);

  // Intercept dbService.save to introduce a deterministic delay and record execution timing
  let saveCompletedAt = 0;
  const originalSave = dbService.save.bind(dbService);

  let saveSpyCalled = false;
  (dbService as any).save = async function delayedSave() {
    saveSpyCalled = true;
    await new Promise((resolve) => setTimeout(resolve, 60)); // 60ms delay
    const result = await originalSave();
    saveCompletedAt = Date.now();
    return result;
  };

  try {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    assert.ok(port > 0, 'Server should bind to an ephemeral port');

    const reqBody = {
      title: 'Persistence Timing Task',
      description: 'Verifying await order',
      priority: 'high',
      status: 'todo',
      estimatedPomodoros: 2,
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'usr_atif_default',
      },
      body: JSON.stringify(reqBody),
    });

    const responseReceivedAt = Date.now();
    assert.equal(res.status, 201, 'POST /api/tasks must return 201 Created');
    assert.equal(saveSpyCalled, true, 'dbService.save must have been called');
    assert.ok(
      saveCompletedAt > 0,
      'saveCompletedAt timestamp must be recorded'
    );
    assert.ok(
      responseReceivedAt >= saveCompletedAt,
      `Response received at ${responseReceivedAt} must be >= save completion time ${saveCompletedAt}`
    );

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  } finally {
    (dbService as any).save = originalSave;
  }
});

// ---------------------------------------------------------------------------
// TEST 11: Top-level JSON array is rejected with DatabaseCorruptError
// ---------------------------------------------------------------------------
test('Scenario 11 — Top-level JSON array ([]) is rejected with DatabaseCorruptError', () => {
  const tempDir = createTempTestDir('ff-test-11-');
  try {
    const dbPath = path.join(tempDir, 'database.json');
    fs.writeFileSync(dbPath, '[]', 'utf-8');

    assert.throws(
      () => {
        new DatabaseService(tempDir);
      },
      (err: unknown) => {
        assert.ok(err instanceof DatabaseCorruptError, 'Must throw DatabaseCorruptError for array root');
        assert.equal(err.name, 'DatabaseCorruptError');
        return true;
      }
    );
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 12: Top-level primitive JSON is rejected with DatabaseCorruptError
// ---------------------------------------------------------------------------
test('Scenario 12 — Top-level primitive JSON (123, "text", true) is rejected with DatabaseCorruptError', () => {
  const tempDir = createTempTestDir('ff-test-12-');
  try {
    const dbPath = path.join(tempDir, 'database.json');
    for (const primitive of ['12345', '"plain string"', 'true', 'null']) {
      fs.writeFileSync(dbPath, primitive, 'utf-8');
      assert.throws(
        () => {
          new DatabaseService(tempDir);
        },
        DatabaseCorruptError,
        `Primitive JSON (${primitive}) must throw DatabaseCorruptError`
      );
    }
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 13: flush() rejects when write fails, does not swallow error
// ---------------------------------------------------------------------------
test('Scenario 13 — flush() rejects when write fails, does not swallow error', async () => {
  const tempDir = createTempTestDir('ff-test-13-');
  try {
    const db = new DatabaseService(tempDir);
    await db.save();

    await withSimulatedWriteFailure(tempDir, async () => {
      // Trigger save (tracked fire-and-forget inside mutation)
      db.saveTimeBlock('usr_test', { title: 'Failing Block' });

      // flush() must propagate the rejection
      await assert.rejects(
        async () => {
          await db.flush();
        },
        (err: unknown) => {
          assert.ok(err instanceof Error, 'flush() must reject with an Error');
          return true;
        },
        'flush() must reject on write failure'
      );
    });
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 14: In-memory failure policy: PersistenceDegraded state and Queue Recovery
// ---------------------------------------------------------------------------
test('Scenario 14 — In-memory failure policy: marks degraded on failure and recovers cleanly', async () => {
  const tempDir = createTempTestDir('ff-test-14-');
  try {
    const db = new DatabaseService(tempDir);
    await db.save();

    assert.equal(db.isHealthy(), true);
    assert.equal(db.isDegraded(), false);

    // Simulate disk failure
    await withSimulatedWriteFailure(tempDir, async () => {
      await assert.rejects(async () => {
        await db.save();
      });

      // Database must now be marked degraded
      assert.equal(db.isHealthy(), false);
      assert.equal(db.isDegraded(), true);
      assert.ok(db.getPersistenceError() !== null);

      // Further saves must immediately reject due to degradation
      await assert.rejects(
        async () => {
          await db.save();
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('degraded'));
          return true;
        }
      );
    });

    // Recovery: permissions restored, recover persistence
    await db.recoverPersistence();

    assert.equal(db.isHealthy(), true);
    assert.equal(db.isDegraded(), false);
    assert.equal(db.getPersistenceError(), null);

    // Save should now succeed normally
    await db.save();
    await db.flush();
  } finally {
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 15: Zero unhandled promise rejections on background save failures
// ---------------------------------------------------------------------------
test('Scenario 15 — Zero unhandled promise rejections on background save failures', async () => {
  let unhandledOccurred = false;
  const onUnhandled = () => {
    unhandledOccurred = true;
  };
  process.on('unhandledRejection', onUnhandled);

  const tempDir = createTempTestDir('ff-test-15-');
  try {
    const db = new DatabaseService(tempDir);
    await db.save();

    await withSimulatedWriteFailure(tempDir, async () => {
      // Fire background unawaited mutation
      db.saveTimeBlock('usr_test', { title: 'Background Unhandled Check' });

      // Wait 60ms for event loop turns
      await new Promise((r) => setTimeout(r, 60));
    });

    assert.equal(unhandledOccurred, false, 'Node.js must not encounter unhandledRejection');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    cleanTempDir(tempDir);
  }
});

// ---------------------------------------------------------------------------
// TEST 16: Missed mutating routes (/time-blocks, /envelopes, /subscriptions, /study/subjects, /sync/queue) await persistence and reject with 500 on failure
// ---------------------------------------------------------------------------
test('Scenario 16 — All previously missed mutating routes await persistence and fail with 500 on persistence error', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { uid: 'usr_atif_default', email: 'test_user@focusflow.local' };
    next();
  });
  app.use('/api', apiRouter);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  assert.ok(port > 0);

  const originalFlush = dbService.flush.bind(dbService);

  try {
    // 1. Verify successful write with persistence
    const res1 = await fetch(`http://127.0.0.1:${port}/api/time-blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_atif_default' },
      body: JSON.stringify({ title: 'Audited Block' }),
    });
    assert.equal(res1.status, 201, 'POST /time-blocks must return 201 on success');

    const res2 = await fetch(`http://127.0.0.1:${port}/api/envelopes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_atif_default' },
      body: JSON.stringify({ name: 'Groceries Envelope', targetPaise: 500000 }),
    });
    assert.equal(res2.status, 201, 'POST /envelopes must return 201 on success');

    const res3 = await fetch(`http://127.0.0.1:${port}/api/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_atif_default' },
      body: JSON.stringify({ name: 'Streaming', amountPaise: 49900, billingCycle: 'monthly' }),
    });
    assert.equal(res3.status, 201, 'POST /subscriptions must return 201 on success');

    const res4 = await fetch(`http://127.0.0.1:${port}/api/study/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_atif_default' },
      body: JSON.stringify({ code: 'CS_101', name: 'Computer Science 101' }),
    });
    assert.equal(res4.status, 200, 'POST /study/subjects must return 200 on success');

    const res5 = await fetch(`http://127.0.0.1:${port}/api/sync/queue/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_atif_default' },
      body: JSON.stringify({ entityType: 'task', action: 'create', sheetName: 'Tasks' }),
    });
    assert.equal(res5.status, 201, 'POST /sync/queue/enqueue must return 201 on success');

    // 2. Simulate persistence failure via flush rejection
    (dbService as any).flush = async function failingFlush() {
      throw new Error('Simulated I/O disk error');
    };

    const failEndpoints = [
      { method: 'POST', path: '/api/time-blocks', body: { title: 'Failing Block' } },
      { method: 'POST', path: '/api/envelopes', body: { name: 'Failing Envelope' } },
      { method: 'POST', path: '/api/subscriptions', body: { name: 'Failing Sub', amountPaise: 100 } },
      { method: 'POST', path: '/api/study/subjects', body: { code: 'FAIL_1', name: 'Failing Subject' } },
      { method: 'POST', path: '/api/sync/queue/enqueue', body: { entityType: 't', action: 'a', sheetName: 's' } },
    ];

    for (const ep of failEndpoints) {
      const failRes = await fetch(`http://127.0.0.1:${port}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_atif_default' },
        body: JSON.stringify(ep.body),
      });

      assert.equal(
        failRes.status,
        500,
        `${ep.path} must return HTTP 500 when database persistence fails`
      );
      const json = await failRes.json();
      assert.equal(json.error, 'Database persistence failed');
      // Verify no stack trace or internal path exposed
      assert.equal(json.stack, undefined);
    }
  } finally {
    (dbService as any).flush = originalFlush;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

