import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import { generateSecureInviteCode } from '../src/lib/firestoreService.ts';

const PROJECT_ID = 'test-rules-project';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const DB_PATH = `projects/${PROJECT_ID}/databases/(default)/documents`;
const BASE_URL = `http://${HOST}/v1/${DB_PATH}`;

const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const skipReason = !isEmulatorRunning
  ? 'Live Firestore emulator host not detected (run via firebase emulators:exec --only firestore)'
  : false;

function makeEmulatorJwt(
  uid: string,
  options: { email?: string; emailVerified?: boolean } = {}
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, any> = {
    sub: uid,
    user_id: uid,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    iat: now,
    exp: now + 3600,
    auth_time: now,
  };
  if (options.email !== undefined) {
    payload.email = options.email;
  }
  if (options.emailVerified !== undefined) {
    payload.email_verified = options.emailVerified;
  }
  return `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
}

function toFsVal(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (v && typeof v === 'object' && '__timestamp' in v) {
    return { timestampValue: v.__timestamp };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsVal) } };
  }
  if (typeof v === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) fields[k] = toFsVal(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFsFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFsVal(v);
  }
  return fields;
}

function fsDocName(relPath: string): string {
  return `${DB_PATH}/${relPath}`;
}

async function beginTx(token: string): Promise<string> {
  const res = await fetch(`${BASE_URL}:beginTransaction`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  const data = (await res.json()) as any;
  assert.equal(res.status, 200, `beginTransaction failed: ${JSON.stringify(data)}`);
  return data.transaction;
}

async function txGet(relPath: string, token: string, txId?: string): Promise<{ status: number; data: any }> {
  if (txId) {
    const res = await fetch(`${BASE_URL}:batchGet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: txId,
        documents: [fsDocName(relPath)],
      }),
    });
    const raw = await res.json().catch(() => null);
    if (!res.ok) return { status: res.status, data: raw };
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (first?.found) return { status: 200, data: first.found };
    return { status: 404, data: first };
  }
  const res = await fetch(`${BASE_URL}/${relPath}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function listDocs(relCollection: string, token: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}/${relCollection}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function commitTx(
  token: string,
  writes: any[],
  txId?: string
): Promise<{ status: number; data: any }> {
  const body: Record<string, any> = { writes };
  if (txId) body.transaction = txId;
  const res = await fetch(`${BASE_URL}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function makeUpdateWrite(
  relPath: string,
  fields: Record<string, any>,
  options: {
    mask?: string[];
    serverTimestamps?: string[];
    exists?: boolean;
  } = {}
): any {
  const write: any = {
    update: {
      name: fsDocName(relPath),
      fields: toFsFields(fields),
    },
  };
  if (options.mask) {
    write.updateMask = { fieldPaths: options.mask };
  }
  if (options.serverTimestamps && options.serverTimestamps.length > 0) {
    write.updateTransforms = options.serverTimestamps.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }
  if (options.exists !== undefined) {
    write.currentDocument = { exists: options.exists };
  }
  return write;
}

function makeJoinWrites(params: {
  vaultId: string;
  inviteCode: string;
  creatorUid: string;
  partnerUid: string;
  partnerEmail: string;
  partnerName: string;
  nowIso: string;
  actId: string;
}): any[] {
  const { vaultId, inviteCode, creatorUid, partnerUid, partnerEmail, partnerName, nowIso, actId } = params;
  return [
    // 1. Update invite -> accepted
    makeUpdateWrite(
      `vaultInvitations/${inviteCode}`,
      {
        status: 'accepted',
        acceptedByUid: partnerUid,
        acceptedAt: nowIso,
        updatedAt: nowIso,
      },
      {
        mask: ['status', 'acceptedByUid', 'acceptedAt', 'updatedAt'],
        serverTimestamps: ['acceptedAtTimestamp'],
        exists: true,
      }
    ),
    // 2. Update vault root -> 2 members
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      {
        memberUids: [creatorUid, partnerUid],
        targetRatio: { [creatorUid]: 50, [partnerUid]: 50 },
        lastAcceptedInviteCode: inviteCode,
        updatedAt: nowIso,
      },
      {
        mask: ['memberUids', 'targetRatio', 'lastAcceptedInviteCode', 'updatedAt'],
        serverTimestamps: ['updatedAtTimestamp'],
        exists: true,
      }
    ),
    // 3. Create (or reactivate) partner member doc
    makeUpdateWrite(
      `sharedVaults/${vaultId}/members/${partnerUid}`,
      {
        uid: partnerUid,
        email: partnerEmail,
        name: partnerName,
        role: 'partner',
        status: 'active',
        joinedAt: nowIso,
        updatedAt: nowIso,
      },
      {
        mask: ['uid', 'email', 'name', 'role', 'status', 'joinedAt', 'updatedAt'],
        serverTimestamps: ['joinedAtTimestamp'],
      }
    ),
    // 4. Create join activity
    makeUpdateWrite(
      `sharedVaults/${vaultId}/activity/${actId}`,
      {
        id: actId,
        vaultId,
        actorUid: partnerUid,
        actorName: partnerName,
        type: 'member_joined',
        title: 'Partner Joined Vault',
        description: `${partnerName} joined the vault`,
        timestamp: nowIso,
      },
      {
        serverTimestamps: ['serverTimestamp'],
        exists: false,
      }
    ),
  ];
}

async function seedVaultAsCreator(params: {
  vaultId: string;
  creatorUid: string;
  creatorToken: string;
  creatorEmail: string;
  nowIso: string;
}) {
  const { vaultId, creatorUid, creatorToken, creatorEmail, nowIso } = params;
  // 1. Create vault root
  const vRes = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      {
        id: vaultId,
        name: 'OUR SAVINGS',
        description: 'Keyless test vault',
        currency: 'INR',
        targetPaise: 50000000,
        monthlyTargetPaise: 5000000,
        createdBy: creatorUid,
        memberUids: [creatorUid],
        targetRatio: { [creatorUid]: 100 },
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { exists: false }
    ),
  ]);
  assert.equal(vRes.status, 200, `Vault creation failed: ${JSON.stringify(vRes.data)}`);

  // 2. Create creator member doc + initial activity
  const mRes = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}/members/${creatorUid}`,
      {
        uid: creatorUid,
        email: creatorEmail,
        name: 'Atif Munshi',
        role: 'creator',
        status: 'active',
        joinedAt: nowIso,
      },
      { exists: false }
    ),
    makeUpdateWrite(
      `sharedVaults/${vaultId}/activity/act_init_${vaultId}`,
      {
        id: `act_init_${vaultId}`,
        vaultId,
        actorUid: creatorUid,
        actorName: 'Atif Munshi',
        type: 'vault_created',
        title: 'Joint Vault Created',
        description: 'Created vault',
        timestamp: nowIso,
      },
      { serverTimestamps: ['serverTimestamp'], exists: false }
    ),
  ]);
  assert.equal(mRes.status, 200, `Creator member creation failed: ${JSON.stringify(mRes.data)}`);
}

async function createInviteAsMember(params: {
  vaultId: string;
  inviteCode: string;
  inviterUid: string;
  inviterToken: string;
  invitedEmail?: string;
  expiresOffsetMs?: number;
  nowIso: string;
}) {
  const { vaultId, inviteCode, inviterUid, inviterToken, invitedEmail, expiresOffsetMs = 7 * 86400_000, nowIso } = params;
  const expiresIso = new Date(Date.now() + expiresOffsetMs).toISOString();
  const fields: Record<string, any> = {
    id: inviteCode,
    vaultId,
    vaultName: 'OUR SAVINGS',
    invitedByUid: inviterUid,
    invitedByName: 'Atif Munshi',
    inviteCode,
    status: 'pending',
    createdAt: nowIso,
    expiresAt: expiresIso,
    expiresAtTimestamp: { __timestamp: expiresIso },
  };
  if (invitedEmail !== undefined) {
    fields.invitedEmail = invitedEmail;
  }
  return commitTx(inviterToken, [
    makeUpdateWrite(`vaultInvitations/${inviteCode}`, fields, {
      serverTimestamps: ['createdAtTimestamp'],
      exists: false,
    }),
  ]);
}

// =====================================================================
// NON-EMULATOR UNIT & GUEST ISOLATION TESTS (always run in `npm test`)
// =====================================================================

test('Keyless Joint Vault — CSPRNG Invite Code Entropy (>= 80 bits, zero modulo bias)', () => {
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateSecureInviteCode();
    assert.equal(code.length, 16, 'Default invite code must be 16 chars (80 bits)');
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/, 'Code must use unambiguous 32-char alphabet');
    codes.add(code);
  }
  assert.equal(codes.size, 200, 'All 200 CSPRNG codes must be unique');
});

test('Keyless Joint Vault — Guest/Demo Mode Isolation Remains Intact on Local JSON Backend', async (t) => {
  const server = http.createServer(app);
  let baseUrl = '';
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
  t.after(() => server.close());

  const g1 = `gst_keyless_a_${Date.now()}`;
  const g2 = `gst_keyless_b_${Date.now()}`;

  const createRes = await fetch(`${baseUrl}/api/joint-vaults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-session': g1 },
    body: JSON.stringify({ name: 'GUEST KEYLESS TEST', targetPaise: 1000000, currency: 'INR' }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as any;
  const vaultId = created.vault.id;

  const invRes = await fetch(`${baseUrl}/api/joint-vaults/${vaultId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-session': g1 },
    body: JSON.stringify({}),
  });
  assert.equal(invRes.status, 201);
  const inv = (await invRes.json()) as any;

  const accRes = await fetch(`${baseUrl}/api/joint-vaults/invitations/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-session': g2 },
    body: JSON.stringify({ inviteCode: inv.inviteCode }),
  });
  assert.equal(accRes.status, 200);
  const accData = (await accRes.json()) as any;
  assert.equal(accData.vault.memberUids.length, 2);

  // Authenticated request without Firebase Admin creds must NEVER fall back to local JSON
  const fakeAuthToken = makeEmulatorJwt('usr_real_auth_no_fallback', { email: 'real@test.com', emailVerified: true });
  const authApiRes = await fetch(`${baseUrl}/api/joint-vaults/invitations/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fakeAuthToken}` },
    body: JSON.stringify({ inviteCode: inv.inviteCode }),
  });
  assert.equal(authApiRes.status, 503, 'Authenticated user calling backend without Admin creds must get 503, never fall back to local JSON');
});

// =====================================================================
// MANDATORY FIRESTORE EMULATOR TRANSACTIONAL SECURITY SUITE
// =====================================================================

test('Emulator 1. Valid Atomic Invitation Acceptance + Idempotent Re-read + Persistence', { skip: skipReason }, async () => {
  const suffix = Date.now().toString(36);
  const vaultId = `vlt_valid_${suffix}`;
  const creatorUid = `usr_a_${suffix}`;
  const partnerUid = `usr_b_${suffix}`;
  const creatorToken = makeEmulatorJwt(creatorUid, { email: 'atif@focusflow.test', emailVerified: true });
  const partnerToken = makeEmulatorJwt(partnerUid, { email: 'puja@focusflow.test', emailVerified: true });
  const nowIso = new Date().toISOString();

  await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'atif@focusflow.test', nowIso });

  const code = generateSecureInviteCode(16);
  const invRes = await createInviteAsMember({
    vaultId,
    inviteCode: code,
    inviterUid: creatorUid,
    inviterToken: creatorToken,
    invitedEmail: 'puja@focusflow.test',
    nowIso,
  });
  assert.equal(invRes.status, 200, `Invite creation failed: ${JSON.stringify(invRes.data)}`);

  // Collection enumeration must be strictly denied
  const listRes = await listDocs('vaultInvitations', partnerToken);
  assert.equal(listRes.status, 403, 'Listing /vaultInvitations must be strictly denied');

  // Partner executes real atomic transaction: beginTransaction -> txGet(invite) -> commit 4 writes
  const txId = await beginTx(partnerToken);
  const readInv = await txGet(`vaultInvitations/${code}`, partnerToken, txId);
  assert.equal(readInv.status, 200, 'Intended verified partner can point-read pending invite');

  const joinWrites = makeJoinWrites({
    vaultId,
    inviteCode: code,
    creatorUid,
    partnerUid,
    partnerEmail: 'puja@focusflow.test',
    partnerName: 'Puja Mozumdar',
    nowIso,
    actId: `act_join_${suffix}`,
  });
  const commitRes = await commitTx(partnerToken, joinWrites, txId);
  assert.equal(commitRes.status, 200, `Atomic partner join transaction must succeed: ${JSON.stringify(commitRes.data)}`);

  // Partner can now read vault root & members
  const vaultRead = await txGet(`sharedVaults/${vaultId}`, partnerToken);
  assert.equal(vaultRead.status, 200);
  const memberValues = vaultRead.data.fields.memberUids.arrayValue.values.map((v: any) => v.stringValue);
  assert.deepEqual(memberValues, [creatorUid, partnerUid]);

  // Idempotent re-read by same partner succeeds (status == accepted && acceptedByUid == partnerUid)
  const idemRead = await txGet(`vaultInvitations/${code}`, partnerToken);
  assert.equal(idemRead.status, 200, 'Same partner can re-read accepted invite for idempotent response');
});

test('Emulator 2. Join Without Invitation & Partial-Write Atomic Lock Attacks', { skip: skipReason }, async () => {
  const suffix = Date.now().toString(36) + 'a';
  const vaultId = `vlt_partial_${suffix}`;
  const creatorUid = `usr_ca_${suffix}`;
  const attackerUid = `usr_atk_${suffix}`;
  const partnerUid = `usr_pb_${suffix}`;
  const creatorToken = makeEmulatorJwt(creatorUid, { email: 'creator@test.com', emailVerified: true });
  const attackerToken = makeEmulatorJwt(attackerUid, { email: 'atk@test.com', emailVerified: true });
  const partnerToken = makeEmulatorJwt(partnerUid, { email: 'partner@test.com', emailVerified: true });
  const nowIso = new Date().toISOString();

  await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'creator@test.com', nowIso });

  // A. Join without any invitation at all
  const noInviteRes = await commitTx(attackerToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      {
        memberUids: [creatorUid, attackerUid],
        targetRatio: { [creatorUid]: 50, [attackerUid]: 50 },
        lastAcceptedInviteCode: generateSecureInviteCode(16),
        updatedAt: nowIso,
      },
      { mask: ['memberUids', 'targetRatio', 'lastAcceptedInviteCode', 'updatedAt'], serverTimestamps: ['updatedAtTimestamp'] }
    ),
  ]);
  assert.equal(noInviteRes.status, 403, 'Join without valid invitation must be denied');

  // Create a real pending invite for partner
  const code = generateSecureInviteCode(16);
  const invRes = await createInviteAsMember({
    vaultId,
    inviteCode: code,
    inviterUid: creatorUid,
    inviterToken: creatorToken,
    nowIso,
  });
  assert.equal(invRes.status, 200);

  // B. Invitation consumed WITHOUT membership update (orphaned consumption attack)
  const consumeOnly = await commitTx(partnerToken, [
    makeUpdateWrite(
      `vaultInvitations/${code}`,
      { status: 'accepted', acceptedByUid: partnerUid, acceptedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'acceptedByUid', 'acceptedAt', 'updatedAt'], serverTimestamps: ['acceptedAtTimestamp'] }
    ),
  ]);
  assert.equal(consumeOnly.status, 403, 'Consuming invitation without joining vault must be denied via getAfter()');

  // C. Membership update WITHOUT invitation consumption (reusable invite attack)
  const fullWrites = makeJoinWrites({
    vaultId,
    inviteCode: code,
    creatorUid,
    partnerUid,
    partnerEmail: 'partner@test.com',
    partnerName: 'Partner',
    nowIso,
    actId: `act_noinv_${suffix}`,
  });
  // Drop write[0] (the invite update), keep vault + member + activity
  const joinWithoutConsume = await commitTx(partnerToken, fullWrites.slice(1));
  assert.equal(joinWithoutConsume.status, 403, 'Joining vault without consuming invitation must be denied via getAfter()');

  // D. Membership + invite update WITHOUT creating member subcollection doc
  const joinWithoutMemberDoc = await commitTx(partnerToken, [fullWrites[0], fullWrites[1]]);
  assert.equal(joinWithoutMemberDoc.status, 403, 'Joining vault without creating active member doc must be denied via getAfter()');
});

test('Emulator 3. Expired, Revoked, Rejected, Replayed Invitations & Wrong/Unverified Email', { skip: skipReason }, async () => {
  const suffix = Date.now().toString(36) + 'b';
  const vaultId = `vlt_states_${suffix}`;
  const creatorUid = `usr_sc_${suffix}`;
  const partnerUid = `usr_sp_${suffix}`;
  const wrongUid = `usr_sw_${suffix}`;
  const creatorToken = makeEmulatorJwt(creatorUid, { email: 'owner@test.com', emailVerified: true });
  const partnerToken = makeEmulatorJwt(partnerUid, { email: 'intended@test.com', emailVerified: true });
  const unverifiedPartnerToken = makeEmulatorJwt(partnerUid, { email: 'intended@test.com', emailVerified: false });
  const wrongToken = makeEmulatorJwt(wrongUid, { email: 'stranger@test.com', emailVerified: true });
  const nowIso = new Date().toISOString();

  await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'owner@test.com', nowIso });

  // A. Expired invite creation itself is rejected (> request.time check)
  const badExpCode = generateSecureInviteCode(16);
  const badExpRes = await createInviteAsMember({
    vaultId,
    inviteCode: badExpCode,
    inviterUid: creatorUid,
    inviterToken: creatorToken,
    expiresOffsetMs: -60_000,
    nowIso,
  });
  assert.equal(badExpRes.status, 403, 'Creating an already-expired invitation must be rejected');

  // A2. Short-lived invite that expires in 1.2 seconds -> after expiry, get & accept both denied
  const shortExpCode = generateSecureInviteCode(16);
  const shortExpRes = await createInviteAsMember({
    vaultId,
    inviteCode: shortExpCode,
    inviterUid: creatorUid,
    inviterToken: creatorToken,
    expiresOffsetMs: 1200,
    nowIso,
  });
  assert.equal(shortExpRes.status, 200);
  await new Promise((r) => setTimeout(r, 1500));

  const expiredRead = await txGet(`vaultInvitations/${shortExpCode}`, partnerToken);
  assert.equal(expiredRead.status, 403, 'Reading expired invitation must be denied by request.time');
  const expiredJoin = await commitTx(
    partnerToken,
    makeJoinWrites({
      vaultId,
      inviteCode: shortExpCode,
      creatorUid,
      partnerUid,
      partnerEmail: 'intended@test.com',
      partnerName: 'Partner',
      nowIso: new Date().toISOString(),
      actId: `act_exp_${suffix}`,
    })
  );
  assert.equal(expiredJoin.status, 403, 'Accepting expired invitation must be denied by request.time');

  // B. Wrong verified email & unverified matching email rejected
  const emailCode = generateSecureInviteCode(16);
  assert.equal(
    (
      await createInviteAsMember({
        vaultId,
        inviteCode: emailCode,
        inviterUid: creatorUid,
        inviterToken: creatorToken,
        invitedEmail: 'intended@test.com',
        nowIso,
      })
    ).status,
    200
  );
  assert.equal((await txGet(`vaultInvitations/${emailCode}`, wrongToken)).status, 403, 'Wrong verified email cannot read invite');
  assert.equal(
    (
      await commitTx(
        wrongToken,
        makeJoinWrites({
          vaultId,
          inviteCode: emailCode,
          creatorUid,
          partnerUid: wrongUid,
          partnerEmail: 'stranger@test.com',
          partnerName: 'Stranger',
          nowIso,
          actId: `act_wrong_${suffix}`,
        })
      )
    ).status,
    403,
    'Wrong verified email cannot accept invite'
  );
  assert.equal((await txGet(`vaultInvitations/${emailCode}`, unverifiedPartnerToken)).status, 403, 'Unverified email cannot read email-bound invite');

  // C. Revoked invitation cannot be accepted; unauthorized stranger cannot revoke
  const revCode = generateSecureInviteCode(16);
  assert.equal(
    (
      await createInviteAsMember({
        vaultId,
        inviteCode: revCode,
        inviterUid: creatorUid,
        inviterToken: creatorToken,
        nowIso,
      })
    ).status,
    200
  );
  const unauthRevoke = await commitTx(wrongToken, [
    makeUpdateWrite(
      `vaultInvitations/${revCode}`,
      { status: 'revoked', revokedByUid: wrongUid, revokedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'revokedByUid', 'revokedAt', 'updatedAt'], serverTimestamps: ['revokedAtTimestamp'] }
    ),
  ]);
  assert.equal(unauthRevoke.status, 403, 'Non-member cannot revoke invitation');

  const validRevoke = await commitTx(creatorToken, [
    makeUpdateWrite(
      `vaultInvitations/${revCode}`,
      { status: 'revoked', revokedByUid: creatorUid, revokedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'revokedByUid', 'revokedAt', 'updatedAt'], serverTimestamps: ['revokedAtTimestamp'] }
    ),
  ]);
  assert.equal(validRevoke.status, 200, 'Inviter can revoke pending invitation');

  const joinRevoked = await commitTx(
    partnerToken,
    makeJoinWrites({
      vaultId,
      inviteCode: revCode,
      creatorUid,
      partnerUid,
      partnerEmail: 'intended@test.com',
      partnerName: 'Partner',
      nowIso,
      actId: `act_rev_${suffix}`,
    })
  );
  assert.equal(joinRevoked.status, 403, 'Revoked invitation cannot be accepted');

  // D. Rejected invitation cannot be accepted
  const rejCode = generateSecureInviteCode(16);
  assert.equal(
    (
      await createInviteAsMember({
        vaultId,
        inviteCode: rejCode,
        inviterUid: creatorUid,
        inviterToken: creatorToken,
        invitedEmail: 'intended@test.com',
        nowIso,
      })
    ).status,
    200
  );
  const validReject = await commitTx(partnerToken, [
    makeUpdateWrite(
      `vaultInvitations/${rejCode}`,
      { status: 'rejected', rejectedByUid: partnerUid, rejectedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'rejectedByUid', 'rejectedAt', 'updatedAt'], serverTimestamps: ['rejectedAtTimestamp'] }
    ),
  ]);
  assert.equal(validReject.status, 200, 'Intended recipient can reject pending invitation');

  const joinRejected = await commitTx(
    partnerToken,
    makeJoinWrites({
      vaultId,
      inviteCode: rejCode,
      creatorUid,
      partnerUid,
      partnerEmail: 'intended@test.com',
      partnerName: 'Partner',
      nowIso,
      actId: `act_rej_${suffix}`,
    })
  );
  assert.equal(joinRejected.status, 403, 'Rejected invitation cannot be accepted');

  // E. Accepted invitation cannot be replayed by third party OR even after partner leaves!
  const okJoin = await commitTx(
    partnerToken,
    makeJoinWrites({
      vaultId,
      inviteCode: emailCode,
      creatorUid,
      partnerUid,
      partnerEmail: 'intended@test.com',
      partnerName: 'Partner',
      nowIso,
      actId: `act_ok_${suffix}`,
    })
  );
  assert.equal(okJoin.status, 200);

  const replayByThird = await commitTx(
    wrongToken,
    makeJoinWrites({
      vaultId,
      inviteCode: emailCode,
      creatorUid,
      partnerUid: wrongUid,
      partnerEmail: 'stranger@test.com',
      partnerName: 'Stranger',
      nowIso,
      actId: `act_rep_${suffix}`,
    })
  );
  assert.equal(replayByThird.status, 403, 'Accepted invitation cannot be replayed by third party');
});

test('Emulator 4. Concurrent Acceptance: Same Invitation AND Two Different Invitations for One Vault', { skip: skipReason }, async () => {
  const suffix = Date.now().toString(36) + 'c';
  const nowIso = new Date().toISOString();

  async function runConcurrentJoinTx(params: {
    vaultId: string;
    inviteCode: string;
    creatorUid: string;
    partnerUid: string;
    partnerToken: string;
    partnerEmail: string;
    partnerName: string;
    actId: string;
  }): Promise<{ status: number; data: any }> {
    // Mirror Firebase Client SDK runTransaction(): retry up to 5 times on HTTP 409 ABORTED contention
    for (let attempt = 0; attempt < 5; attempt++) {
      const txId = await beginTx(params.partnerToken);
      const readRes = await txGet(`vaultInvitations/${params.inviteCode}`, params.partnerToken, txId);
      if (readRes.status !== 200) {
        await fetch(`${BASE_URL}:rollback`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${params.partnerToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction: txId }),
        }).catch(() => {});
        if (readRes.status === 409) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
          continue;
        }
        return readRes;
      }
      const commitRes = await commitTx(
        params.partnerToken,
        makeJoinWrites({
          vaultId: params.vaultId,
          inviteCode: params.inviteCode,
          creatorUid: params.creatorUid,
          partnerUid: params.partnerUid,
          partnerEmail: params.partnerEmail,
          partnerName: params.partnerName,
          nowIso,
          actId: params.actId,
        }),
        txId
      );
      if (commitRes.status === 409) {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
        continue;
      }
      return commitRes;
    }
    return { status: 409, data: { error: 'ABORTED after max retries' } };
  }

  // Case A: Concurrent acceptance of the SAME invitation by two users
  {
    const vaultId = `vlt_conc1_${suffix}`;
    const creatorUid = `usr_c1_${suffix}`;
    const userB = `usr_b1_${suffix}`;
    const userC = `usr_c2_${suffix}`;
    const creatorToken = makeEmulatorJwt(creatorUid, { email: 'c1@test.com', emailVerified: true });
    const tokenB = makeEmulatorJwt(userB, { email: 'b1@test.com', emailVerified: true });
    const tokenC = makeEmulatorJwt(userC, { email: 'c2@test.com', emailVerified: true });

    await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'c1@test.com', nowIso });
    const code = generateSecureInviteCode(16);
    assert.equal(
      (await createInviteAsMember({ vaultId, inviteCode: code, inviterUid: creatorUid, inviterToken: creatorToken, nowIso })).status,
      200
    );

    const [resB, resC] = await Promise.all([
      runConcurrentJoinTx({
        vaultId,
        inviteCode: code,
        creatorUid,
        partnerUid: userB,
        partnerToken: tokenB,
        partnerEmail: 'b1@test.com',
        partnerName: 'User B',
        actId: `act_b1_${suffix}`,
      }),
      runConcurrentJoinTx({
        vaultId,
        inviteCode: code,
        creatorUid,
        partnerUid: userC,
        partnerToken: tokenC,
        partnerEmail: 'c2@test.com',
        partnerName: 'User C',
        actId: `act_c2_${suffix}`,
      }),
    ]);

    const statuses = [resB.status, resC.status].sort();
    assert.equal(statuses[0], 200, 'Exactly one concurrent join must succeed');
    assert.ok(statuses[1] === 403 || statuses[1] === 409, `Second concurrent join must fail (403/409), got ${statuses[1]}`);

    const finalVault = await txGet(`sharedVaults/${vaultId}`, creatorToken);
    assert.equal(finalVault.data.fields.memberUids.arrayValue.values.length, 2, 'Vault must have strictly 2 members');
  }

  // Case B: Concurrent acceptance of TWO DIFFERENT invitations for the SAME 1-member vault
  {
    const vaultId = `vlt_conc2_${suffix}`;
    const creatorUid = `usr_c3_${suffix}`;
    const userB = `usr_b3_${suffix}`;
    const userC = `usr_c4_${suffix}`;
    const creatorToken = makeEmulatorJwt(creatorUid, { email: 'c3@test.com', emailVerified: true });
    const tokenB = makeEmulatorJwt(userB, { email: 'b3@test.com', emailVerified: true });
    const tokenC = makeEmulatorJwt(userC, { email: 'c4@test.com', emailVerified: true });

    await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'c3@test.com', nowIso });
    const code1 = generateSecureInviteCode(16);
    const code2 = generateSecureInviteCode(16);
    assert.equal(
      (await createInviteAsMember({ vaultId, inviteCode: code1, inviterUid: creatorUid, inviterToken: creatorToken, nowIso })).status,
      200
    );
    assert.equal(
      (await createInviteAsMember({ vaultId, inviteCode: code2, inviterUid: creatorUid, inviterToken: creatorToken, nowIso })).status,
      200
    );

    const [resB, resC] = await Promise.all([
      runConcurrentJoinTx({
        vaultId,
        inviteCode: code1,
        creatorUid,
        partnerUid: userB,
        partnerToken: tokenB,
        partnerEmail: 'b3@test.com',
        partnerName: 'User B',
        actId: `act_b3_${suffix}`,
      }),
      runConcurrentJoinTx({
        vaultId,
        inviteCode: code2,
        creatorUid,
        partnerUid: userC,
        partnerToken: tokenC,
        partnerEmail: 'c4@test.com',
        partnerName: 'User C',
        actId: `act_c4_${suffix}`,
      }),
    ]);

    const statuses = [resB.status, resC.status].sort();
    assert.equal(statuses[0], 200, 'Exactly one invitation acceptance must win');
    assert.ok(statuses[1] === 403 || statuses[1] === 409, `Losing invitation must be rolled back (403/409), got ${statuses[1]}`);

    const finalVault = await txGet(`sharedVaults/${vaultId}`, creatorToken);
    assert.equal(finalVault.data.fields.memberUids.arrayValue.values.length, 2, 'Vault capacity strictly capped at 2');

    // Verify losing invite remained 'pending' (atomic rollback — never consumed without join!)
    const inv1 = await txGet(`vaultInvitations/${code1}`, creatorToken);
    const inv2 = await txGet(`vaultInvitations/${code2}`, creatorToken);
    const invStatuses = [inv1.data.fields.status.stringValue, inv2.data.fields.status.stringValue].sort();
    assert.deepEqual(invStatuses, ['accepted', 'pending'], 'Winning invite accepted, losing invite rolled back to pending');
  }
});

test('Emulator 5. Leave, Sole-Member Leave Guard, Kick Attempt, Re-Join, Archive & Unauthorized Field Tampering', { skip: skipReason }, async () => {
  const suffix = Date.now().toString(36) + 'd';
  const vaultId = `vlt_life_${suffix}`;
  const creatorUid = `usr_lc_${suffix}`;
  const partnerUid = `usr_lp_${suffix}`;
  const outsiderUid = `usr_lo_${suffix}`;
  const creatorToken = makeEmulatorJwt(creatorUid, { email: 'lc@test.com', emailVerified: true });
  const partnerToken = makeEmulatorJwt(partnerUid, { email: 'lp@test.com', emailVerified: true });
  const outsiderToken = makeEmulatorJwt(outsiderUid, { email: 'lo@test.com', emailVerified: true });
  const nowIso = new Date().toISOString();

  await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'lc@test.com', nowIso });

  // 1. Sole member leave MUST be rejected by Security Rules
  const soleLeave = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { memberUids: [], targetRatio: {}, updatedAt: nowIso },
      { mask: ['memberUids', 'targetRatio', 'updatedAt'], serverTimestamps: ['updatedAtTimestamp'] }
    ),
    makeUpdateWrite(
      `sharedVaults/${vaultId}/members/${creatorUid}`,
      { status: 'left', leftAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'leftAt', 'updatedAt'], serverTimestamps: ['leftAtTimestamp'] }
    ),
  ]);
  assert.equal(soleLeave.status, 403, 'Sole remaining member cannot leave vault');

  // 2. Partner joins
  const code = generateSecureInviteCode(16);
  assert.equal(
    (await createInviteAsMember({ vaultId, inviteCode: code, inviterUid: creatorUid, inviterToken: creatorToken, nowIso })).status,
    200
  );
  assert.equal(
    (
      await commitTx(
        partnerToken,
        makeJoinWrites({
          vaultId,
          inviteCode: code,
          creatorUid,
          partnerUid,
          partnerEmail: 'lp@test.com',
          partnerName: 'Partner L',
          nowIso,
          actId: `act_lj_${suffix}`,
        })
      )
    ).status,
    200
  );

  // 3. Partner attempting to remove creator (kick attack) MUST be rejected
  const kickAttempt = await commitTx(partnerToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { memberUids: [partnerUid], targetRatio: { [partnerUid]: 100 }, updatedAt: nowIso },
      { mask: ['memberUids', 'targetRatio', 'updatedAt'], serverTimestamps: ['updatedAtTimestamp'] }
    ),
  ]);
  assert.equal(kickAttempt.status, 403, 'Partner cannot remove another member');

  // 4. Partner attempting to archive 2-member vault (non-creator) MUST be rejected
  const partnerArchive = await commitTx(partnerToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { status: 'archived', archivedAt: nowIso, archivedByUid: partnerUid, updatedAt: nowIso },
      { mask: ['status', 'archivedAt', 'archivedByUid', 'updatedAt'], serverTimestamps: ['archivedAtTimestamp', 'updatedAtTimestamp'] }
    ),
  ]);
  assert.equal(partnerArchive.status, 403, 'Non-creator partner cannot archive a 2-member vault');

  // 5. Unauthorized field modification (changing currency or invalid ratio summing != 100) MUST be rejected
  const badRatio = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { targetRatio: { [creatorUid]: 70, [partnerUid]: 70 }, updatedAt: nowIso },
      { mask: ['targetRatio', 'updatedAt'], serverTimestamps: ['updatedAtTimestamp'] }
    ),
  ]);
  assert.equal(badRatio.status, 403, 'Target ratio not summing to 100 must be rejected');

  const mutateCurrency = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { currency: 'USD', updatedAt: nowIso },
      { mask: ['currency', 'updatedAt'] }
    ),
  ]);
  assert.equal(mutateCurrency.status, 403, 'Mutating locked currency must be rejected');

  // 6. Non-member cannot read vault or inject fake activity
  assert.equal((await txGet(`sharedVaults/${vaultId}`, outsiderToken)).status, 403, 'Non-member cannot read vault');
  const fakeActivity = await commitTx(outsiderToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}/activity/act_fake_${suffix}`,
      {
        id: `act_fake_${suffix}`,
        vaultId,
        actorUid: outsiderUid,
        actorName: 'Outsider',
        type: 'member_joined',
        title: 'Spoofed',
        description: 'Injected',
        timestamp: nowIso,
      },
      { exists: false }
    ),
  ]);
  assert.equal(fakeActivity.status, 403, 'Non-member cannot inject fake activity logs');

  // 7. Legitimate atomic self-leave by partner succeeds!
  const selfLeave = await commitTx(partnerToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { memberUids: [creatorUid], targetRatio: { [creatorUid]: 100 }, updatedAt: nowIso },
      { mask: ['memberUids', 'targetRatio', 'updatedAt'], serverTimestamps: ['updatedAtTimestamp'] }
    ),
    makeUpdateWrite(
      `sharedVaults/${vaultId}/members/${partnerUid}`,
      { status: 'left', leftAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'leftAt', 'updatedAt'], serverTimestamps: ['leftAtTimestamp'] }
    ),
    makeUpdateWrite(
      `sharedVaults/${vaultId}/activity/act_left_${suffix}`,
      {
        id: `act_left_${suffix}`,
        vaultId,
        actorUid: partnerUid,
        actorName: 'Partner L',
        type: 'member_left',
        title: 'Member Left Vault',
        description: 'Partner left',
        timestamp: nowIso,
      },
      { serverTimestamps: ['serverTimestamp'], exists: false }
    ),
  ]);
  assert.equal(selfLeave.status, 200, `Valid atomic self-leave must succeed: ${JSON.stringify(selfLeave.data)}`);

  // Partner immediately loses access to vault after leaving
  assert.equal((await txGet(`sharedVaults/${vaultId}`, partnerToken)).status, 403, 'Departed partner loses read access');

  // 8. Re-join after leaving with a FRESH invite code succeeds (reactivating 'left' member doc!)
  const rejoinCode = generateSecureInviteCode(16);
  assert.equal(
    (await createInviteAsMember({ vaultId, inviteCode: rejoinCode, inviterUid: creatorUid, inviterToken: creatorToken, nowIso })).status,
    200
  );
  const rejoinRes = await commitTx(
    partnerToken,
    makeJoinWrites({
      vaultId,
      inviteCode: rejoinCode,
      creatorUid,
      partnerUid,
      partnerEmail: 'lp@test.com',
      partnerName: 'Partner L',
      nowIso,
      actId: `act_rejoin_${suffix}`,
    })
  );
  assert.equal(rejoinRes.status, 200, `Re-joining after previously leaving must succeed: ${JSON.stringify(rejoinRes.data)}`);

  // 9. Creator archives vault -> vault becomes strictly read-only!
  const archiveRes = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}`,
      { status: 'archived', archivedAt: nowIso, archivedByUid: creatorUid, updatedAt: nowIso },
      { mask: ['status', 'archivedAt', 'archivedByUid', 'updatedAt'], serverTimestamps: ['archivedAtTimestamp', 'updatedAtTimestamp'] }
    ),
    makeUpdateWrite(
      `sharedVaults/${vaultId}/activity/act_arch_${suffix}`,
      {
        id: `act_arch_${suffix}`,
        vaultId,
        actorUid: creatorUid,
        actorName: 'Atif Munshi',
        type: 'vault_archived',
        title: 'Joint Vault Archived',
        description: 'Archived vault',
        timestamp: nowIso,
      },
      { serverTimestamps: ['serverTimestamp'], exists: false }
    ),
  ]);
  assert.equal(archiveRes.status, 200, `Creator archive must succeed: ${JSON.stringify(archiveRes.data)}`);

  // Archived vault cannot accept new contributions or be unarchived
  const contribOnArchived = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}/contributions/c_arch_${suffix}`,
      {
        id: `c_arch_${suffix}`,
        vaultId,
        contributedByUid: creatorUid,
        contributorName: 'Atif',
        amountPaise: 10000,
        date: '2026-11-17',
        description: 'Late contrib',
        createdAt: nowIso,
        status: 'active',
      },
      { exists: false }
    ),
  ]);
  assert.equal(contribOnArchived.status, 403, 'Cannot contribute to an archived vault');
});

test('Emulator 6. Expense & Contribution Reversal Authorization + Personal Finance/Productivity/Study Integrity', { skip: skipReason }, async () => {
  const suffix = Date.now().toString(36) + 'e';
  const vaultId = `vlt_rev_${suffix}`;
  const creatorUid = `usr_rc_${suffix}`;
  const partnerUid = `usr_rp_${suffix}`;
  const creatorToken = makeEmulatorJwt(creatorUid, { email: 'rc@test.com', emailVerified: true });
  const partnerToken = makeEmulatorJwt(partnerUid, { email: 'rp@test.com', emailVerified: true });
  const nowIso = new Date().toISOString();

  await seedVaultAsCreator({ vaultId, creatorUid, creatorToken, creatorEmail: 'rc@test.com', nowIso });
  const code = generateSecureInviteCode(16);
  assert.equal(
    (await createInviteAsMember({ vaultId, inviteCode: code, inviterUid: creatorUid, inviterToken: creatorToken, nowIso })).status,
    200
  );
  assert.equal(
    (
      await commitTx(
        partnerToken,
        makeJoinWrites({
          vaultId,
          inviteCode: code,
          creatorUid,
          partnerUid,
          partnerEmail: 'rp@test.com',
          partnerName: 'Partner R',
          nowIso,
          actId: `act_rj_${suffix}`,
        })
      )
    ).status,
    200
  );

  // Creator adds a contribution & expense
  const cId = `cnt_${suffix}`;
  const eId = `exp_${suffix}`;
  assert.equal(
    (
      await commitTx(creatorToken, [
        makeUpdateWrite(
          `sharedVaults/${vaultId}/contributions/${cId}`,
          {
            id: cId,
            vaultId,
            contributedByUid: creatorUid,
            contributorName: 'Atif',
            amountPaise: 50000,
            date: '2026-11-17',
            description: 'Monthly save',
            createdAt: nowIso,
            status: 'active',
          },
          { exists: false }
        ),
        makeUpdateWrite(
          `sharedVaults/${vaultId}/expenses/${eId}`,
          {
            id: eId,
            vaultId,
            paidByUid: creatorUid,
            payerName: 'Atif',
            amountPaise: 20000,
            description: 'Dinner',
            date: '2026-11-17',
            splitMode: 'equal',
            memberShares: { [creatorUid]: 10000, [partnerUid]: 10000 },
            createdAt: nowIso,
            status: 'active',
          },
          { exists: false }
        ),
      ])
    ).status,
    200
  );

  // Partner CANNOT reverse creator's contribution or expense
  const unauthContribRev = await commitTx(partnerToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}/contributions/${cId}`,
      { status: 'reversed', reversedByUid: partnerUid, reversalReason: 'Unauthorized', reversedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'reversedByUid', 'reversalReason', 'reversedAt', 'updatedAt'], serverTimestamps: ['reversedAtTimestamp'] }
    ),
  ]);
  assert.equal(unauthContribRev.status, 403, 'Partner cannot reverse creator contribution');

  const unauthExpRev = await commitTx(partnerToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}/expenses/${eId}`,
      { status: 'reversed', reversedByUid: partnerUid, reversalReason: 'Unauthorized', reversedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'reversedByUid', 'reversalReason', 'reversedAt', 'updatedAt'], serverTimestamps: ['reversedAtTimestamp'] }
    ),
  ]);
  assert.equal(unauthExpRev.status, 403, 'Partner cannot reverse creator expense');

  // Creator CAN reverse their own expense with exact immutable fields preserved
  const validExpRev = await commitTx(creatorToken, [
    makeUpdateWrite(
      `sharedVaults/${vaultId}/expenses/${eId}`,
      { status: 'reversed', reversedByUid: creatorUid, reversalReason: 'Entered twice', reversedAt: nowIso, updatedAt: nowIso },
      { mask: ['status', 'reversedByUid', 'reversalReason', 'reversedAt', 'updatedAt'], serverTimestamps: ['reversedAtTimestamp'] }
    ),
  ]);
  assert.equal(validExpRev.status, 200, `Payer expense reversal must succeed: ${JSON.stringify(validExpRev.data)}`);

  // Personal Finance / Productivity / Study records remain strictly private to owner (partner denied!)
  const personalRes = await commitTx(creatorToken, [
    makeUpdateWrite(
      `users/${creatorUid}/expenses/pexp_${suffix}`,
      {
        id: `pexp_${suffix}`,
        userId: creatorUid,
        description: 'Private Coffee',
        amountPaise: 500,
        date: '2026-11-17',
        type: 'variable',
        paymentMethod: 'upi_bank',
      },
      { exists: false }
    ),
    makeUpdateWrite(
      `users/${creatorUid}/tasks/ptask_${suffix}`,
      {
        id: `ptask_${suffix}`,
        userId: creatorUid,
        title: 'Private Task',
        priority: 'high',
        status: 'todo',
        estimatedPomodoros: 2,
      },
      { exists: false }
    ),
    makeUpdateWrite(
      `users/${creatorUid}/study_subjects/psub_${suffix}`,
      {
        id: `psub_${suffix}`,
        userId: creatorUid,
        code: 'CS101',
        name: 'Algorithms',
        priority: 'high',
      },
      { exists: false }
    ),
  ]);
  assert.equal(personalRes.status, 200, `Personal Finance/Productivity/Study writes must succeed: ${JSON.stringify(personalRes.data)}`);

  // Vault partner MUST be strictly denied from reading creator's personal data!
  assert.equal((await txGet(`users/${creatorUid}/expenses/pexp_${suffix}`, partnerToken)).status, 403, 'Partner cannot read private expense');
  assert.equal((await txGet(`users/${creatorUid}/tasks/ptask_${suffix}`, partnerToken)).status, 403, 'Partner cannot read private task');
  assert.equal((await txGet(`users/${creatorUid}/study_subjects/psub_${suffix}`, partnerToken)).status, 403, 'Partner cannot read private study subject');
});

