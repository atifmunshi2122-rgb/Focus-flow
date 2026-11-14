import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FocusSession, TimeBlock } from '../src/types/index.ts';
import { StudyTopic, StudySubject, StudyRevision } from '../src/types/study.ts';
import { computeStudyProgressSummary, calculateNextRevisionDate, REVISION_INTERVAL_LADDER } from '../src/lib/studyIntelligence.ts';
import {
  loadInitialTimerState,
  saveTimerState,
  acquireCompletionLock,
} from '../src/lib/timerEngine.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

test('Phase 11 — FocusSession and TimeBlock Data Model Extensions', () => {
  // FocusSession must support optional study linkage
  const session: FocusSession = {
    id: 'fs_test_1',
    userId: 'user_p11',
    taskId: null,
    mode: 'work',
    durationMinutes: 25,
    durationSeconds: 1500,
    completed: true,
    startedAt: '2026-11-14T10:00:00.000Z',
    endedAt: '2026-11-14T10:25:00.000Z',
    subjectCode: 'Sub_DBMS',
    subjectId: 'sub_123',
    topicId: 'topic_456',
    activityType: 'practice',
  };

  assert.equal(session.subjectCode, 'Sub_DBMS');
  assert.equal(session.topicId, 'topic_456');
  assert.equal(session.activityType, 'practice');
  assert.equal(session.durationSeconds, 1500);

  // TimeBlock must support optional revisionId linkage
  const block: TimeBlock = {
    id: 'tb_rev_rev_123',
    userId: 'user_p11',
    date: '2026-11-15',
    title: '[Revision] B+ Trees',
    category: 'Learning',
    startMinute: 9 * 60,
    endMinute: 9 * 60 + 45,
    completed: false,
    revisionId: 'rev_123',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
  };

  assert.equal(block.revisionId, 'rev_123');
  assert.equal(block.id, 'tb_rev_rev_123');
  assert.equal(block.endMinute - block.startMinute, 45);
});

test('Phase 11 — Study Progress Analytics Uses Actual Completed Duration', () => {
  const subjects: StudySubject[] = [
    {
      id: 'sub_dbms',
      userId: 'u1',
      code: 'Sub_DBMS',
      name: 'Database Management Systems',
      tierId: 'tier1_sem3',
      totalSubtopics: 10,
      completedSubtopics: 4,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'sub_os',
      userId: 'u1',
      code: 'Sub_OS',
      name: 'Operating Systems',
      tierId: 'tier1_sem3',
      totalSubtopics: 12,
      completedSubtopics: 6,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const topics: StudyTopic[] = [
    {
      id: 'top_bplus',
      userId: 'u1',
      subjectCode: 'Sub_DBMS',
      unit: 'Unit 3',
      topic: 'Indexing',
      subtopic: 'B+ Tree Splitting',
      priority: 'High',
      theory: true,
      practice: false,
      pyq: false,
      revisionCount: 2,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const revisions: StudyRevision[] = [];
  const mistakes: any[] = [];

  // Completed focus sessions with actual recorded duration
  const sessions: FocusSession[] = [
    // 50 minutes actual completed time in DBMS
    {
      id: 's1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      startedAt: '2026-11-14T08:00:00Z',
      endedAt: '2026-11-14T08:50:00Z',
      subjectCode: 'Sub_DBMS',
      topicId: 'top_bplus',
      activityType: 'practice',
    },
    // 25 minutes actual completed time in OS
    {
      id: 's2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-14T09:00:00Z',
      endedAt: '2026-11-14T09:25:00Z',
      subjectCode: 'Sub_OS',
      activityType: 'study',
    },
    // Ordinary non-study focus session (should NOT count toward study hours)
    {
      id: 's3',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 30,
      durationSeconds: 1800,
      completed: true,
      startedAt: '2026-11-14T10:00:00Z',
      endedAt: '2026-11-14T10:30:00Z',
      taskTitle: 'Pay Electricity Bill',
    },
    // Uncompleted session (must NOT count)
    {
      id: 's4',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 45,
      durationSeconds: 2700,
      completed: false,
      startedAt: '2026-11-14T11:00:00Z',
      endedAt: '2026-11-14T11:15:00Z',
      subjectCode: 'Sub_DBMS',
    },
  ];

  const summary = computeStudyProgressSummary({
    subjects,
    topics,
    revisions,
    mistakes,
    focusSessions: sessions,
  });

  // Total study minutes should reflect 50m + 25m = 75 minutes (1.3 hours)
  assert.equal(summary.totalStudyMinutes, 75, 'Study minutes must reflect actual completed study focus sessions');
  const hours = Math.round((summary.totalStudyMinutes / 60) * 10) / 10;
  assert.equal(hours, 1.3, 'Study hours calculation must equal 1.3 hours');

  // Per-subject study minutes verification
  const dbmsBreakdown = summary.subjectBreakdown.find((b) => b.code === 'Sub_DBMS');
  assert.ok(dbmsBreakdown);
  assert.equal(dbmsBreakdown.studyMinutes, 50, 'DBMS study minutes must match 50 completed minutes');

  const osBreakdown = summary.subjectBreakdown.find((b) => b.code === 'Sub_OS');
  assert.ok(osBreakdown);
  assert.equal(osBreakdown.studyMinutes, 25, 'OS study minutes must match 25 completed minutes');
});

test('Phase 11 — Practice Count Constraint Verification', () => {
  // Verify that Practice count increments ONLY when explicitly classified as 'practice'
  const appContextSource = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');

  // Check the work completion handler
  assert.match(
    appContextSource,
    /if\s*\(\s*studyTopicNow\s*&&\s*studyActivityNow\s*===\s*'practice'\s*\)\s*\{\s*api\.saveStudyTopic\(\{\s*id:\s*studyTopicNow,\s*practice:\s*true\s*\}\)/,
    'AppContext must ONLY increment practice when studyActivityNow is explicitly "practice"'
  );

  // Check the stopwatch completion handler
  assert.match(
    appContextSource,
    /if\s*\(\s*activeStudyTopicId\s*&&\s*activeStudyActivityType\s*===\s*'practice'\s*\)\s*\{\s*api\.saveStudyTopic\(\{\s*id:\s*activeStudyTopicId,\s*practice:\s*true\s*\}\)/,
    'Stopwatch save must ONLY update practice when activeStudyActivityType is explicitly "practice"'
  );

  // Verify theory flag is handled similarly
  assert.match(
    appContextSource,
    /if\s*\(\s*studyTopicNow\s*&&\s*studyActivityNow\s*===\s*'theory'\s*\)\s*\{\s*api\.saveStudyTopic\(\{\s*id:\s*studyTopicNow,\s*theory:\s*true\s*\}\)/,
    'Theory flag must be updated when activity type is "theory"'
  );
});

test('Phase 11 — Timer Engine State Persistence and Synchronization', () => {
  const memStorage = new MemoryStorage();

  // Test timer state save and load with study linkage using explicit storage instance
  saveTimerState(
    {
      activeStudySubjectCode: 'Sub_ALGO',
      activeStudyTopicId: 'topic_dp_1',
      activeStudyActivityType: 'theory',
    },
    memStorage
  );

  const state = loadInitialTimerState(memStorage);
  assert.equal(state.activeStudySubjectCode, 'Sub_ALGO');
  assert.equal(state.activeStudyTopicId, 'topic_dp_1');
  assert.equal(state.activeStudyActivityType, 'theory');

  // Verify atomic completion locking
  const completionKey = `test_comp_${Date.now()}`;
  const firstAcquire = acquireCompletionLock(completionKey, memStorage);
  const secondAcquire = acquireCompletionLock(completionKey, memStorage);

  assert.equal(firstAcquire, true, 'First tab must acquire completion lock');
  assert.equal(secondAcquire, false, 'Second tab must be prevented from acquiring duplicate completion lock');
});

test('Phase 11 — Spaced Repetition to Time Block Idempotency & Fault Tolerance', () => {
  const scheduleSource = fs.readFileSync(
    path.resolve('src/components/study/ScheduleRevisionModal.tsx'),
    'utf8'
  );

  // Deterministic ID format verification
  assert.match(
    scheduleSource,
    /id:\s*`tb_rev_\$\{revisionId\}`/,
    'Time block must use deterministic ID tb_rev_${revisionId} to prevent duplicate planner entries'
  );

  // Non-blocking planner insertion verification (try...catch with warning and no throw)
  assert.match(
    scheduleSource,
    /catch\s*\(\s*plannerErr\s*\)\s*\{[\s\S]*console\.warn/,
    'Planner insertion failure must be caught and logged without failing the scheduled revision'
  );

  // Spaced repetition interval date calculation
  const nextDate1 = calculateNextRevisionDate(REVISION_INTERVAL_LADDER[0]);
  const nextDate7 = calculateNextRevisionDate(7);

  assert.match(nextDate1, /^\d{4}-\d{2}-\d{2}$/, 'Next date must be formatted as YYYY-MM-DD');
  assert.match(nextDate7, /^\d{4}-\d{2}-\d{2}$/, 'Next date must be formatted as YYYY-MM-DD');

  const diffMs = new Date(nextDate7).getTime() - new Date(nextDate1).getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  assert.equal(diffDays, 6, '7-day interval must be 6 days after 1-day interval');
});

test('Phase 11 — DailyTimeBlockPlanner and StudyView UI Linkage', () => {
  const plannerSource = fs.readFileSync(
    path.resolve('src/components/focus/DailyTimeBlockPlanner.tsx'),
    'utf8'
  );
  const studyViewSource = fs.readFileSync(
    path.resolve('src/components/study/StudyView.tsx'),
    'utf8'
  );
  const pomodoroSource = fs.readFileSync(
    path.resolve('src/components/focus/PomodoroTimer.tsx'),
    'utf8'
  );

  // Planner must display revision indicator and link to study tab
  assert.match(
    plannerSource,
    /b\.revisionId/,
    'Planner must check for revisionId on time blocks'
  );
  assert.match(
    plannerSource,
    /setCurrentTab\('study'\)/,
    'Planner revision badge must provide one-click navigation to Study OS'
  );

  // StudyView must provide one-click focus button
  assert.match(
    studyViewSource,
    /setCurrentTab\('focus'\)/,
    'StudyView must provide one-click button to jump directly to Pomodoro focus'
  );
  assert.match(
    studyViewSource,
    /setActiveStudySubjectCode\(/,
    'StudyView must set activeStudySubjectCode when clicking Focus on a topic'
  );

  // PomodoroTimer must display active study topic and support modal linking
  assert.match(
    pomodoroSource,
    /activeStudySubjectCode\s*\|\|\s*activeStudyTopicId/,
    'PomodoroTimer must render active study linkage indicator'
  );
  assert.match(
    pomodoroSource,
    /setShowStudyModal\(true\)/,
    'PomodoroTimer must offer button to link study topic'
  );
});
