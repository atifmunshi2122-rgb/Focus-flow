import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  AVATAR_CATALOG,
  DEFAULT_AVATAR_ID,
  getAvatarCatalogEntry,
  validateAndSanitizeAvatarConfig,
} from '../src/features/avatar/avatar-catalog.ts';
import { resolveStudyAvatarIdentity } from '../src/lib/studyAvatarRegistry.ts';
import { rankLeaderboardProfiles } from '../src/lib/leaderboardService.ts';

test('AVATAR_CATALOG provides multiple male & female GLB avatars with no hardcoded user names', () => {
  assert.ok(AVATAR_CATALOG.length >= 4, 'Catalog must include at least 4 avatars');
  const styles = new Set(AVATAR_CATALOG.map((a) => a.style));
  assert.ok(styles.has('male') && styles.has('female'), 'Must include both male and female styles');

  for (const entry of AVATAR_CATALOG) {
    assert.equal(entry.modelFormat, 'glb');
    assert.equal(entry.available, true);
    assert.ok(entry.modelUrl.startsWith('/models/avatars/') && entry.modelUrl.endsWith('.glb'));
    const diskPath = path.join(process.cwd(), 'public', entry.modelUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `GLB asset missing on disk: ${diskPath}`);
    assert.ok(!/atif|puja/i.test(entry.displayName), 'No hardcoded personal names in catalog');
  }
});

test('validateAndSanitizeAvatarConfig rejects spoofed modelUrl and unsupported values', () => {
  const spoofed = validateAndSanitizeAvatarConfig({
    avatarId: 'anime-boy-02',
    modelUrl: 'https://evil.example.com/malicious.glb',
    customization: {
      hairColor: '#78350f',
      eyeColor: '#NOT_A_HEX',
      outfitColor: '#0f766e',
      accessories: ['glasses', 'jetpack', 'headphones'],
    },
  });

  const expectedEntry = getAvatarCatalogEntry('anime-boy-02');
  assert.equal(spoofed.avatarId, 'anime-boy-02');
  assert.equal(spoofed.modelUrl, expectedEntry.modelUrl, 'Spoofed modelUrl must be overwritten');
  assert.equal(spoofed.customization.hairColor, '#78350f');
  assert.equal(spoofed.customization.eyeColor, expectedEntry.defaults.eyeColor);
  assert.equal(spoofed.customization.outfitColor, '#0f766e');
  assert.deepEqual(spoofed.customization.accessories, ['glasses', 'headphones']);

  const unknownAvatar = validateAndSanitizeAvatarConfig({
    avatarId: 'non-existent-character',
    modelUrl: '/etc/passwd',
  });
  assert.equal(unknownAvatar.avatarId, DEFAULT_AVATAR_ID);
  assert.equal(unknownAvatar.modelUrl, getAvatarCatalogEntry(DEFAULT_AVATAR_ID).modelUrl);
});

test('Multi-user avatar isolation: 3 distinct users get independent 3D avatars and customizations', () => {
  const userA = {
    uid: 'uid-alice-001',
    displayName: 'Alice',
    avatarColor: '#4f46e5',
    avatarConfig: validateAndSanitizeAvatarConfig({
      avatarId: 'anime-girl-01',
      customization: {
        hairColor: AVATAR_CATALOG.find((a) => a.id === 'anime-girl-01')!.supportedCustomization.hairColors[1],
        eyeColor: AVATAR_CATALOG.find((a) => a.id === 'anime-girl-01')!.supportedCustomization.eyeColors[2],
        outfitColor: AVATAR_CATALOG.find((a) => a.id === 'anime-girl-01')!.supportedCustomization.outfitColors[0],
        accessories: ['glasses'],
      },
    }),
  };

  const userB = {
    uid: 'uid-bob-002',
    displayName: 'Bob',
    avatarColor: '#0f766e',
    avatarConfig: validateAndSanitizeAvatarConfig({
      avatarId: 'anime-boy-01',
      customization: {
        hairColor: AVATAR_CATALOG.find((a) => a.id === 'anime-boy-01')!.supportedCustomization.hairColors[3],
        eyeColor: AVATAR_CATALOG.find((a) => a.id === 'anime-boy-01')!.supportedCustomization.eyeColors[1],
        outfitColor: AVATAR_CATALOG.find((a) => a.id === 'anime-boy-01')!.supportedCustomization.outfitColors[2],
        accessories: ['headphones'],
      },
    }),
  };

  const userC = {
    uid: 'uid-charlie-003',
    displayName: 'Charlie',
    avatarColor: '#db2777',
    avatarConfig: null, // New user who has not customized yet
  };

  const idA = resolveStudyAvatarIdentity(userA);
  const idB = resolveStudyAvatarIdentity(userB);
  const idC = resolveStudyAvatarIdentity(userC);

  assert.equal(idA.id, 'anime-girl-01');
  assert.equal(idA.modelUrl, '/models/avatars/anime-girl-01.glb');
  assert.deepEqual(idA.accessories, ['glasses']);

  assert.equal(idB.id, 'anime-boy-01');
  assert.equal(idB.modelUrl, '/models/avatars/anime-boy-01.glb');
  assert.deepEqual(idB.accessories, ['headphones']);

  assert.ok(AVATAR_CATALOG.some((c) => c.id === idC.id), 'Fallback user must resolve to a valid catalog avatar');
  assert.notEqual(idA.hairColor, idB.hairColor);
  assert.notEqual(idA.modelUrl, idB.modelUrl);
});

test('rankLeaderboardProfiles preserves avatarConfig for squad rendering', () => {
  const cfg = validateAndSanitizeAvatarConfig({
    avatarId: 'anime-girl-02',
    customization: { accessories: ['glasses', 'headphones'] },
  });

  const ranked = rankLeaderboardProfiles({
    profiles: [
      {
        uid: 'u-1',
        displayName: 'Student One',
        avatarColor: '#4f46e5',
        avatarConfig: cfg,
        isPublic: true,
        squadIds: [],
        todayKey: '2026-11-26',
        todayMinutes: 60,
        weekKey: '2026-W48',
        weekMinutes: 180,
        monthKey: '2026-11',
        monthMinutes: 180,
        streakDays: 5,
        dailyGoalMinutes: 120,
        totalSessionsCount: 4,
        updatedAt: new Date().toISOString(),
      },
    ],
    period: 'week',
    currentUid: 'u-1',
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].avatarConfig?.avatarId, 'anime-girl-02');
  assert.deepEqual(ranked[0].avatarConfig?.customization?.accessories, ['glasses', 'headphones']);
});
