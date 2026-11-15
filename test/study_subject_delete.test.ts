import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseService } from '../server/db.ts';
import { StudySubject, StudyTopic } from '../src/types/study.ts';

function createMockDb(): DatabaseService {
  const db = new DatabaseService();
  // In-memory test isolation: prevent disk pollution
  (db as any).save = () => {};
  return db;
}

test('Subject Delete — Local Backend: Subject deletion with zero topics', () => {
  const db = createMockDb();
  const userId = `usr_del_zero_${Date.now()}`;
  const code = 'SUB_ZERO_TEST';

  const sub = db.saveStudySubject(userId, {
    code,
    name: 'Zero Topics Subject',
    tierId: 'college',
  });
  assert.equal(sub.code, code);

  const activeBefore = db.getStudySubjects(userId);
  assert.equal(activeBefore.length, 1);

  const result = db.deleteStudySubject(userId, code);
  assert.equal(result.success, true);
  assert.equal(result.deletedCount, 1);

  const activeAfter = db.getStudySubjects(userId);
  assert.equal(activeAfter.length, 0, 'Active subjects must be empty after deletion');

  // Verify soft delete preservation: subject still exists in underlying db with deletedAt timestamp
  const rawSubs = (db as any).db.studySubjects.filter((s: StudySubject) => s.userId === userId);
  assert.equal(rawSubs.length, 1, 'Historical record must be preserved');
  assert.ok(rawSubs[0].deletedAt, 'deletedAt must be populated');
  assert.equal(typeof rawSubs[0].deletedAt, 'string');
});

test('Subject Delete — Local Backend: Subject deletion with multiple topics', () => {
  const db = createMockDb();
  const userId = `usr_del_multi_${Date.now()}`;
  const code = 'SUB_MULTI_TEST';

  db.saveStudySubject(userId, { code, name: 'Multi Topics Subject', tierId: 'college' });
  db.saveStudyTopic(userId, { subjectCode: code, unit: 'Unit 1', subtopic: 'Topic 1', priority: 'High' });
  db.saveStudyTopic(userId, { subjectCode: code, unit: 'Unit 1', subtopic: 'Topic 2', priority: 'Medium' });
  db.saveStudyTopic(userId, { subjectCode: code, unit: 'Unit 2', subtopic: 'Topic 3', priority: 'Low' });

  assert.equal(db.getStudySubjects(userId).length, 1);
  assert.equal(db.getStudyTopics(userId).length, 3);

  const result = db.deleteStudySubject(userId, code);
  assert.equal(result.success, true);
  assert.equal(result.deletedCount, 4, 'Must delete 1 subject + 3 associated topics');
  assert.equal(result.subjectCode, code);

  assert.equal(db.getStudySubjects(userId).length, 0, 'No active subjects');
  assert.equal(db.getStudyTopics(userId).length, 0, 'No active topics');

  // Historical records preserved with deletedAt
  const rawTopics = (db as any).db.studyTopics.filter((t: StudyTopic) => t.userId === userId);
  assert.equal(rawTopics.length, 3);
  for (const t of rawTopics) {
    assert.ok(t.deletedAt, 'Topic must have deletedAt set');
  }
});

test('Subject Delete — Local Backend: Cross-user and different-subject isolation', () => {
  const db = createMockDb();
  const userA = `usr_iso_A_${Date.now()}`;
  const userB = `usr_iso_B_${Date.now()}`;
  const sharedCode = 'SHARED_CODE';

  // User A creates sharedCode and customCode
  db.saveStudySubject(userA, { code: sharedCode, name: 'Subject A Shared', tierId: 'college' });
  db.saveStudyTopic(userA, { subjectCode: sharedCode, unit: 'Unit A', subtopic: 'Subtopic A1' });
  db.saveStudySubject(userA, { code: 'UNTOUCHED_A', name: 'Untouched A', tierId: 'college' });
  db.saveStudyTopic(userA, { subjectCode: 'UNTOUCHED_A', unit: 'Unit A2', subtopic: 'Subtopic A2' });

  // User B creates sharedCode
  db.saveStudySubject(userB, { code: sharedCode, name: 'Subject B Shared', tierId: 'college' });
  db.saveStudyTopic(userB, { subjectCode: sharedCode, unit: 'Unit B', subtopic: 'Subtopic B1' });

  // User A deletes sharedCode
  const resA = db.deleteStudySubject(userA, sharedCode);
  assert.equal(resA.success, true);

  // User A check
  const userASubjects = db.getStudySubjects(userA);
  assert.equal(userASubjects.length, 1);
  assert.equal(userASubjects[0].code, 'UNTOUCHED_A', 'User A untouched subject must remain active');
  const userATopics = db.getStudyTopics(userA);
  assert.equal(userATopics.length, 1);
  assert.equal(userATopics[0].subjectCode, 'UNTOUCHED_A');

  // User B check: User B records must be 100% unaffected
  const userBSubjects = db.getStudySubjects(userB);
  assert.equal(userBSubjects.length, 1);
  assert.equal(userBSubjects[0].code, sharedCode, 'User B subject must remain untouched');
  const userBTopics = db.getStudyTopics(userB);
  assert.equal(userBTopics.length, 1);
  assert.equal(userBTopics[0].subtopic, 'Subtopic B1');
});

test('Subject Delete — Local Backend: Historical study records remain intact', () => {
  const db = createMockDb();
  const userId = `usr_hist_${Date.now()}`;
  const code = 'SUB_HIST_TEST';

  db.saveStudySubject(userId, { code, name: 'Historical Subject' });
  const topic = db.saveStudyTopic(userId, { subjectCode: code, unit: 'Unit 1', subtopic: 'Historical Topic' });

  // Simulate related historical records (revisions, mistakes)
  db.saveStudyRevision(userId, { topicId: topic.id, lastStudiedAt: '2026-11-01' });
  db.saveStudyMistake(userId, { subjectCode: code, topic: 'Historical Topic', trap: 'Watch out' });

  const revsBefore = db.getStudyRevisions(userId);
  const mistsBefore = db.getStudyMistakes(userId);
  assert.equal(revsBefore.length, 1);
  assert.equal(mistsBefore.length, 1);

  // Delete subject
  const res = db.deleteStudySubject(userId, code);
  assert.equal(res.success, true);

  // Verify historical references are preserved
  const revsAfter = db.getStudyRevisions(userId);
  const mistsAfter = db.getStudyMistakes(userId);
  assert.equal(revsAfter.length, 1, 'Revisions must NOT be deleted');
  assert.equal(revsAfter[0].topicId, topic.id, 'Revision topicId must remain intact');
  assert.equal(mistsAfter.length, 1, 'Mistakes must NOT be deleted');
  assert.equal(mistsAfter[0].subjectCode, code, 'Mistake subjectCode must remain intact');
});

test('Subject Delete — Local Backend: Rollback on save failure prevents partial writes', () => {
  const db = createMockDb();
  const userId = `usr_fail_${Date.now()}`;
  const code = 'SUB_FAIL_TEST';

  db.saveStudySubject(userId, { code, name: 'Fail Subject' });
  db.saveStudyTopic(userId, { subjectCode: code, unit: 'Unit 1', subtopic: 'Topic 1' });

  // Simulate an error during save
  (db as any).save = () => {
    throw new Error('Simulated disk full error');
  };

  assert.throws(
    () => db.deleteStudySubject(userId, code),
    /Simulated disk full error/,
    'Must rethrow save error'
  );

  // Verify in-memory rollback: neither subject nor topic should be marked deleted
  const sub = (db as any).db.studySubjects.find((s: StudySubject) => s.userId === userId && s.code === code);
  assert.equal(sub.deletedAt, null, 'Subject must not have deletedAt after rollback');
  const top = (db as any).db.studyTopics.find((t: StudyTopic) => t.userId === userId && t.subjectCode === code);
  assert.equal(top.deletedAt, null, 'Topic must not have deletedAt after rollback');
});

test('Subject Delete — Local Backend: Non-existent subject returns success: false', () => {
  const db = createMockDb();
  const res = db.deleteStudySubject('any_user', 'NON_EXISTENT_SUBJ');
  assert.equal(res.success, false);
  assert.equal(res.deletedCount, 0);
});

test('Subject Delete — Local Backend: Refresh after deletion returns empty', () => {
  const db = createMockDb();
  const userId = `usr_refresh_${Date.now()}`;
  const code = 'SUB_REFRESH';

  db.saveStudySubject(userId, { code, name: 'Refresh Test' });
  db.saveStudyTopic(userId, { subjectCode: code, unit: 'Unit R', subtopic: 'Topic R' });

  db.deleteStudySubject(userId, code);

  // Simulate multiple subsequent refreshes
  const refresh1 = db.getStudySubjects(userId);
  const refresh2 = db.getStudySubjects(userId);
  assert.equal(refresh1.length, 0);
  assert.equal(refresh2.length, 0);
});

test('Subject Delete — FirestoreService Architecture & Safety Inspection', () => {
  const firestoreSource = fs.readFileSync(path.resolve('src/lib/firestoreService.ts'), 'utf8');

  // Check 1: Must distinguish lookup failures from non-existent docs
  assert.match(
    firestoreSource,
    /handleFirestoreError\(err,\s*OperationType\.GET,\s*directPath\);/,
    'firestoreService must report permission/network errors on direct getDoc'
  );
  assert.match(
    firestoreSource,
    /handleFirestoreError\(err,\s*OperationType\.LIST,\s*collectionPath\);/,
    'firestoreService must report permission/network errors on fallback listing'
  );

  // Check 2: Must never write a ghost document when subject not found
  assert.match(
    firestoreSource,
    /if\s*\(!targetDoc\)\s*\{\s*return;\s*\}/,
    'firestoreService must return without writing if subject not found'
  );

  // Check 3: Must fetch active topics for cascading soft-delete
  assert.match(
    firestoreSource,
    /topicsSnap\.docs\s*\.filter\(\(d\)\s*=>\s*\{[\s\S]*?t\.subjectCode\s*===\s*targetCode\s*&&\s*!t\.deletedAt/,
    'firestoreService must filter active topics for target subjectCode'
  );

  // Check 4: Must use writeBatch for atomic soft-delete when within limits
  assert.match(
    firestoreSource,
    /const\s+batch\s*=\s*writeBatch\(db\);/,
    'firestoreService must use writeBatch for atomic updates'
  );

  // Check 5: Must safely chunk operations exceeding batch limit with explicit partial-failure error
  assert.match(
    firestoreSource,
    /BATCH_LIMIT\s*=\s*450;/,
    'firestoreService must define safe batch chunk size below 500 limit'
  );
  assert.match(
    firestoreSource,
    /Partial\s+deletion:/,
    'firestoreService must explicitly report partial deletion on multi-batch failure'
  );
});

test('Subject Delete — StudyView UI & Async Protection Inspection', () => {
  const studyViewSource = fs.readFileSync(path.resolve('src/components/study/StudyView.tsx'), 'utf8');

  // Check 1: Duplicate deletion protection flag
  assert.match(
    studyViewSource,
    /const\s*\[deletingSubjectId,\s*setDeletingSubjectId\]\s*=\s*useState<string\s*\|\s*null>\(null\);/,
    'StudyView must maintain deletingSubjectId state'
  );
  assert.match(
    studyViewSource,
    /if\s*\(deletingSubjectId\)\s*return;/,
    'handleDeleteSubject must block duplicate concurrent requests'
  );

  // Check 2: Must await deletion operation
  assert.match(
    studyViewSource,
    /await\s+api\.deleteStudySubject\(targetKey\);/,
    'handleDeleteSubject must await api.deleteStudySubject'
  );

  // Check 3: Must update state only after success
  assert.match(
    studyViewSource,
    /await\s+api\.deleteStudySubject\(targetKey\);[\s\S]*?setSubjects\(/,
    'setSubjects must only be called after api.deleteStudySubject succeeds'
  );

  // Check 4: Must reset selectedSubjectCode if deleting current filter
  assert.match(
    studyViewSource,
    /if\s*\(selectedSubjectCode\s*===\s*subject\.code\)\s*\{\s*setSelectedSubjectCode\('all'\);/,
    'handleDeleteSubject must reset selectedSubjectCode to all if matching deleted subject'
  );

  // Check 5: On error, must reload authoritative data and show error
  assert.match(
    studyViewSource,
    /catch\s*\(\w+:\s*unknown\)\s*\{[\s\S]*?showToast\(errMsg,\s*'error'\);[\s\S]*?await\s+loadData\(\);/,
    'handleDeleteSubject must reload data and show error on failure'
  );

  // Check 6: Delete buttons must show pending spinner and disable while deleting
  assert.match(
    studyViewSource,
    /disabled=\{Boolean\(deletingSubjectId\)\}/,
    'Delete button must be disabled when deleting'
  );
  assert.match(
    studyViewSource,
    /<Loader2\s+className="w-3\.5\s+h-3\.5\s+animate-spin/,
    'Delete button must render Loader2 spinner during pending deletion'
  );

  // Check 7: No fire-and-forget loops for topic deletion
  assert.doesNotMatch(
    studyViewSource,
    /api\.deleteStudyTopic\(t\.id\)\.catch/,
    'StudyView must not contain fire-and-forget topic deletion'
  );
});

test('Subject Delete — Firestore Security Rules Validation Inspection', () => {
  const rulesSource = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');

  // Check 1: Owner-only checks on study_subjects and study_topics
  assert.match(
    rulesSource,
    /match\s*\/study_subjects\/\{subId\}\s*\{[\s\S]*?allow\s+read:\s*if\s+isOwner\(userId\);/,
    'study_subjects must enforce isOwner for read'
  );
  assert.match(
    rulesSource,
    /match\s*\/study_subjects\/\{subId\}\s*\{[\s\S]*?allow\s+update:\s*if\s+isOwner\(userId\)/,
    'study_subjects must enforce isOwner for update'
  );

  // Check 2: Immutable userId and code on study_subjects
  assert.match(
    rulesSource,
    /request\.resource\.data\.userId\s*==\s*resource\.data\.userId\s*&&\s*request\.resource\.data\.code\s*==\s*resource\.data\.code/,
    'study_subjects must enforce immutable userId and code during ordinary update'
  );

  // Check 3: Immutable userId and subjectCode on study_topics
  assert.match(
    rulesSource,
    /request\.resource\.data\.userId\s*==\s*resource\.data\.userId\s*&&\s*request\.resource\.data\.subjectCode\s*==\s*resource\.data\.subjectCode/,
    'study_topics must enforce immutable userId and subjectCode during ordinary update'
  );

  // Check 4: isSoftDelete validates string deletedAt
  assert.match(
    rulesSource,
    /request\.resource\.data\.deletedAt\s*==\s*null\s*\|\|\s*\(request\.resource\.data\.deletedAt\s+is\s+string\s+&&\s+request\.resource\.data\.deletedAt\.size\(\)\s*<=\s*64\)/,
    'isSoftDelete must validate deletedAt as bounded string or null'
  );
});
