import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import { dbService } from '../server/db.ts';

function createAuthJwt(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: `${uid}@example.com`,
      aud: 'test-rules-project',
      iss: 'https://securetoken.google.com/test-rules-project',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

describe('v1.8.0 Cross-User Data Access, Ownership & ID Squatting Security Suite', () => {
  let server: http.Server;
  let baseUrl = '';

  const userA = 'usr_sec_alice_' + Date.now();
  const userB = 'usr_sec_bob_' + Date.now();
  const tokenA = createAuthJwt(userA);
  const tokenB = createAuthJwt(userB);

  before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
  });

  const endpoints = [
    {
      name: 'Skill Tree Nodes',
      route: '/api/skill-nodes',
      idPrefix: 'sn_test',
      validCreatePayload: (id: string) => ({
        id,
        title: 'Advanced Graph Algorithms',
        tier: 3,
        xpPoints: 30,
        status: 'available',
      }),
      updatePayload: {
        title: 'Malicious Injected Title',
        xpPoints: 9999,
      },
    },
    {
      name: 'Whiteboard Drawings',
      route: '/api/whiteboard',
      idPrefix: 'wb_test',
      validCreatePayload: (id: string) => ({
        id,
        title: 'Confidential System Blueprint',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        width: 1024,
        height: 768,
      }),
      updatePayload: {
        title: 'Overwritten Whiteboard Title',
      },
    },
    {
      name: 'Exam Hall Simulations',
      route: '/api/exam-simulations',
      idPrefix: 'sim_test',
      validCreatePayload: (id: string) => ({
        id,
        title: 'GATE CS Mock Exam Final',
        totalDurationMinutes: 180,
        status: 'completed',
        totalElapsedSeconds: 10800,
      }),
      updatePayload: {
        title: 'Hacked Exam Simulation',
        totalDurationMinutes: 60,
      },
    },
    {
      name: 'Decision Journal',
      route: '/api/decisions',
      idPrefix: 'dec_test',
      validCreatePayload: (id: string) => ({
        id,
        title: 'Accept Series A Term Sheet',
        category: 'career',
        confidenceScore: 9,
        expectedReviewDate: '2026-12-01',
      }),
      updatePayload: {
        title: 'Sabotaged Decision Entry',
        confidenceScore: 1,
      },
    },
    {
      name: 'Doomscroll Self-Tax Jar',
      route: '/api/doomscroll-tax',
      idPrefix: 'tax_test',
      validCreatePayload: (id: string) => ({
        id,
        minutes: 45,
        distractionApp: 'Instagram Reels',
        taxRatePerMinute: 2,
        taxAmount: 90,
      }),
      updatePayload: {
        distractionApp: 'Hacked App',
      },
    },
    {
      name: 'Time Capsule Letters',
      route: '/api/time-capsules',
      idPrefix: 'cap_test',
      validCreatePayload: (id: string) => ({
        id,
        title: 'Letter to Future Self on Graduation Day',
        content: 'Stay curious and keep shipping.',
        unlockDate: '2030-01-01',
      }),
      updatePayload: {
        title: 'Compromised Time Capsule',
      },
    },
    {
      name: 'Life-in-Weeks Milestones',
      route: '/api/life-milestones',
      idPrefix: 'm_test',
      validCreatePayload: (id: string) => ({
        id,
        label: 'Founded Tech Startup',
        age: 26,
        weekIndex: 1352,
        category: 'career',
      }),
      updatePayload: {
        label: 'Overwritten Milestone',
      },
    },
  ];

  for (const ep of endpoints) {
    describe(`Endpoint Security: ${ep.name} (${ep.route})`, () => {
      const recordIdA = `${ep.idPrefix}_alice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const recordIdB = `${ep.idPrefix}_bob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      it(`1. User A creates a record successfully`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenA}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ep.validCreatePayload(recordIdA)),
        });
        assert.equal(res.status, 201, `Expected 201 Created for User A on ${ep.route}`);
        const data = (await res.json()) as any;
        assert.equal(data.userId, userA, `Saved record userId must match authenticated User A`);
      });

      it(`2. User B cannot read User A's record in collection list`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenB}`,
          },
        });
        assert.equal(res.status, 200);
        const list = (await res.json()) as any[];
        const leaked = list.find((item: any) => item.id === recordIdA || item.userId === userA);
        assert.equal(leaked, undefined, `User B must NEVER see User A's record in collection list`);
      });

      it(`3. User B cannot read User A's record by direct ID (single GET returns 403 or 404)`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}/${recordIdA}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenB}`,
          },
        });
        assert.ok(
          res.status === 403 || res.status === 404,
          `Expected 403 or 404 when User B tries to read User A's ID ${recordIdA}, got ${res.status}`
        );
      });

      it(`4. User B cannot update User A's record via PUT (returns 403)`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}/${recordIdA}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${tokenB}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ep.updatePayload),
        });
        assert.equal(res.status, 403, `User B updating User A's record must be strictly rejected with 403`);
      });

      it(`5. User B cannot overwrite User A's record via POST with existing ID (ID squatting returns 403)`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenB}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...ep.validCreatePayload(recordIdA),
            title: 'Malicious Squat Attempt',
          }),
        });
        assert.equal(res.status, 403, `User B squatting on User A's ID via POST must be rejected with 403`);
      });

      it(`6. User B cannot delete User A's record via DELETE (returns 403)`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}/${recordIdA}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${tokenB}`,
          },
        });
        assert.equal(res.status, 403, `User B deleting User A's record must be rejected with 403`);

        // Verify User A's record remains completely intact
        const verifyRes = await fetch(`${baseUrl}${ep.route}/${recordIdA}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        });
        assert.equal(verifyRes.status, 200, `User A's record must still exist after unauthorized delete attempt`);
      });

      it(`7. User B creates their own record, and User A cannot access it`, async () => {
        // User B creates record B
        const bRes = await fetch(`${baseUrl}${ep.route}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenB}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ep.validCreatePayload(recordIdB)),
        });
        assert.equal(bRes.status, 201);

        // User A cannot read B's record in list
        const aListRes = await fetch(`${baseUrl}${ep.route}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        });
        const aList = (await aListRes.json()) as any[];
        const leakedB = aList.find((item: any) => item.id === recordIdB || item.userId === userB);
        assert.equal(leakedB, undefined, `User A must not see User B's record in list`);

        // User A cannot read B's record by ID
        const aGetRes = await fetch(`${baseUrl}${ep.route}/${recordIdB}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        });
        assert.ok(aGetRes.status === 403 || aGetRes.status === 404);

        // User A cannot delete B's record
        const aDelRes = await fetch(`${baseUrl}${ep.route}/${recordIdB}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        });
        assert.equal(aDelRes.status, 403);
      });

      it(`8. Unauthenticated request without Authorization header is rejected with 401`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}`, {
          method: 'GET',
        });
        assert.equal(res.status, 401, `Expected 401 AUTH_REQUIRED for unauthenticated GET ${ep.route}`);
        const body = (await res.json()) as any;
        assert.equal(body.code, 'AUTH_REQUIRED');
      });

      it(`9. Request with invalid or malformed Bearer token is rejected with 401`, async () => {
        const res = await fetch(`${baseUrl}${ep.route}`, {
          method: 'GET',
          headers: {
            Authorization: 'Bearer invalid.bogus.signature.payload',
          },
        });
        assert.equal(res.status, 401, `Expected 401 AUTH_REQUIRED for forged token on ${ep.route}`);
      });
    });
  }

  describe('Endpoint Security: Emergency Profile (/api/emergency-profile)', () => {
    it('User A creates an emergency profile and User B cannot read it', async () => {
      const resA = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: 'Alice Walker',
          bloodGroup: 'O+',
          primaryHospital: 'City General',
          emergencyContacts: [{ name: 'Bob Friend', phone: '1234567890' }],
        }),
      });
      assert.equal(resA.status, 201);
      const dataA = (await resA.json()) as any;
      assert.equal(dataA.userId, userA);
      assert.equal(dataA.fullName, 'Alice Walker');

      // User B fetches /api/emergency-profile: must return B's profile (or blank default for B), NEVER Alice's
      const resB = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenB}`,
        },
      });
      assert.equal(resB.status, 200);
      const dataB = (await resB.json()) as any;
      assert.equal(dataB.userId, userB, `Emergency profile must be scoped strictly to User B`);
      assert.notEqual(dataB.fullName, 'Alice Walker', `User B must never see Alice's emergency profile data`);
    });

    it('User B cannot overwrite User A emergency profile by injecting userId or ID', async () => {
      const maliciousRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: `ep_${userA}`,
          userId: userA,
          fullName: 'Compromised Identity',
        }),
      });
      // The server either ignores client userId and scopes to User B (returning 201 for B) or rejects 403
      assert.ok(maliciousRes.status === 201 || maliciousRes.status === 403);
      if (maliciousRes.status === 201) {
        const body = (await maliciousRes.json()) as any;
        assert.equal(body.userId, userB, `Server must never accept client-provided userId`);
      }

      // Verify Alice's profile was NOT compromised
      const aliceCheck = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
      });
      const aliceData = (await aliceCheck.json()) as any;
      assert.equal(aliceData.fullName, 'Alice Walker', `Alice's profile must remain completely unchanged`);
    });

    it('Unauthenticated GET and POST to emergency profile return 401', async () => {
      const getRes = await fetch(`${baseUrl}/api/emergency-profile`);
      assert.equal(getRes.status, 401);
      const postRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'Nobody' }),
      });
      assert.equal(postRes.status, 401);
    });
  });

  describe('Legacy Unowned Records & Quarantine Invariants', () => {
    it('Never exposes unowned records to authenticated users', async () => {
      // Direct inspection of database service methods with missing/empty userId
      const allSimsMissing = dbService.getExamSimulations('');
      assert.deepEqual(allSimsMissing, [], 'getExamSimulations("") must return empty array');

      const allNodesMissing = dbService.getSkillNodes('');
      assert.deepEqual(allNodesMissing, [], 'getSkillNodes("") must return empty array');

      const allDecisionsMissing = dbService.getDecisionEntries('');
      assert.deepEqual(allDecisionsMissing, [], 'getDecisionEntries("") must return empty array');

      const allTaxMissing = dbService.getDoomscrollLogs('');
      assert.deepEqual(allTaxMissing, [], 'getDoomscrollLogs("") must return empty array');

      const allMilestonesMissing = dbService.getLifeMilestones('');
      assert.deepEqual(allMilestonesMissing, [], 'getLifeMilestones("") must return empty array');

      const allCapsulesMissing = dbService.getTimeCapsules('');
      assert.deepEqual(allCapsulesMissing, [], 'getTimeCapsules("") must return empty array');

      const emergencyMissing = dbService.getEmergencyProfile('');
      assert.equal(emergencyMissing, null, 'getEmergencyProfile("") must return null');
    });

    it('Quarantines records that lack a valid userId during sanitization', () => {
      const rawRecordsWithOrphans = [
        { id: 'valid_1', userId: 'usr_owner_1', title: 'Legit Node' },
        { id: 'orphan_1', title: 'Unowned Legacy Node' }, // Missing userId
        { id: 'orphan_2', userId: '', title: 'Empty String User' }, // Empty userId
        { id: 'valid_2', userId: 'usr_owner_2', title: 'Second Legit Node' },
      ];

      const cleaned = (dbService as any).sanitizeAndQuarantineRecords(
        rawRecordsWithOrphans,
        'skillNodes'
      );

      assert.equal(cleaned.length, 2, 'Only records with valid userId must pass sanitization');
      assert.equal(cleaned[0].id, 'valid_1');
      assert.equal(cleaned[1].id, 'valid_2');

      const quarantined = dbService.getQuarantinedRecords();
      const orphan1 = quarantined.find((q) => q.recordId === 'orphan_1');
      const orphan2 = quarantined.find((q) => q.recordId === 'orphan_2');
      assert.ok(orphan1, 'orphan_1 must be present in quarantinedRecords');
      assert.ok(orphan2, 'orphan_2 must be present in quarantinedRecords');
      assert.equal(orphan1.reason, 'Legacy unowned record: missing or empty userId');
    });
  });
});

