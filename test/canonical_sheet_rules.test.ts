import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Canonical Private Sheet Ownership Architecture — Firestore Rules Invariants', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // 1. Default-deny architecture
  assert.ok(
    rules.includes('match /{document=**}') && rules.includes('allow read, write: if false;'),
    'Default-deny root rule must be preserved'
  );

  // 2. Canonical sheets/{sheetId} collection strictly nested inside users/{userId}
  assert.ok(rules.includes('match /users/{userId}'), 'users/{userId} root must be defined');
  assert.ok(rules.includes('match /sheets/{sheetId}'), 'sheets/{sheetId} must be defined');

  // Find users block and ensure sheets is inside it
  const userBlockStart = rules.indexOf('match /users/{userId}');
  const userBlockEnd = rules.indexOf('// JOINT VAULT & INVITATION SHARED HELPERS');
  assert.ok(userBlockStart > 0 && userBlockEnd > userBlockStart, 'users/{userId} block must be found');
  const userBlockContent = rules.substring(userBlockStart, userBlockEnd);

  assert.ok(
    userBlockContent.includes('match /sheets/{sheetId}'),
    'match /sheets/{sheetId} must be strictly nested inside match /users/{userId}'
  );

  // 3. Enforce isOwner(userId) on read, create, update, delete for sheets/{sheetId}
  const sheetMatchIndex = userBlockContent.indexOf('match /sheets/{sheetId}');
  const sheetBlock = userBlockContent.substring(sheetMatchIndex, userBlockContent.indexOf('// ==========================================', sheetMatchIndex));

  assert.ok(sheetBlock.includes('allow read: if isOwner(userId);'), 'sheets read must enforce isOwner(userId)');
  assert.ok(sheetBlock.includes('allow create: if isOwner(userId)'), 'sheets create must enforce isOwner(userId)');
  assert.ok(sheetBlock.includes('allow update: if isOwner(userId)'), 'sheets update must enforce isOwner(userId)');
  assert.ok(sheetBlock.includes('allow delete: if isOwner(userId);'), 'sheets delete must enforce isOwner(userId)');

  // 4. Enforce immutable ownership on create and update for sheets/{sheetId}
  assert.ok(
    sheetBlock.includes('request.resource.data.userId == userId'),
    'sheets create must enforce request.resource.data.userId == userId'
  );
  assert.ok(
    sheetBlock.includes('isValidId(sheetId)'),
    'sheets create must enforce isValidId(sheetId)'
  );
  assert.ok(
    sheetBlock.includes('request.resource.data.id == sheetId'),
    'sheets create must enforce request.resource.data.id == sheetId'
  );
  assert.ok(
    sheetBlock.includes('request.resource.data.userId == resource.data.userId'),
    'sheets update must enforce request.resource.data.userId == resource.data.userId'
  );
  assert.ok(
    sheetBlock.includes('request.resource.data.id == resource.data.id'),
    'sheets update must enforce request.resource.data.id == resource.data.id'
  );
  assert.ok(
    sheetBlock.includes('request.resource.data.createdAt == resource.data.createdAt'),
    'sheets update must enforce immutable createdAt'
  );

  // 5. Schema validation with hasOnly and disallowed tokens
  assert.ok(
    rules.includes('function isValidSheetDoc(data, docId, uid)'),
    'isValidSheetDoc validator function must be defined'
  );
  assert.ok(
    rules.includes("!('accessToken' in data)"),
    'Security rules must reject accessToken'
  );
  assert.ok(
    rules.includes("!('refreshToken' in data)"),
    'Security rules must reject refreshToken'
  );

  // Check isValidSheetDoc hasOnly fields
  const expectedSheetFields = [
    'id', 'userId', 'title', 'spreadsheetId', 'spreadsheetUrl', 'description',
    'templateHint', 'syncMode', 'status', 'createdAt', 'updatedAt', 'deletedAt',
  ];
  for (const field of expectedSheetFields) {
    assert.ok(
      rules.includes(`'${field}'`),
      `isValidSheetDoc must validate allowed field ${field}`
    );
  }

  // 6. Subcollections tabs/{tabId}, rows/{rowId}, row_chunks/{chunkId}
  assert.ok(sheetBlock.includes('match /tabs/{tabId}'), 'tabs/{tabId} subcollection must be defined under sheets');
  assert.ok(sheetBlock.includes('match /rows/{rowId}'), 'rows/{rowId} subcollection must be defined under sheets');
  assert.ok(sheetBlock.includes('match /row_chunks/{chunkId}'), 'row_chunks/{chunkId} subcollection must be defined under sheets');

  // Verify subcollections enforce isOwner(userId) and immutable userId
  assert.ok(sheetBlock.includes('isValidNestedSheetTab'), 'isValidNestedSheetTab validator must be used');
  assert.ok(sheetBlock.includes('isValidSheetRow'), 'isValidSheetRow validator must be used');
  assert.ok(sheetBlock.includes('isValidNestedSheetRowChunk'), 'isValidNestedSheetRowChunk validator must be used');

  // 7. Audit of existing collections: sheet_connections, sheet_tabs, sheet_row_chunks, sheet_sync_queue, sheet_conflicts
  const existingCollections = [
    'match /sheet_connections/{connectionId}',
    'match /sheet_tabs/{tabId}',
    'match /sheet_row_chunks/{chunkId}',
    'match /sheet_sync_queue/{opId}',
    'match /sheet_conflicts/{conflictId}',
  ];
  for (const coll of existingCollections) {
    assert.ok(userBlockContent.includes(coll), `Existing collection ${coll} must be preserved`);
  }

  // Verify token disallowance on existing collections as well
  const connIndex = userBlockContent.indexOf('match /sheet_connections/{connectionId}');
  const connBlock = userBlockContent.substring(connIndex, userBlockContent.indexOf('match /sheet_tabs/{tabId}'));
  assert.ok(connBlock.includes("!('accessToken' in data)"), 'sheet_connections must disallow accessToken');
  assert.ok(connBlock.includes("!('refreshToken' in data)"), 'sheet_connections must disallow refreshToken');
  assert.ok(connBlock.includes('request.resource.data.userId == resource.data.userId'), 'sheet_connections must enforce immutable userId');

  const tabIndex = userBlockContent.indexOf('match /sheet_tabs/{tabId}');
  const tabBlock = userBlockContent.substring(tabIndex, userBlockContent.indexOf('match /sheet_row_chunks/{chunkId}'));
  assert.ok(tabBlock.includes("!('accessToken' in data)"), 'sheet_tabs must disallow accessToken');
  assert.ok(tabBlock.includes("!('refreshToken' in data)"), 'sheet_tabs must disallow refreshToken');
  assert.ok(tabBlock.includes('request.resource.data.userId == resource.data.userId'), 'sheet_tabs must enforce immutable userId');

  const chunkIndex = userBlockContent.indexOf('match /sheet_row_chunks/{chunkId}');
  const chunkBlock = userBlockContent.substring(chunkIndex, userBlockContent.indexOf('match /sheet_sync_queue/{opId}'));
  assert.ok(chunkBlock.includes("!('accessToken' in data)"), 'sheet_row_chunks must disallow accessToken');
  assert.ok(chunkBlock.includes("!('refreshToken' in data)"), 'sheet_row_chunks must disallow refreshToken');
  assert.ok(chunkBlock.includes('request.resource.data.userId == resource.data.userId'), 'sheet_row_chunks must enforce immutable userId');

  const queueIndex = userBlockContent.indexOf('match /sheet_sync_queue/{opId}');
  const queueBlock = userBlockContent.substring(queueIndex, userBlockContent.indexOf('match /sheet_conflicts/{conflictId}'));
  assert.ok(queueBlock.includes("!('accessToken' in data)"), 'sheet_sync_queue must disallow accessToken');
  assert.ok(queueBlock.includes("!('refreshToken' in data)"), 'sheet_sync_queue must disallow refreshToken');
  assert.ok(queueBlock.includes('request.resource.data.userId == resource.data.userId'), 'sheet_sync_queue must enforce immutable userId');

  const conflictIndex = userBlockContent.indexOf('match /sheet_conflicts/{conflictId}');
  const conflictBlock = userBlockContent.substring(conflictIndex, userBlockContent.indexOf('match /sheets/{sheetId}'));
  assert.ok(conflictBlock.includes("!('accessToken' in data)"), 'sheet_conflicts must disallow accessToken');
  assert.ok(conflictBlock.includes("!('refreshToken' in data)"), 'sheet_conflicts must disallow refreshToken');
  assert.ok(conflictBlock.includes('request.resource.data.userId == resource.data.userId'), 'sheet_conflicts must enforce immutable userId');
});

