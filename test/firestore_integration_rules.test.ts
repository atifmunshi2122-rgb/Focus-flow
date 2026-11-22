import './test_bootstrap.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Firestore Integration & Private Collection Security Rules', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('1. verifies integrations collection is strictly denied from direct client read/write', () => {
    assert.ok(
      rulesContent.includes('match /integrations/{integrationId}'),
      'Must define match /integrations/{integrationId}'
    );
    // Find the block
    const match = rulesContent.match(/match\s+\/integrations\/\{integrationId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    assert.ok(match, 'integrations must have "allow read, write: if false;"');
  });

  it('2. verifies fcm_installations collection is strictly denied from direct client read/write', () => {
    assert.ok(
      rulesContent.includes('match /fcm_installations/{installationId}'),
      'Must define match /fcm_installations/{installationId}'
    );
    const match = rulesContent.match(/match\s+\/fcm_installations\/\{installationId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    assert.ok(match, 'fcm_installations must have "allow read, write: if false;"');
  });

  it('3. verifies calendar_event_links collection is strictly denied from direct client read/write', () => {
    assert.ok(
      rulesContent.includes('match /calendar_event_links/{linkId}'),
      'Must define match /calendar_event_links/{linkId}'
    );
    const match = rulesContent.match(/match\s+\/calendar_event_links\/\{linkId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    assert.ok(match, 'calendar_event_links must have "allow read, write: if false;"');
  });

  it('4. verifies notification_delivery_ledger collection is strictly denied from direct client read/write', () => {
    assert.ok(
      rulesContent.includes('match /notification_delivery_ledger/{entryId}'),
      'Must define match /notification_delivery_ledger/{entryId}'
    );
    const match = rulesContent.match(/match\s+\/notification_delivery_ledger\/\{entryId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    assert.ok(match, 'notification_delivery_ledger must have "allow read, write: if false;"');
  });

  it('5. verifies root oauth_states collection is strictly denied from direct client read/write', () => {
    assert.ok(
      rulesContent.includes('match /oauth_states/{stateId}'),
      'Must define root match /oauth_states/{stateId}'
    );
    const match = rulesContent.match(/match\s+\/oauth_states\/\{stateId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    assert.ok(match, 'oauth_states must have "allow read, write: if false;"');
  });

  it('6. verifies all private integration collections reside inside /users/{userId} hierarchy or root isolation', () => {
    const userMatchIndex = rulesContent.indexOf('match /users/{userId}');
    assert.ok(userMatchIndex !== -1, 'Must define match /users/{userId}');

    const integrationsIndex = rulesContent.indexOf('match /integrations/{integrationId}');
    const fcmIndex = rulesContent.indexOf('match /fcm_installations/{installationId}');
    const calendarLinksIndex = rulesContent.indexOf('match /calendar_event_links/{linkId}');
    const ledgerIndex = rulesContent.indexOf('match /notification_delivery_ledger/{entryId}');

    assert.ok(integrationsIndex > userMatchIndex, 'integrations must be nested inside users collection');
    assert.ok(fcmIndex > userMatchIndex, 'fcm_installations must be nested inside users collection');
    assert.ok(calendarLinksIndex > userMatchIndex, 'calendar_event_links must be nested inside users collection');
    assert.ok(ledgerIndex > userMatchIndex, 'notification_delivery_ledger must be nested inside users collection');
  });
});

