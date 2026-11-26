import './test_bootstrap.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { syncStudyProgressFromTask } from '../src/lib/study/studyTaskIntegration.ts';
import { migrateV18JsonToFirestore } from '../server/migrateV18Data.ts';
import type { Task } from '../src/types/index.ts';
import type { StudySubject, StudyTopic } from '../src/types/study.ts';

describe('Study Task Sync, Emergency Profile & Productivity Bugfixes (7 bugs)', () => {
  it('1. syncStudyProgressFromTask never double-counts completedSubtopics when topicId and subtasks overlap', async () => {
    const topic: StudyTopic = {
      id: 'top_bt_1',
      userId: 'u1',
      subjectCode: 'CS301',
      unit: 'Unit 2',
      topic: 'Trees',
      subtopic: 'Binary Trees',
      theory: false,
      practice: false,
      pyq: false,
      revisionCount: 0,
      priority: 'High',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const subject: StudySubject = {
      id: 'sub_cs301',
      userId: 'u1',
      code: 'CS301',
      name: 'Algorithms',
      tierId: 'tier_1',
      semesterOrDomain: 'Sem 3',
      targetExam: 'GATE',
      totalSubtopics: 10,
      completedSubtopics: 2,
      color: '#38bdf8',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const task: Task = {
      id: 'task_bt',
      userId: 'u1',
      title: 'Finish Binary Trees',
      description: '',
      priority: 'high',
      status: 'completed',
      topicId: 'top_bt_1',
      subjectCode: 'CS301',
      subtasks: [
        { id: 'st_1', title: 'Binary Trees (Theory)', done: true },
        { id: 'st_2', title: 'Binary Trees (Practice)', done: true },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;

    let topicSaveCount = 0;
    let savedSubjectCompleted = -1;

    const result = await syncStudyProgressFromTask(
      task,
      [topic],
      [subject],
      async (updatedTopic) => {
        topicSaveCount += 1;
        return { ...topic, ...updatedTopic } as StudyTopic;
      },
      async (subUpdate) => {
        savedSubjectCompleted = Number(subUpdate.completedSubtopics);
        return { ...subject, ...subUpdate } as StudySubject;
      }
    );

    assert.equal(topicSaveCount, 1);
    assert.deepEqual(result.updatedTopicIds, ['top_bt_1']);
    assert.equal(result.totalSubtopicsCompletedDelta, 1);
    assert.equal(savedSubjectCompleted, 3);
  });

  it('2. EmergencyAssetSummary honors exportSections/exportMasked in print view and resets profile with seq cancellation on account switch', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/finance/EmergencyAssetSummary.tsx'),
      'utf8'
    );

    // Check section print toggles and masking
    assert.ok(src.includes("!exportSections.personalInfo ? 'print:hidden' : ''"));
    assert.ok(src.includes("!exportSections.contacts ? 'print:hidden' : ''"));
    assert.ok(src.includes("!exportSections.accounts ? 'print:hidden' : ''"));
    assert.ok(src.includes("!exportSections.policies ? 'print:hidden' : ''"));
    assert.ok(src.includes("!exportSections.documentNotes ? 'print:hidden' : ''"));
    assert.ok(src.includes("exportMasked ? maskReference(acc.maskedNumber) : acc.maskedNumber"));
    assert.ok(src.includes("exportMasked ? maskReference(p.policyNumber || '') : p.policyNumber || '—'"));

    // Check account switch reset and async sequence cancellation
    assert.ok(src.includes('loadSeqRef'));
    assert.ok(src.includes('setProfile(null);'));
    assert.ok(src.includes('if (seq !== loadSeqRef.current) return;'));
  });

  it('3. DoomscrollTaxJar refuses to clear jar when no savings goal exists or fetch fails, and syncs empty remote state', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/productivity/DoomscrollTaxJar.tsx'),
      'utf8'
    );

    // Must not unconditionally empty jar when !targetGoal
    assert.ok(src.includes('if (!targetGoal)'));
    assert.equal(src.includes('api.getSavingsGoals().catch(() => [])'), false);
    assert.equal(src.includes('isMounted && Array.isArray(remote) && remote.length > 0'), false);
    assert.ok(src.includes('if (isMounted && Array.isArray(remote))'));
  });

  it('4. TimeCapsuleView resets capsules & selectedCapsule immediately on storageKey switch and guards stale fetches', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/productivity/TimeCapsuleView.tsx'),
      'utf8'
    );

    assert.ok(src.includes('loadSeqRef'));
    assert.ok(src.includes('setSelectedCapsule(null);'));
    assert.ok(src.includes('if (seq !== loadSeqRef.current) return;'));
  });

  it('5. LifeInWeeksGrid avoids NaN stats on empty birthDate, avoids overwriting same-age milestones, and cancels stale fetches', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/productivity/LifeInWeeksGrid.tsx'),
      'utf8'
    );

    assert.ok(src.includes('Number.isFinite(birthMs)'));
    assert.ok(src.includes('new Map<number, LifeMilestone[]>()'));
    assert.ok(src.includes('usedWeeksInAge.has(weekOffset)'));
    assert.ok(src.includes('if (!isMounted) return;'));
  });

  it('6. DecisionJournal uses timezone-aware YYYY-MM-DD comparison for isDue and clears stale local cache when remote is []', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/productivity/DecisionJournal.tsx'),
      'utf8'
    );

    assert.ok(src.includes('entry.expectedReviewDate <= todayStr'));
    assert.equal(src.includes('new Date(entry.expectedReviewDate) <= new Date()'), false);
    assert.equal(src.includes('isMounted && Array.isArray(remote) && remote.length > 0'), false);
    assert.ok(src.includes('if (isMounted && Array.isArray(remote))'));
  });

  it('7. migrateV18JsonToFirestore writes emergency_profile with canonical id ep_${userId} under doc "default"', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-mig-ep-'));
    const jsonPath = path.join(tempDir, 'db.json');
    const quarantinePath = path.join(tempDir, 'q.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        emergencyAssetProfiles: [
          {
            id: 'ep_usr_mig_1',
            userId: 'usr_mig_1',
            fullName: 'Alice Test',
            accounts: [],
            policies: [],
            emergencyContacts: [],
            updatedAt: '2026-11-20T00:00:00.000Z',
          },
        ],
      }),
      'utf8'
    );

    const writes: Array<{ col: string; docId: string; payload: any }> = [];
    const mockFirestore = {
      collection: () => ({
        doc: () => ({
          collection: (col: string) => ({
            doc: (docId: string) => ({
              get: async () => ({ exists: false }),
              set: async (payload: any) => {
                writes.push({ col, docId, payload });
              },
            }),
          }),
        }),
      }),
    };

    try {
      const summary = await migrateV18JsonToFirestore({
        sourceJsonPath: jsonPath,
        quarantineOutputPath: quarantinePath,
        firestoreOverride: mockFirestore,
      });

      assert.equal(summary.migratedCount, 1);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].col, 'emergency_profile');
      assert.equal(writes[0].docId, 'default');
      assert.equal(writes[0].payload.id, 'ep_usr_mig_1');
      assert.equal(writes[0].payload.userId, 'usr_mig_1');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
