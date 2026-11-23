import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../server/serverless.ts';

let server: http.Server;
let baseUrl = '';

async function apiRequest(
  path: string,
  options: {
    method?: string;
    token?: string;
    guestSession?: string;
    body?: any;
  } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  } else if (options.guestSession) {
    headers['x-demo-session'] = options.guestSession;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => '');
  }

  return { status: res.status, headers: res.headers, data, contentType };
}

// Helper to generate mock Firebase ID token for test authentication
function createMockFirebaseIdToken(uid: string, email?: string, name?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: email || `${uid}@focusflow.test`,
      name: name || uid.toUpperCase(),
      aud: 'focus-flow-by-atif',
      iss: 'https://securetoken.google.com/focus-flow-by-atif',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

test('Joint Vault Vercel Serverless API — End-to-End Invitation & Verification Suite', async (t) => {
  // Start the Vercel serverless app on an ephemeral port
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  // ========================================================
  // SUITE 1: VERCEL SERVERLESS ROUTING & HEALTH CHECKS
  // ========================================================

  await t.test('1.1 Health check endpoints return healthy JSON', async () => {
    const resRootHealth = await apiRequest('/health');
    assert.equal(resRootHealth.status, 200);
    assert.equal(resRootHealth.data.status, 'healthy');
    assert.equal(resRootHealth.data.platform, 'vercel-serverless');

    const resApiHealth = await apiRequest('/api/health');
    assert.equal(resApiHealth.status, 200);
    assert.equal(resApiHealth.data.status, 'healthy');
  });

  await t.test('1.2 Unknown API route returns 404 JSON, NEVER HTML fallback', async () => {
    const resUnknown = await apiRequest('/api/unknown-nonexistent-endpoint');
    assert.equal(resUnknown.status, 404);
    assert.ok(resUnknown.contentType.includes('application/json'), 'Missing API endpoint must return JSON');
    assert.ok(resUnknown.data.error.includes('not found'));
  });

  // ========================================================
  // SUITE 2: TWO-ACCOUNT INVITATION & JOIN FLOW (E2E)
  // ========================================================

  const creatorUid = 'gst_alice_creator_' + Date.now();
  const creatorToken = createMockFirebaseIdToken(creatorUid, 'alice@focusflow.test', 'Alice');

  const partnerUid = 'gst_bob_partner_' + Date.now();
  const partnerToken = createMockFirebaseIdToken(partnerUid, 'bob@focusflow.test', 'Bob');

  const thirdPartyUid = 'gst_eve_stranger_' + Date.now();
  const thirdPartyToken = createMockFirebaseIdToken(thirdPartyUid, 'eve@focusflow.test', 'Eve');

  let vaultId = '';
  let validInviteCode = '';

  await t.test('2.1 Account A (Creator) creates a Joint Vault', async () => {
    const res = await apiRequest('/api/joint-vaults', {
      method: 'POST',
      token: creatorToken,
      body: {
        name: 'Europe Holiday 2027',
        description: 'Joint savings fund for European trip',
        targetPaise: 50000000, // ₹500,000
        currency: 'INR',
      },
    });

    assert.equal(res.status, 201, 'Creator vault creation returns 201');
    assert.ok(res.data.vault, 'Response contains vault');
    vaultId = res.data.vault.id;
    assert.ok(vaultId);
    assert.equal(res.data.vault.createdBy, creatorUid);
    assert.deepEqual(res.data.vault.memberUids, [creatorUid]);
  });

  await t.test('2.2 Privacy: Unrelated non-member cannot read Account A\'s vault', async () => {
    const res = await apiRequest(`/api/joint-vaults/${vaultId}`, {
      token: partnerToken,
    });
    assert.equal(res.status, 404, 'Non-member access is rejected with 404');
  });

  await t.test('2.3 Account A creates an invitation and generates a single-use code', async () => {
    const res = await apiRequest(`/api/joint-vaults/${vaultId}/invitations`, {
      method: 'POST',
      token: creatorToken,
      body: { invitedEmail: 'bob@focusflow.test' },
    });

    assert.equal(res.status, 201, 'Invitation generation returns 201');
    validInviteCode = res.data.inviteCode;
    assert.ok(validInviteCode, 'Invite code must be returned');
    assert.equal(res.data.status, 'pending');
    assert.equal(res.data.vaultId, vaultId);
  });

  await t.test('2.4 Account B (Invited Partner) successfully joins the vault using valid invite code', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: partnerToken,
      body: { inviteCode: validInviteCode },
    });

    assert.equal(res.status, 200, 'Accepting valid invitation returns 200');
    assert.ok(res.data.vault, 'Returns updated vault');
    assert.equal(res.data.vault.memberUids.length, 2, 'Vault now has exactly 2 members');
    assert.ok(res.data.vault.memberUids.includes(creatorUid), 'Creator is member');
    assert.ok(res.data.vault.memberUids.includes(partnerUid), 'Partner is now member');
    assert.deepEqual(res.data.vault.targetRatio, {
      [creatorUid]: 50,
      [partnerUid]: 50,
    });
  });

  await t.test('2.5 Partner can now read the shared vault summary', async () => {
    const res = await apiRequest(`/api/joint-vaults/${vaultId}`, {
      token: partnerToken,
    });
    assert.equal(res.status, 200, 'Partner can now read vault summary');
    assert.equal(res.data.vault.name, 'Europe Holiday 2027');
    assert.equal(res.data.members.length, 2);
  });

  // ========================================================
  // SUITE 3: SECURITY, IDEMPOTENCY & CAPACITY FAILURE TESTS
  // ========================================================

  await t.test('3.1 Reused invitation code is strictly rejected (single-use enforcement)', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: thirdPartyToken,
      body: { inviteCode: validInviteCode },
    });
    assert.equal(res.status, 400, 'Reused code must return 400');
    assert.ok(res.data.error.includes('already processed') || res.data.error.includes('Invalid'));
  });

  await t.test('3.2 Invalid or nonexistent invitation code is strictly rejected', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: thirdPartyToken,
      body: { inviteCode: 'BOGUS-INVITE-9999' },
    });
    assert.equal(res.status, 400, 'Bogus code returns 400');
  });

  await t.test('3.3 Third-member attempt on full vault (max 2 members) is strictly rejected', async () => {
    // Generate an invite for another vault, but attempt to join full vault
    const res = await apiRequest(`/api/joint-vaults/${vaultId}/invitations`, {
      method: 'POST',
      token: creatorToken,
      body: { invitedEmail: 'third@test.com' },
    });
    assert.equal(res.status, 400, 'Full vault cannot generate invitations');
  });

  await t.test('3.4 Unauthenticated request to accept invitation without Bearer or session fails cleanly', async () => {
    // When REQUIRE_AUTH is true or when missing token
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      body: { inviteCode: 'SOME-CODE' },
    });
    // Request must fail with client error (400 or 401), never 500
    assert.ok(res.status === 400 || res.status === 401);
  });

  await t.test('3.5 Partner and Creator can record shared contributions', async () => {
    // Creator contributes ₹100,000
    const res1 = await apiRequest(`/api/joint-vaults/${vaultId}/contributions`, {
      method: 'POST',
      token: creatorToken,
      body: { amountPaise: 10000000, description: 'Alice initial deposit' },
    });
    assert.equal(res1.status, 201);

    // Partner contributes ₹100,000
    const res2 = await apiRequest(`/api/joint-vaults/${vaultId}/contributions`, {
      method: 'POST',
      token: partnerToken,
      body: { amountPaise: 10000000, description: 'Bob initial deposit' },
    });
    assert.equal(res2.status, 201);

    // Third-party non-member contribution is blocked
    const res3 = await apiRequest(`/api/joint-vaults/${vaultId}/contributions`, {
      method: 'POST',
      token: thirdPartyToken,
      body: { amountPaise: 5000000 },
    });
    assert.equal(res3.status, 400, 'Non-member cannot contribute');
  });
});
