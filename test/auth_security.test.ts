import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseIdToken, requireUserContext } from '../server/auth.ts';
import type { Request, Response, NextFunction } from 'express';

test('Auth Security — Rejects malformed JWT tokens', async () => {
  await assert.rejects(async () => {
    await verifyFirebaseIdToken('invalid-token');
  }, /Malformed JWT/);
});

test('Auth Security — Rejects unsigned "none" alg token in production mode', async () => {
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user_123', aud: 'test-rules-project' })).toString('base64url');
    const token = `${header}.${payload}.`;

    await assert.rejects(async () => {
      await verifyFirebaseIdToken(token);
    }, /Unsigned tokens are strictly forbidden in production/);
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});

test('Auth Security — Rejects forged RS256 token with invalid signature', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'non-existent-kid' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user_123' })).toString('base64url');
  const token = `${header}.${payload}.fake_signature`;

  await assert.rejects(async () => {
    await verifyFirebaseIdToken(token);
  });
});

test('Auth Security — Rejects expired token', async () => {
  const origEnv = process.env.NODE_ENV;
  const origHost = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    process.env.NODE_ENV = 'test';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const pastSec = Math.floor(Date.now() / 1000) - 3600;
    const payload = Buffer.from(JSON.stringify({
      sub: 'user_123',
      aud: 'test-rules-project',
      exp: pastSec,
    })).toString('base64url');
    const token = `${header}.${payload}.`;

    await assert.rejects(async () => {
      await verifyFirebaseIdToken(token);
    }, /Token expired/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.FIRESTORE_EMULATOR_HOST = origHost;
  }
});

test('Auth Security — Rejects wrong audience', async () => {
  const origEnv = process.env.NODE_ENV;
  const origHost = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    process.env.NODE_ENV = 'test';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'user_123',
      aud: 'attacker-arbitrary-project',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    const token = `${header}.${payload}.`;

    await assert.rejects(async () => {
      await verifyFirebaseIdToken(token);
    }, /Token audience mismatch/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.FIRESTORE_EMULATOR_HOST = origHost;
  }
});

test('Auth Security — Rejects missing or invalid subject (UID)', async () => {
  const origEnv = process.env.NODE_ENV;
  const origHost = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    process.env.NODE_ENV = 'test';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: '',
      aud: 'test-rules-project',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    const token = `${header}.${payload}.`;

    await assert.rejects(async () => {
      await verifyFirebaseIdToken(token);
    }, /Invalid token subject/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.FIRESTORE_EMULATOR_HOST = origHost;
  }
});

test('Auth Security — Emulator variables present in production must still reject unsigned tokens', async () => {
  const origEnv = process.env.NODE_ENV;
  const origHost = process.env.FIRESTORE_EMULATOR_HOST;
  const origAllow = process.env.ALLOW_EMULATOR_AUTH;
  try {
    process.env.NODE_ENV = 'production';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    process.env.ALLOW_EMULATOR_AUTH = 'true';

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user_attacker', aud: 'test-rules-project' })).toString('base64url');
    const token = `${header}.${payload}.`;

    await assert.rejects(async () => {
      await verifyFirebaseIdToken(token);
    }, /Unsigned tokens are strictly forbidden in production/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.FIRESTORE_EMULATOR_HOST = origHost;
    process.env.ALLOW_EMULATOR_AUTH = origAllow;
  }
});

test('Auth Security — Rejects UID mismatch (claimed x-user-id does not match verified token sub)', async () => {
  const origEnv = process.env.NODE_ENV;
  const origHost = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    process.env.NODE_ENV = 'test';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      sub: 'alice_legitimate_uid',
      aud: 'test-rules-project',
      exp: nowSec + 3600,
    })).toString('base64url');
    const token = `${header}.${payload}.`;

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-user-id': 'bob_attacker_claimed_uid',
      },
    } as unknown as Request;

    let statusCode: number | null = null;
    let jsonBody: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
        return this;
      },
    } as unknown as Response;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    await requireUserContext(req, res, next);
    assert.equal(nextCalled, false, 'Next must not be called when x-user-id mismatches token');
    assert.equal(statusCode, 403, 'Must return 403 forbidden on tenant mismatch');
    assert.match(jsonBody?.error, /Tenant isolation violation/);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.FIRESTORE_EMULATOR_HOST = origHost;
  }
});

test('Auth Security — Middleware fails closed in production without auth', async () => {
  const origEnv = process.env.NODE_ENV;
  const origRequireAuth = process.env.REQUIRE_AUTH;
  const origAllowGuest = process.env.ALLOW_GUEST;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_AUTH;
    delete process.env.ALLOW_GUEST;

    const req = {
      headers: {},
    } as unknown as Request;

    let statusCode: number | null = null;
    let jsonBody: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
        return this;
      },
    } as unknown as Response;

    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    await requireUserContext(req, res, next);
    assert.equal(nextCalled, false, 'Next must not be called when unauthenticated in production');
    assert.equal(statusCode, 401, 'Status must be 401');
    assert.equal(jsonBody?.error, 'Authentication required');
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.REQUIRE_AUTH = origRequireAuth;
    process.env.ALLOW_GUEST = origAllowGuest;
  }
});

test('Auth Security — Shared demo mode is disabled in production', async () => {
  const origEnv = process.env.NODE_ENV;
  const origDemoMode = process.env.DEMO_MODE;
  const origAllowGuest = process.env.ALLOW_GUEST;

  try {
    process.env.NODE_ENV = 'production';
    process.env.DEMO_MODE = 'shared';
    process.env.ALLOW_GUEST = 'true';

    const req = {
      headers: {},
      socket: { remoteAddress: '192.168.1.100' },
    } as unknown as Request;

    let nextCalled = false;
    const res = {} as unknown as Response;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    await requireUserContext(req, res, next);
    assert.equal(nextCalled, true);
    const auth = (req as any).auth;
    assert.ok(auth.userId.startsWith('gst_'), `In production, userId must not be usr_atif_default, got: ${auth.userId}`);
    assert.notEqual(auth.userId, 'usr_atif_default');
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.DEMO_MODE = origDemoMode;
    process.env.ALLOW_GUEST = origAllowGuest;
  }
});
