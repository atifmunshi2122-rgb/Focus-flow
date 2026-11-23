import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import app from '../server/serverless.ts';
import { DatabaseService } from '../server/db.ts';
import { V18StorageService, StorageOwnershipError } from '../server/v18StorageService.ts';
import { migrateV18JsonToFirestore } from '../server/migrateV18Data.ts';
import type {
  SkillNode,
  WhiteboardDrawing,
  ExamSimulationState,
  DecisionEntry,
  DoomscrollTaxEntry,
  LifeMilestone,
  TimeCapsuleLetter,
  EmergencyAssetProfile,
} from '../src/types/features15.ts';

function createAuthJwt(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: `${uid}@test.focusflow.io`,
      aud: 'test-rules-project',
      iss: 'https://securetoken.google.com/test-rules-project',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

// In-memory Firestore mock to test multi-instance shared persistence & migration
class MockFirestore {
  public store = new Map<string, any>();

  collection(name: string) {
    const self = this;
    return {
      doc(docId: string) {
        return self.doc(`${name}/${docId}`);
      },
    };
  }

  doc(docPath: string) {
    const self = this;
    return {
      collection(subcol: string) {
        return {
          doc(subdocId: string) {
            return self.doc(`${docPath}/${subcol}/${subdocId}`);
          },
          get: async () => {
            const prefix = `${docPath}/${subcol}/`;
            const docs: any[] = [];
            for (const [k, v] of self.store.entries()) {
              if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
                docs.push({
                  id: k.slice(prefix.length),
                  data: () => ({ ...v }),
                  exists: true,
                });
              }
            }
            return {
              docs,
              empty: docs.length === 0,
            };
          },
          orderBy: () => ({
            get: async () => {
              const prefix = `${docPath}/${subcol}/`;
              const docs: any[] = [];
              for (const [k, v] of self.store.entries()) {
                if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
                  docs.push({
                    id: k.slice(prefix.length),
                    data: () => ({ ...v }),
                    exists: true,
                  });
                }
              }
              return {
                docs,
                empty: docs.length === 0,
              };
            },
          }),
        };
      },
      get: async () => {
        const val = self.store.get(docPath);
        return {
          exists: val !== undefined,
          data: () => (val ? { ...val } : undefined),
        };
      },
      set: async (data: any) => {
        self.store.set(docPath, { ...data });
      },
      delete: async () => {
        self.store.delete(docPath);
      },
    };
  }

  batch() {
    const ops: Array<() => void> = [];
    const self = this;
    return {
      delete(ref: any) {
        ops.push(() => {
          // If ref has docPath or similar
        });
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  }
}

describe('v1.8.0 Critical Database Persistence & Data Loss Prevention Suite', () => {
  let server: http.Server;
  let baseUrl = '';

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

  // =========================================================================
  // 1. DatabaseService.load() Restoration & Deserialization
  // =========================================================================
  describe('1. DatabaseService.load() & Deserialization Faithfulness', () => {
    const testDir = path.join(os.tmpdir(), `ff_test_load_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

    before(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    after(() => {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    });

    it('saves all eight v1.8 data types and restores every field faithfully upon fresh DatabaseService restart', async () => {
      const db1 = new DatabaseService(testDir);
      const userA = 'usr_alpha_99';

      const skillNode: SkillNode = {
        id: 'sn_test_1',
        userId: userA,
        trackId: 'cs_track',
        title: 'Binary Search Trees',
        description: 'Balanced trees and traversals',
        tier: 2,
        prerequisites: [],
        status: 'available',
        category: 'Algorithms',
        xpPoints: 50,
      };

      const whiteboard: WhiteboardDrawing = {
        id: 'wb_test_1',
        userId: userA,
        title: 'CPU Pipeline Diagram',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        sizeBytes: 120,
        width: 800,
        height: 600,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const examSim: ExamSimulationState = {
        id: 'sim_test_1',
        title: 'GATE CS Mock Exam',
        totalDurationMinutes: 180,
        sections: [{ id: 'sec_1', name: 'General Aptitude', durationMinutes: 60 }],
        currentSectionIndex: 0,
        status: 'running',
        sectionElapsedSeconds: { sec_1: 120 },
        totalElapsedSeconds: 120,
      };

      const decision: DecisionEntry = {
        id: 'dec_test_1',
        userId: userA,
        title: 'Switching to Microservices Architecture',
        category: 'career',
        rationale: 'Modular scaling requirement',
        expectedOutcome: 'Reduced build latency',
        confidenceScore: 8,
        expectedReviewDate: '2026-12-01',
        reviewIntervalDays: 30,
        status: 'pending_review',
        createdAt: new Date().toISOString(),
      };

      const doomscroll: DoomscrollTaxEntry = {
        id: 'tax_test_1',
        userId: userA,
        minutes: 45,
        durationMinutes: 45,
        distractionApp: 'Social Feed',
        ratePerHour: 300,
        amountTaxed: 225,
        currency: '₹',
        createdAt: new Date().toISOString(),
      };

      const milestone: LifeMilestone = {
        id: 'ms_test_1',
        weekIndex: 520,
        age: 10,
        label: 'Learned Python Programming',
        title: 'Learned Python Programming',
        category: 'education',
      };

      const timeCapsule: TimeCapsuleLetter = {
        id: 'cap_test_1',
        userId: userA,
        title: 'Letter to my 30-year-old self',
        content: 'Stay passionate and build for real users.',
        unlockDate: '2030-01-01',
        isUnlocked: false,
        isSealed: true,
        createdAt: new Date().toISOString(),
      };

      const emergencyProfile: EmergencyAssetProfile = {
        id: `ep_${userA}`,
        userId: userA,
        fullName: 'Dr. Jane Watson',
        bloodGroup: 'O+',
        primaryHospital: 'City General Medical Center',
        accounts: [{
          id: 'acc_1',
          institution: 'HDFC Bank',
          nickname: 'Salary Account',
          maskedNumber: '•••• 4421',
          accountType: 'Savings',
        }],
        policies: [],
        emergencyContacts: [{
          id: 'con_1',
          name: 'John Watson',
          relationship: 'Brother',
          phone: '+91 9876543210',
          isPrimary: true,
        }],
        updatedAt: new Date().toISOString(),
      };

      // Save all 8 records into db1
      db1.saveSkillNode(skillNode);
      db1.saveWhiteboardDrawing(whiteboard);
      db1.saveExamSimulation({ ...examSim, userId: userA });
      db1.saveDecisionEntry(decision);
      db1.saveDoomscrollLog(doomscroll);
      db1.saveLifeMilestone({ ...milestone, userId: userA });
      db1.saveTimeCapsule(timeCapsule);
      db1.saveEmergencyProfile(emergencyProfile);

      // Flush in-flight asynchronous disk write
      await db1.flush();

      // Verify that database.json exists and contains records
      const dbJsonPath = path.join(testDir, 'database.json');
      assert.ok(fs.existsSync(dbJsonPath), 'database.json must exist on disk');

      // Now create a COMPLETELY FRESH DatabaseService instance pointing to the same folder
      const db2 = new DatabaseService(testDir);

      // 1. SkillNodes restored
      const nodes = db2.getSkillNodes(userA);
      assert.strictEqual(nodes.length, 1);
      assert.strictEqual(nodes[0].title, 'Binary Search Trees');
      assert.strictEqual(nodes[0].xpPoints, 50);

      // 2. WhiteboardDrawings restored
      const drawings = db2.getWhiteboardDrawings(userA);
      assert.strictEqual(drawings.length, 1);
      assert.strictEqual(drawings[0].title, 'CPU Pipeline Diagram');
      assert.strictEqual(drawings[0].width, 800);

      // 3. ExamSimulations restored
      const sims = db2.getExamSimulations(userA);
      assert.strictEqual(sims.length, 1);
      assert.strictEqual(sims[0].title, 'GATE CS Mock Exam');
      assert.strictEqual(sims[0].totalDurationMinutes, 180);

      // 4. DecisionEntries restored
      const decisions = db2.getDecisionEntries(userA);
      assert.strictEqual(decisions.length, 1);
      assert.strictEqual(decisions[0].title, 'Switching to Microservices Architecture');
      assert.strictEqual(decisions[0].confidenceScore, 8);

      // 5. DoomscrollLogs restored
      const logs = db2.getDoomscrollLogs(userA);
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].distractionApp, 'Social Feed');
      assert.strictEqual(logs[0].amountTaxed, 225);

      // 6. LifeMilestones restored
      const milestones = db2.getLifeMilestones(userA);
      assert.strictEqual(milestones.length, 1);
      assert.strictEqual(milestones[0].label, 'Learned Python Programming');

      // 7. TimeCapsules restored
      const capsules = db2.getTimeCapsules(userA);
      assert.strictEqual(capsules.length, 1);
      assert.strictEqual(capsules[0].title, 'Letter to my 30-year-old self');
      assert.strictEqual(capsules[0].isUnlocked, false);

      // 8. EmergencyProfile restored
      const prof = db2.getEmergencyProfile(userA);
      assert.ok(prof !== null);
      assert.strictEqual(prof.fullName, 'Dr. Jane Watson');
      assert.strictEqual(prof.bloodGroup, 'O+');
      assert.strictEqual(prof.emergencyContacts?.length, 1);
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & ID Squatting / Tampering Prevention
  // =========================================================================
  describe('2. Multi-Tenant User Isolation & ID Tampering Prevention', () => {
    const testDir = path.join(os.tmpdir(), `ff_test_iso_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

    before(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    after(() => {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
    });

    it('prevents user B from reading or overwriting user A records (ID squatting protection)', () => {
      const db = new DatabaseService(testDir);
      const userA = 'usr_tenant_alice';
      const userB = 'usr_tenant_bob';

      // Alice creates a skill node with ID "shared_node_id"
      db.saveSkillNode({
        id: 'shared_node_id',
        userId: userA,
        trackId: 'track_1',
        title: "Alice's Secret Skill",
        description: 'Top secret',
        tier: 1,
        prerequisites: [],
        status: 'available',
        category: 'CS',
        xpPoints: 10,
      });

      // Bob cannot see Alice's skill node
      const bobNodes = db.getSkillNodes(userB);
      assert.strictEqual(bobNodes.length, 0, 'Bob must not see Alice skill node');

      // Bob attempts to overwrite Alice's skill node by reusing the ID
      assert.throws(
        () => {
          db.saveSkillNode({
            id: 'shared_node_id',
            userId: userB,
            trackId: 'track_1',
            title: "Bob's Malicious Overwrite",
            description: 'Compromised',
            tier: 1,
            prerequisites: [],
            status: 'available',
            category: 'CS',
            xpPoints: 10,
          });
        },
        /Forbidden: Cannot overwrite a skill node owned by another user/,
        'Overwriting another user record must throw forbidden error'
      );

      // Alice's skill node remains unchanged
      const aliceNodes = db.getSkillNodes(userA);
      assert.strictEqual(aliceNodes[0].title, "Alice's Secret Skill");

      // Exam simulation isolation
      db.saveExamSimulation({
        id: 'exam_alice_1',
        userId: userA,
        title: 'Alice Private Exam',
        totalDurationMinutes: 60,
        sections: [],
        currentSectionIndex: 0,
        status: 'idle',
        sectionElapsedSeconds: {},
        totalElapsedSeconds: 0,
      });

      const bobSims = db.getExamSimulations(userB);
      assert.strictEqual(bobSims.length, 0, 'Bob must not see Alice exam simulations');
    });
  });

  // =========================================================================
  // 3. Multi-Instance Shared Production Persistence (V18StorageService)
  // =========================================================================
  describe('3. Multi-Instance Shared Production Persistence (V18StorageService)', () => {
    it('allows different server instances to access and mutate the same production storage', async () => {
      const mockSharedFirestore = new MockFirestore();
      const serverInstance1 = new V18StorageService(mockSharedFirestore);
      const serverInstance2 = new V18StorageService(mockSharedFirestore);

      const userId = 'usr_prod_user_42';

      // Instance 1 creates a Decision Journal record
      const savedDec = await serverInstance1.saveDecisionEntry(userId, {
        id: 'dec_cluster_1',
        userId,
        title: 'Shared Cluster Decision',
        category: 'financial',
        rationale: 'High availability requirement',
        expectedOutcome: 'Zero downtime',
        confidenceScore: 9,
        expectedReviewDate: '2026-12-31',
        reviewIntervalDays: 30,
        status: 'pending_review',
        createdAt: new Date().toISOString(),
      });

      assert.strictEqual(savedDec.id, 'dec_cluster_1');

      // Instance 2 reads it back immediately from shared storage
      const readBack = await serverInstance2.getDecisionEntries(userId);
      assert.strictEqual(readBack.length, 1);
      assert.strictEqual(readBack[0].title, 'Shared Cluster Decision');
      assert.strictEqual(readBack[0].confidenceScore, 9);

      // Instance 2 saves an Exam Simulation
      await serverInstance2.saveExamSimulation(userId, {
        id: 'sim_cluster_1',
        userId,
        title: 'Multi-Tenant Exam',
        totalDurationMinutes: 120,
        sections: [],
        currentSectionIndex: 0,
        status: 'running',
        sectionElapsedSeconds: {},
        totalElapsedSeconds: 60,
      });

      // Instance 1 reads back the Exam Simulation
      const sims = await serverInstance1.getExamSimulations(userId);
      assert.strictEqual(sims.length, 1);
      assert.strictEqual(sims[0].title, 'Multi-Tenant Exam');
    });

    it('enforces owner-only authorization and rejects cross-user overwrite in V18StorageService', async () => {
      const mockSharedFirestore = new MockFirestore();
      const storageService = new V18StorageService(mockSharedFirestore);

      const userA = 'usr_owner_alice';
      const userB = 'usr_intruder_bob';

      // Alice saves a Time Capsule
      await storageService.saveTimeCapsule(userA, {
        id: 'capsule_alpha',
        userId: userA,
        title: "Alice's Secret Capsule",
        content: 'Confidential thoughts',
        unlockDate: '2028-01-01',
        isUnlocked: false,
        createdAt: new Date().toISOString(),
      });

      // Bob attempts to overwrite Alice's capsule with same ID
      await assert.rejects(
        async () => {
          await storageService.saveTimeCapsule(userB, {
            id: 'capsule_alpha',
            userId: userB,
            title: "Bob's Malicious Capsule",
            content: 'Attacker payload',
            unlockDate: '2028-01-01',
            isUnlocked: false,
            createdAt: new Date().toISOString(),
          });
        },
        StorageOwnershipError,
        'Cross-user overwrite must reject with StorageOwnershipError'
      );
    });
  });

  // =========================================================================
  // 4. Safe Idempotent Migration
  // =========================================================================
  describe('4. Safe Idempotent Data Migration', () => {
    const tempDir = path.join(os.tmpdir(), `ff_test_mig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const sourceJson = path.join(tempDir, 'database.json');
    const quarantineJson = path.join(tempDir, 'quarantine.json');

    before(() => {
      fs.mkdirSync(tempDir, { recursive: true });
    });

    after(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('migrates valid owned records, quarantines ambiguous records, and is safe to rerun', async () => {
      const mockFirestore = new MockFirestore();

      // Create initial legacy JSON containing:
      // - 1 valid owned skill node
      // - 1 valid owned doomscroll log
      // - 1 unowned skill node (missing userId) -> must be quarantined
      // - 1 ambiguous record (missing id) -> must be quarantined
      const mockJsonContent = {
        skillNodes: [
          {
            id: 'sn_mig_1',
            userId: 'usr_valid_mig_1',
            trackId: 'default',
            title: 'Valid Migrated Skill',
            tier: 1,
            xpPoints: 20,
          },
          {
            id: 'sn_unowned_1',
            // missing userId
            trackId: 'default',
            title: 'Orphaned Skill Node',
            tier: 1,
            xpPoints: 10,
          },
        ],
        doomscrollLogs: [
          {
            id: 'tax_mig_1',
            userId: 'usr_valid_mig_1',
            minutes: 30,
            distractionApp: 'Reels',
            ratePerHour: 100,
            amountTaxed: 50,
            currency: '₹',
            createdAt: '2026-11-20T10:00:00Z',
          },
        ],
        timeCapsules: [
          {
            // missing id
            userId: 'usr_valid_mig_1',
            title: 'Missing ID Capsule',
            content: 'No ID',
            unlockDate: '2027-01-01',
          },
        ],
      };

      fs.writeFileSync(sourceJson, JSON.stringify(mockJsonContent, null, 2), 'utf8');

      // Run migration First Pass
      const summary1 = await migrateV18JsonToFirestore({
        sourceJsonPath: sourceJson,
        quarantineOutputPath: quarantineJson,
        firestoreOverride: mockFirestore,
      });

      assert.strictEqual(summary1.totalRecordsFound, 4);
      assert.strictEqual(summary1.migratedCount, 2, '2 valid owned records must be migrated');
      assert.strictEqual(summary1.quarantinedCount, 2, '2 unowned/ambiguous records must be quarantined');
      assert.strictEqual(summary1.skippedExistingCount, 0);

      // Verify that quarantine file exists and contains the unowned records
      assert.ok(fs.existsSync(quarantineJson), 'Quarantine report file must be created');
      const qRecords = JSON.parse(fs.readFileSync(quarantineJson, 'utf8'));
      assert.strictEqual(qRecords.length, 2);
      assert.strictEqual(qRecords[0].reason, 'MISSING_OR_AMBIGUOUS_USER_ID');
      assert.strictEqual(qRecords[1].reason, 'MISSING_RECORD_ID');

      // Verify that source database.json remains completely intact
      const rawOriginal = fs.readFileSync(sourceJson, 'utf8');
      assert.ok(rawOriginal.includes('Valid Migrated Skill'));
      assert.ok(rawOriginal.includes('Orphaned Skill Node'));

      // Run migration Second Pass (Idempotency verification)
      const summary2 = await migrateV18JsonToFirestore({
        sourceJsonPath: sourceJson,
        quarantineOutputPath: quarantineJson,
        firestoreOverride: mockFirestore,
      });

      assert.strictEqual(summary2.migratedCount, 0, 'Second run must not re-write or duplicate existing records');
      assert.strictEqual(summary2.skippedExistingCount, 2, '2 previously migrated records must be safely skipped');
      assert.strictEqual(summary2.quarantinedCount, 2);
    });
  });

  // =========================================================================
  // 5. API Endpoints Authenticated Routing & Truthful Errors
  // =========================================================================
  describe('5. API Routes Authorization, Persistence & Truthful Error Responses', () => {
    const userA = `usr_api_test_a_${Date.now()}`;
    const tokenA = createAuthJwt(userA);

    it('GET /api/life-milestones and POST /api/life-milestones persist with user context', async () => {
      // Create life milestone
      const postRes = await fetch(`${baseUrl}/api/life-milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          age: 26,
          label: 'Mastered Full-Stack Cloud Architecture',
          category: 'career',
        }),
      });

      assert.strictEqual(postRes.status, 201);
      const created = await postRes.json();
      assert.strictEqual(created.label, 'Mastered Full-Stack Cloud Architecture');
      assert.strictEqual(created.age, 26);

      // Read back
      const getRes = await fetch(`${baseUrl}/api/life-milestones`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(getRes.status, 200);
      const list = await getRes.json();
      assert.ok(Array.isArray(list));
      assert.ok(list.some((m: any) => m.label === 'Mastered Full-Stack Cloud Architecture'));
    });

    it('POST /api/skill-nodes returns 400 for empty or invalid title', async () => {
      const res = await fetch(`${baseUrl}/api/skill-nodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          title: '   ', // whitespace only
          category: 'CS',
        }),
      });
      assert.strictEqual(res.status, 400);
      const err = await res.json();
      assert.ok(err.error.includes('title is required'));
    });

    it('POST /api/whiteboard returns 400 for invalid dataUrl format', async () => {
      const res = await fetch(`${baseUrl}/api/whiteboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          dataUrl: 'http://malicious-external-site.com/evil.png',
        }),
      });
      assert.strictEqual(res.status, 400);
      const err = await res.json();
      assert.strictEqual(err.code, 'INVALID_PAYLOAD');
    });

    it('POST /api/emergency-profile creates and retrieves user-specific profile with truthful data', async () => {
      const postRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          fullName: 'Alice Walker',
          bloodGroup: 'B+',
          primaryHospital: 'St. Jude Hospital',
          accounts: [],
          policies: [],
          emergencyContacts: [{ id: 'ec-1', name: 'Bob Walker', phone: '1234567890', relationship: 'Brother' }],
        }),
      });
      assert.strictEqual(postRes.status, 201);

      const getRes = await fetch(`${baseUrl}/api/emergency-profile`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(getRes.status, 200);
      const profile = await getRes.json();
      assert.strictEqual(profile.fullName, 'Alice Walker');
      assert.strictEqual(profile.bloodGroup, 'B+');
      assert.strictEqual(profile.primaryHospital, 'St. Jude Hospital');
    });
  });
});
