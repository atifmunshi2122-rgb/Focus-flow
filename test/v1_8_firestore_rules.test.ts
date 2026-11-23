import './test_bootstrap.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('v1.8.0 Firestore Security Rules Suite', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const v18Collections = [
    { name: 'skill_nodes', idParam: 'nodeId', validator: 'isValidSkillNode' },
    { name: 'whiteboard_drawings', idParam: 'drawingId', validator: 'isValidWhiteboardDrawing' },
    { name: 'exam_simulations', idParam: 'simId', validator: 'isValidExamSimulation' },
    { name: 'decision_entries', idParam: 'entryId', validator: 'isValidDecisionEntry' },
    { name: 'doomscroll_logs', idParam: 'logId', validator: 'isValidDoomscrollLog' },
    { name: 'life_milestones', idParam: 'milestoneId', validator: 'isValidLifeMilestone' },
    { name: 'time_capsules', idParam: 'capsuleId', validator: 'isValidTimeCapsule' },
    { name: 'emergency_profile', idParam: 'profileId', validator: 'isValidEmergencyProfile' },
  ];

  it('1. verifies all 8 v1.8 collections are nested inside match /users/{userId}', () => {
    const userMatchIndex = rulesContent.indexOf('match /users/{userId}');
    assert.ok(userMatchIndex !== -1, 'Must define match /users/{userId}');

    // Find closing brace of users block (before top-level vaultInvitations or sharedVaults)
    const vaultInvitationsIndex = rulesContent.indexOf('match /vaultInvitations/{inviteCode}');
    assert.ok(vaultInvitationsIndex > userMatchIndex, 'vaultInvitations must appear after users block');

    for (const col of v18Collections) {
      const colMatch = `match /${col.name}/{${col.idParam}}`;
      const colIndex = rulesContent.indexOf(colMatch);
      assert.ok(colIndex > userMatchIndex, `${col.name} must be defined after match /users/{userId}`);
      assert.ok(colIndex < vaultInvitationsIndex, `${col.name} must be nested INSIDE /users/{userId}`);
    }
  });

  it('2. verifies read access strictly enforces isOwner(userId) for all 8 collections', () => {
    for (const col of v18Collections) {
      const pattern = new RegExp(
        `match\\s+\\/${col.name}\\/\\{${col.idParam}\\}\\s*\\{[\\s\\S]*?allow\\s+read:\\s*if\\s+isOwner\\(userId\\);`
      );
      assert.ok(
        pattern.test(rulesContent),
        `${col.name} read rule must strictly require isOwner(userId)`
      );
    }
  });

  it('3. verifies create access enforces isOwner, isValidId, userId ownership, and validator function', () => {
    for (const col of v18Collections) {
      const pattern = new RegExp(
        `match\\s+\\/${col.name}\\/\\{${col.idParam}\\}\\s*\\{[\\s\\S]*?allow\\s+create:\\s*if\\s+isOwner\\(userId\\)` +
        `[\\s\\S]*?isValidId\\(${col.idParam}\\)` +
        `[\\s\\S]*?request\\.resource\\.data\\.userId\\s*==\\s*userId` +
        `[\\s\\S]*?${col.validator}\\(`
      );
      assert.ok(
        pattern.test(rulesContent),
        `${col.name} create rule must enforce isOwner, isValidId, userId == userId, and ${col.validator}`
      );
    }
  });

  it('4. verifies update access enforces isOwner, immutable ownership, immutable ID, and validator function', () => {
    for (const col of v18Collections) {
      const pattern = new RegExp(
        `match\\s+\\/${col.name}\\/\\{${col.idParam}\\}\\s*\\{[\\s\\S]*?allow\\s+update:\\s*if\\s+isOwner\\(userId\\)` +
        `[\\s\\S]*?${col.validator}\\(` +
        `[\\s\\S]*?request\\.resource\\.data\\.userId\\s*==\\s*resource\\.data\\.userId` +
        `[\\s\\S]*?!\\('id'\\s+in\\s+resource\\.data\\)\\s*\\|\\|\\s*request\\.resource\\.data\\.id\\s*==\\s*resource\\.data\\.id`
      );
      assert.ok(
        pattern.test(rulesContent),
        `${col.name} update rule must enforce isOwner, ${col.validator}, immutable userId, and immutable ID`
      );
    }
  });

  it('5. verifies delete access enforces isOwner(userId) for all 8 collections', () => {
    for (const col of v18Collections) {
      const pattern = new RegExp(
        `match\\s+\\/${col.name}\\/\\{${col.idParam}\\}\\s*\\{[\\s\\S]*?allow\\s+delete:\\s*if\\s+isOwner\\(userId\\);`
      );
      assert.ok(
        pattern.test(rulesContent),
        `${col.name} delete rule must strictly require isOwner(userId)`
      );
    }
  });

  it('6. verifies all 8 domain validator functions exist with strict schema enforcement (keys().hasOnly)', () => {
    for (const col of v18Collections) {
      const funcPattern = new RegExp(
        `function\\s+${col.validator}\\([\\s\\S]*?\\)\\s*\\{[\\s\\S]*?data\\.keys\\(\\)\\.hasOnly\\(`
      );
      assert.ok(
        funcPattern.test(rulesContent),
        `${col.validator} must exist and enforce schema via data.keys().hasOnly()`
      );
    }
  });

  it('7. verifies default deny rule remains present and unchanged at the root', () => {
    const rootDenyPattern = /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/;
    assert.ok(rootDenyPattern.test(rulesContent), 'Default deny all rule must remain intact');
  });

  it('8. verifies server-managed integrations remain strictly protected (allow read, write: if false)', () => {
    assert.ok(rulesContent.includes('match /integrations/{integrationId}'));
    assert.ok(rulesContent.includes('match /fcm_installations/{installationId}'));
    assert.ok(rulesContent.includes('match /calendar_event_links/{linkId}'));
    assert.ok(rulesContent.includes('match /notification_delivery_ledger/{entryId}'));
  });
});
