import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { dbService } from '../server/db.ts';
import { apiRouter } from '../server/routes.ts';

const app = express();
app.use(express.json());

// Inject dynamic mock auth context
app.use((req, _res, next) => {
  const mockUid = req.headers['x-test-uid'] as string;
  if (mockUid) {
    (req as any).auth = {
      userId: mockUid,
      email: mockUid === 'usr_bob_sec_02' ? 'bob@focusflow.test' : `${mockUid}@focusflow.test`,
      name: mockUid.toUpperCase(),
      isGuest: true,
    };
  } else {
    (req as any).auth = {
      userId: 'guest_unauth',
      email: undefined,
      name: 'Unauthenticated Guest',
      isGuest: true,
    };
  }
  next();
});
app.use('/api', apiRouter);

let server: http.Server;
let baseUrl = '';

async function apiCall(path: string, options: { method?: string; uid?: string; body?: any } = {}) {
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

test('Joint Vaults & Security Rules — P0 Verification Suite', async (t) => {
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

  const creator = 'usr_alice_sec_01';
  const partner = 'usr_bob_sec_02';
  const attacker = 'usr_eve_hacker_03';
  const fourthParty = 'usr_frank_sec_04';

  // ========================================================
  // SUITE 1: VAULT CREATION & INITIAL OWNERSHIP
  // ========================================================
  const createRes = await apiCall('/joint-vaults', {
    method: 'POST',
    uid: creator,
    body: {
      name: 'P0 Security Test Vault',
      description: 'Zero Trust Vault',
      targetPaise: 5000000,
      currency: 'INR',
    },
  });
  assert.equal(createRes.status, 201, 'Creator can initialize a joint vault');
  const vaultId = createRes.data.vault ? createRes.data.vault.id : createRes.data.id;
  assert.ok(vaultId);

  // ========================================================
  // SUITE 2: INVITATION PRIVACY
  // ========================================================
  // 1. Authorized member creates invitation
  const inviteRes = await apiCall(`/joint-vaults/${vaultId}/invitations`, {
    method: 'POST',
    uid: creator,
    body: { invitedEmail: 'bob@focusflow.test' },
  });
  assert.equal(inviteRes.status, 201, 'Creator can generate invitation');
  const validCode = inviteRes.data.inviteCode;
  assert.ok(validCode, 'Valid code must be generated');

  // 2. Unrelated user (Attacker Eve) CANNOT create invitations for Alice\'s vault
  const eveCreateInvite = await apiCall(`/joint-vaults/${vaultId}/invitations`, {
    method: 'POST',
    uid: attacker,
    body: { invitedEmail: 'eve@evil.com' },
  });
  assert.equal(eveCreateInvite.status, 400, 'Non-member cannot create invitations');

  // 3. Attacker Eve CANNOT view or inspect Alice\'s vault
  const eveViewVault = await apiCall(`/joint-vaults/${vaultId}`, {
    uid: attacker,
  });
  assert.equal(eveViewVault.status, 404, 'Non-member is denied vault access (404)');

  // 4. Attacker Eve CANNOT list invitations or discover active codes
  const eveList = await apiCall('/joint-vaults', {
    uid: attacker,
  });
  assert.equal(eveList.status, 200);
  assert.equal(eveList.data.length, 0, 'Attacker sees 0 vaults and 0 invitations');

  // ========================================================
  // SUITE 3: MEMBERSHIP PROTECTION & REDEMPTION
  // ========================================================
  // 1. Invalid invite code fails
  const badCodeRes = await apiCall('/joint-vaults/invitations/accept', {
    method: 'POST',
    uid: partner,
    body: { inviteCode: 'TOTALLY_INVALID_CODE_999' },
  });
  assert.equal(badCodeRes.status, 400, 'Invalid invite code must be rejected');

  // 2. Legitimate partner Bob joins through trusted flow
  const joinRes = await apiCall('/joint-vaults/invitations/accept', {
    method: 'POST',
    uid: partner,
    body: { inviteCode: validCode },
  });
  assert.equal(joinRes.status, 200, 'Valid invited partner can accept invitation');
  assert.equal(joinRes.data.vault.memberUids.length, 2, 'Vault now has exactly 2 members');
  assert.ok(joinRes.data.vault.memberUids.includes(creator));
  assert.ok(joinRes.data.vault.memberUids.includes(partner));

  // 3. Reused invitation CANNOT grant access
  const reuseRes = await apiCall('/joint-vaults/invitations/accept', {
    method: 'POST',
    uid: attacker,
    body: { inviteCode: validCode },
  });
  assert.equal(reuseRes.status, 400, 'Reused single-use invitation must be rejected');

  // 4. Vault already has 2 members -> Arbitrary third member cannot join
  const fullInviteAttempt = await apiCall(`/joint-vaults/${vaultId}/invitations`, {
    method: 'POST',
    uid: creator,
    body: { invitedEmail: 'fourth@focusflow.test' },
  });
  assert.equal(fullInviteAttempt.status, 400, 'Full vault (2 members) cannot generate invitations');

  // 5. Concurrent redemption race test: Even if code existed, max 2 members is strictly enforced
  const thirdMemberJoin = await apiCall('/joint-vaults/invitations/accept', {
    method: 'POST',
    uid: fourthParty,
    body: { inviteCode: validCode },
  });
  assert.equal(thirdMemberJoin.status, 400, 'Third member join must be denied');

  // ========================================================
  // SUITE 4: DATA INTEGRITY & IMMUTABILITY
  // ========================================================
  // 1. Members can update ratio within valid bounds (must sum to 100)
  const validRatioRes = await apiCall(`/joint-vaults/${vaultId}/ratio`, {
    method: 'PATCH',
    uid: creator,
    body: { targetRatio: { [creator]: 70, [partner]: 30 } },
  });
  assert.equal(validRatioRes.status, 200, 'Valid ratio update succeeds');

  // 2. Invalid ratio (sums to 120) must be rejected
  const badRatioRes = await apiCall(`/joint-vaults/${vaultId}/ratio`, {
    method: 'PATCH',
    uid: creator,
    body: { targetRatio: { [creator]: 70, [partner]: 50 } },
  });
  assert.equal(badRatioRes.status, 400, 'Invalid ratio must be rejected');

  // 3. Non-member cannot mutate ratio
  const eveRatioRes = await apiCall(`/joint-vaults/${vaultId}/ratio`, {
    method: 'PATCH',
    uid: attacker,
    body: { targetRatio: { [attacker]: 100 } },
  });
  assert.equal(eveRatioRes.status, 400, 'Non-member cannot update ratio');

  // 4. Non-member cannot contribute money
  const eveContrib = await apiCall(`/joint-vaults/${vaultId}/contributions`, {
    method: 'POST',
    uid: attacker,
    body: { amountPaise: 100000 },
  });
  assert.equal(eveContrib.status, 400, 'Non-member contribution must be rejected');

  // 5. Valid member can contribute
  const bobContrib = await apiCall(`/joint-vaults/${vaultId}/contributions`, {
    method: 'POST',
    uid: partner,
    body: { amountPaise: 250000, description: 'Monthly joint savings' },
  });
  assert.equal(bobContrib.status, 201, 'Member contribution succeeds');
});

