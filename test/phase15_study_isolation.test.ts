import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDefaultStudyWorkspace } from '../src/data/studySeedData.ts';
import { StudySubject } from '../src/types/study.ts';

test('Phase 15 — StudyView Architecture & Account Isolation (FIX 1 & FIX 2)', () => {
  const studyViewSource = fs.readFileSync(path.resolve('src/components/study/StudyView.tsx'), 'utf8');

  // FIX 1: Active user ID and load generation cancellation trackers must exist
  assert.match(
    studyViewSource,
    /const activeUserIdRef = useRef<string \| null>\(null\);/,
    'StudyView must track activeUserIdRef for cross-account race isolation'
  );
  assert.match(
    studyViewSource,
    /const loadGenerationRef = useRef<number>\(0\);/,
    'StudyView must track loadGenerationRef for stale async response cancellation'
  );

  // FIX 1: State must be cleared immediately when loading / switching user
  assert.match(
    studyViewSource,
    /setSubjects\(\[\]\);\s*setTopics\(\[\]\);\s*setRevisions\(\[\]\);\s*setMistakes\(\[\]\);\s*setFocusSessions\(\[\]\);\s*setLoadError\(null\);/,
    'StudyView must immediately clear all study state on user change or reload'
  );

  // FIX 1: Stale response protection must drop late-resolving requests from previous accounts
  assert.match(
    studyViewSource,
    /if\s*\(\s*generation\s*!==\s*loadGenerationRef\.current\s*\|\|\s*activeUserIdRef\.current\s*!==\s*currentUid\s*\)\s*\{\s*return;\s*\}/,
    'StudyView must discard responses if generation changed or user switched during in-flight fetch'
  );

  // FIX 2: Must NOT swallow API errors into empty arrays via .catch(() => [])
  assert.doesNotMatch(
    studyViewSource,
    /api\.getStudySubjects\(\)\.catch\(/,
    'StudyView must not convert failed subject fetches to empty arrays'
  );
  assert.doesNotMatch(
    studyViewSource,
    /api\.getStudyTopics\(\)\.catch\(/,
    'StudyView must not convert failed topic fetches to empty arrays'
  );

  // FIX 2: Must never call buildDefaultStudyWorkspace with 'guest' fallback
  assert.doesNotMatch(
    studyViewSource,
    /buildDefaultStudyWorkspace\s*\(/,
    'StudyView must not perform frontend auto-seeding or use guest fallback'
  );

  // FIX 2: Must show retryable error state and retry button
  assert.match(
    studyViewSource,
    /setLoadError\(msg\);/,
    'StudyView must set loadError on API failure'
  );
  assert.match(
    studyViewSource,
    /Retry/,
    'StudyView must provide a user-facing Retry control on error'
  );
});

test('Phase 15 — FirestoreService Atomic Seeding & Anti-Resurrection (FIX 3 & FIX 4)', () => {
  const firestoreSource = fs.readFileSync(path.resolve('src/lib/firestoreService.ts'), 'utf8');

  // FIX 3: Check existing records (including soft-deleted) before deciding to seed
  assert.match(
    firestoreSource,
    /if\s*\(list\.length\s*>\s*0\)\s*\{\s*return active\.sort/,
    'firestoreService must check list.length > 0 to prevent resurrecting soft-deleted subjects'
  );

  // FIX 3: Check study_meta initialization marker in settings
  assert.match(
    firestoreSource,
    /users\/\$\{userId\}\/settings\/study_meta/,
    'firestoreService must check settings/study_meta initialization document'
  );
  assert.match(
    firestoreSource,
    /if\s*\(isInitialized\)\s*\{\s*return \[\];\s*\}/,
    'firestoreService must return empty array if workspace was previously initialized'
  );

  // FIX 4: Atomic seeding via writeBatch
  assert.match(
    firestoreSource,
    /const batch = writeBatch\(db\);/,
    'firestoreService must use writeBatch for atomic workspace initialization'
  );
  assert.match(
    firestoreSource,
    /await batch\.commit\(\);/,
    'firestoreService must commit default workspace atomically'
  );
});

test('Phase 15 — Logic Simulation: Initial Seeding vs. Resurrection Prevention', () => {
  // Simulate mock database state for getStudySubjects logic
  interface MockDbState {
    subjects: StudySubject[];
    isInitialized: boolean;
  }

  function simulateGetStudySubjects(userId: string, state: MockDbState): StudySubject[] {
    const list = state.subjects;
    const active = list.filter((s) => !s.deletedAt);

    // Rule 1: Historical records exist
    if (list.length > 0) {
      return active.sort((a, b) => a.code.localeCompare(b.code));
    }

    // Rule 2: Explicitly marked initialized
    if (state.isInitialized) {
      return [];
    }

    // Rule 3: Brand new user -> seed defaults
    const { subjects } = buildDefaultStudyWorkspace(userId);
    state.subjects = [...subjects];
    state.isInitialized = true;
    return subjects;
  }

  // Case A: Brand-new user receives 5 default subjects
  const newUserState: MockDbState = { subjects: [], isInitialized: false };
  const firstLoad = simulateGetStudySubjects('user_123', newUserState);
  assert.equal(firstLoad.length, 5, 'New user must receive exactly 5 default subjects');
  assert.equal(newUserState.isInitialized, true, 'Workspace must be marked initialized');

  // Case B: User soft-deletes all subjects -> must NOT resurrect
  newUserState.subjects = newUserState.subjects.map((s) => ({
    ...s,
    deletedAt: new Date().toISOString(),
  }));
  const reloadAfterDelete = simulateGetStudySubjects('user_123', newUserState);
  assert.equal(reloadAfterDelete.length, 0, 'Soft-deleted subjects must remain empty on reload');

  // Case C: User hard-deletes all subjects but isInitialized is true -> must NOT resurrect
  const emptiedState: MockDbState = { subjects: [], isInitialized: true };
  const reloadHardEmpty = simulateGetStudySubjects('user_123', emptiedState);
  assert.equal(reloadHardEmpty.length, 0, 'Emptied workspace must not resurrect defaults');

  // Case D: User creates custom subject -> custom subject preserved
  const customSub: StudySubject = {
    id: 'subj_custom_1',
    userId: 'user_456',
    code: 'CUSTOM101',
    name: 'Advanced Machine Learning',
    tierId: 'custom',
    totalSubtopics: 10,
    completedSubtopics: 5,
    color: '#10b981',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
  const customState: MockDbState = { subjects: [customSub], isInitialized: true };
  const customLoad = simulateGetStudySubjects('user_456', customState);
  assert.equal(customLoad.length, 1, 'Custom subjects must remain unchanged');
  assert.equal(customLoad[0].code, 'CUSTOM101');
});

test('Phase 15 — Logic Simulation: User A to User B Account Switching & In-Flight Race Condition', async () => {
  let activeUserId: string | null = null;
  let loadGeneration = 0;
  let viewMountedSubjects: StudySubject[] = [];

  const simulateLoadData = async (userUid: string | null, delayMs: number, dataToReturn: StudySubject[]) => {
    const generation = ++loadGeneration;
    activeUserId = userUid;

    // Immediately clear mounted state on switch
    viewMountedSubjects = [];

    if (!userUid) return;

    await new Promise((r) => setTimeout(r, delayMs));

    // Stale check
    if (generation !== loadGeneration || activeUserId !== userUid) {
      return; // Discard stale response
    }

    viewMountedSubjects = dataToReturn;
  };

  const userASubjects: StudySubject[] = [
    { id: 'sub_a', userId: 'user_A', code: 'A101', name: 'User A Subject', tierId: 'tier1', totalSubtopics: 1, completedSubtopics: 0, color: '#000', createdAt: '', updatedAt: '', deletedAt: null },
  ];
  const userBSubjects: StudySubject[] = [
    { id: 'sub_b', userId: 'user_B', code: 'B201', name: 'User B Subject', tierId: 'tier1', totalSubtopics: 1, completedSubtopics: 0, color: '#111', createdAt: '', updatedAt: '', deletedAt: null },
  ];

  // 1. User A starts loading with high network latency (60ms)
  const userAPromise = simulateLoadData('user_A', 60, userASubjects);

  // 2. Before User A finishes (at 10ms), user switches to User B (latency 15ms)
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(viewMountedSubjects, [], 'Mounted state must be cleared immediately when switching to User B');

  const userBPromise = simulateLoadData('user_B', 15, userBSubjects);

  // 3. User B finishes at t=25ms
  await userBPromise;
  assert.equal(viewMountedSubjects.length, 1);
  assert.equal((viewMountedSubjects[0] as StudySubject).code, 'B201', 'User B subjects must be displayed');

  // 4. User A finishes late at t=60ms
  await userAPromise;
  assert.equal(viewMountedSubjects.length, 1, 'Late User A response must NOT overwrite User B state');
  assert.equal((viewMountedSubjects[0] as StudySubject).code, 'B201', 'User B subjects must remain untouched');

  // 5. Logout occurs
  await simulateLoadData(null, 0, []);
  assert.deepEqual(viewMountedSubjects, [], 'Logout must clear all mounted study data');
});

test('Phase 15 — Firestore Security Rules UID Verification for Study Subcollections', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');

  // Study Subjects
  assert.match(rules, /match \/study_subjects\/\{subId\}/);
  assert.match(rules, /allow read:\s*if isOwner\(userId\);/);
  assert.match(rules, /allow create:\s*if isOwner\(userId\)[\s\S]*?request\.resource\.data\.userId == userId/);

  // Study Topics
  assert.match(rules, /match \/study_topics\/\{topicId\}/);
  assert.match(rules, /allow read:\s*if isOwner\(userId\);/);
  assert.match(rules, /allow create:\s*if isOwner\(userId\)[\s\S]*?request\.resource\.data\.userId == userId/);

  // Study Revisions
  assert.match(rules, /match \/study_revisions\/\{revId\}/);
  assert.match(rules, /allow read:\s*if isOwner\(userId\);/);
  assert.match(rules, /allow create:\s*if isOwner\(userId\)[\s\S]*?request\.resource\.data\.userId == userId/);

  // Study Mistakes
  assert.match(rules, /match \/study_mistakes\/\{mistakeId\}/);
  assert.match(rules, /allow read:\s*if isOwner\(userId\);/);
  assert.match(rules, /allow create:\s*if isOwner\(userId\)[\s\S]*?request\.resource\.data\.userId == userId/);
});
