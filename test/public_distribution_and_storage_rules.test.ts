import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Public Clone — firebase-applet-config.json is valid and contains no private secrets', () => {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  assert.ok(fs.existsSync(configPath), 'firebase-applet-config.json must exist for fresh clones');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.projectId, 'focus-flow-by-atif', 'Project ID must match owner project');
  assert.ok(config.apiKey && config.apiKey.startsWith('AIza'), 'Public Web API key must be present');
  assert.ok(config.authDomain, 'authDomain must be present');
  assert.ok(config.firestoreDatabaseId, 'firestoreDatabaseId must be present');

  // Verify no private credentials or service accounts are in the config
  assert.equal(config.private_key, undefined, 'private_key must NEVER be present');
  assert.equal(config.client_secret, undefined, 'client_secret must NEVER be present');
  assert.equal(config.privateKey, undefined, 'privateKey must NEVER be present');
});

test('Public Clone — Repository contains zero private keys or service accounts', () => {
  const rootFiles = fs.readdirSync(process.cwd());
  for (const file of rootFiles) {
    assert.ok(
      !file.toLowerCase().includes('serviceaccount') && !file.toLowerCase().includes('service-account'),
      `Service account file detected in root: ${file}`
    );
  }

  // Verify .gitignore ignores .env and .env.local
  const gitignore = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf8');
  assert.match(gitignore, /\.env\*/, '.gitignore must ignore .env files');
});

test('Storage Security Rules — Strict user isolation and size validation', () => {
  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');
  assert.ok(fs.existsSync(storageRulesPath), 'storage.rules must exist');

  const rules = fs.readFileSync(storageRulesPath, 'utf8');

  // Default deny all
  assert.match(rules, /match\s+\/\{allPaths=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;/, 'Must have default deny all');

  // Path isolation under /users/{userId}
  assert.match(rules, /match\s+\/users\/\{userId\}\/\{allPaths=\*\*\}\s*\{/, 'Must partition files by userId');

  // Owner authentication check
  assert.match(rules, /request\.auth\s*!=\s*null\s*&&\s*request\.auth\.uid\s*==\s*userId/, 'Must verify request.auth.uid == userId');

  // Size limit (< 10MB)
  assert.match(rules, /request\.resource\.size\s*<\s*10\s*\*\s*1024\s*\*\s*1024/, 'Must restrict file size under 10MB');

  // Content type validation
  assert.match(rules, /request\.resource\.contentType\.matches\('image\/\.\*'\)/, 'Must restrict allowed MIME types');

  // No unrestricted access
  assert.ok(!rules.includes('allow read, write: if true'), 'Must not contain unrestricted rules');
});

test('Firestore Security Rules — Strict multi-tenant isolation verification', () => {
  const firestoreRulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.ok(fs.existsSync(firestoreRulesPath), 'firestore.rules must exist');

  const rules = fs.readFileSync(firestoreRulesPath, 'utf8');

  // Must not have open read/write
  assert.ok(!rules.includes('allow read, write: if true'), 'Must not contain allow read, write: if true');
  assert.ok(!rules.includes('allow write: if true'), 'Must not contain allow write: if true');

  // Connection healthcheck test doc must be read-only
  assert.match(rules, /match\s+\/test\/connection\s*\{\s*allow\s+read:\s*if\s+true;\s*allow\s+write:\s*if\s+false;\s*\}/);

  // Every single resource must check owner
  assert.match(rules, /function\s+isOwner\(userId\)\s*\{\s*return\s+isSignedIn\(\)\s*&&\s*request\.auth\.uid\s*==\s*userId;\s*\}/);
});

