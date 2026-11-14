import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ACADEMIC_TIERS,
  DEFAULT_STUDY_SUBJECTS,
  buildDefaultStudyWorkspace,
} from '../src/data/studySeedData.ts';
import {
  REVISION_INTERVAL_LADDER,
  calculateNextRevisionDate,
  processRevisionRecall,
  categorizeRevisions,
  computeStudyProgressSummary,
} from '../src/lib/studyIntelligence.ts';
import {
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyMistake,
} from '../src/types/study.ts';
import { dbService } from '../server/db.ts';

test('Phase 7 — Academic Tiers & Seed Data Integrity', () => {
  assert.equal(DEFAULT_ACADEMIC_TIERS.length, 3, 'Should have exactly 3 academic tiers');
  const tierIds = DEFAULT_ACADEMIC_TIERS.map((t) => t.id);
  assert.ok(tierIds.includes('tier1_sem3'));
  assert.ok(tierIds.includes('tier2_placements'));
  assert.ok(tierIds.includes('tier3_gate'));

  assert.ok(DEFAULT_STUDY_SUBJECTS.length >= 5, 'Should have at least 5 default core subjects');
  const subCodes = DEFAULT_STUDY_SUBJECTS.map((s) => s.code);
  assert.ok(subCodes.includes('Sub_DBMS'));
  assert.ok(subCodes.includes('Sub_OS'));
  assert.ok(subCodes.includes('Sub_COA'));
  assert.ok(subCodes.includes('Sub_DSA'));
  assert.ok(subCodes.includes('Sub_TOC'));

  const testUser = 'user_test_academic_seed';
  const seed = buildDefaultStudyWorkspace(testUser);
  assert.ok(seed.subjects.length >= 5);
  assert.ok(seed.topics.length >= 25);
  assert.ok(seed.revisions.length >= 2);
  assert.ok(seed.mistakes.length >= 2);

  // Every generated topic & subject must belong to testUser
  for (const s of seed.subjects) {
    assert.equal(s.userId, testUser);
    assert.ok(s.code);
  }
  for (const t of seed.topics) {
    assert.equal(t.userId, testUser);
    assert.ok(t.subjectCode);
  }
});

test('Phase 7 — Ebbinghaus Spaced Repetition Math & Ladder Progression', () => {
  assert.deepEqual(
    REVISION_INTERVAL_LADDER,
    [1, 3, 7, 14, 30, 60],
    'Interval ladder must strictly adhere to cognitive retention curve'
  );

  // Interval arithmetic
  const nextDate = calculateNextRevisionDate('2026-11-14', 7);
  assert.equal(nextDate, '2026-11-21');

  const baseRev: StudyRevision = {
    id: 'rev_ebbinghaus_test',
    userId: 'user_ebbinghaus',
    topicId: 'topic_1',
    subjectCode: 'Sub_DBMS',
    topicTitle: 'B+ Tree Splitting',
    lastStudiedAt: '2026-11-14',
    nextRevisionAt: '2026-11-15',
    intervalDays: 1,
    repetition: 1,
    difficulty: 'medium',
    status: 'due',
    createdAt: '2026-11-14T10:00:00Z',
    updatedAt: '2026-11-14T10:00:00Z',
  };

  // Medium recall: advances 1 step (1d -> 3d)
  const medStep = processRevisionRecall(baseRev, 'medium', '2026-11-15');
  assert.equal(medStep.intervalDays, 3);
  assert.equal(medStep.repetition, 2);
  assert.equal(medStep.status, 'scheduled');
  assert.equal(medStep.nextRevisionAt, '2026-11-18');

  // Hard recall on 3d: regresses 1 step back to 1d
  const hardStep = processRevisionRecall(medStep, 'hard', '2026-11-18');
  assert.equal(hardStep.intervalDays, 1);
  assert.equal(hardStep.repetition, 3);
  assert.equal(hardStep.nextRevisionAt, '2026-11-19');

  // Easy recall: jumps 2 steps (1d -> 7d)
  const easyStep = processRevisionRecall(baseRev, 'easy', '2026-11-15');
  assert.equal(easyStep.intervalDays, 7);
  assert.equal(easyStep.repetition, 2);
  assert.equal(easyStep.nextRevisionAt, '2026-11-22');

  // Easy recall at 30d leaps to 60d and marks as mastered
  const highRev: StudyRevision = {
    ...baseRev,
    intervalDays: 30,
    repetition: 5,
  };
  const masteredStep = processRevisionRecall(highRev, 'easy', '2026-11-15');
  assert.equal(masteredStep.intervalDays, 60);
  assert.equal(masteredStep.status, 'mastered');
});

test('Phase 7 — Revision Categorization: Overdue, Due Today, Upcoming, Mastered', () => {
  const todayStr = '2026-11-14';

  const revs: StudyRevision[] = [
    {
      id: 'rev_overdue',
      userId: 'user_1',
      topicId: 't1',
      subjectCode: 'Sub_DBMS',
      topicTitle: 'Topic 1',
      lastStudiedAt: '2026-11-01',
      nextRevisionAt: '2026-11-10', // Before today
      intervalDays: 7,
      repetition: 2,
      difficulty: 'medium',
      status: 'scheduled',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'rev_due_today',
      userId: 'user_1',
      topicId: 't2',
      subjectCode: 'Sub_OS',
      topicTitle: 'Topic 2',
      lastStudiedAt: '2026-11-13',
      nextRevisionAt: '2026-11-14', // Today
      intervalDays: 1,
      repetition: 1,
      difficulty: 'medium',
      status: 'due',
      createdAt: '2026-11-13T00:00:00Z',
      updatedAt: '2026-11-13T00:00:00Z',
    },
    {
      id: 'rev_upcoming',
      userId: 'user_1',
      topicId: 't3',
      subjectCode: 'Sub_COA',
      topicTitle: 'Topic 3',
      lastStudiedAt: '2026-11-14',
      nextRevisionAt: '2026-11-20', // Future
      intervalDays: 6,
      repetition: 1,
      difficulty: 'medium',
      status: 'scheduled',
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 'rev_mastered',
      userId: 'user_1',
      topicId: 't4',
      subjectCode: 'Sub_DSA',
      topicTitle: 'Topic 4',
      lastStudiedAt: '2026-11-14',
      nextRevisionAt: '2027-01-01',
      intervalDays: 60,
      repetition: 6,
      difficulty: 'easy',
      status: 'mastered',
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 'rev_deleted',
      userId: 'user_1',
      topicId: 't5',
      subjectCode: 'Sub_TOC',
      topicTitle: 'Topic 5',
      lastStudiedAt: '2026-11-10',
      nextRevisionAt: '2026-11-12',
      intervalDays: 1,
      repetition: 1,
      difficulty: 'hard',
      status: 'overdue',
      deletedAt: '2026-11-13T00:00:00Z', // Deleted
      createdAt: '2026-11-10T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z',
    },
  ];

  const cat = categorizeRevisions(revs, todayStr);
  assert.equal(cat.overdue.length, 1);
  assert.equal(cat.overdue[0].id, 'rev_overdue');
  assert.equal(cat.dueToday.length, 1);
  assert.equal(cat.dueToday[0].id, 'rev_due_today');
  assert.equal(cat.upcoming.length, 1);
  assert.equal(cat.upcoming[0].id, 'rev_upcoming');
  assert.equal(cat.mastered.length, 1);
  assert.equal(cat.mastered[0].id, 'rev_mastered');
});

test('Phase 7 — Study Progress Summary Deterministic Accuracy', () => {
  const subjects: StudySubject[] = [
    {
      id: 's1',
      userId: 'u1',
      code: 'Sub_DBMS',
      name: 'DBMS',
      tierId: 'tier1_sem3',
      totalSubtopics: 4,
      completedSubtopics: 2,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
  ];

  const topics: StudyTopic[] = [
    {
      id: 't1',
      userId: 'u1',
      subjectCode: 'Sub_DBMS',
      unit: 'Unit 1',
      topic: 'Indexing',
      subtopic: 'B Trees',
      priority: 'High',
      theory: true,
      practice: true, // Complete
      pyq: true,
      revisionCount: 2,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 't2',
      userId: 'u1',
      subjectCode: 'Sub_DBMS',
      unit: 'Unit 1',
      topic: 'Indexing',
      subtopic: 'B+ Trees',
      priority: 'High',
      theory: true,
      practice: false, // Incomplete
      pyq: false,
      revisionCount: 1,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 't3',
      userId: 'u1',
      subjectCode: 'Sub_DBMS',
      unit: 'Unit 2',
      topic: 'Transactions',
      subtopic: 'ACID Properties',
      priority: 'Medium',
      theory: false,
      practice: false,
      pyq: false,
      revisionCount: 0,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 't4',
      userId: 'u1',
      subjectCode: 'Sub_DBMS',
      unit: 'Unit 2',
      topic: 'Transactions',
      subtopic: 'Serializability',
      priority: 'High',
      theory: true,
      practice: true, // Complete
      pyq: true,
      revisionCount: 1,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
  ];

  const mistakes: StudyMistake[] = [
    {
      id: 'm1',
      userId: 'u1',
      date: '2026-11-14',
      subjectCode: 'Sub_DBMS',
      topic: 'B+ Trees',
      source: 'Mock',
      severity: 'High',
      trap: 'Ignored child pointers',
      rootCause: 'Formula error',
      goldenRule: 'Check child pointers formula',
      resolved: false,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 'm2',
      userId: 'u1',
      date: '2026-11-14',
      subjectCode: 'Sub_DBMS',
      topic: 'ACID',
      source: 'Lab',
      severity: 'Medium',
      trap: 'Confused Isolation and Consistency',
      rootCause: 'Definition mixup',
      goldenRule: 'Isolation prevents concurrent interference',
      resolved: true,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
  ];

  const summary = computeStudyProgressSummary({
    subjects,
    topics,
    revisions: [],
    mistakes,
    todayStr: '2026-11-14',
  });

  assert.equal(summary.totalTopics, 4);
  assert.equal(summary.completedTopics, 2); // t1 and t4 have theory + practice
  assert.equal(summary.overallCompletionPct, 50); // 2/4 = 50%
  assert.equal(summary.theoryCompleted, 3); // t1, t2, t4
  assert.equal(summary.practiceCompleted, 2); // t1, t4
  assert.equal(summary.pyqCompleted, 2); // t1, t4
  assert.equal(summary.unresolvedMistakesCount, 1);
  assert.equal(summary.highSeverityMistakesCount, 1);
});

test('Phase 7 — Server DB Study Entity CRUD & User Isolation', () => {
  const ts = Date.now();
  const userIdA = `user_study_test_A_${ts}`;
  const userIdB = `user_study_test_B_${ts}`;

  // 1. Subjects
  const subA = dbService.saveStudySubject(userIdA, {
    code: 'Sub_Algorithms',
    name: 'Design and Analysis of Algorithms',
    tierId: 'tier2_placements',
    semesterOrDomain: 'Core',
    color: '#8b5cf6',
  });
  assert.ok(subA.id);
  assert.equal(subA.code, 'Sub_Algorithms');

  // Verify user B does not see user A's subject
  const subjectsB = dbService.getStudySubjects(userIdB);
  assert.ok(!subjectsB.some((s) => s.code === 'Sub_Algorithms'));

  // 2. Topics
  const topicA = dbService.saveStudyTopic(userIdA, {
    subjectCode: 'Sub_Algorithms',
    unit: 'Unit 3',
    topic: 'Dynamic Programming',
    subtopic: 'Matrix Chain Multiplication',
    priority: 'High',
    theory: true,
    practice: false,
    pyq: false,
    revisionCount: 0,
  });
  assert.ok(topicA.id);
  assert.equal(topicA.subtopic, 'Matrix Chain Multiplication');

  const topicsA = dbService.getStudyTopics(userIdA, 'Sub_Algorithms');
  assert.equal(topicsA.length, 1);
  assert.equal(topicsA[0].id, topicA.id);

  // 3. Revisions & Recall
  const revA = dbService.saveStudyRevision(userIdA, {
    topicId: topicA.id,
    subjectCode: 'Sub_Algorithms',
    topicTitle: topicA.subtopic,
    lastStudiedAt: '2026-11-14',
    nextRevisionAt: '2026-11-15',
    intervalDays: 1,
    repetition: 1,
    difficulty: 'medium',
    status: 'due',
  });
  assert.ok(revA.id);

  const updatedRev = dbService.recordStudyRecall(userIdA, revA.id, 'easy');
  assert.ok(updatedRev);
  assert.equal(updatedRev?.intervalDays, 7); // 1d leaped to 7d

  // 4. Mistakes
  const mistakeA = dbService.saveStudyMistake(userIdA, {
    date: '2026-11-14',
    subjectCode: 'Sub_Algorithms',
    topic: 'MCM Dimension Matching',
    source: 'Practice Contest',
    severity: 'High',
    trap: 'Multiplied matrices in wrong order',
    rootCause: 'Index boundary error in recurrence',
    goldenRule: 'Cost equation is m[i,k] + m[k+1,j] + p[i-1]*p[k]*p[j]',
    resolved: false,
  });
  assert.ok(mistakeA.id);
  assert.equal(mistakeA.severity, 'High');

  const mistakesA = dbService.getStudyMistakes(userIdA);
  assert.ok(mistakesA.some((m) => m.id === mistakeA.id));

  // 5. Soft-deletion
  const deletedRev = dbService.deleteStudyRevision(userIdA, revA.id);
  assert.ok(deletedRev);
  const activeRevs = dbService.getStudyRevisions(userIdA);
  assert.ok(!activeRevs.some((r) => r.id === revA.id));

  const deletedMistake = dbService.deleteStudyMistake(userIdA, mistakeA.id);
  assert.ok(deletedMistake);
  const activeMistakes = dbService.getStudyMistakes(userIdA);
  assert.ok(!activeMistakes.some((m) => m.id === mistakeA.id));
});
