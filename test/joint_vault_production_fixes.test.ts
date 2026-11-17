import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import { dbService } from '../server/db.ts';
import {
  vaultBackendService,
  __setServiceAccountForTesting,
  VaultServiceError,
} from '../server/vaultBackendService.ts';

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

test('Joint Vault Production Fixes — End-to-End Suite', async (t) => {
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
    __setServiceAccountForTesting(undefined);
  });

  await t.test(
    '1. Authenticated user receives HTTP 503 (FIREBASE_ADMIN_NOT_CONFIGURED) when service account is not configured',
    async () => {
      // Ensure credentials are explicitly missing in test environment
      __setServiceAccountForTesting(null);

      const authenticatedToken = makeMockToken('usr_auth_atif', 'atif@example.com', 'Atif Munshi');
      const res = await apiRequest('/api/joint-vaults/invitations/accept', {
        method: 'POST',
        token: authenticatedToken,
        body: {
          inviteCode: 'JC4KN2SJ5D',
        },
      });

      assert.equal(res.status, 503, 'Must return HTTP 503 Service Unavailable');
      assert.equal(
        res.data.code,
        'FIREBASE_ADMIN_NOT_CONFIGURED',
        'Must return FIREBASE_ADMIN_NOT_CONFIGURED code'
      );
      assert.ok(
        typeof res.data.error === 'string' &&
          res.data.error.includes('credentials are not configured'),
        'Error message explains credentials are not configured'
      );
      // Guarantee it never silently fell back to local JSON and never reported invalid code
      assert.ok(
        !res.data.error.toLowerCase().includes('invalid invitation code'),
        'Must NEVER falsely report "Invalid invitation code"'
      );
    }
  );

  await t.test(
    '2. Guest user cleanly uses local database for invite/join/leave without attempting Firestore',
    async () => {
      const guest1 = 'gst_guest_creator_01';
      const guest2 = 'gst_guest_partner_02';

      // 2.1 Guest 1 creates a joint vault
      const createRes = await apiRequest('/api/joint-vaults', {
        method: 'POST',
        guestSession: guest1,
        body: {
          name: 'GUEST MUTUAL VAULT',
          description: 'Local test vault',
          targetPaise: 5000000,
          currency: 'INR',
        },
      });
      assert.equal(createRes.status, 201);
      const vaultId = createRes.data.vault.id;
      assert.ok(vaultId);
      assert.equal(createRes.data.vault.memberUids.length, 1);

      // 2.2 Guest 1 creates an invitation
      const inviteRes = await apiRequest(`/api/joint-vaults/${vaultId}/invitations`, {
        method: 'POST',
        guestSession: guest1,
        body: {},
      });
      assert.equal(inviteRes.status, 201);
      const inviteCode = inviteRes.data.inviteCode;
      assert.ok(inviteCode);

      // 2.3 Guest 2 accepts the invitation code
      const acceptRes = await apiRequest('/api/joint-vaults/invitations/accept', {
        method: 'POST',
        guestSession: guest2,
        body: {
          inviteCode,
        },
      });
      assert.equal(acceptRes.status, 200, 'Guest join succeeds via local JSON database');
      assert.ok(acceptRes.data.vault);
      assert.equal(acceptRes.data.vault.memberUids.length, 2, 'Vault now has 2 members');
      assert.ok(acceptRes.data.vault.memberUids.includes(guest2));

      // 2.4 Guest 2 leaves vault
      const leaveRes = await apiRequest(`/api/joint-vaults/${vaultId}/leave`, {
        method: 'POST',
        guestSession: guest2,
      });
      assert.equal(leaveRes.status, 200);
      assert.equal(leaveRes.data.success, true);

      // Vault is now back to 1 member
      const summaryAfterLeave = dbService.getVaultSummary(vaultId, guest1);
      assert.ok(summaryAfterLeave);
      assert.equal(summaryAfterLeave.vault.memberUids.length, 1);
    }
  );

  await t.test(
    '3. Sole remaining member calling /leave receives HTTP 409 (LAST_MEMBER_MUST_ARCHIVE)',
    async () => {
      const guestSole = 'gst_sole_member_01';

      // Create a 1-member vault
      const createRes = await apiRequest('/api/joint-vaults', {
        method: 'POST',
        guestSession: guestSole,
        body: {
          name: 'SOLE MEMBER VAULT',
          targetPaise: 2000000,
          currency: 'INR',
        },
      });
      assert.equal(createRes.status, 201);
      const vaultId = createRes.data.vault.id;

      // Sole member tries to leave
      const leaveRes = await apiRequest(`/api/joint-vaults/${vaultId}/leave`, {
        method: 'POST',
        guestSession: guestSole,
      });

      assert.equal(leaveRes.status, 409, 'Sole member leave must return HTTP 409 Conflict');
      assert.equal(
        leaveRes.data.code,
        'LAST_MEMBER_MUST_ARCHIVE',
        'Must return LAST_MEMBER_MUST_ARCHIVE error code'
      );
      assert.ok(
        leaveRes.data.error.includes('archive'),
        'Error message instructs sole member to archive'
      );
    }
  );

  await t.test(
    '4. Two-member vault allows member departure; marks member as left in members; updates memberUids to 1; preserves historical contributions and expenses',
    async () => {
      const userA = 'usr_dep_user_a';
      const userB = 'usr_dep_user_b';

      // Set up a vault in dbService
      const vault = dbService.createJointVault(
        {
          name: 'PRESERVATION VAULT',
          targetPaise: 10000000,
          currency: 'INR',
        },
        { id: userA, name: 'Alice' }
      );

      // Add user B via invitation
      const inv = dbService.createVaultInvitation(
        vault.id,
        { id: userA, name: 'Alice' },
        'bob@example.com'
      );
      dbService.acceptVaultInvitation(inv.inviteCode, {
        id: userB,
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Add contributions from both members
      dbService.addVaultContribution(
        vault.id,
        { id: userA, name: 'Alice' },
        {
          amountPaise: 3000000,
        }
      );

      dbService.addVaultContribution(
        vault.id,
        { id: userB, name: 'Bob' },
        {
          amountPaise: 2000000,
        }
      );

      // Add a joint expense
      dbService.addVaultExpense(
        vault.id,
        { id: userA, name: 'Alice' },
        {
          amountPaise: 1500000,
          description: 'Joint Grocery',
          splitMode: 'equal',
        }
      );

      // Bob leaves the vault
      const leaveResult = await vaultBackendService.leaveVault(vault.id, { id: userB, isGuest: true });
      assert.equal(leaveResult.success, true);

      // Verify vault state
      const summary = dbService.getVaultSummary(vault.id, userA);
      assert.ok(summary);
      assert.equal(summary.vault.memberUids.length, 1, 'memberUids updated to 1');
      assert.ok(summary.vault.memberUids.includes(userA));
      assert.ok(!summary.vault.memberUids.includes(userB));

      // In members database, Bob's record is marked with status 'left'
      const bobMember = (dbService as any).db.vaultMembers.find((m: any) => m.uid === userB);
      assert.ok(bobMember, 'Bob member record is retained in database');
      assert.equal(bobMember.status, 'left', 'Bob status marked as left');

      // Alice is the sole active member in summary
      assert.equal(summary.members.length, 1);
      const aliceMember = summary.members.find((m) => m.uid === userA);
      assert.ok(aliceMember);
      assert.equal(aliceMember.status, 'active');

      // Historical contributions are preserved
      assert.equal(summary.totalContributedPaise, 5000000, 'All contributions preserved (30k + 20k)');
    }
  );

  await t.test('5. Archive vault works and marks vault read-only', async () => {
    const owner = 'gst_arch_owner';
    const createRes = await apiRequest('/api/joint-vaults', {
      method: 'POST',
      guestSession: owner,
      body: {
        name: 'VAULT TO ARCHIVE',
        targetPaise: 1000000,
        currency: 'INR',
      },
    });
    assert.equal(createRes.status, 201);
    const vaultId = createRes.data.vault.id;

    // Archive the vault
    const archiveRes = await apiRequest(`/api/joint-vaults/${vaultId}/archive`, {
      method: 'POST',
      guestSession: owner,
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.data.success, true);
    assert.equal(archiveRes.data.vault.status, 'archived');

    // Trying to leave an archived vault is rejected
    const leaveArchived = await apiRequest(`/api/joint-vaults/${vaultId}/leave`, {
      method: 'POST',
      guestSession: owner,
    });
    assert.ok(leaveArchived.status >= 400, 'Attempting to leave an archived or sole vault is rejected');
  });

  await t.test(
    '6. Idempotency & Conflict: Repeated acceptance returns 200; duplicate partner joins handled safely',
    async () => {
      const gCreator = 'gst_idem_creator';
      const gPartner = 'gst_idem_partner';

      const vRes = await apiRequest('/api/joint-vaults', {
        method: 'POST',
        guestSession: gCreator,
        body: {
          name: 'IDEMPOTENCY VAULT',
          targetPaise: 2500000,
          currency: 'INR',
        },
      });
      assert.equal(vRes.status, 201);
      const vId = vRes.data.vault.id;

      const invRes = await apiRequest(`/api/joint-vaults/${vId}/invitations`, {
        method: 'POST',
        guestSession: gCreator,
        body: {},
      });
      assert.equal(invRes.status, 201);
      const code = invRes.data.inviteCode;

      // First accept -> 200 OK
      const accept1 = await apiRequest('/api/joint-vaults/invitations/accept', {
        method: 'POST',
        guestSession: gPartner,
        body: { inviteCode: code },
      });
      assert.equal(accept1.status, 200);

      // Second accept by same partner -> idempotent 200 OK
      const accept2 = await apiRequest('/api/joint-vaults/invitations/accept', {
        method: 'POST',
        guestSession: gPartner,
        body: { inviteCode: code },
      });
      assert.equal(accept2.status, 200, 'Re-accepting by existing member is idempotent');

      // Third party tries to use the same code -> 400 Bad Request
      const accept3 = await apiRequest('/api/joint-vaults/invitations/accept', {
        method: 'POST',
        guestSession: 'gst_third_party_99',
        body: { inviteCode: code },
      });
      assert.equal(accept3.status, 400, 'Reused invitation by different user is rejected');
    }
  );
});
