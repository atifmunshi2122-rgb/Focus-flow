import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { dbService } from '../server/db.ts';

test('Isolation Verification Gate — DATA_DIR is outside repository and isolated', () => {
  const repoDataDir = path.resolve(process.cwd(), 'data');
  const envDataDir = path.resolve(process.env.DATA_DIR || '');
  
  // 1. Assert DATA_DIR is assigned
  assert.ok(process.env.DATA_DIR, 'DATA_DIR must be assigned before test execution');

  // 2. Assert DATA_DIR is strictly outside repo data dir
  assert.notEqual(envDataDir, repoDataDir, 'DATA_DIR must not equal repository data directory');
  assert.equal(
    envDataDir.startsWith(repoDataDir),
    false,
    `DATA_DIR (${envDataDir}) must not be inside repository data directory (${repoDataDir})`
  );

  // 3. Assert dbService uses the isolated path
  const raw = dbService.getRaw();
  assert.ok(raw, 'dbService must load synthetic fixture');
  assert.equal(raw.users[0]?.email, 'test_user@focusflow.local');

  // 4. Test mutation in temporary db
  raw.users[0].name = 'Mutated Isolation Name';
  dbService.save();

  console.log(`[Isolation Verification Gate PASSED] Resolved DATA_DIR: ${envDataDir}`);
});

