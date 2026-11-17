import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { dbService } from '../server/db.ts';
import { apiRouter } from '../server/routes.ts';

const app = express();
app.use(express.json());
// Inject mock auth header handler for testing
app.use((req, _res, next) => {
  const mockUid = req.headers['x-test-uid'] as string;
  if (mockUid) {
    (req as any).auth = {
      userId: mockUid,
      email: mockUid === 'usr_bob_couple_02' ? 'bob@example.com' : `${mockUid}@test.com`,
      name: mockUid.toUpperCase(),
      isGuest: false,
    };
  }
  next();
});
app.use('/api', apiRouter);

let server: http.Server;
let baseUrl = '';

async function request(path: string, options: { method?: string; uid?: string; body?: any } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.uid ? { 'x-test-uid': options.uid } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('Joint Vaults API — Complete Lifecycle, Privacy Isolation & Settlement Tests', async (t) => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}/api`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const alice = 'usr_alice_couple_01';
  const bob = 'usr_bob_couple_02';
  const eve = 'usr_eve_stranger_03';

  // 1. Alice creates a joint vault
  const createRes = await request('/joint-vaults', {
    method: 'POST',
    uid: alice,
    body: {
      name: 'Couple Vacation Fund',
      description: 'Bali 2027',
      targetPaise: 10000000, // ₹100,000
      currency: 'INR',
    },
  });
  assert.equal(createRes.status, 201, 'Vault creation should return 201');
  const vaultId = createRes.data.vault ? createRes.data.vault.id : createRes.data.id;
  assert.ok(vaultId, 'Created vault must have an ID');

  // 2. PRIVACY TEST: Unrelated user (Eve) cannot access Alice\'s vault
  const eveAccess = await request(`/joint-vaults/${vaultId}`, {
    uid: eve,
  });
  assert.equal(eveAccess.status, 404, 'Non-member must be denied access with 404');

  // 3. Alice creates an invitation
  const inviteRes = await request(`/joint-vaults/${vaultId}/invitations`, {
    method: 'POST',
    uid: alice,
    body: { invitedEmail: 'bob@example.com' },
  });
  assert.equal(inviteRes.status, 201);
  const inviteCode = inviteRes.data.inviteCode;
  assert.ok(inviteCode, 'Invite code must be generated');

  // 4. Bob accepts the invitation
  const acceptRes = await request('/joint-vaults/invitations/accept', {
    method: 'POST',
    uid: bob,
    body: { inviteCode },
  });
  assert.equal(acceptRes.status, 200, 'Bob should successfully accept invitation');
  assert.equal(acceptRes.data.vault.memberUids.length, 2, 'Vault must now have exactly 2 members');
  assert.ok(acceptRes.data.vault.memberUids.includes(bob));

  // 5. MAX 2 MEMBERS ENFORCEMENT: Eve tries to join the full vault with a new invite
  const fullInviteRes = await request(`/joint-vaults/${vaultId}/invitations`, {
    method: 'POST',
    uid: alice,
    body: {},
  });
  assert.equal(fullInviteRes.status, 400, 'Creating invitation for a full vault must fail');

  // 6. CONTRIBUTIONS: Alice contributes ₹60,000, Bob contributes ₹40,000
  const c1 = await request(`/joint-vaults/${vaultId}/contributions`, {
    method: 'POST',
    uid: alice,
    body: { amountPaise: 6000000, description: 'Alice monthly deposit' },
  });
  assert.equal(c1.status, 201);

  const c2 = await request(`/joint-vaults/${vaultId}/contributions`, {
    method: 'POST',
    uid: bob,
    body: { amountPaise: 4000000, description: 'Bob monthly deposit' },
  });
  assert.equal(c2.status, 201);

  // Non-member (Eve) cannot contribute
  const eveContrib = await request(`/joint-vaults/${vaultId}/contributions`, {
    method: 'POST',
    uid: eve,
    body: { amountPaise: 500000 },
  });
  assert.equal(eveContrib.status, 400, 'Non-member contribution must be rejected');

  // 7. MILESTONE CHECK: Total is ₹100,000 out of ₹100,000 (100% milestone!)
  const summaryRes = await request(`/joint-vaults/${vaultId}`, {
    uid: alice,
  });
  assert.equal(summaryRes.status, 200);
  assert.equal(summaryRes.data.totalContributedPaise, 10000000);
  assert.equal(summaryRes.data.progressPercentage, 100);

  // 8. CONTRIBUTION REVERSAL (Auditable): Alice reverses an accidental duplicate
  const cDup = await request(`/joint-vaults/${vaultId}/contributions`, {
    method: 'POST',
    uid: alice,
    body: { amountPaise: 500000, description: 'Accidental duplicate' },
  });
  assert.equal(cDup.status, 201);
  const dupId = cDup.data.contribution.id;

  const revRes = await request(`/joint-vaults/${vaultId}/contributions/${dupId}/reverse`, {
    method: 'POST',
    uid: alice,
    body: { reason: 'Duplicate charge refunded' },
  });
  assert.equal(revRes.status, 200);
  assert.equal(revRes.data.contribution.status, 'reversed');

  // 9. EXPENSES & SETTLEMENT ENGINE:
  // Alice pays ₹2,000 for flight deposit (split equally: ₹1,000 each)
  const expRes = await request(`/joint-vaults/${vaultId}/expenses`, {
    method: 'POST',
    uid: alice,
    body: {
      amountPaise: 200000,
      description: 'Flight deposit',
      splitMode: 'equal',
    },
  });
  assert.equal(expRes.status, 201);
  assert.equal(expRes.data.summary.settlement.netBalancePaise, 100000, 'Bob owes Alice ₹1,000');
  assert.equal(expRes.data.summary.settlement.debtorUid, bob);
  assert.equal(expRes.data.summary.settlement.creditorUid, alice);

  // Bob pays ₹1,000 settlement reimbursement to Alice
  const settleRes = await request(`/joint-vaults/${vaultId}/settlements`, {
    method: 'POST',
    uid: bob,
    body: {
      toUid: alice,
      toName: 'Alice',
      amountPaise: 100000,
      notes: 'Settled via UPI',
    },
  });
  assert.equal(settleRes.status, 201);
  assert.equal(settleRes.data.summary.settlement.netBalancePaise, 0);
  assert.equal(settleRes.data.summary.settlement.settled, true, 'Vault expenses must be fully settled');

  // 10. RATIO UPDATE: Change to 60/40
  const ratioRes = await request(`/joint-vaults/${vaultId}/ratio`, {
    method: 'PATCH',
    uid: alice,
    body: {
      targetRatio: { [alice]: 60, [bob]: 40 },
    },
  });
  assert.equal(ratioRes.status, 200);

  // Invalid ratio (sum != 100)
  const badRatioRes = await request(`/joint-vaults/${vaultId}/ratio`, {
    method: 'PATCH',
    uid: alice,
    body: {
      targetRatio: { [alice]: 60, [bob]: 50 },
    },
  });
  assert.equal(badRatioRes.status, 400, 'Invalid ratio summing to 110 must be rejected');

  // 11. PRIVACY VERIFICATION: Confirm Eve still gets 0 vaults
  const eveVaults = await request('/joint-vaults', { uid: eve });
  assert.equal(eveVaults.status, 200);
  assert.equal(eveVaults.data.length, 0, 'Eve should see 0 vaults');

  // Alice sees 1 vault
  const aliceVaults = await request('/joint-vaults', { uid: alice });
  assert.equal(aliceVaults.status, 200);
  assert.equal(aliceVaults.data.length, 1);
});

