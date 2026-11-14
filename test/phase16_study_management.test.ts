import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeStudyPlanAnalytics,
  computeStudyGoalProgress,
  computeStudyExamReadiness,
  searchStudyWorkspace,
  validateStudyExportPayload,
  processRevisionRecall,
} from '../src/lib/studyIntelligence.ts';
import {
  StudyGoal,
  StudyPlan,
  StudyPlanTask,
  StudyExam,
  StudyNote,
  StudyResource,
  StudyFlashcard,
  StudyQuiz,
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyExportPayload,
} from '../src/types/study.ts';
import { FocusSession } from '../src/types/index.ts';

test('Phase 16 — Firestore Security Rules for New Study Collections', () => {
  const rulesPath = path.resolve('firestore.rules');
  const rulesSource = fs.readFileSync(rulesPath, 'utf8');

  const requiredCollections = [
    'study_goals',
    'study_plans',
    'study_plan_tasks',
    'study_resources',
    'study_exams',
    'study_notes',
    'study_activity_logs',
    'study_flashcards',
    'study_quizzes',
  ];

  for (const col of requiredCollections) {
    const matchRegex = new RegExp(`match\\s*\\/${col}\\/\\{`);
    assert.match(
      rulesSource,
      matchRegex,
      `firestore.rules must secure collection /users/{userId}/${col}`
    );
  }

  // Enforce append-only on study_activity_logs
  assert.match(
    rulesSource,
    /match\s*\/study_activity_logs\/\{logId\}\s*\{[\s\S]*?allow\s+update:\s*if\s+false;/,
    'study_activity_logs must disallow updates (append-only)'
  );
  assert.match(
    rulesSource,
    /match\s*\/study_activity_logs\/\{logId\}\s*\{[\s\S]*?allow\s+delete:\s*if\s+false;/,
    'study_activity_logs must disallow deletion (immutable audit log)'
  );

  // Enforce owner check on study_goals and study_plans
  assert.match(
    rulesSource,
    /match\s*\/study_goals\/\{goalId\}\s*\{[\s\S]*?isOwner\(userId\)/,
    'study_goals must verify isOwner(userId)'
  );
  assert.match(
    rulesSource,
    /match\s*\/study_plans\/\{planId\}\s*\{[\s\S]*?isOwner\(userId\)/,
    'study_plans must verify isOwner(userId)'
  );
});

test('Phase 16 — Study Plan Analytics (computeStudyPlanAnalytics)', () => {
  const sampleTasks: StudyPlanTask[] = [
    {
      id: 't1',
      userId: 'u1',
      planId: 'p1',
      subjectId: 'DBMS',
      topicId: 'top1',
      title: 'B-Tree Indexing Exercises',
      description: '',
      scheduledDate: '2026-11-15',
      startTime: '10:00',
      endTime: '11:00',
      estimatedMinutes: 60,
      actualMinutes: 50,
      priority: 'high',
      status: 'completed',
      completedAt: '2026-11-15T11:00:00Z',
      createdAt: '2026-11-15T09:00:00Z',
      updatedAt: '2026-11-15T11:00:00Z',
      deletedAt: null,
    },
    {
      id: 't2',
      userId: 'u1',
      planId: 'p1',
      subjectId: 'DBMS',
      topicId: 'top2',
      title: 'Query Optimization Practice',
      description: '',
      scheduledDate: '2026-11-15',
      startTime: '14:00',
      endTime: '15:00',
      estimatedMinutes: 60,
      actualMinutes: 0,
      priority: 'medium',
      status: 'pending',
      completedAt: null,
      createdAt: '2026-11-15T09:00:00Z',
      updatedAt: '2026-11-15T09:00:00Z',
      deletedAt: null,
    },
  ];

  const focusSessions: FocusSession[] = [
    {
      id: 'fs1',
      userId: 'u1',
      mode: 'work',
      durationMinutes: 55,
      durationSeconds: 3300,
      completed: true,
      subjectCode: 'DBMS',
      createdAt: '2026-11-15T10:00:00Z',
    },
  ];

  const analytics = computeStudyPlanAnalytics(sampleTasks, focusSessions);

  assert.equal(analytics.totalPlannedMinutes, 120, 'Total planned minutes must sum active tasks');
  assert.equal(analytics.completedTasksCount, 1, 'Completed task count must match');
  assert.equal(analytics.pendingTasksCount, 1, 'Pending task count must match');
  assert.ok(analytics.totalActualMinutes >= 55, 'Actual minutes must leverage FocusSessions');
  assert.ok(analytics.adherencePercentage > 0, 'Adherence percentage must be calculated');
});

test('Phase 16 — Study Goal Progress (computeStudyGoalProgress)', () => {
  const goalWithMilestones: StudyGoal = {
    id: 'g1',
    userId: 'u1',
    title: 'Complete 50 DBMS PYQs',
    description: '',
    goalType: 'monthly',
    subjectId: 'DBMS',
    subjectCode: 'DBMS',
    targetValue: 50,
    currentValue: 25,
    unit: 'questions',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    status: 'active',
    priority: 'high',
    milestones: [
      { id: 'm1', title: 'First 10 Questions', targetValue: 10, completed: true },
      { id: 'm2', title: 'Next 20 Questions', targetValue: 30, completed: true },
      { id: 'm3', title: 'Final 20 Questions', targetValue: 50, completed: false },
    ],
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
    deletedAt: null,
  };

  const progress = computeStudyGoalProgress(goalWithMilestones);
  assert.equal(progress.percentage, 50, 'Current vs target value: 25 / 50 = 50%');
  assert.equal(progress.milestonesDone, 2, 'Two milestones completed');
  assert.equal(progress.milestonesTotal, 3, 'Total of 3 milestones');
  assert.equal(progress.isComplete, false, 'Goal is not complete yet');

  // Milestone fallback progress when currentValue is 0
  const milestoneGoal: StudyGoal = {
    ...goalWithMilestones,
    currentValue: 0,
  };
  const milestoneProgress = computeStudyGoalProgress(milestoneGoal);
  assert.equal(milestoneProgress.percentage, 67, '2 of 3 milestones = 67%');
});

test('Phase 16 — Exam Readiness Diagnostics (computeStudyExamReadiness)', () => {
  const topics: StudyTopic[] = [
    {
      id: 'top1',
      userId: 'u1',
      subjectCode: 'OS',
      unit: 'Unit 1',
      topic: 'Process Management',
      subtopic: 'CPU Scheduling Algorithms',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: true,
      revisionCount: 2,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'top2',
      userId: 'u1',
      subjectCode: 'OS',
      unit: 'Unit 2',
      topic: 'Deadlocks',
      subtopic: 'Bankers Algorithm',
      priority: 'High',
      theory: true,
      practice: false,
      pyq: false,
      revisionCount: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const exam: StudyExam = {
    id: 'ex1',
    userId: 'u1',
    title: 'Operating Systems Midterm',
    examType: 'Midterm',
    subjectIds: ['OS'],
    syllabusTopicIds: ['top1', 'top2'],
    examDate: '2026-11-25',
    startTime: '10:00',
    durationMinutes: 120,
    totalMarks: 50,
    obtainedMarks: null,
    preparationStatus: 'preparing',
    resultStatus: 'pending',
    notes: 'Covers Unit 1 and Unit 2',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt: null,
  };

  const readiness = computeStudyExamReadiness(exam, topics);
  assert.equal(readiness.totalSyllabusTopicsCount, 2, '2 topics in syllabus');
  assert.equal(readiness.coveredTopicsCount, 1, 'Only 1 topic has theory and practice done');
  assert.equal(readiness.readinessPct, 50, '1/2 topics = 50% readiness');
  assert.ok(typeof readiness.daysRemaining === 'number', 'Days remaining must be a valid integer');
});

test('Phase 16 — Universal Study Workspace Search (searchStudyWorkspace)', () => {
  const workspace = {
    subjects: [
      {
        id: 's1',
        userId: 'u1',
        code: 'CN',
        name: 'Computer Networks',
        tierId: 'tier1_sem3',
        totalSubtopics: 10,
        completedSubtopics: 4,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ],
    topics: [
      {
        id: 't1',
        userId: 'u1',
        subjectCode: 'CN',
        unit: 'Unit 3',
        topic: 'Network Layer',
        subtopic: 'Dijkstra Shortest Path Routing',
        priority: 'High' as const,
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 1,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ],
    notes: [
      {
        id: 'n1',
        userId: 'u1',
        subjectId: 'CN',
        topicId: 't1',
        title: 'Dijkstra Time Complexity Cheat Sheet',
        content: 'Fibonacci heap gives O(V log V + E)',
        tags: ['algorithms', 'routing'],
        isPinned: true,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        deletedAt: null,
      },
    ],
    resources: [
      {
        id: 'r1',
        userId: 'u1',
        subjectId: 'CN',
        topicId: 't1',
        title: 'Stanford CS144 Lecture Slides',
        description: 'Packet switching and routing overview',
        resourceType: 'pdf' as const,
        url: 'https://cs144.stanford.edu/slides.pdf',
        storagePath: null,
        tags: ['slides', 'networking'],
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        deletedAt: null,
      },
    ],
    exams: [
      {
        id: 'e1',
        userId: 'u1',
        subjectIds: ['CN'],
        syllabusTopicIds: ['t1'],
        title: 'GATE Computer Networks Sectional',
        examType: 'Mock',
        examDate: '2026-12-01',
        startTime: null,
        durationMinutes: 90,
        totalMarks: 30,
        obtainedMarks: null,
        preparationStatus: 'preparing' as const,
        resultStatus: 'pending' as const,
        notes: '',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        deletedAt: null,
      },
    ],
    plans: [],
    flashcards: [
      {
        id: 'fc1',
        userId: 'u1',
        subjectId: 'CN',
        topicId: 't1',
        question: 'What is the time complexity of Dijkstra with a binary heap?',
        answer: 'O((V + E) log V)',
        difficulty: 'medium' as const,
        reviewCount: 2,
        lastReviewedAt: null,
        nextReviewAt: '2026-11-16',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        deletedAt: null,
      },
    ],
  };

  // Search by query "Dijkstra"
  const dijkstraMatches = searchStudyWorkspace('Dijkstra', workspace);
  assert.ok(dijkstraMatches.length >= 3, 'Should match across topic, note, and flashcard');
  assert.ok(dijkstraMatches.some((m) => m.type === 'topic'));
  assert.ok(dijkstraMatches.some((m) => m.type === 'note'));
  assert.ok(dijkstraMatches.some((m) => m.type === 'flashcard'));

  // Search by query "Stanford"
  const resourceMatches = searchStudyWorkspace('Stanford', workspace);
  assert.equal(resourceMatches.length, 1);
  assert.equal(resourceMatches[0].type, 'resource');

  // Search empty query returns empty list
  assert.deepEqual(searchStudyWorkspace('', workspace), []);
});

test('Phase 16 — Study Data Export & Restore Schema Validation (validateStudyExportPayload)', () => {
  const validPayload: StudyExportPayload = {
    version: 1,
    exportedAt: '2026-11-15T00:00:00Z',
    userId: 'usr_test_123',
    subjects: [],
    topics: [],
    revisions: [],
    mistakes: [],
    goals: [],
    plans: [],
    planTasks: [],
    resources: [],
    exams: [],
    notes: [],
    flashcards: [],
    quizzes: [],
  };

  const parsed = validateStudyExportPayload(validPayload);
  assert.notEqual(parsed, null, 'Valid payload should parse cleanly');
  assert.equal(parsed?.userId, 'usr_test_123');
  assert.equal(parsed?.version, 1);

  // Invalid payload checks
  assert.equal(validateStudyExportPayload(null), null, 'Null payload rejected');
  assert.equal(validateStudyExportPayload({}), null, 'Missing version/userId rejected');
  assert.equal(validateStudyExportPayload({ version: 'one', userId: 'u1' }), null, 'Wrong version type rejected');
});

test('Phase 16 — Spaced Repetition Recall Ladder Updates', () => {
  const initialRevision: StudyRevision = {
    id: 'rev_test_1',
    userId: 'u1',
    topicId: 't1',
    subjectCode: 'DBMS',
    topicTitle: 'B-Tree Splitting Algorithm',
    lastStudiedAt: '2026-11-15',
    nextRevisionAt: '2026-11-16',
    intervalDays: 1,
    repetition: 0,
    difficulty: 'medium',
    status: 'scheduled',
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
  };

  // Recall feedback 'easy' advances ladder faster
  const easyStep = processRevisionRecall(initialRevision, 'easy', '2026-11-15');
  assert.equal(easyStep.intervalDays, 7, 'Easy feedback jumps ladder steps');
  assert.equal(easyStep.repetition, 1);

  // Recall feedback 'hard' drops back to minimum interval
  const hardStep = processRevisionRecall(easyStep, 'hard', '2026-11-15');
  assert.equal(hardStep.intervalDays, 3, 'Hard feedback steps down interval');
});

test('Phase 16 — StudyView Sub-tab Architecture & Component Wiring', () => {
  const studyViewPath = path.resolve('src/components/study/StudyView.tsx');
  const studyViewSource = fs.readFileSync(studyViewPath, 'utf8');

  // Verify all 13 subtabs exist in StudySubTab union
  const subtabs = [
    'syllabus',
    'plans',
    'goals',
    'exams',
    'revisions',
    'flashcards',
    'notes',
    'resources',
    'quizzes',
    'mistakes',
    'habits',
    'analytics',
    'activity',
  ];

  for (const tab of subtabs) {
    const matchRegex = new RegExp(`'${tab}'`);
    assert.match(studyViewSource, matchRegex, `StudyView must support subtab: ${tab}`);
  }

  // Verify all Phase 16 dedicated subcomponents are mounted
  assert.match(studyViewSource, /<StudyPlansTab/, 'StudyView must render StudyPlansTab');
  assert.match(studyViewSource, /<StudyGoalsTab/, 'StudyView must render StudyGoalsTab');
  assert.match(studyViewSource, /<StudyExamsTab/, 'StudyView must render StudyExamsTab');
  assert.match(studyViewSource, /<StudyFlashcardsTab/, 'StudyView must render StudyFlashcardsTab');
  assert.match(studyViewSource, /<StudyNotesTab/, 'StudyView must render StudyNotesTab');
  assert.match(studyViewSource, /<StudyResourcesTab/, 'StudyView must render StudyResourcesTab');
  assert.match(studyViewSource, /<StudyQuizzesTab/, 'StudyView must render StudyQuizzesTab');
  assert.match(studyViewSource, /<StudyActivityTab/, 'StudyView must render StudyActivityTab');

  // Verify modals are mounted
  assert.match(studyViewSource, /<AddStudyGoalModal/, 'StudyView must mount AddStudyGoalModal');
  assert.match(studyViewSource, /<AddStudyPlanModal/, 'StudyView must mount AddStudyPlanModal');
  assert.match(studyViewSource, /<AddStudyExamModal/, 'StudyView must mount AddStudyExamModal');
  assert.match(studyViewSource, /<AddStudyNoteModal/, 'StudyView must mount AddStudyNoteModal');
  assert.match(studyViewSource, /<AddStudyResourceModal/, 'StudyView must mount AddStudyResourceModal');
  assert.match(studyViewSource, /<AddStudyFlashcardModal/, 'StudyView must mount AddStudyFlashcardModal');
  assert.match(studyViewSource, /<TakeStudyQuizModal/, 'StudyView must mount TakeStudyQuizModal');
  assert.match(studyViewSource, /<ExportRestoreStudyModal/, 'StudyView must mount ExportRestoreStudyModal');
});

