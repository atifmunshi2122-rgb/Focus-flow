import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import { dbService } from '../server/db.ts';

let server: http.Server;
let baseUrl = '';

async function apiRequest(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
  } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
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

function makeMockToken(uid: string, email?: string, name?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: email || `${uid}@focusflow.test`,
      name: name || uid,
      auth_time: now,
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

test('Joint Vault Dual-Mode Lifecycle & Invitation Flow Suite', async (t) => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const creatorUid = `gst_creator_${Date.now()}`;
  const partnerUid = `gst_partner_${Date.now()}`;
  const thirdUid = `gst_third_${Date.now()}`;

  const creatorToken = makeMockToken(creatorUid, 'atif@focusflow.test', 'Atif Munshi');
  const partnerToken = makeMockToken(partnerUid, 'puja@focusflow.test', 'Puja Mozumdar');
  const thirdToken = makeMockToken(thirdUid, 'third@focusflow.test', 'Third Party');

  let vaultId = '';
  let inviteCode = '';

  await t.test('1. Creator creates a Joint Vault with 1/2 members', async () => {
    const res = await apiRequest('/api/joint-vaults', {
      method: 'POST',
      token: creatorToken,
      body: {
        name: 'OUR SAVINGS',
        description: 'Mutual future savings',
        targetPaise: 50000000,
        currency: 'INR',
      },
    });

    assert.equal(res.status, 201, 'Vault creation must return 201');
    assert.ok(res.data.vault, 'Response has vault summary');
    vaultId = res.data.vault.id;
    assert.ok(vaultId);
    assert.equal(res.data.vault.name, 'OUR SAVINGS');
    assert.deepEqual(res.data.vault.memberUids, [creatorUid]);
    assert.equal(res.data.members.length, 1);
  });

  await t.test('2. Creator generates single-use invitation code', async () => {
    const res = await apiRequest(`/api/joint-vaults/${vaultId}/invitations`, {
      method: 'POST',
      token: creatorToken,
      body: {
        invitedEmail: 'puja@focusflow.test',
      },
    });

    assert.equal(res.status, 201, 'Invitation creation returns 201');
    inviteCode = res.data.inviteCode;
    assert.ok(inviteCode);
    assert.equal(inviteCode.length >= 8, true);
    assert.equal(res.data.status, 'pending');
    assert.equal(res.data.vaultId, vaultId);
  });

  await t.test('3. Non-member invalid code returns specific error', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: partnerToken,
      body: {
        inviteCode: 'NONEXISTENT99',
      },
    });

    assert.equal(res.status, 400);
    assert.ok(
      res.data.error.toLowerCase().includes('invalid') ||
      res.data.error.toLowerCase().includes('verify')
    );
  });

  await t.test('4. Partner accepts valid invitation code -> Vault becomes 2/2 members', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: partnerToken,
      body: {
        inviteCode,
      },
    });

    assert.equal(res.status, 200, 'Accepting valid invite must return 200');
    assert.ok(res.data.vault, 'Returns updated vault summary');
    assert.equal(res.data.vault.memberUids.length, 2, 'Vault now has exactly 2 members');
    assert.ok(res.data.vault.memberUids.includes(creatorUid));
    assert.ok(res.data.vault.memberUids.includes(partnerUid));
    assert.deepEqual(res.data.vault.targetRatio, {
      [creatorUid]: 50,
      [partnerUid]: 50,
    });
  });

  await t.test('5. Single-use enforcement: Attempting to accept the same code again is strictly rejected', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: thirdToken,
      body: {
        inviteCode,
      },
    });

    assert.equal(res.status, 400, 'Reusing code must return 400');
    assert.ok(
      res.data.error.toLowerCase().includes('already') ||
      res.data.error.toLowerCase().includes('invalid')
    );
  });

  await t.test('6. Vault summary confirms 2/2 active members for both accounts', async () => {
    const resA = await apiRequest(`/api/joint-vaults/${vaultId}`, { token: creatorToken });
    const resB = await apiRequest(`/api/joint-vaults/${vaultId}`, { token: partnerToken });

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.equal(resA.data.members.length, 2);
    assert.equal(resB.data.members.length, 2);
  });

  await t.test('7. Full vault (2/2) cannot generate more invitations', async () => {
    const res = await apiRequest(`/api/joint-vaults/${vaultId}/invitations`, {
      method: 'POST',
      token: creatorToken,
      body: {},
    });

    assert.equal(res.status, 400);
    assert.ok(res.data.error.toLowerCase().includes('maximum'));
  });

  await t.test('8. Both partners can record contributions towards target', async () => {
    const contribA = await apiRequest(`/api/joint-vaults/${vaultId}/contributions`, {
      method: 'POST',
      token: creatorToken,
      body: {
        amountPaise: 10000000, // ₹1,00,000
        description: 'Monthly savings Atif',
        date: new Date().toISOString().slice(0, 10),
      },
    });
    assert.equal(contribA.status, 201);

    const contribB = await apiRequest(`/api/joint-vaults/${vaultId}/contributions`, {
      method: 'POST',
      token: partnerToken,
      body: {
        amountPaise: 10000000, // ₹1,00,000
        description: 'Monthly savings Puja',
        date: new Date().toISOString().slice(0, 10),
      },
    });
    assert.equal(contribB.status, 201);
    assert.equal(contribB.data.summary.totalContributedPaise, 20000000);
  });

  await t.test('9. Idempotency: Repeated acceptance by the same account returns 200 with existing membership', async () => {
    const res = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: partnerToken,
      body: {
        inviteCode,
      },
    });

    assert.equal(res.status, 200, 'Repeated acceptance by the same partner returns 200 OK');
    assert.ok(res.data.vault, 'Returns vault data');
    assert.equal(res.data.vault.memberUids.length, 2);
    assert.ok(res.data.vault.memberUids.includes(partnerUid));
  });

  let exclusiveVaultId = '';

  await t.test('10. Email-bound invitation rejected when accepted by an account with mismatched email', async () => {
    // Create a new vault for email-binding test
    const vRes = await apiRequest('/api/joint-vaults', {
      method: 'POST',
      token: creatorToken,
      body: {
        name: 'EXCLUSIVE VAULT',
        targetPaise: 1000000,
        currency: 'INR',
      },
    });
    assert.equal(vRes.status, 201);
    exclusiveVaultId = vRes.data.vault.id;

    // Create invitation specifically bound to specific-email@test.com
    const invRes = await apiRequest(`/api/joint-vaults/${exclusiveVaultId}/invitations`, {
      method: 'POST',
      token: creatorToken,
      body: {
        invitedEmail: 'intended-recipient@focusflow.test',
      },
    });
    assert.equal(invRes.status, 201);
    const exclusiveInviteCode = invRes.data.inviteCode;

    // Attempt accept with partner token whose email is puja@focusflow.test
    const acceptRes = await apiRequest('/api/joint-vaults/invitations/accept', {
      method: 'POST',
      token: partnerToken,
      body: {
        inviteCode: exclusiveInviteCode,
      },
    });

    assert.equal(acceptRes.status, 400, 'Accepting email-mismatched invite must return 400');
    assert.ok(
      acceptRes.data.error.toLowerCase().includes('different email') ||
      acceptRes.data.error.toLowerCase().includes('email address')
    );
  });

  await t.test('11. Non-member cannot create invitations for another vault', async () => {
    const res = await apiRequest(`/api/joint-vaults/${exclusiveVaultId}/invitations`, {
      method: 'POST',
      token: thirdToken,
      body: {},
    });

    assert.equal(res.status, 400, 'Non-member invitation creation must be rejected with 400 Bad Request');
    assert.ok(
      res.data.error.toLowerCase().includes('not a member') ||
      res.data.error.toLowerCase().includes('unauthorized')
    );
  });
});
