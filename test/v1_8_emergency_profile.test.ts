import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../server/serverless.ts';
import {
  maskReference,
  isProfileConfigured,
} from '../src/components/finance/EmergencyAssetSummary.tsx';
import type { EmergencyAssetProfile } from '../src/types/features15.ts';

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

describe('v1.8.0 Emergency & Asset Summary Data Accuracy, Security & Privacy Suite', () => {
  let server: http.Server;
  let baseUrl = '';

  const userA = 'usr_emer_alice_' + Date.now();
  const userB = 'usr_emer_bob_' + Date.now();
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

  // ==========================================================================
  // 1. New User Empty State & No False Sample Data
  // ==========================================================================
  describe('1. New User Empty State & No Sample Data Invariant', () => {
    it('returns a clean unconfigured template for a fresh user, NEVER returning SEED_PROFILE', async () => {
      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as EmergencyAssetProfile;

      // Invariant: Scoped to User A
      assert.equal(data.userId, userA);

      // Invariant: No false sample data
      assert.notEqual(data.fullName, 'Atif Munshi', 'Must never display hardcoded sample user name');
      assert.notEqual(data.primaryHospital, 'City Multi-Speciality Hospital', 'Must never display sample hospital');
      assert.notEqual(data.bloodGroup, 'O+', 'Must never display sample blood group');

      // Arrays must be empty for a new user
      assert.equal(data.accounts?.length || 0, 0, 'New user accounts must be empty');
      assert.equal(data.policies?.length || 0, 0, 'New user policies must be empty');
      assert.equal(data.emergencyContacts?.length || 0, 0, 'New user contacts must be empty');

      // Helper verifies it is unconfigured (triggers Empty State in UI)
      assert.equal(isProfileConfigured(data), false, 'Empty template must evaluate as unconfigured');
    });

    it('isProfileConfigured accurately distinguishes null, empty, and populated profiles', () => {
      assert.equal(isProfileConfigured(null), false);
      assert.equal(isProfileConfigured(undefined), false);
      assert.equal(
        isProfileConfigured({
          id: 'ep_1',
          userId: 'u1',
          accounts: [],
          policies: [],
          emergencyContacts: [],
          updatedAt: new Date().toISOString(),
        }),
        false
      );

      // Adding legal name configures profile
      assert.equal(
        isProfileConfigured({
          id: 'ep_1',
          userId: 'u1',
          fullName: 'Dr. Jane Roe',
          accounts: [],
          policies: [],
          emergencyContacts: [],
          updatedAt: new Date().toISOString(),
        }),
        true
      );

      // Adding an account configures profile
      assert.equal(
        isProfileConfigured({
          id: 'ep_1',
          userId: 'u1',
          accounts: [
            {
              id: 'a1',
              institution: 'Bank',
              nickname: 'Savings',
              maskedNumber: '•••• 1234',
              accountType: 'Savings',
            },
          ],
          policies: [],
          emergencyContacts: [],
          updatedAt: new Date().toISOString(),
        }),
        true
      );
    });
  });

  // ==========================================================================
  // 2. Real Profile Management (Create, Edit & Persist)
  // ==========================================================================
  describe('2. Real Profile Management (Create & Edit)', () => {
    it('creates a real emergency profile via POST with full medical, contact, and account details', async () => {
      const payload: Partial<EmergencyAssetProfile> = {
        fullName: 'Evelyn Reed',
        bloodGroup: 'B+',
        primaryHospital: 'Memorial General Hospital',
        contacts: [
          {
            id: 'c_1',
            name: 'Marcus Reed',
            relationship: 'Spouse',
            phone: '+1-555-0199',
            isPrimary: true,
          },
          {
            id: 'c_2',
            name: 'Dr. Sarah Connor',
            relationship: 'Primary Physician',
            phone: '+1-555-0144',
            isPrimary: false,
          },
        ],
        accounts: [
          {
            id: 'acc_1',
            institution: 'First National Bank',
            nickname: 'Primary Checking',
            maskedNumber: '•••• 8821',
            accountType: 'Checking',
            nomineeName: 'Marcus Reed',
          },
        ],
        policies: [
          {
            id: 'pol_1',
            provider: 'Global Health Assurance',
            policyType: 'Health Insurance',
            policyNumber: '•••• 4410',
            coverageAmountPaise: 50000000, // $500,000 / ₹5,00,000
            emergencyHelpline: '1-800-555-0199',
            nomineeName: 'Marcus Reed',
          },
        ],
        notes: 'Physical passport and documents in home safe box.',
      };

      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 201);
      const created = (await res.json()) as EmergencyAssetProfile;
      assert.equal(created.userId, userA);
      assert.equal(created.fullName, 'Evelyn Reed');
      assert.equal(created.bloodGroup, 'B+');
      assert.equal(created.primaryHospital, 'Memorial General Hospital');
      assert.equal(created.contacts?.length, 2);
      assert.equal(created.accounts?.length, 1);
      assert.equal(created.policies?.length, 1);
      assert.equal(created.notes, 'Physical passport and documents in home safe box.');
      assert.equal(isProfileConfigured(created), true);
    });

    it('updates existing profile via PUT with modified hospital and additional account', async () => {
      const updatePayload: Partial<EmergencyAssetProfile> = {
        fullName: 'Evelyn Reed',
        bloodGroup: 'B+',
        primaryHospital: 'St. Jude Regional Medical Center',
        accounts: [
          {
            id: 'acc_1',
            institution: 'First National Bank',
            nickname: 'Primary Checking',
            maskedNumber: '•••• 8821',
            accountType: 'Checking',
            nomineeName: 'Marcus Reed',
          },
          {
            id: 'acc_2',
            institution: 'Vanguard Index',
            nickname: 'Total Market Demat',
            maskedNumber: '•••• 9102',
            accountType: 'Demat/Brokerage',
            nomineeName: 'Marcus Reed',
          },
        ],
        policies: [],
      };

      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      assert.equal(res.status, 200);
      const updated = (await res.json()) as EmergencyAssetProfile;
      assert.equal(updated.primaryHospital, 'St. Jude Regional Medical Center');
      assert.equal(updated.accounts.length, 2);
    });
  });

  // ==========================================================================
  // 3. Reload and Persistence
  // ==========================================================================
  describe('3. Reload and Durable Persistence', () => {
    it('retrieves the faithfully updated emergency profile on reload (GET)', async () => {
      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.status, 200);
      const fetched = (await res.json()) as EmergencyAssetProfile;
      assert.equal(fetched.userId, userA);
      assert.equal(fetched.fullName, 'Evelyn Reed');
      assert.equal(fetched.primaryHospital, 'St. Jude Regional Medical Center');
      assert.equal(fetched.accounts.length, 2);
      assert.equal(fetched.accounts[1].institution, 'Vanguard Index');
    });
  });

  // ==========================================================================
  // 4. Failed API Requests & Authentication Enforcement
  // ==========================================================================
  describe('4. Failed API Requests & Auth Rejections', () => {
    it('rejects unauthenticated GET with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/emergency-profile`);
      assert.equal(res.status, 401);
      const data = (await res.json()) as any;
      assert.equal(data.code, 'AUTH_REQUIRED');
    });

    it('rejects unauthenticated POST with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'Malicious' }),
      });
      assert.equal(res.status, 401);
    });

    it('rejects malformed token with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: { Authorization: 'Bearer invalid.token.payload' },
      });
      assert.equal(res.status, 401);
    });
  });

  // ==========================================================================
  // 5. Cross-User Data Access & Tenant Isolation
  // ==========================================================================
  describe('5. Cross-User Data Access & Tenant Isolation', () => {
    it('User B cannot read User A emergency profile (returns B empty state)', async () => {
      const resB = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: {
          Authorization: `Bearer ${tokenB}`,
        },
      });

      assert.equal(resB.status, 200);
      const dataB = (await resB.json()) as EmergencyAssetProfile;
      assert.equal(dataB.userId, userB);
      assert.notEqual(dataB.fullName, 'Evelyn Reed', 'User B must never see User A data');
      assert.equal(dataB.accounts.length, 0);
    });

    it('User B cannot overwrite User A emergency profile by injecting User A ID or userId', async () => {
      const maliciousRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: `ep_${userA}`,
          userId: userA,
          fullName: 'Malicious Bob Overwrite',
        }),
      });

      // The server overrides userId to auth.userId (User B) and saves under User B namespace
      assert.equal(maliciousRes.status, 201);
      const savedB = (await maliciousRes.json()) as EmergencyAssetProfile;
      assert.equal(savedB.userId, userB);

      // Verify User A remained completely unaffected
      const checkA = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const dataA = (await checkA.json()) as EmergencyAssetProfile;
      assert.equal(dataA.fullName, 'Evelyn Reed');
    });
  });

  // ==========================================================================
  // 6. Masking & Sensitive Data Restriction
  // ==========================================================================
  describe('6. Masking & Sensitive Data Restriction', () => {
    it('server automatically masks unmasked account numbers into •••• last4 format', async () => {
      const res = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: 'Evelyn Reed',
          accounts: [
            {
              institution: 'Secured Federal Credit Union',
              nickname: 'High Yield Savings',
              maskedNumber: '987654321098', // Unmasked full number provided
              accountType: 'Savings',
            },
          ],
          policies: [
            {
              provider: 'Allied Mutual Insurance',
              policyNumber: 'PL-9988776655', // Unmasked policy number
              policyType: 'Term Life Insurance',
              emergencyHelpline: '1-800-555-0100',
              nomineeName: 'Marcus Reed',
            },
          ],
        }),
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as EmergencyAssetProfile;

      // Invariant: Unmasked numbers are strictly converted to •••• last4
      assert.equal(data.accounts[0].maskedNumber, '•••• 1098');
      assert.equal(data.policies[0].policyNumber, '•••• 6655');
    });

    it('maskReference helper enforces masking consistently across edge cases', () => {
      assert.equal(maskReference(''), '••••');
      assert.equal(maskReference('4921'), '•••• 4921');
      assert.equal(maskReference('1234567890'), '•••• 7890');
      assert.equal(maskReference('•••• 9931'), '•••• 9931');
      assert.equal(maskReference('   •••• 7712   '), '•••• 7712');
      assert.equal(maskReference('ACC-9988'), '•••• 9988');
    });
  });

  // ==========================================================================
  // 7. Deletion & Reset to Empty State
  // ==========================================================================
  describe('7. Profile Deletion & State Reset', () => {
    it('deletes User A emergency profile via DELETE', async () => {
      const deleteRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(deleteRes.status, 200);
      const deleteData = (await deleteRes.json()) as { success: boolean };
      assert.equal(deleteData.success, true);
    });

    it('subsequent GET returns clean unconfigured empty state after deletion', async () => {
      const checkRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: {
          Authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(checkRes.status, 200);
      const data = (await checkRes.json()) as EmergencyAssetProfile;
      assert.equal(data.userId, userA);
      assert.equal(data.accounts.length, 0);
      assert.equal(data.policies.length, 0);
      assert.equal(data.fullName, undefined);
      assert.equal(isProfileConfigured(data), false, 'Deleted profile must revert to empty state');
    });
  });
});
