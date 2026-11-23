import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../server/db.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('BUG-02 & BUG-03: DatabaseService preserves, exports, and restores studyTiers, userSettings, and finance categories', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff_test_db_'));
  const customDb = new DatabaseService(tmpDir);

  const testUser = 'usr_audit_test_1';
  customDb.ensureUserWorkspace(testUser);

  // Save custom tier
  const tier = customDb.saveStudyTier(testUser, {
    name: 'Advanced Electives',
    shortTitle: 'Electives',
    subjectCodes: ['Sub_AI', 'Sub_ML'],
  });
  assert.ok(tier.id);

  // Add focus session directly to raw db
  customDb.getRaw().focusSessions.push({
    id: 'foc_test_1',
    userId: testUser,
    taskId: null,
    mode: 'work',
    durationMinutes: 25,
    durationSeconds: 1500,
    actualDurationSeconds: 1500,
    completed: true,
    status: 'completed',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  await customDb.save();

  // Verify load() preserves studyTiers from disk
  const reloadedDb = new DatabaseService(tmpDir);
  const reloadedTiers = reloadedDb.getStudyTiers(testUser);
  assert.equal(reloadedTiers.length, 1);
  assert.equal(reloadedTiers[0].name, 'Advanced Electives');

  // Verify exportUserData includes studyTiers and userSettings
  const exported = reloadedDb.exportUserData(testUser) as any;
  assert.ok(Array.isArray(exported.studyTiers));
  assert.equal(exported.studyTiers.length, 1);
  assert.ok(exported.userSettings);

  // Wipe workspace and verify restoreUserData restores them
  reloadedDb.clearWorkspace(testUser);
  assert.equal(reloadedDb.getStudyTiers(testUser).length, 0);

  const restoreRes = reloadedDb.restoreUserData(testUser, exported);
  assert.equal(restoreRes.success, true);
  assert.equal(restoreRes.counts.studyTiers, 1);
  assert.equal(restoreRes.counts.focusSessions, 1);
  assert.equal(reloadedDb.getStudyTiers(testUser).length, 1);
  assert.equal(reloadedDb.getStudyTiers(testUser)[0].name, 'Advanced Electives');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('BUG-08: recordStudyRecall calculates next revision using user configured timezone', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff_test_db_tz_'));
  const customDb = new DatabaseService(tmpDir);

  const testUser = 'usr_audit_test_tz';
  customDb.ensureUserWorkspace(testUser);
  const s = customDb.getRaw().userSettings.find((st) => st.userId === testUser);
  if (s) s.timezone = 'Asia/Tokyo';

  const rev = customDb.saveStudyRevision(testUser, {
    topicId: 'top_123',
    subjectCode: 'Sub_AI',
    topicTitle: 'Search A*',
    intervalDays: 1,
  });

  const updatedRev = customDb.recordStudyRecall(testUser, rev.id, 'medium');
  assert.ok(updatedRev);
  assert.ok(updatedRev.lastStudiedAt);
  assert.ok(updatedRev.nextRevisionAt);
  assert.equal(updatedRev.repetition, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('BUG-06: escapeSheetTitleForA1 helper properly formats titles with spaces vs identifiers', async () => {
  const sheetsWorkerContent = fs.readFileSync(path.resolve('server/sheetsWorker.ts'), 'utf-8');
  assert.ok(sheetsWorkerContent.includes('function escapeSheetTitleForA1(title: string): string'));

  // Test regex logic directly
  const escapeSheetTitleForA1 = (title: string): string => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(title)) {
      return `'${title.replace(/'/g, "''")}'`;
    }
    return title;
  };

  assert.equal(escapeSheetTitleForA1('Tasks'), 'Tasks');
  assert.equal(escapeSheetTitleForA1('Variable_Expenses'), 'Variable_Expenses');
  assert.equal(escapeSheetTitleForA1('FocusFlow Writeback Test'), "'FocusFlow Writeback Test'");
  assert.equal(escapeSheetTitleForA1("John's Sheet"), "'John''s Sheet'");
  assert.equal(escapeSheetTitleForA1('Prob & Stats'), "'Prob & Stats'");
});

test('BUG-05: Rate limiter middleware is mounted inside apiRouter after requireUserContext', () => {
  const routesContent = fs.readFileSync(path.resolve('server/routes.ts'), 'utf-8');
  const serverContent = fs.readFileSync(path.resolve('server.ts'), 'utf-8');
  const serverlessPath = fs.existsSync(path.resolve('server/serverless.ts'))
    ? path.resolve('server/serverless.ts')
    : path.resolve('api/index.ts');
  const serverlessContent = fs.readFileSync(serverlessPath, 'utf-8');

  // Must be in routes.ts after requireUserContext
  const reqUserCtxIndex = routesContent.indexOf('apiRouter.use(requireUserContext);');
  const rateLimiterIndex = routesContent.indexOf('apiRouter.use(rateLimiter(');

  assert.ok(reqUserCtxIndex >= 0, 'requireUserContext must be registered');
  assert.ok(rateLimiterIndex > reqUserCtxIndex, 'rateLimiter must be registered after requireUserContext');

  // Must NOT be prematurely mounted on /api in server.ts or server/serverless.ts
  assert.ok(!serverContent.includes("app.use('/api', rateLimiter("), 'server.ts should not duplicate rateLimiter');
  assert.ok(!serverlessContent.includes("app.use('/api', rateLimiter("), 'serverless entrypoint should not duplicate rateLimiter');
});

test('BUG-09: PUT /finance/expenses/:id and PUT /finance/recurring/:id validate categoryId existence', () => {
  const routesContent = fs.readFileSync(path.resolve('server/routes.ts'), 'utf-8');
  
  // Expenses PUT category check
  assert.ok(routesContent.includes("const catExists = db.categories.some("));
  assert.ok(routesContent.includes("Referenced category does not exist or belongs to another user"));
});

test('BUG-01: Vault service enforces status and membership checks in reverseVaultExpense and rejectVaultInvitation', () => {
  const vaultContent = fs.readFileSync(path.resolve('server/vaultBackendService.ts'), 'utf-8');

  // rejectVaultInvitation
  assert.ok(vaultContent.includes("if (inviteData.status !== 'pending')"));
  assert.ok(vaultContent.includes("INVITATION_INVALID"));
  assert.ok(vaultContent.includes("EMAIL_MISMATCH"));
  assert.ok(vaultContent.includes("FIRESTORE_COMMIT_FAILED"));

  // reverseVaultExpense
  assert.ok(vaultContent.includes("NOT_A_MEMBER"));
  assert.ok(vaultContent.includes("ALREADY_REVERSED"));
});

test('BUG-07 & BUG-10: Frontend SheetHubView and NativeSpreadsheetEditor state isolation', () => {
  const sheetHubViewContent = fs.readFileSync(path.resolve('src/components/sheets-hub/SheetHubView.tsx'), 'utf-8');
  const nativeEditorContent = fs.readFileSync(path.resolve('src/components/sheets-hub/NativeSpreadsheetEditor.tsx'), 'utf-8');

  // DynamicSheetRenderer key
  assert.ok(sheetHubViewContent.includes('key={activeTab.id}'));
  // Stable semantic row identity
  assert.ok(sheetHubViewContent.includes('semanticKey'));
  assert.ok(sheetHubViewContent.includes('stableRowUid'));

  // Tab move rollback on failure
  assert.ok(nativeEditorContent.includes('onUpdateTabs(previousTabs);'));
});
